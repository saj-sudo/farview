import type { LaneGeometry } from '../engine/timeline/layout';

/**
 * Save the timeline as a standalone SVG for a weekly or yearly review. The
 * on-screen chart is styled by the page's stylesheet and its colour variables,
 * which a saved file does not have, so every element carries the styles the
 * browser worked out for it. The lane names are an HTML overlay on screen, so
 * they are drawn into the file as text. Nothing leaves the browser: the file is
 * built here and handed to a download link.
 */

const COPIED = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linejoin',
  'stroke-linecap',
  'paint-order',
  'stop-color',
  'stop-opacity',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'mix-blend-mode',
  'visibility',
] as const;

const SVG_NS = 'http://www.w3.org/2000/svg';

function inlineStyles(source: Element, copy: Element): void {
  const computed = getComputedStyle(source);
  // The page's Content-Security-Policy forbids writing a style attribute as
  // text, so the styles go in through the CSS object model, which it allows.
  // They serialise as an ordinary style attribute in the saved file.
  const target = (copy as SVGElement).style;
  for (const name of COPIED) target.setProperty(name, computed.getPropertyValue(name));
  // A colour variable in an attribute cannot resolve in a saved file, and the
  // inline style above already says what it resolved to.
  for (const attr of [...copy.attributes]) {
    if (attr.value.includes('var(')) copy.removeAttribute(attr.name);
  }
  copy.removeAttribute('tabindex');
  copy.removeAttribute('focusable');
  const from = [...source.children];
  const to = [...copy.children];
  from.forEach((child, i) => {
    const twin = to[i];
    if (twin) inlineStyles(child, twin);
  });
}

function laneName(lane: LaneGeometry): string {
  const pillar =
    lane.firstOfGroup && lane.subGroup !== null && lane.group !== null && lane.group !== lane.subGroup
      ? `${lane.group} › `
      : '';
  return `${pillar}${lane.label} · ${lane.count}`;
}

export function timelineSvgMarkup(
  chart: SVGSVGElement,
  lanes: readonly LaneGeometry[],
  title: string,
): string {
  const copy = chart.cloneNode(true) as SVGSVGElement;
  inlineStyles(chart, copy);
  copy.removeAttribute('class');
  copy.removeAttribute('aria-hidden');
  copy.setAttribute('xmlns', SVG_NS);

  const page = getComputedStyle(document.body);
  const root = getComputedStyle(document.documentElement);
  const surface = root.getPropertyValue('--surface').trim() || page.backgroundColor;
  const ink = root.getPropertyValue('--ink').trim() || page.color;
  const line = root.getPropertyValue('--line-strong').trim() || ink;
  const width = Number(chart.getAttribute('width'));
  const height = Number(chart.getAttribute('height'));

  const label = (lane: LaneGeometry): string => {
    const text = laneName(lane);
    const w = Math.round(text.length * 6.6 + 20);
    return (
      `<g><rect x="8" y="${lane.y + 4}" width="${w}" height="22" rx="6" fill="${surface}" stroke="${line}"/>` +
      `<text x="18" y="${lane.y + 19}" fill="${ink}" font-family="${page.fontFamily.replace(/"/g, "'")}" ` +
      `font-size="12" font-weight="600">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></g>`
    );
  };

  const background = `<rect x="0" y="0" width="${width}" height="${height}" fill="${surface}"/>`;
  const heading = `<title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`;
  const body = copy.innerHTML;
  const open = copy.outerHTML.slice(0, copy.outerHTML.indexOf('>') + 1);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${open}${heading}${background}${body}${lanes.map(label).join('')}</svg>\n`;
}

/** Hand the markup to the browser as a download. */
export function downloadSvg(markup: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
