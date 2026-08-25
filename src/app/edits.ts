import { useMemo, useState } from 'preact/hooks';
import {
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

/**
 * The UI's write surface: optimistic apply, server write-through, and
 * revert-with-notice on failure. Every method here is triggered by a
 * direct user gesture; there are no background writes. A scope-
 * insufficient 403 downgrades the message to "reconnect with editing"
 * rather than retrying.
 */

export interface EditActions {
  updateDates: (item: TimelineItem, change: DateChange) => Promise<boolean>;
  createItem: (spec: NewItemSpec) => Promise<TimelineItem | null>;
  notice: string | null;
  dismissNotice: () => void;
}

export function useEditActions(
  session: Session,
  resolved: ResolvedSchema | null,
  data: TimelineData,
): EditActions | null {
  const [notice, setNotice] = useState<string | null>(null);

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
          const server = await editor.updateDates(item.id, item.kind, change);
          data.applyObject(server, item.kind, { group: item.group, tags: item.tags });
          return true;
        } catch (err) {
          data.upsertItem(previous); // revert; the space stays authoritative
          setNotice(failureMessage(err));
          return false;
        }
      },
      createItem: async (spec) => {
        try {
          const server = await editor.createItem(spec);
          return data.applyObject(server, spec.kind);
        } catch (err) {
          setNotice(failureMessage(err));
          return null;
        }
      },
    };
  }, [editor, data, notice]);
}
