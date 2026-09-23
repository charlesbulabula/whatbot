// Charts drawn as inline SVG: no library, no client-side rendering, and they
// print and work with JavaScript disabled. Colours come from the theme tokens,
// so every chart follows the light/dark palette automatically.
import { esc } from './ui.js';

const PALETTE = ['var(--primary)', 'var(--info)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--primary-light-2)'];

/** Nice round axis ticks covering `max`. */
export function ticks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= raw);
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out.at(-1) < max) out.push(out.at(-1) + step);
  return out;
}

const path = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

/**
 * Revenue over time: filled area plus a line, with a value tooltip per point.
 * `series` is [{ day, revenue, orders }]; `format` turns a number into text.
 */
export function areaChart(series, { format, height = 200, label = '', secondary = null, secondaryLabel = '' }) {
  if (!series.length) return '';
  const W = 720;
  const H = height;
  const padL = 46;
  const padB = 24;
  const padT = 10;
  const max = Math.max(...series.map((d) => d.revenue), ...(secondary || []), 0);
  const axis = ticks(max);
  const top = axis.at(-1) || 1;
  const x = (i) => padL + (i * (W - padL - 8)) / Math.max(1, series.length - 1);
  const y = (v) => padT + (1 - v / top) * (H - padT - padB);

  const grid = axis
    .map((v) => `<line class="grid" x1="${padL}" x2="${W - 8}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
<text class="axis" x="${padL - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(format(v, true))}</text>`)
    .join('');

  const points = series.map((d, i) => [x(i), y(d.revenue)]);
  const area = `${path(points)} L${x(series.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${padL} ${y(0).toFixed(1)} Z`;

  const every = Math.ceil(series.length / 6);
  const xLabels = series
    .map((d, i) => (i % every === 0 || i === series.length - 1
      ? `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}">${esc(d.label)}</text>`
      : ''))
    .join('');

  // One transparent hit area per point keeps the tooltip usable on a phone.
  const hits = series
    .map((d, i) => `<g class="hit"><circle cx="${x(i).toFixed(1)}" cy="${y(d.revenue).toFixed(1)}" r="3.5" class="pt"/>
<rect x="${(x(i) - (W - padL) / series.length / 2).toFixed(1)}" y="${padT}" width="${((W - padL) / series.length).toFixed(1)}"
height="${H - padT - padB}" fill="transparent"><title>${esc(d.label)} — ${esc(format(d.revenue))}${d.orders !== undefined ? ` · ${d.orders}` : ''}</title></rect></g>`)
    .join('');

  const secondLine = secondary
    ? `<path class="line" style="stroke:var(--info);stroke-dasharray:4 3" d="${path(secondary.map((v, i) => [x(i), y(v)]))}"/>`
    : '';

  const legend = secondary
    ? `<div class="legend"><span><i style="background:var(--primary)"></i>${esc(label)}</span>
<span><i style="background:var(--info)"></i>${esc(secondaryLabel)}</span></div>`
    : '';

  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
${grid}<path class="area" d="${area}"/><path class="line" d="${path(points)}"/>${secondLine}${hits}${xLabels}</svg>${legend}`;
}

/** Vertical bars, e.g. orders per hour of the day. */
export function barChart(bars, { format, height = 170, label = '' }) {
  if (!bars.length) return '';
  const W = 720;
  const H = height;
  const padL = 34;
  const padB = 22;
  const padT = 8;
  const max = Math.max(...bars.map((b) => b.value), 0);
  const axis = ticks(max, 3);
  const top = axis.at(-1) || 1;
  const slot = (W - padL - 8) / bars.length;
  const bw = Math.min(slot * 0.62, 26);
  const y = (v) => padT + (1 - v / top) * (H - padT - padB);

  const grid = axis
    .map((v) => `<line class="grid" x1="${padL}" x2="${W - 8}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
<text class="axis" x="${padL - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(format(v, true))}</text>`)
    .join('');

  const rects = bars
    .map((b, i) => {
      const cx = padL + slot * i + slot / 2;
      const h = Math.max(0, y(0) - y(b.value));
      return `<rect class="bar" x="${(cx - bw / 2).toFixed(1)}" y="${y(b.value).toFixed(1)}" width="${bw.toFixed(1)}"
height="${h.toFixed(1)}" rx="3"><title>${esc(b.label)} — ${esc(format(b.value))}</title></rect>`;
    })
    .join('');

  const every = Math.ceil(bars.length / 12);
  const xLabels = bars
    .map((b, i) => (i % every === 0
      ? `<text class="axis" x="${(padL + slot * i + slot / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(b.label)}</text>`
      : ''))
    .join('');

  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
${grid}${rects}${xLabels}</svg>`;
}

/** Donut, e.g. orders per status. `slices` is [{ label, value, tone? }]. */
export function donutChart(slices, { format, label = '', centerLabel = '' }) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (!total) return '';
  const R = 60;
  const r = 38;
  const C = 70;
  let angle = -Math.PI / 2;

  const arcs = slices
    .map((d, i) => {
      const sweep = (d.value / total) * Math.PI * 2;
      const end = angle + sweep;
      const big = sweep > Math.PI ? 1 : 0;
      const p = (rad, a) => [C + rad * Math.cos(a), C + rad * Math.sin(a)];
      const [x1, y1] = p(R, angle);
      const [x2, y2] = p(R, end);
      const [x3, y3] = p(r, end);
      const [x4, y4] = p(r, angle);
      angle = end;
      // A full circle cannot be drawn with a single arc: use two half sweeps.
      const d1 = slices.length === 1
        ? `M${C - R} ${C} A${R} ${R} 0 1 1 ${C + R} ${C} A${R} ${R} 0 1 1 ${C - R} ${C} Z M${C - r} ${C} A${r} ${r} 0 1 0 ${C + r} ${C} A${r} ${r} 0 1 0 ${C - r} ${C} Z`
        : `M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 ${big} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}
L${x3.toFixed(1)} ${y3.toFixed(1)} A${r} ${r} 0 ${big} 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z`;
      return `<path d="${d1}" fill="${d.tone || PALETTE[i % PALETTE.length]}" fill-rule="evenodd">
<title>${esc(d.label)} — ${esc(format(d.value))}</title></path>`;
    })
    .join('');

  const legend = slices
    .map((d, i) => `<span><i style="background:${d.tone || PALETTE[i % PALETTE.length]}"></i>${esc(d.label)}
<b class="strong">${esc(format(d.value))}</b></span>`)
    .join('');

  return `<div style="display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap">
<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="${esc(label)}">${arcs}
<text x="70" y="66" text-anchor="middle" style="fill:var(--hk-text-primary);font-size:20px;font-weight:700">${esc(String(total))}</text>
<text x="70" y="82" text-anchor="middle" class="axis">${esc(centerLabel)}</text></svg>
<div class="legend" style="flex-direction:column;gap:.45rem;margin:0">${legend}</div></div>`;
}

/** Ranked horizontal bars — the clearest way to read a top-N list. */
export function rankedBars(items, { format }) {
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  return `<div class="hbars">${items
    .map((i) => `<div class="hbar"><span class="hbar__name" title="${esc(i.label)}">${i.html || esc(i.label)}</span>
<span class="hbar__track"><span class="hbar__fill" style="width:${((i.value / max) * 100).toFixed(1)}%"></span></span>
<span class="hbar__val">${esc(format(i.value))}</span></div>`)
    .join('')}</div>`;
}

/** Tiny trend line for a stat tile. */
export function sparkline(values, { tone = 'currentColor' } = {}) {
  if (values.length < 2) return '';
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 24;
  const pts = values.map((v, i) => [(i * w) / (values.length - 1), h - (v / max) * h]);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="color:${tone}" aria-hidden="true">
<path d="${path(pts)}"/></svg>`;
}
