import type { HybridCategory } from './hybridClusterPresentation';
import { HYBRID_ICON_PATHS } from './hybridIconPaths';
import { hybridRingGeometry } from './hybridRingGeometry';

export type HybridGraphic = { xml: string; width: number; height: number; label: string };
const p = (n: number) => n * .9;
const blue = '#208EE8', green = '#258446', ink = '#143247';
const number = (n: number) => String(Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)));
const textWidth = (text: string, size: number) => text.length * size * .65;
const icon = (name: string, x: number, y: number, size: number, color: string) =>
  `<path fill="${color}" transform="translate(${x} ${y}) scale(${size / 24})" d="${HYBRID_ICON_PATHS[name] || HYBRID_ICON_PATHS.category}"/>`;
const text = (value: string, x: number, y: number, size: number, color: string) =>
  `<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" font-weight="600" fill="${color}">${value.replace(/[&<>"']/g, '')}</text>`;
const divider = (x: number, height: number) => `<path d="M${x} ${p(5)}V${height - p(5)}" stroke="#CBD8DD" stroke-width="${p(1)}"/>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="${p(2)}" fill="#EF5A59" stroke="#FFFEFA" stroke-width="${p(.7)}"/>`;
function graphic(width: number, height: number, content: string, label: string): HybridGraphic {
  return { width, height, label, xml: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>` };
}

export function venueSummarySize(categories: HybridCategory[], overflow: number) {
  const height = p(26), size = p(11), gap = p(2), padding = p(4);
  const widths = categories.map(c => padding * 2 + size + gap + textWidth(number(c.count), size));
  if (overflow) widths.push(p(22));
  const width = p(10) + widths.reduce((a, b) => a + b, 0);
  return { width, height, widths };
}

/** Entire pills, including glyphs and dividers, are drawn by the SVG renderer before Mapbox captures them. */
export function venueSummaryGraphic(categories: HybridCategory[], overflow: number, hiddenNew: boolean, accent: string, categoryIcon: (category: string) => string): HybridGraphic {
  const { width, height, widths } = venueSummarySize(categories, overflow);
  const size = p(11), gap = p(2), padding = p(4);
  let x = p(5);
  let content = `<rect x="${p(1)}" y="${p(1)}" width="${width - p(2)}" height="${height - p(2)}" rx="${height / 2}" fill="#FFFEFA" stroke="${accent}" stroke-width="${p(2)}"/>`;
  categories.forEach((c, at) => {
    if (at) content += divider(x, height);
    const color = c.type === 'special' ? green : blue, ix = x + padding;
    content += icon(categoryIcon(c.category), ix, (height - size) / 2, size, color);
    content += text(number(c.count), ix + size + gap, height / 2 + size * .35, size, color);
    if (c.isNew) content += dot(ix + size, (height - size) / 2);
    x += widths[at];
  });
  if (overflow) {
    content += divider(x, height) + icon('more-horiz', x + p(4), (height - p(14)) / 2, p(14), '#637B88');
    if (hiddenNew) content += dot(x + p(18), p(5));
  }
  return graphic(width, height, content, categories.map(c => `${c.category}: ${c.count}${c.isNew ? ', new content' : ''}`).join('; ') + (overflow ? `; ${overflow} more categories` : ''));
}

export function clusterSummaryGraphic(venues: number, events: number, specials: number, city: boolean): HybridGraphic {
  const count = number(venues), diameter = p(count.length > 2 ? 30 : 24), height = Math.max(p(28), diameter + p(4));
  const size = p(12), gap = p(2), padding = p(4), start = p(4) + diameter + p(3);
  const sections = [
    { count: events, color: blue, name: 'event' },
    { count: specials, color: green, name: 'restaurant' },
  ].filter(section => section.count > 0);
  const sectionWidth = (value: number) => padding * 2 + size + gap + textWidth(number(value), size);
  const width = start + sections.reduce((sum, section) => sum + sectionWidth(section.count), 0) + p(4) + (city ? p(13) : 0);
  let content = `<rect x="${p(.5)}" y="${p(.5)}" width="${width - p(1)}" height="${height - p(1)}" rx="${height / 2}" fill="#EFF7FF" stroke="#ABCDE5" stroke-width="${p(1)}"/>`;
  const cx = p(4) + diameter / 2, cy = height / 2;
  const { radius, gap: ringGap, arc } = hybridRingGeometry(diameter, p(1.25), venues, p(1.5));
  content += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#8DA8B8" stroke-width="${p(1.25)}" stroke-dasharray="${arc} ${ringGap}" stroke-dashoffset="${-ringGap / 2}" transform="rotate(-90 ${cx} ${cy})"/>`;
  const houseSize = p(count.length > 1 ? 6 : 7.5), countSize = p(count.length > 1 ? 8 : 9), innerWidth = houseSize + p(1) + textWidth(count, countSize);
  content += icon('home', cx - innerWidth / 2, cy - houseSize / 2, houseSize, ink);
  content += text(count, cx - innerWidth / 2 + houseSize + p(1), cy + countSize * .35, countSize, ink);
  let x = start;
  for (const section of sections) {
    content += divider(x, height) + icon(section.name, x + padding, cy - size / 2, size, section.color);
    content += text(number(section.count), x + padding + size + gap, cy + size * .35, size, section.color);
    x += sectionWidth(section.count);
  }
  if (city) content += `<circle cx="${width - p(9)}" cy="${cy}" r="${p(6)}" fill="#FFC400"/>` + icon('festival', width - p(13.5), cy - p(4.5), p(9), '#4E342E');
  return graphic(width, height, content, `${venues} venues; ${events} events; ${specials} specials${city ? '; city-wide event' : ''}`);
}

export function friendBadgeGraphic(count: number): HybridGraphic {
  const value = count > 9 ? '9+' : number(count), size = p(9), height = p(15);
  const width = Math.max(p(25), p(10) + p(2) + textWidth(value, size) + p(8));
  return graphic(width, height, `<rect x="${p(.5)}" y="${p(.5)}" width="${width - p(1)}" height="${height - p(1)}" rx="${height / 2}" fill="#7044C6" stroke="#FFFEFA" stroke-width="${p(1)}"/>${icon('people', p(4), (height - p(10)) / 2, p(10), '#FFF')}${text(value, p(16), height / 2 + size * .35, size, '#FFF')}`, `${count} friends checked in`);
}

export function countGraphic(value: string, size = 12, color = '#674C13'): HybridGraphic {
  const safe = value.replace(/[^0-9A-Z+]/gi, '').slice(0, 12), width = Math.max(size, textWidth(safe, size)), height = size * 1.4;
  return graphic(width, height, text(safe, 0, height / 2 + size * .35, size, color), safe);
}
