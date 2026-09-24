// Channel-agnostic outbound message builders. The WhatsApp client turns these
// into Graph API payloads; tests inspect them directly.

// WhatsApp interactive limits.
const BUTTON_MAX = 3;
const BUTTON_TITLE_MAX = 20;
const LIST_ROWS_MAX = 10;
const LIST_SECTION_MAX = 24;
const LIST_TITLE_MAX = 24;
const LIST_DESC_MAX = 72;
const BODY_MAX = 1024;

const chars = (s) => [...String(s ?? '')];

export function clip(s, max) {
  const c = chars(s);
  return c.length <= max ? c.join('') : `${c.slice(0, max - 1).join('')}…`;
}

export const text = (to, body) => ({ kind: 'text', to, body });

export const buttons = (to, body, options, footer) => ({
  kind: 'buttons',
  to,
  body: clip(body, BODY_MAX),
  footer: footer ? clip(footer, 60) : undefined,
  buttons: options.map((o) => ({ id: o.id, title: clip(o.title, BUTTON_TITLE_MAX) })),
});

const row = (o) => ({
  id: o.id,
  title: clip(o.title, LIST_TITLE_MAX),
  description: o.description ? clip(o.description, LIST_DESC_MAX) : undefined,
});

/**
 * A list message. `options` may carry a `group` per option: WhatsApp then draws
 * named sections instead of one undifferentiated block, which is the difference
 * between scanning a shelf and reading a receipt.
 */
export const list = (to, body, buttonLabel, options, footer, header) => {
  const groups = [...new Set(options.map((o) => o.group).filter(Boolean))];
  const sections = groups.length
    ? [
      ...groups.map((title) => ({
        title: clip(title, LIST_SECTION_MAX),
        rows: options.filter((o) => o.group === title).map(row),
      })),
      // Anything without an aisle still has to appear somewhere.
      ...(options.some((o) => !o.group)
        ? [{ rows: options.filter((o) => !o.group).map(row) }]
        : []),
    ]
    : null;
  return {
    kind: 'list',
    to,
    header: header ? clip(header, 60) : undefined,
    body: clip(body, BODY_MAX),
    footer: footer ? clip(footer, 60) : undefined,
    button: clip(buttonLabel, 20),
    rows: options.map(row),
    sections,
  };
};

/** A picture, e.g. a product photo sent with the size question. */
export const image = (to, link, caption) => ({ kind: 'image', to, link, caption: caption ? clip(caption, 900) : undefined });

/** The Meta product catalog, rendered natively by WhatsApp. */
export const productList = (to, { catalogId, header, body, footer, sections }) => ({
  kind: 'product_list',
  to,
  catalogId,
  header: clip(header, 60),
  body: clip(body, 1024),
  footer: footer ? clip(footer, 60) : undefined,
  sections,
});

export const template = (to, name, language, params = []) => ({ kind: 'template', to, name, language, params });

/**
 * Picks the richest format WhatsApp allows for a set of options:
 * reply buttons (<=3 short titles), a list (<=10 rows), or numbered text.
 * Customers can always answer by number or by typing the option's name.
 */
export function choice(to, body, options, { buttonLabel, footer, header, numberHint }) {
  // Grouped options deserve a list even when few: the aisles are the point.
  const grouped = options.some((o) => o.group);
  const fitsButtons = !grouped && options.length <= BUTTON_MAX
    && options.every((o) => chars(o.title).length <= BUTTON_TITLE_MAX);
  if (fitsButtons) return buttons(to, body, options, footer);
  if (options.length <= LIST_ROWS_MAX) return list(to, body, buttonLabel, options, footer, header);
  const lines = options.map((o, i) => `*${i + 1}.* ${o.title}${o.description ? ` — ${o.description}` : ''}`);
  return text(to, `${body}\n\n${lines.join('\n')}\n\n${numberHint}`);
}

/** Human-readable one-liner, used for the message log shown in the admin dashboard. */
export function summarize(msg) {
  switch (msg.kind) {
    case 'text':
      return msg.body;
    case 'buttons':
      return `${msg.body}\n[${msg.buttons.map((b) => b.title).join('] [')}]`;
    case 'list':
      return `${msg.body}\n[${msg.rows.map((r) => r.title).join(' | ')}]`;
    case 'image':
      return `(image) ${msg.caption || msg.link}`;
    case 'product_list':
      return `${msg.body}\n[${msg.sections.flatMap((sec) => sec.items).join(' | ')}]`;
    case 'template':
      return `(template ${msg.name}) ${msg.params.join(' · ')}`;
    default:
      return JSON.stringify(msg);
  }
}
