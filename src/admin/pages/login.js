// The sign-in page, laid out like Jampack's "login classic": brand above a
// bordered card, the two fields, a show-password eye, keep-me-signed-in, and
// a full-width uppercase button.
import { esc } from '../ui.js';
import { CSS, FONT_LINK, FAVICON, icon } from '../theme.js';
import * as settings from '../../shop/settings.js';

export function loginPage(L, { theme = '', error = '', username = '', next = '', bye = false, signedIn = false } = {}) {
  const shop = settings.get().name;
  const notice = error
    ? `<div class="alert alert--danger">${icon('alert', 18)}<span>${esc(error)}</span></div>`
    : bye
      ? `<div class="alert alert--success">${icon('check', 18)}<span>${esc(L.loggedOut)}</span></div>`
      : signedIn
        ? `<div class="alert alert--info">${icon('check', 18)}<span>${esc(L.alreadySignedIn)}
<a href="/admin">${esc(L.backToDashboard)}</a></span></div>`
        : '';
  return `<!doctype html><html lang="${L.lang}"${theme ? ` data-bs-theme="${theme}"` : ''}>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(L.loginTitle)} · ${esc(shop)}</title>${FAVICON}${FONT_LINK}
<style>${CSS}</style></head>
<body><main class="auth">
<div class="auth__brand"><span class="auth__logo">${icon('store', 22)}</span>${esc(shop)}</div>
<div class="card auth__card">
<h1 class="auth__title">${esc(L.loginHeading)}</h1>
${notice}
<form method="post" action="/admin/login" autocomplete="on">
<input type="hidden" name="next" value="${esc(next)}">
<div class="field">
<label for="lg-u">${esc(L.loginUser)}</label>
<input id="lg-u" name="username" value="${esc(username)}" autocomplete="username"
 required autofocus placeholder="${esc(L.loginUserHint)}"></div>
<div class="field">
<label for="lg-p">${esc(L.loginPassword)}</label>
<span class="input-affix">
<input id="lg-p" name="password" type="password" autocomplete="current-password"
 required placeholder="${esc(L.loginPasswordHint)}">
<button type="button" class="input-suffix" id="lg-eye" aria-label="${esc(L.loginShow)}"
 data-tip="${esc(L.loginShow)}">${icon('eye', 18)}</button></span></div>
<label class="auth__check"><input type="checkbox" name="remember" value="1" checked>
<span>${esc(L.loginRemember)}</span></label>
<button class="btn btn--primary btn--block auth__submit">${esc(L.loginSubmit)}</button>
</form></div>
<p class="auth__foot">${esc(L.loginFoot)}</p>
</main>
<script>(function(){
  var eye=document.getElementById('lg-eye'),pw=document.getElementById('lg-p');
  if(!eye||!pw)return;
  eye.addEventListener('click',function(){
    pw.type=pw.type==='password'?'text':'password';
    eye.classList.toggle('on',pw.type==='text');
    pw.focus();
  });
})();</script></body></html>`;
}
