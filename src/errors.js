// The two pages nobody designs and everybody eventually sees: a wrong URL and
// a crash. Without these, Express answers with its own bare "Cannot GET /x",
// in English, unstyled -- including to a customer opening a stale tracking link.
import { logger } from './utils/logger.js';
import { esc } from './admin/views.js';
import { CSS, FONT_LINK, FAVICON, icon } from './admin/theme.js';

const COPY = {
  fr: {
    notFoundTitle: 'Page introuvable',
    notFoundText: 'Ce lien n’existe pas, ou n’est plus valable.',
    forbiddenTitle: 'Accès refusé',
    forbiddenText: 'Votre compte n’a pas accès à cette partie du tableau de bord.',
    errorTitle: 'Une erreur est survenue',
    errorText: 'Le problème vient de nous. Réessayez dans un instant.',
    backAdmin: 'Retour au tableau de bord',
    lang: 'fr',
  },
  en: {
    notFoundTitle: 'Page not found',
    notFoundText: 'This link does not exist, or is no longer valid.',
    forbiddenTitle: 'Access denied',
    forbiddenText: 'Your account cannot open this part of the dashboard.',
    errorTitle: 'Something went wrong',
    errorText: 'The problem is on our side. Please try again in a moment.',
    backAdmin: 'Back to the dashboard',
    lang: 'en',
  },
};

const copyFor = (req) =>
  (/(^|;\s*)admin_lang=en(;|$)/.test(req.get('cookie') || '') ? COPY.en : COPY.fr);

function page(L, { code, title, text, href, label }) {
  return `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
${FAVICON}${FONT_LINK}<style>${CSS}</style></head>
<body><div class="errpage"><div class="errpage__code">${code}</div>
<div class="errpage__icon">${icon('alert', 30)}</div>
<h1>${esc(title)}</h1><p>${esc(text)}</p>
${href ? `<a class="btn btn--primary" href="${href}">${esc(label)}</a>` : ''}</div></body></html>`;
}

/** Renders the themed error page at any status. Used by the handlers and by routes. */
export function sendError(req, res, status = 404) {
  const L = copyFor(req);
  const key = status === 404 ? 'notFound' : status === 403 ? 'forbidden' : 'error';
  res.status(status).type('html').send(
    page(L, {
      code: status,
      title: L[`${key}Title`],
      text: L[`${key}Text`],
      href: req.path.startsWith('/admin') ? '/admin' : null,
      label: L.backAdmin,
    }),
  );
}

/** Last route: nothing matched, so the URL is wrong. */
export const notFoundHandler = (req, res) => sendError(req, res, 404);

/** Anything thrown by a route ends here. The reason goes to the log, never to the page. */
export function errorHandler(err, req, res, _next) {
  logger.error('Unhandled error:', err.stack || err.message);
  sendError(req, res, err.status || 500);
}
