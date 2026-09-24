// Jampack design system, ported to the plain server-rendered dashboard.
//
// Tokens are copied literally from the theme's SCSS
// (vue-jampack-classic/src/styles/scss/variables.scss, "Teal Primary Edition"):
// primary #007D88, success #00D67F, info #18DDEF, warning #FFC400, danger #FF0000,
// black #2F343A, gray #9E9E9E, body font 'DM Sans', radius .375rem, sidebar 270px
// (72px collapsed), header 65px. SCSS mix() shades are resolved to hex here since
// there is no build step.

// Favicon: a chilli on the brand teal, inlined so no extra request is made.
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="#007D88"/>
<path d="M19.8 8.4c.1-1.5 1.2-2.6 2.7-2.6" fill="none" stroke="#7BD88F" stroke-width="2.1" stroke-linecap="round"/>
<path d="M19.9 9.1c2.7 1.5 4 4.5 3.2 7.5-1 3.9-4.7 6.7-9.1 7.3-2.7.4-5.1-.4-6.3-2-.5-.7 0-1.6.9-1.6 3.7-.1 6.5-1.6 8.1-4.1 1.1-1.6 1.5-3.5 1.3-5.3-.2-1.4.9-2.5 1.9-1.8z" fill="#fff"/>
</svg>`;

export const FAVICON =
  `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}">` +
  '<meta name="theme-color" content="#007D88">';

export const FAVICON_SOURCE = FAVICON_SVG;

export const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap">';

const LIGHT_TOKENS = `
/* ------------------------------- tokens -------------------------------- */
:root{
  --primary:#007D88;--primary-dark-1:#00707A;--primary-dark-2:#00646D;
  --primary-light-1:#3D9CA5;--primary-light-2:#6BB4BA;--primary-light-5:#EBF5F6;
  --success:#00D67F;--info:#18DDEF;--warning:#FFC400;--danger:#FF0000;
  --gray:#9E9E9E;--black:#2F343A;--black-2:#262A2E;

  --bs-body-bg:#F7F7F7;--bs-body-color:#6F6F6F;--bs-emphasis-color:#262A2E;
  --hk-bg-primary:#FFFFFF;--hk-bg-secondary:#F7F7F7;--hk-bg-tertiary:#EAEAEA;--hk-bg-hover:#F2F2F2;
  --hk-text-primary:#262A2E;--hk-text-secondary:#6F6F6F;--hk-text-tertiary:#9E9E9E;
  --hk-border-primary:#EAEAEA;--hk-border-secondary:#D8D8D8;
  --hk-menu-bg:#FFFFFF;--hk-menu-text:#262A2E;--hk-menu-border:#EAEAEA;
  --hk-menu-item-active-bg:rgba(0,125,136,.15);--hk-menu-item-active-text:#007D88;
  --hk-menu-icon-color:#6F6F6F;--hk-menu-header-text:#9E9E9E;

  --soft-primary:#E0EEF0;--soft-success:#DDF9EE;--soft-info:#E2FAFD;
  --soft-warning:#FFF5D9;--soft-danger:#FFE0E0;--soft-gray:#EFEFEF;
  --on-soft-primary:#00646D;--on-soft-success:#00794A;--on-soft-info:#0E7F8B;
  --on-soft-warning:#8A6A00;--on-soft-danger:#B30000;--on-soft-gray:#5F5F5F;

  --radius:.375rem;--radius-sm:.25rem;--radius-lg:.5rem;--radius-xl:1rem;--radius-pill:50rem;
  --shadow-sm:0 .125rem .25rem rgba(47,52,58,.075);
  --shadow:0 .5rem 1rem rgba(47,52,58,.08);
  --shadow-lg:0 1rem 3rem rgba(47,52,58,.12);
  --sidebar:270px;--header:65px;
  color-scheme:light;
}
`;

// The dark palette is emitted twice: once for an explicit choice, once for
// viewers whose system is dark and who have not chosen light.
const DARK = `--primary:#007D88;--primary-dark-1:#00707A;--primary-light-5:#0B2E31;
  --bs-body-bg:#1A1D20;--bs-body-color:#B5B5B5;--bs-emphasis-color:#FFFFFF;
  --hk-bg-primary:#212529;--hk-bg-secondary:#2B3035;--hk-bg-tertiary:#343A40;--hk-bg-hover:#2A2E32;
  --hk-text-primary:#E9ECEF;--hk-text-secondary:#B5B5B5;--hk-text-tertiary:#8B9198;
  --hk-border-primary:#35393F;--hk-border-secondary:#41464B;
  --hk-menu-bg:#212529;--hk-menu-text:#E9ECEF;--hk-menu-border:#35393F;
  --hk-menu-item-active-bg:rgba(0,125,136,.22);--hk-menu-item-active-text:#3D9CA5;
  --hk-menu-icon-color:#B5B5B5;--hk-menu-header-text:#8B9198;

  --soft-primary:#00191B;--soft-success:#002B19;--soft-info:#052C30;
  --soft-warning:#332700;--soft-danger:#330000;--soft-gray:#2B2B2B;
  --on-soft-primary:#3D9CA5;--on-soft-success:#4FE3A8;--on-soft-info:#5CE7F4;
  --on-soft-warning:#FFD34D;--on-soft-danger:#FF6B6B;--on-soft-gray:#B5B5B5;

  --shadow-sm:0 .125rem .25rem rgba(0,0,0,.3);
  --shadow:0 .5rem 1rem rgba(0,0,0,.35);
  --shadow-lg:0 1rem 3rem rgba(0,0,0,.45);
  color-scheme:dark;`;

export const CSS = `
${LIGHT_TOKENS}
:root[data-bs-theme=dark]{${DARK}}
@media (prefers-color-scheme:dark){:root:not([data-bs-theme=light]){${DARK}}}



/* ------------------------------- base ---------------------------------- */
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bs-body-bg);color:var(--bs-body-color);
  font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:.9375rem;line-height:1.5;
  -webkit-font-smoothing:antialiased}
h1,h2,h3,h4{color:var(--hk-text-primary);font-weight:700;margin:0}
h1{font-size:1.375rem;letter-spacing:-.01em}h2{font-size:1.0625rem}h3{font-size:.9375rem}
a{color:var(--primary);text-decoration:none}a:hover{color:var(--primary-dark-1);text-decoration:underline}
:root[data-bs-theme=dark] a{color:var(--primary-light-1)}
p{margin:0 0 .75rem}ul{margin:.35rem 0;padding-left:1.15rem}
small{font-size:.8125rem}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em}
hr{border:0;border-top:1px solid var(--hk-border-primary);margin:1rem 0}
.muted{color:var(--hk-text-tertiary)}
.strong{color:var(--hk-text-primary);font-weight:700}
.nowrap{white-space:nowrap}
.tabnum{font-variant-numeric:tabular-nums}
:focus-visible{outline:2px solid var(--primary-light-1);outline-offset:2px;border-radius:var(--radius-sm)}

/* ------------------------------ layout --------------------------------- */
.hk-wrapper{min-height:100vh}
#hk-toggle{position:absolute;opacity:0;pointer-events:none}
.hk-nav{position:fixed;inset:0 auto 0 0;width:var(--sidebar);z-index:1030;display:flex;flex-direction:column;
  background:var(--hk-menu-bg);border-right:1px solid var(--hk-menu-border);transition:transform .25s ease}
.hk-nav__brand{height:var(--header);display:flex;align-items:center;gap:.625rem;padding:0 1.1875rem;
  border-bottom:1px solid var(--hk-menu-border);flex:0 0 auto}
.hk-nav__logo{width:34px;height:34px;flex:0 0 auto;border-radius:var(--radius-lg);display:grid;place-items:center;
  background:var(--primary);color:#fff;font-size:1.05rem}
.hk-nav__name{font-weight:700;color:var(--hk-menu-text);font-size:1rem;line-height:1.15;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hk-nav__scroll{flex:1 1 auto;overflow-y:auto;padding:1.25rem 1.5rem 1.5rem}
.hk-nav__head{font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--hk-menu-header-text);padding:0 0 .5rem}
.hk-nav__head+.hk-nav__head,.hk-nav__list+.hk-nav__head{margin-top:1.25rem}
.hk-nav__list{list-style:none;margin:0;padding:0}
.hk-nav__link{display:flex;align-items:center;gap:.875rem;padding:.5rem 1rem;margin:0 -1rem;border-radius:var(--radius-lg);
  color:var(--hk-menu-text);font-weight:500;line-height:1.35}
.hk-nav__link:hover{background:var(--hk-bg-hover);text-decoration:none;color:var(--hk-menu-text)}
.hk-nav__link svg{flex:0 0 auto;color:var(--hk-menu-icon-color)}
.hk-nav__link.on{background:var(--hk-menu-item-active-bg);color:var(--hk-menu-item-active-text);font-weight:700}
.hk-nav__link.on svg{color:var(--hk-menu-item-active-text)}
.hk-nav__count{margin-left:auto}
.hk-nav__foot{flex:0 0 auto;border-top:1px solid var(--hk-menu-border);padding:.875rem 1.5rem;font-size:.8125rem}
.hk-scrim{display:none;position:fixed;inset:0;z-index:1025;background:rgba(47,52,58,.5);backdrop-filter:blur(2px)}

.hk-top{position:fixed;top:0;right:0;left:var(--sidebar);height:var(--header);z-index:1020;display:flex;align-items:center;
  gap:.75rem;padding:0 1.25rem;background:var(--hk-bg-primary);border-bottom:1px solid var(--hk-border-primary)}
.hk-top__title{font-weight:700;color:var(--hk-text-primary);font-size:1.0625rem;margin-right:auto;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hk-burger{display:none;align-items:center;justify-content:center;width:38px;height:38px;flex:0 0 auto;
  border-radius:var(--radius-lg);color:var(--hk-text-secondary);cursor:pointer}
.hk-burger:hover{background:var(--hk-bg-hover)}
.hk-page{padding:calc(var(--header) + 1.5rem) 1.5rem 3rem;margin-left:var(--sidebar)}
.hk-page__head{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin-bottom:1.25rem}
.hk-page__head .spacer{margin-left:auto}
@media (max-width:1199px){
  .hk-nav{transform:translateX(-100%);box-shadow:var(--shadow-lg)}
  #hk-toggle:checked~.hk-nav{transform:none}
  #hk-toggle:checked~.hk-scrim{display:block}
  .hk-top{left:0}.hk-page{margin-left:0}.hk-burger{display:flex}
}
@media (max-width:575px){.hk-page{padding-left:1rem;padding-right:1rem}.hk-top{padding:0 1rem}}

/* ------------------------------- cards --------------------------------- */
.card{background:var(--hk-bg-primary);border:1px solid var(--hk-border-primary);border-radius:var(--radius-lg);
  box-shadow:var(--shadow-sm)}
.card+.card{margin-top:1rem}
.card__head{display:flex;align-items:center;gap:.625rem;flex-wrap:wrap;padding:.875rem 1.125rem;
  border-bottom:1px solid var(--hk-border-primary)}
.card__head .spacer{margin-left:auto}
.card__head h2,.card__head h3{font-size:.9375rem}
.card__body{padding:1.125rem}
.card__body>:last-child{margin-bottom:0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:1rem}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1rem}
.section{margin-top:1.75rem}
.section__title{display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem}
.section__title .spacer{margin-left:auto}

/* --------------------------- stat tiles -------------------------------- */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1rem}
.stat{display:flex;align-items:flex-start;gap:.875rem;background:var(--hk-bg-primary);
  border:1px solid var(--hk-border-primary);border-radius:var(--radius-lg);padding:1.0625rem 1.125rem;
  box-shadow:var(--shadow-sm);min-width:0}
.stat>span:last-child{min-width:0;flex:1 1 auto}
.stat__icon{width:44px;height:44px;flex:0 0 auto;border-radius:var(--radius-lg);display:grid;place-items:center}
/* Amounts stay on one line: they are the thing being read at a glance. */
.stat__value{display:block;font-size:1.3125rem;font-weight:700;color:var(--hk-text-primary);line-height:1.2;
  font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stat__label{display:block;font-size:.8125rem;color:var(--hk-text-tertiary);margin-top:.15rem}
.stat__hint{display:block;font-size:.75rem;color:var(--hk-text-tertiary);opacity:.85}
@media (max-width:575px){
  .stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:.625rem}
  .stat{flex-direction:column;align-items:flex-start;gap:.5rem;padding:.875rem}
  .stat__icon{width:34px;height:34px}
  .stat__value{font-size:1.0625rem}
}

/* ------------------------------ badges --------------------------------- */
.badge{display:inline-flex;align-items:center;gap:.3rem;padding:.25rem .5625rem;border-radius:var(--radius-pill);
  font-size:.75rem;font-weight:700;line-height:1.35;white-space:nowrap}
.badge--primary{background:var(--soft-primary);color:var(--on-soft-primary)}
.badge--success{background:var(--soft-success);color:var(--on-soft-success)}
.badge--info{background:var(--soft-info);color:var(--on-soft-info)}
.badge--warning{background:var(--soft-warning);color:var(--on-soft-warning)}
.badge--danger{background:var(--soft-danger);color:var(--on-soft-danger)}
.badge--gray{background:var(--soft-gray);color:var(--on-soft-gray)}
.badge--solid{background:var(--primary);color:#fff}
.dot{width:.5rem;height:.5rem;border-radius:50%;background:currentColor;flex:0 0 auto}

.avatar{width:38px;height:38px;flex:0 0 auto;border-radius:50%;display:grid;place-items:center;font-weight:700;
  font-size:.875rem;background:var(--soft-primary);color:var(--on-soft-primary);text-transform:uppercase}

/* ------------------------------ buttons -------------------------------- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;font:inherit;font-weight:500;
  padding:.4375rem .875rem;border:1px solid var(--hk-border-secondary);border-radius:var(--radius);cursor:pointer;
  background:var(--hk-bg-primary);color:var(--hk-text-primary);text-decoration:none;white-space:nowrap;
  transition:background .15s,border-color .15s}
.btn:hover{background:var(--hk-bg-hover);color:var(--hk-text-primary);text-decoration:none}
.btn--primary{background:var(--primary);border-color:var(--primary);color:#fff;font-weight:700}
.btn--primary:hover{background:var(--primary-dark-1);border-color:var(--primary-dark-1);color:#fff}
.btn--danger{color:var(--on-soft-danger);border-color:var(--hk-border-secondary)}
.btn--danger:hover{background:var(--soft-danger)}
.btn--ghost{border-color:transparent;background:transparent}
.btn--ghost:hover{background:var(--hk-bg-hover)}
.btn--sm{padding:.25rem .5625rem;font-size:.8125rem}
.btn--block{width:100%}
.btn[aria-current=true],.btn.on{background:var(--primary);border-color:var(--primary);color:#fff;font-weight:700}
.btn:disabled,.btn[aria-disabled=true]{opacity:.55;pointer-events:none}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;flex:0 0 auto;
  border:0;background:transparent;border-radius:var(--radius-lg);color:var(--hk-text-secondary);cursor:pointer}
.icon-btn:hover{background:var(--hk-bg-hover);color:var(--hk-text-primary);text-decoration:none}
.actions{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.actions--end{justify-content:flex-end}
form.inline{display:inline-flex;gap:.375rem;align-items:center}
.toolbar{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:1.25rem}
.segmented{display:inline-flex;background:var(--hk-bg-tertiary);border-radius:var(--radius);padding:.1875rem;gap:.1875rem}
.segmented a{padding:.3125rem .75rem;border-radius:var(--radius-sm);font-size:.8125rem;font-weight:500;
  color:var(--hk-text-secondary)}
.segmented a:hover{text-decoration:none;color:var(--hk-text-primary)}
.segmented a.on{background:var(--hk-bg-primary);color:var(--hk-text-primary);font-weight:700;box-shadow:var(--shadow-sm)}

/* ------------------------------- forms --------------------------------- */
label{font-size:.8125rem;font-weight:500;color:var(--hk-text-secondary)}
.field{display:flex;flex-direction:column;gap:.25rem}
.field--grow{flex:1 1 9rem;min-width:0}
input,select,textarea{font:inherit;color:var(--hk-text-primary);background:var(--hk-bg-primary);
  border:1px solid var(--hk-border-secondary);border-radius:var(--radius);padding:.4375rem .625rem;max-width:100%}
input:focus,select:focus,textarea:focus{outline:0;border-color:var(--primary-light-1);
  box-shadow:0 0 0 .2rem rgba(0,125,136,.18)}
input::placeholder,textarea::placeholder{color:var(--hk-text-tertiary)}
input[type=number]{width:7em}input[type=date]{color-scheme:inherit}
textarea{width:100%;resize:vertical}
select{appearance:none;padding-right:1.75rem;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%239E9E9E' stroke-width='1.6'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right .5rem center;background-size:14px}
.switch{display:inline-flex;align-items:center;gap:.5rem;cursor:pointer}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.875rem}
.form-note{font-size:.8125rem;color:var(--hk-text-tertiary);margin-top:.35rem}

/* ------------------------------- tables -------------------------------- */
.table-wrap{overflow-x:auto;border:1px solid var(--hk-border-primary);border-radius:var(--radius-lg);
  background:var(--hk-bg-primary);box-shadow:var(--shadow-sm)}
.card .table-wrap{border:0;border-radius:0;box-shadow:none}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:.6875rem .875rem;border-bottom:1px solid var(--hk-border-primary);vertical-align:middle}
th{font-size:.75rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--hk-text-tertiary);
  background:var(--hk-bg-secondary);white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:var(--hk-bg-hover)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.num input[type=number]{width:6em;text-align:right}
td .switch{white-space:nowrap}

/* ------------------------------ feedback ------------------------------- */
.alert{display:flex;align-items:flex-start;gap:.625rem;padding:.75rem 1rem;border-radius:var(--radius-lg);
  background:var(--soft-primary);color:var(--on-soft-primary);font-weight:500;margin-bottom:1.25rem}
.alert--warning{background:var(--soft-warning);color:var(--on-soft-warning)}
.alert--danger{background:var(--soft-danger);color:var(--on-soft-danger)}
.alert svg{flex:0 0 auto;margin-top:.1rem}
.empty{text-align:center;padding:2.25rem 1rem;color:var(--hk-text-tertiary)}
.empty svg{color:var(--hk-border-secondary);margin-bottom:.5rem}
.empty p{margin:0}

/* display:flex below outranks the browser's [hidden] rule, so say it here. */
[hidden]{display:none!important}
.toast{position:fixed;right:1rem;bottom:1rem;z-index:1040;max-width:min(22rem,calc(100vw - 2rem));
  display:flex;align-items:center;gap:.5rem;padding:.625rem .875rem;border-radius:var(--radius-lg);
  background:var(--hk-text-primary);color:var(--hk-bg-primary);font-weight:500;font-size:.875rem;
  box-shadow:var(--shadow-lg);animation:toast-in .2s ease}
.toast--action{background:var(--primary);color:#fff;cursor:pointer;text-decoration:underline}
@keyframes toast-in{from{opacity:0;transform:translateY(.5rem)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.toast{animation:none}}

/* -------------------------------- chat --------------------------------- */
.chat{display:flex;flex-direction:column;gap:.5rem;max-height:32rem;overflow-y:auto;padding:.25rem}
.msg{max-width:min(85%,34rem);padding:.5625rem .75rem;border-radius:var(--radius-lg);white-space:pre-wrap;
  word-break:break-word;font-size:.875rem;line-height:1.45}
.msg.in{background:var(--hk-bg-secondary);color:var(--hk-text-primary);align-self:flex-start;border-bottom-left-radius:var(--radius-sm)}
.msg.out{background:var(--primary);color:#fff;align-self:flex-end;border-bottom-right-radius:var(--radius-sm)}
.msg.out a{color:#fff;text-decoration:underline}
.msg time{display:block;font-size:.6875rem;opacity:.7;margin-top:.25rem}
.msg img{display:block;max-width:220px;border-radius:var(--radius);margin-top:.35rem}

/* -------------------------------- chart -------------------------------- */
.chart{position:relative;height:230px;margin:1rem 0 2rem 3rem}
.chart .gl{position:absolute;left:0;right:0;border-top:1px dashed var(--hk-border-primary)}
.chart .gl span{position:absolute;right:calc(100% + .5rem);top:-.6em;font-size:.7rem;color:var(--hk-text-tertiary);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.chart .cols{position:absolute;inset:0;display:flex;align-items:flex-end}
.col{flex:1 1 0;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;
  position:relative;outline:none}
.col .colbar{width:min(22px,60%);background:var(--primary);border-radius:var(--radius-sm) var(--radius-sm) 0 0;transition:filter .15s}
.col:hover .colbar,.col:focus .colbar{filter:brightness(1.2)}
.col .cap{position:absolute;font-size:.7rem;font-weight:700;color:var(--hk-text-primary);white-space:nowrap}
.col .x{position:absolute;top:calc(100% + .4rem);font-size:.7rem;color:var(--hk-text-tertiary);white-space:nowrap}
.col:first-child .x{left:0}.col:last-child .x{right:0}
@media (max-width:600px){.col .x.minor{display:none}}
.tip{position:absolute;pointer-events:none;display:none;white-space:nowrap;z-index:3;
  background:var(--hk-bg-primary);border:1px solid var(--hk-border-primary);border-radius:var(--radius-lg);
  padding:.4375rem .625rem;font-size:.8125rem;box-shadow:var(--shadow)}
.tip b{display:block;font-size:.9375rem;color:var(--hk-text-primary)}


/* ------------------------- header search & menus ----------------------- */
.hk-search{position:relative;flex:1 1 20rem;max-width:26rem;min-width:0}
.hk-search input{width:100%;padding-left:2.25rem;background:var(--hk-bg-secondary);border-color:transparent}
.hk-search input:focus{background:var(--hk-bg-primary)}
.hk-search__icon{position:absolute;left:.6875rem;top:50%;transform:translateY(-50%);color:var(--hk-text-tertiary);
  pointer-events:none;display:flex}
.hk-search kbd{position:absolute;right:.5rem;top:50%;transform:translateY(-50%);font:inherit;font-size:.6875rem;
  color:var(--hk-text-tertiary);background:var(--hk-bg-tertiary);border-radius:var(--radius-sm);padding:.1rem .3rem;
  pointer-events:none}
@media (max-width:767px){.hk-search{display:none}.hk-search--open{display:block;position:absolute;inset:0 1rem;
  z-index:2;background:var(--hk-bg-primary);display:flex;align-items:center}}

.menu{position:relative}
.menu__panel{position:absolute;right:0;top:calc(100% + .5rem);min-width:14rem;z-index:1035;
  background:var(--hk-bg-primary);border:1px solid var(--hk-border-primary);border-radius:var(--radius-lg);
  box-shadow:var(--shadow-lg);padding:.375rem;display:none}
.menu__panel[data-open]{display:block}
.menu__item{display:flex;align-items:center;gap:.625rem;padding:.5rem .625rem;border-radius:var(--radius);
  color:var(--hk-text-primary);font-size:.875rem;white-space:nowrap}
.menu__item:hover{background:var(--hk-bg-hover);text-decoration:none;color:var(--hk-text-primary)}
.menu__item svg{color:var(--hk-text-tertiary);flex:0 0 auto}
.menu__sep{height:1px;background:var(--hk-border-primary);margin:.375rem -.375rem}
.menu__head{padding:.5rem .625rem;font-size:.75rem;color:var(--hk-text-tertiary);font-weight:700;
  text-transform:uppercase;letter-spacing:.05em}

/* --------------------------------- tabs -------------------------------- */
.tabs{display:flex;gap:.25rem;border-bottom:1px solid var(--hk-border-primary);margin-bottom:1.25rem;
  overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tabs a{display:flex;align-items:center;gap:.4375rem;padding:.625rem .875rem;font-weight:500;font-size:.875rem;
  color:var(--hk-text-secondary);border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.tabs a:hover{color:var(--hk-text-primary);text-decoration:none}
.tabs a.on{color:var(--primary);border-bottom-color:var(--primary);font-weight:700}
:root[data-bs-theme=dark] .tabs a.on{color:var(--primary-light-1);border-bottom-color:var(--primary-light-1)}
.tabs a svg{flex:0 0 auto}

/* ------------------------------- filters ------------------------------- */
.filters{display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end;padding:.875rem 1.125rem;
  background:var(--hk-bg-primary);border:1px solid var(--hk-border-primary);border-radius:var(--radius-lg);
  margin-bottom:1rem;box-shadow:var(--shadow-sm)}
.filters .field{gap:.1875rem}
.filters label{font-size:.75rem}
.chips{display:flex;gap:.375rem;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:.375rem;padding:.25rem .5rem .25rem .625rem;border-radius:var(--radius-pill);
  background:var(--hk-bg-tertiary);color:var(--hk-text-secondary);font-size:.75rem;font-weight:500}
.chip a{display:flex;color:var(--hk-text-tertiary)}
.chip a:hover{color:var(--on-soft-danger)}

/* ------------------------------ pagination ----------------------------- */
.pager{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-top:1rem}
.pager__info{color:var(--hk-text-tertiary);font-size:.8125rem;margin-right:auto}

/* ---------------------------- sortable tables -------------------------- */
th a{color:inherit;display:inline-flex;align-items:center;gap:.25rem}
th a:hover{color:var(--hk-text-primary);text-decoration:none}
th a .sort{opacity:.35}
th a.on .sort{opacity:1;color:var(--primary)}
.row-actions{display:flex;gap:.25rem;justify-content:flex-end}
.row-actions .icon-btn{width:32px;height:32px;border-radius:var(--radius)}
.row-actions .icon-btn--danger:hover{background:var(--soft-danger);color:var(--on-soft-danger)}
.row-actions form{display:inline-flex}

/* tooltip on icon-only controls */
[data-tip]{position:relative}
[data-tip]:hover::after,[data-tip]:focus-visible::after{content:attr(data-tip);position:absolute;bottom:calc(100% + .35rem);
  left:50%;transform:translateX(-50%);background:var(--hk-text-primary);color:var(--hk-bg-primary);font-size:.6875rem;
  font-weight:500;padding:.1875rem .4375rem;border-radius:var(--radius-sm);white-space:nowrap;z-index:5;pointer-events:none}

/* -------------------------------- charts ------------------------------- */
.chart-svg{display:block;width:100%;height:auto;overflow:visible}
.chart-svg .grid{stroke:var(--hk-border-primary);stroke-dasharray:3 3}
.chart-svg .axis{fill:var(--hk-text-tertiary);font-size:10px;font-family:inherit}
.chart-svg .area{fill:var(--primary);opacity:.12}
.chart-svg .line{fill:none;stroke:var(--primary);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.chart-svg .pt{fill:var(--hk-bg-primary);stroke:var(--primary);stroke-width:2}
.chart-svg .bar{fill:var(--primary)}
.chart-svg .bar:hover{opacity:.82}
.legend{display:flex;gap:.875rem;flex-wrap:wrap;margin-top:.75rem;font-size:.8125rem}
.legend span{display:inline-flex;align-items:center;gap:.375rem;color:var(--hk-text-secondary)}
.legend i{width:.625rem;height:.625rem;border-radius:2px;display:block}
.hbars{display:flex;flex-direction:column;gap:.6875rem}
.hbar{display:grid;grid-template-columns:minmax(6rem,9rem) 1fr auto;gap:.75rem;align-items:center;font-size:.875rem}
.hbar__name{color:var(--hk-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hbar__track{height:.5rem;background:var(--hk-bg-tertiary);border-radius:var(--radius-pill);overflow:hidden}
.hbar__fill{height:100%;background:var(--primary);border-radius:var(--radius-pill)}
.hbar__val{color:var(--hk-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.spark{display:block;height:2rem;width:100%;overflow:visible}
.spark path{fill:none;stroke:currentColor;stroke-width:1.75;stroke-linejoin:round;stroke-linecap:round}
.trend{display:inline-flex;align-items:center;gap:.2rem;font-size:.75rem;font-weight:700}
.trend--up{color:var(--on-soft-success)}
.trend--down{color:var(--on-soft-danger)}
.trend--flat{color:var(--hk-text-tertiary)}

/* ------------------------------- timeline ------------------------------ */
.timeline{list-style:none;margin:0;padding:0;position:relative}
.timeline::before{content:"";position:absolute;left:15px;top:.5rem;bottom:.5rem;width:1px;background:var(--hk-border-primary)}
.timeline li{position:relative;padding:0 0 1.125rem 2.5rem;min-height:2rem}
.timeline li:last-child{padding-bottom:0}
.timeline__dot{position:absolute;left:0;top:0;width:31px;height:31px;border-radius:50%;display:grid;place-items:center;
  background:var(--hk-bg-primary);border:1px solid var(--hk-border-primary);z-index:1}
.timeline__title{color:var(--hk-text-primary);font-weight:500}
.timeline__meta{font-size:.75rem;color:var(--hk-text-tertiary)}

/* ------------------------------- invoice ------------------------------- */
.doc{max-width:48rem;margin:0 auto;background:var(--hk-bg-primary);border:1px solid var(--hk-border-primary);
  border-radius:var(--radius-lg);padding:2rem}
.doc__head{display:flex;gap:1.5rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:1.75rem}
.doc__brand{font-size:1.25rem;font-weight:700;color:var(--hk-text-primary)}
.doc__qr{margin-left:auto;text-align:center;font-size:.6875rem;color:var(--hk-text-tertiary);max-width:7.5rem}
.doc__qr svg{width:6.5rem;height:6.5rem;display:block;margin:0 auto .35rem;background:#fff;padding:.375rem;
  border-radius:var(--radius);box-sizing:content-box}
.doc__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:1.25rem;margin-bottom:1.5rem}
.doc__label{font-size:.6875rem;text-transform:uppercase;letter-spacing:.05em;color:var(--hk-text-tertiary);
  font-weight:700;margin-bottom:.25rem}
.doc__total{display:flex;justify-content:space-between;gap:1rem;padding:.35rem 0}
.doc__total--grand{border-top:2px solid var(--hk-border-secondary);margin-top:.5rem;padding-top:.6rem;
  font-size:1.0625rem;font-weight:700;color:var(--hk-text-primary)}
.doc__foot{margin-top:1.75rem;padding-top:1rem;border-top:1px solid var(--hk-border-primary);
  font-size:.75rem;color:var(--hk-text-tertiary)}
.verify{max-width:26rem;margin:3rem auto;text-align:center}
.verify__mark{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;margin:0 auto 1rem}

/* ------------------------------ utilities ------------------------------ */
.stack{display:flex;flex-direction:column;gap:.25rem}
.inline-list{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.tag{display:inline-flex;align-items:center;gap:.25rem;padding:.125rem .4375rem;border-radius:var(--radius-sm);
  background:var(--soft-primary);color:var(--on-soft-primary);font-size:.6875rem;font-weight:700}
.kv{display:grid;grid-template-columns:auto 1fr;gap:.35rem .875rem;font-size:.875rem}
.kv dt{color:var(--hk-text-tertiary)}
.kv dd{margin:0;color:var(--hk-text-primary);font-weight:500}
.scroll-y{max-height:26rem;overflow-y:auto}

/* ------------------------------ printing ------------------------------- */
@media print{
  .hk-nav,.hk-top,.hk-scrim,.actions,.toolbar,.filters,.pager,.tabs,.no-print,.toast{display:none!important}
  .hk-page{margin:0;padding:0}
  .card,.doc{break-inside:avoid;box-shadow:none;border:0}
  .doc{max-width:none;padding:0}
  a[href]::after{content:""}
  body{background:#fff;color:#000;font-size:11pt}
  .table-wrap{overflow:visible;border:0}
  th{background:#f1f1f1!important;color:#000!important}
  @page{margin:14mm}
}
dialog.confirm{border:0;padding:0;background:transparent;max-width:min(26rem,calc(100vw - 2rem));color:inherit}
dialog.confirm::backdrop{background:rgba(15,23,26,.55);backdrop-filter:blur(2px)}
.confirm__box{background:var(--hk-bg-primary);border:1px solid var(--hk-border-primary);
  border-radius:var(--radius-lg);box-shadow:0 18px 48px rgba(0,0,0,.28);padding:1.25rem 1.375rem 1.125rem}
.confirm__head{display:flex;align-items:center;gap:.75rem;margin-bottom:.625rem}
.confirm__icon{width:40px;height:40px;flex:0 0 auto;border-radius:var(--radius-lg);display:grid;place-items:center;
  background:var(--soft-gray);color:var(--on-soft-gray)}
dialog.confirm[data-tone=danger] .confirm__icon{background:var(--soft-danger);color:var(--on-soft-danger)}
.confirm__title{font-size:1rem;font-weight:700;margin:0;color:var(--hk-text-primary)}
.confirm__msg{margin:0;color:var(--hk-text-secondary);line-height:1.5}
.confirm__actions{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1.125rem}
dialog.confirm[data-tone=danger] .confirm__ok{background:var(--danger);border-color:var(--danger);color:#fff}
dialog.confirm[data-tone=danger] .confirm__ok:hover{filter:brightness(.92)}
@media (prefers-reduced-motion:no-preference){
  dialog.confirm[open] .confirm__box{animation:confirm-in .16s ease-out}
  @keyframes confirm-in{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
}
@media print{dialog.confirm{display:none!important}}
.pay-grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))}
.pay .card__body{display:flex;flex-direction:column;gap:.625rem}
.pay__head{display:flex;align-items:center;gap:.625rem}
.pay__who{display:flex;flex-direction:column;min-width:0;line-height:1.3}
.pay__who a{font-weight:700}
.pay__who .muted{font-size:.8125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pay__amount{margin-left:auto;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;
  display:flex;flex-direction:column;align-items:flex-end;gap:.25rem}
.pay__meta{display:flex;align-items:center;flex-wrap:wrap;gap:.4rem;margin:0;font-size:.8125rem;
  color:var(--hk-text-secondary)}
.pay__proof{display:block;border-radius:var(--radius-lg);overflow:hidden;background:var(--hk-bg-secondary);
  border:1px solid var(--hk-border-primary)}
.pay__proof img{display:block;width:100%;height:13rem;object-fit:cover}
.pay__proof--none{height:7rem;display:grid;place-items:center;gap:.35rem;align-content:center;
  color:var(--hk-text-tertiary);font-size:.8125rem;text-align:center;padding:.5rem}
.pay__actions{display:flex;align-items:center;gap:.4rem}
.pay__actions .btn{margin-left:auto}
.pay__actions form{display:inline-flex}
.icon-btn--success:hover{background:var(--soft-success);color:var(--on-soft-success)}
.auth{min-height:100vh;display:grid;place-content:center;justify-items:center;gap:1.25rem;
  padding:2.5rem 1.25rem;background:var(--hk-bg-secondary);width:100%}
.auth__brand{display:flex;align-items:center;gap:.625rem;font-size:1.125rem;font-weight:700;
  color:var(--hk-text-primary)}
.auth__logo{width:38px;height:38px;border-radius:var(--radius-lg);display:grid;place-items:center;
  background:var(--primary);color:#fff}
.auth__card{width:min(24rem,100%);padding:1.75rem 1.625rem 1.5rem}
.auth__title{font-size:1.125rem;font-weight:700;text-align:center;margin:0 0 1.25rem}
.auth__card .field{margin-bottom:.875rem}
.auth__check{display:flex;align-items:center;justify-content:center;gap:.45rem;margin:.25rem 0 1rem;
  font-size:.8125rem;color:var(--hk-text-secondary);cursor:pointer}
.auth__submit{text-transform:uppercase;letter-spacing:.04em;padding-top:.5625rem;padding-bottom:.5625rem}
.auth__foot{margin:0;font-size:.8125rem;color:var(--hk-text-tertiary)}
.input-affix{position:relative;display:block}
.input-affix>input{width:100%;padding-right:2.5rem}
.input-suffix{position:absolute;top:50%;right:.5rem;transform:translateY(-50%);display:grid;
  place-items:center;width:1.875rem;height:1.875rem;border:0;background:transparent;cursor:pointer;
  color:var(--hk-text-tertiary);border-radius:var(--radius-sm)}
.input-suffix:hover{color:var(--hk-text-primary);background:var(--hk-bg-hover)}
.input-suffix.on{color:var(--primary)}
.errpage{min-height:100vh;display:grid;place-content:center;justify-items:center;text-align:center;
  gap:.5rem;padding:2rem 1.25rem;background:var(--hk-bg-secondary);color:var(--hk-text-primary)}
.errpage__code{font-size:.8125rem;font-weight:700;letter-spacing:.14em;color:var(--hk-text-tertiary)}
.errpage__icon{width:60px;height:60px;border-radius:var(--radius-xl);display:grid;place-items:center;
  background:var(--soft-gray);color:var(--on-soft-gray);margin:.25rem 0 .5rem}
.errpage h1{font-size:1.375rem;margin:0}
.errpage p{margin:0 0 1rem;color:var(--hk-text-secondary);max-width:26rem}
`;

/* -------------------------------- icons --------------------------------- */
// Tabler icons (the set the theme's sidebar uses), inlined as 24px stroke paths.
const PATHS = {
  receipt: '<path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  basket: '<path d="M5 11h14l-1.2 8.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z"/><path d="M9 11V6a3 3 0 0 1 6 0v5"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5"/><path d="M18 20a5 5 0 0 0-3-4.6"/>',
  chart: '<path d="M4 19h16"/><rect x="5" y="11" width="3.5" height="6" rx="1"/><rect x="10.2" y="7" width="3.5" height="10" rx="1"/><rect x="15.4" y="13" width="3.5" height="4" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="2.6"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.5 1z"/>',
  scooter: '<circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M8 17.5h8"/><path d="M5.5 17.5V13a2 2 0 0 1 2-2h4l3-6h2"/><path d="M16 5h3"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3"/><rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M16.5 13.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 9v4.5M12 17h.01"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/>',
  hand: '<path d="M11 13V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M14 12V6a1.5 1.5 0 0 1 3 0v7"/><path d="M8 13.5V8a1.5 1.5 0 0 1 3 0v5"/><path d="M17 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.3-3.2L5 14.5a1.5 1.5 0 0 1 2.6-1.5L8 13.5"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4.5M9.5 13h.01M14.5 13h.01M9.5 16h5"/>',
  download: '<path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M5 18.5h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3.5 9h17M3.5 15h17"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  back: '<path d="M19 12H5m0 0 6-6m-6 6 6 6"/>',
  star: '<path d="m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9z"/>',
  ticket: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5z"/><path d="M13 6v2M13 11v2M13 16v2"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  eye: '<path d="M2.5 12S5.8 5.5 12 5.5 21.5 12 21.5 12 18.2 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 6.5l3 3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4.5h6V7"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="3.5" y="9" width="17" height="7" rx="2"/><path d="M7 14h10v6H7z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  qr: '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h3v3h-3zM20.5 14.5v3M17.5 20.5h3M14.5 20.5h.01"/>',
  filter: '<path d="M4 5h16l-6.2 7.3V19l-3.6 1.8v-8.5z"/>',
  sort: '<path d="M8 4v16m0 0-3-3m3 3 3-3"/><path d="M16 20V4m0 0-3 3m3-3 3 3"/>',
  gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8.5V20"/><path d="M12 8.5S10.5 4 8.2 4a2.2 2.2 0 0 0 0 4.5zM12 8.5S13.5 4 15.8 4a2.2 2.2 0 0 1 0 4.5z"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8 15.8 6.7M8.2 13.2l7.6 4.1"/>',
  trending: '<path d="M3.5 17 9 11l4 4 7.5-8"/><path d="M15 7h5.5v5.5"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5V10H9"/><path d="M12 8v4.2l2.8 1.7"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  note: '<path d="M5 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h4"/>',
  tag: '<path d="M3.5 10.5V4.5a1 1 0 0 1 1-1h6l9 9a1.5 1.5 0 0 1 0 2.1l-5 5a1.5 1.5 0 0 1-2.1 0z"/><path d="M7.5 7.5h.01"/>',
  megaphone: '<path d="M4 9v5a1 1 0 0 0 1 1h2l8 4.5V4.5L7 9H5a1 1 0 0 0-1 1z"/><path d="M18.5 8.5a5 5 0 0 1 0 7"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z"/><path d="M13.7 19.5a2 2 0 0 1-3.4 0"/>',
  logout: '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="M15.5 16.5 20 12l-4.5-4.5M20 12H9"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-13.8-5.2L3.5 8.5"/><path d="M3.5 4v4.5H8"/><path d="M4 13a8 8 0 0 0 13.8 5.2l2.7-2.7"/><path d="M20.5 20v-4.5H16"/>',
  package: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 21v-9M7.7 5.2l8.6 4.6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 2 2-2 2 2 2-2 2-2-2-2 2z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 5.1A9.5 9.5 0 0 1 12 5c6.2 0 9.5 7 9.5 7a16 16 0 0 1-3.2 4.1"/><path d="M6.6 7.3A15.6 15.6 0 0 0 2.5 12S5.8 19 12 19c1.4 0 2.6-.3 3.7-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  store: '<path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9"/><path d="M3 10 4.8 5A1.5 1.5 0 0 1 6.2 4h11.6a1.5 1.5 0 0 1 1.4 1L21 10a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/>',
};

/** Inline 24px Tabler-style icon. `size` in px, colour inherits via currentColor. */
export function icon(name, size = 20) {
  const d = PATHS[name];
  if (!d) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}
