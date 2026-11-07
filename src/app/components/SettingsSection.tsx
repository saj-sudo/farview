import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

const PHONE = '(max-width: 720px)';

/**
 * One section of Settings: a heading that folds its contents away. Open on a
 * wide screen; on a phone only the sections marked openOnPhone start open,
 * so the page opens as a short list of headings. Decided once, on mount.
 * With fold off it is a plain heading, for screens that fold differently.
 */
export function SettingsSection(props: {
  title: string;
  openOnPhone?: boolean;
  fold?: boolean;
  children: ComponentChildren;
}) {
  const [open] = useState(
    () =>
      props.openOnPhone === true ||
      typeof matchMedia === 'undefined' ||
      !matchMedia(PHONE).matches,
  );
  if (props.fold === false) {
    return (
      <>
        <h2>{props.title}</h2>
        {props.children}
      </>
    );
  }
  return (
    <details class="settings-section" open={open}>
      <summary>
        <h2>{props.title}</h2>
      </summary>
      {props.children}
    </details>
  );
}
