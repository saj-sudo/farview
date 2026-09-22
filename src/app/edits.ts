import { useMemo, useRef, useState } from 'preact/hooks';
import {
  actionsPropertyId,
  applyDateChange,
  EditNotPossibleError,
  type DateChange,
  type Editor,
  type NewItemSpec,
} from '../engine/editor';
import type { ResolvedSchema } from '../engine/resolve';
import type { TimelineItem } from '../engine/types';
import { isScopeInsufficiency, type Session } from './session';
import type { TimelineData } from './useTimelineData';
import { createWriteQueue, type WriteQueue } from './writeQueue';

/**
 * The UI's write surface: optimistic apply, server write-through, and
 * revert-with-notice on failure. Every method here is triggered by a
 * direct user gesture; there are no background writes. A scope-
 * insufficient 403 downgrades the message to "reconnect with editing"
 * rather than retrying.
 */

export interface EditActions {
  updateDates: (item: TimelineItem, change: DateChange) => Promise<boolean>;
  /**
   * Create an item; with a parentItem, link it — a project sets its
   * goal at create, an action is appended to the parent's actions
   * entity property afterwards (the parent owns that relation).
   */
  createItem: (spec: NewItemSpec, parentItem?: TimelineItem | null) => Promise<boolean>;
  notice: string | null;
  dismissNotice: () => void;
}

export function useEditActions(
  session: Session,
  resolved: ResolvedSchema | null,
  data: TimelineData,
): EditActions | null {
  const [notice, setNotice] = useState<string | null>(null);

  const queueRef = useRef<WriteQueue | null>(null);
  if (queueRef.current === null) queueRef.current = createWriteQueue();
  const enqueue = queueRef.current;

  // Queued writes run after the render that scheduled them, so they read
  // the item set through this ref rather than the captured `data`.
  const dataRef = useRef(data);
  dataRef.current = data;

  const editor: Editor | null = useMemo(
    () => (resolved ? session.makeEditor(resolved) : null),
    [session, resolved],
  );

  return useMemo(() => {
    if (!editor) return null;

    const failureMessage = (err: unknown): string => {
      if (isScopeInsufficiency(err)) {
        return 'This connection was not granted write access. Reconnect with ' +
          'editing from Settings to make changes here.';
      }
      if (err instanceof EditNotPossibleError) return err.message;
      return 'Saving to Capacities failed — the change was not applied.';
    };

    return {
      notice,
      dismissNotice: () => setNotice(null),
      updateDates: async (item, change) => {
        const previous = item;
        data.upsertItem(applyDateChange(item, change)); // optimistic
        try {
          const server = await enqueue(item.id, () =>
            editor.updateDates(item.id, item.kind, change),
          );
          data.applyObject(server, item.kind, { group: item.group, tags: item.tags });
          return true;
        } catch (err) {
          data.upsertItem(previous); // revert; the space stays authoritative
          setNotice(failureMessage(err));
          return false;
        }
      },
      createItem: async (spec, parentItem = null) => {
        try {
          const withParent: NewItemSpec = {
            ...spec,
            parent: parentItem ? { kind: parentItem.kind, id: parentItem.id } : null,
          };
          const server = await editor.createItem(withParent);
          if (spec.kind === 'action') {
            // Two-step link: the parent's entity property gains the new id.
            if (parentItem && resolved) {
              const propId = actionsPropertyId(resolved, parentItem.kind);
              if (propId) {
                const parentServer = await enqueue(parentItem.id, () => {
                  // Read the parent's links when the write actually runs:
                  // an earlier queued create may have added ids since this
                  // call was made, and the property is replaced wholesale.
                  const current =
                    dataRef.current.items.find((i) => i.id === parentItem.id) ?? parentItem;
                  return editor.setEntityProperty(parentItem.id, propId, [
                    ...current.actionIds,
                    server.id,
                  ]);
                });
                data.applyObject(parentServer, parentItem.kind, {
                  group: parentItem.group,
                  tags: parentItem.tags,
                });
              }
            }
            return true;
          }
          data.applyObject(server, spec.kind);
          return true;
        } catch (err) {
          setNotice(failureMessage(err));
          return false;
        }
      },
    };
  }, [editor, data, notice, enqueue, resolved]);
}
