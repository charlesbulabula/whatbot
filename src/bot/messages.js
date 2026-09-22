// Channel-agnostic outbound message builders. The WhatsApp client turns these
// into Graph API payloads; tests inspect them directly.

// WhatsApp interactive limits.
const BUTTON_MAX = 3;
const BUTTON_TITLE_MAX = 20;
const LIST_ROWS_MAX = 10;
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

export const list = (to, body, buttonLabel, options, footer) => ({
  kind: 'list',
  to,
  body: clip(body, BODY_MAX),
  footer: footer ? clip(footer, 60) : undefined,
  button: clip(buttonLabel, 20),
  rows: options.map((o) => ({
    id: o.id,
    title: clip(o.title, LIST_TITLE_MAX),
    description: o.description ? clip(o.description, LIST_DESC_MAX) : undefined,
  })),
});

export const template = (to, name, language, params = []) => ({ kind: 'template', to, name, language, params });

/**
 * Picks the richest format WhatsApp allows for a set of options:
 * reply buttons (<=3 short titles), a list (<=10 rows), or numbered text.
 * Customers can always answer by number or by typing the option's name.
 */
export function choice(to, body, options, { buttonLabel, footer, numberHint }) {
  const fitsButtons = options.length <= BUTTON_MAX && options.every((o) => chars(o.title).length <= BUTTON_TITLE_MAX);
  if (fitsButtons) return buttons(to, body, options, footer);
  if (options.length <= LIST_ROWS_MAX) return list(to, body, buttonLabel, options, footer);
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
    case 'template':
      return `(template ${msg.name}) ${msg.params.join(' · ')}`;
    default:
      return JSON.stringify(msg);
  }
}
