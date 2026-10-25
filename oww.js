// Shared by kitchen.html and inventory.html
const OWW = {
  // Address of the Apps Script Web App and the OneSignal App ID: both are set in config.js (the only file to edit)
  URL: (window.OWW_CONFIG || {}).URL || '',
  tk: null, user: null, hooks: {}, SK: 'oww_s', QK: 'oww_q', // SK/QK = where this app keeps the login / the offline queue (the Owner app uses its own)
  PUSH_APP_ID: (window.OWW_CONFIG || {}).PUSH_APP_ID || '', // phone notifications (OneSignal): empty = off
  $: id => document.getElementById(id),
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
};

// Stock is shown the way the kitchen counts it:  15 Busta in boxes of 6 -> 2B [3 Busta]   5 PZ -> 5 PZ   4.6 KG -> 4.6 KG   (same rule as stockText in Code.gs)
OWW.UL = { PZ: 'PZ', BUSTA: 'Busta', KG: 'KG' };
OWW.fn = n => String(Math.round((+n || 0) * 100) / 100);
OWW.fmtQty = (n, ct, per) => {
  n = Math.round((+n || 0) * 100) / 100; const lab = OWW.UL[ct] || 'PZ';
  if (ct === 'KG' || !(per > 1) || n < per) return OWW.fn(n) + ' ' + lab;
  const b = Math.floor(n / per + 1e-9), r = Math.round((n - b * per) * 100) / 100; return b + 'B' + (r ? ' [' + OWW.fn(r) + ' ' + lab + ']' : '');
};

// one request to any server (the current branch, or the central Owner script)
OWW.call = async (url, tk, action, p = {}, sk = OWW.SK) => {
  let j;
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 45000); // give up after 45 s instead of waiting forever
  try {
    // text/plain body = no CORS preflight, which Apps Script cannot answer
    const r = await fetch(url, { method: 'POST', redirect: 'follow', signal: ac.signal, body: JSON.stringify({ ...p, action, token: tk }) });
    j = await r.json();
  } catch (e) { throw Object.assign(new Error(e.name === 'AbortError' ? 'The server took too long. Please try again.' : 'No connection to the server'), { net: true }); }
  finally { clearTimeout(tm); }
  if (!j.ok) {
    if (j.error === 'AUTH') { if (sk !== OWW.SK) { localStorage.removeItem(sk); location.href = 'owner.html'; } else { const l = (JSON.parse(localStorage.getItem(OWW.SK) || 'null') || {}).layer; localStorage.removeItem(OWW.SK); if (l) location.href = 'owner.html'; else location.reload(); } } // an expired session: back to the right login
    throw new Error(/^Unknown action/.test(j.error) ? 'The server is not updated yet. In Apps Script: Deploy → Manage deployments → pencil → New version → Deploy' : j.error);
  }
  return j.data;
};
// The Owner can only LOOK at a branch (the branch script refuses writes too; this just answers at once)
OWW.RO_OK = ['login', 'me', 'invData', 'today', 'shiftAll', 'shiftMine', 'eventList', 'rotaWeek', 'reqList', 'tempData', 'punctual', 'userList', 'itemCatalog', 'ddtMatch', 'kitchenData', 'salaData', 'recipe', 'countData'];
OWW.api = (action, p = {}) => {
  if (OWW.user && OWW.user.role === 'Owner' && OWW.APP !== 'owner' && !OWW.RO_OK.includes(action)) { OWW.toast('View only: the Owner cannot change data', 'amber'); return Promise.reject(new Error('The Owner view is read-only.')); }
  return OWW.call(OWW.URL, OWW.tk, action, p);
};

OWW.toast = (m, c = 'green') => {
  const t = document.createElement('div'); t.id = 'toast'; t.textContent = m; t.style.background = `var(--${c})`;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2800);
};

// writes that survive a dropped connection (kitchen shifts have bad wifi)
OWW.send = async (action, p) => {
  try { return await OWW.api(action, p); }
  catch (e) {
    if (!e.net) throw e;
    const q = JSON.parse(localStorage.getItem(OWW.QK) || '[]'); q.push({ action, p });
    localStorage.setItem(OWW.QK, JSON.stringify(q)); OWW.toast('Offline — saved, will sync', 'amber');
  }
};
OWW.flush = async () => {
  const q = JSON.parse(localStorage.getItem(OWW.QK) || '[]'); if (!q.length || !OWW.tk) return;
  const left = [];
  for (const i of q) { try { await OWW.api(i.action, i.p); } catch (e) { if (e.net) left.push(i); } }
  localStorage.setItem(OWW.QK, JSON.stringify(left));
  if (left.length < q.length) OWW.toast('Synced ' + (q.length - left.length) + ' saved action(s)');
};
addEventListener('online', OWW.flush);

OWW.go = id => {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === id));
  document.querySelectorAll('.nb').forEach(b => b.classList.toggle('on', b.dataset.p === id));
  OWW.$('main').scrollTop = 0;
  if (OWW.hooks[id]) OWW.hooks[id]();
};

OWW.logout = () => { let l; try { l = (JSON.parse(localStorage.getItem(OWW.SK) || 'null') || {}).layer; if (!l && window.OneSignal && OneSignal.logout) OneSignal.logout(); } catch (e) {} localStorage.removeItem(OWW.SK); if (l) location.href = 'owner.html'; else location.reload(); }; // also unlinks this phone from the person

// cfg: { title, sub, allow:[roles], ready(user) }
OWW.start = cfg => {
  const C = window.OWW_CONFIG || {}; OWW.APP = cfg.app; const saved = JSON.parse(localStorage.getItem(OWW.SK) || 'null');
  if (cfg.app === 'owner') OWW.URL = C.OWNER_URL || ''; // the Owner app talks to the central Owner script
  else { OWW.branches = (C.BRANCHES || []).filter(b => b && b.url && !/PASTE/.test(b.url)); const b0 = OWW.branches.find(b => b.id === localStorage.getItem('oww_branch')) || OWW.branches[0]; if (b0) OWW.URL = b0.url; if (saved && saved.url) OWW.URL = saved.url; } // a saved session (or an owner's opened branch) keeps its own branch
  if (!OWW.URL || /PASTE/.test(OWW.URL)) { OWW.$('login').innerHTML = '<div class="empty" style="line-height:1.6">The server address is not set yet.<br>On GitHub, open <b>config.js</b> and paste the ' + (cfg.app === 'owner' ? 'Owner script address into <b>OWNER_URL</b>' : 'Web app address (the one ending in /exec)') + '.</div>'; return; }
  OWW.switchCfg = cfg.switchTo; // where the Director can jump to (set per app)
  const L = OWW.$('login');
  const formHtml = `<form id="lf" novalidate><img src="logo.png" alt="Old Wild West" style="width:124px;height:124px;margin:0 auto 2px"><h1>${cfg.title}</h1><p>${cfg.sub}</p><div style="text-align:center">${OWW.langBar ? OWW.langBar() : ''}</div>
    ${OWW.branches && OWW.branches.length > 1 ? `<select id="br" aria-label="Branch">${OWW.branches.map(b => `<option value="${b.id}" ${b.url === OWW.URL ? 'selected' : ''}>${OWW.esc(b.name || b.id)}</option>`).join('')}</select>` : ''}
    <input id="em" type="email" placeholder="Email" autocomplete="username" autocapitalize="none" required>
    <input id="pw" type="password" placeholder="Password" autocomplete="current-password" required>
    <div class="err" id="le" role="alert"></div><button class="btn p w" id="lb">Sign in</button></form>`;
  const enter = (tk, user) => {
    if (cfg.allow && !cfg.allow.includes(user.role)) throw new Error(cfg.deny || 'This app is for managers and directors only');
    OWW.tk = tk; OWW.user = user; L.classList.add('hide'); L.innerHTML = ''; OWW.$('app').classList.remove('hide');
    localStorage.setItem(OWW.SK, JSON.stringify({ tk, user, url: OWW.URL, layer: !!(saved && saved.layer && saved.tk === tk), bname: saved && saved.layer && saved.tk === tk ? saved.bname : '' })); cfg.ready(user); OWW.flush(); OWW.push.init(); OWW.addSwitch(); OWW.push.banner();
  };
  const build = () => { L.innerHTML = formHtml;
  if (OWW.$('br')) OWW.$('br').onchange = e => { const b = OWW.branches.find(x => x.id === e.target.value); OWW.URL = b.url; localStorage.setItem('oww_branch', b.id); };
  OWW.$('em').value = localStorage.getItem('oww_email') || '';
  OWW.$('lf').onsubmit = async e => {
    e.preventDefault(); const b = OWW.$('lb'), er = OWW.$('le'); er.textContent = ''; b.disabled = true; b.textContent = 'Signing in…';
    try {
      const em = OWW.$('em').value.trim(), r = await OWW.api('login', { email: em, password: OWW.$('pw').value, app: cfg.app });
      localStorage.setItem('oww_email', em); enter(r.token, r.user);
    } catch (x) { er.textContent = x.message; b.disabled = false; b.textContent = 'Sign in'; OWW.$('pw').value = ''; }
  };
  };
  // restore a still-valid session (12h) so people are not asked every time
  const s = JSON.parse(localStorage.getItem(OWW.SK) || 'null');
  if (s) { OWW.tk = s.tk; const go = () => { try { enter(s.tk, s.user); OWW.api('me').catch(() => {}); } catch (x) { OWW.tk = null; localStorage.removeItem(OWW.SK); build(); OWW.$('le').textContent = x.message; } }; // wrong app for this account: back to the login with the reason // runs after the whole page has loaded
    document.readyState === 'loading' ? addEventListener('DOMContentLoaded', go) : go(); } else build(); // opens instantly; an expired session returns to login
};

// settings card: who you are, change password, sign out
OWW.account = el => {
  const u = OWW.user;
  OWW.$(el).innerHTML = `<div class="sec">Account</div><div class="cols"><div class="card">
    <div class="row"><div class="grow"><div class="nm">${OWW.esc(u.full)}</div><div class="sub">${OWW.esc(u.email)} · ${OWW.esc(u.role)} · ${OWW.esc(u.branch)}</div></div></div>
    <form class="row" style="display:grid;gap:8px" onsubmit="OWW.changePw();return false"><div class="nm">Change password</div>
      <input type="text" name="username" autocomplete="username" value="${OWW.esc(u.email)}" readonly tabindex="-1" aria-hidden="true" style="position:absolute;opacity:0;height:0;width:0;padding:0;border:0;pointer-events:none">
      <input id="pc" name="oww-current" type="password" placeholder="Current password" autocomplete="current-password">
      <input id="pn" name="oww-new" type="password" placeholder="New password (8+ characters)" autocomplete="new-password">
      <button class="btn p" type="submit">Save password</button></form>
    <div class="row"><span class="grow">Language / Lingua</span>${OWW.langBar ? OWW.langBar() : ''}</div>
    ${OWW.PUSH_APP_ID ? '<div class="row"><button class="btn w" onclick="OWW.push.enable()">🔔 Turn on phone notifications</button></div>' : ''}
    ${OWW.targets().map((t, i) => `<div class="row"><button class="btn w" onclick="OWW.goApp(${i})"><span aria-hidden="true">${t.icon || '⇄'} </span>${OWW.esc(t.label)}</button></div>`).join('')}
    <div class="row"><button class="btn w" onclick="OWW.logout()" style="color:var(--red)">Sign out</button></div></div></div>`;
};
OWW.changePw = async () => {
  try { await OWW.api('changePassword', { current: OWW.$('pc').value, next: OWW.$('pn').value }); OWW.toast('Password changed'); OWW.$('pc').value = OWW.$('pn').value = ''; }
  catch (e) { OWW.toast(e.message, 'red'); }
};

OWW.ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
OWW.hrs = h => { const m = Math.round(h * 60); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
OWW.kind = s => { const h = parseInt(s, 10); return h >= 6 && h < 12 ? 'Morning' : h >= 12 && h < 17 ? 'Lunch' : 'Dinner'; };
OWW.day = s => new Date(s + 'T12:00').toLocaleDateString(OWW.loc(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
OWW.shiftNow = () => new Date().getHours() < 15 ? 'Day' : 'Night';
OWW.ico = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

// bottom sheet (phone) / centred dialog (laptop)
OWW.sheet = html => { OWW.$('sheetc').innerHTML = html; OWW.$('sheet').classList.add('on'); };
OWW.close = () => OWW.$('sheet').classList.remove('on');
document.addEventListener('click', e => { if (e.target.id === 'sheet') OWW.close(); });

// type-ahead: items() -> [{k,l,s}], pick(k)
OWW.finder = (inp, pop, items, pick) => {
  const i = OWW.$(inp), p = OWW.$(pop);
  i.oninput = () => {
    const q = i.value.trim().toLowerCase(); if (!q) { p.classList.add('hide'); return; }
    const nz = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), qs = nz(q).split(/\s+/);
    const r = items().filter(x => { const h = nz(x.m || x.l); return qs.every(w => h.includes(w)); }).slice(0, 8);
    p.innerHTML = r.length ? r.map(x => `<div data-k="${OWW.esc(x.k)}"><span style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span class="nm">${OWW.esc(x.l)}</span><span style="display:flex;gap:6px;flex-shrink:0">${[].concat(x.t || []).filter(Boolean).map((t, i) => `<span class="tag ${i ? 'b' : 'a'}">${OWW.esc(t)}</span>`).join('')}</span></span><span class="sub">${OWW.esc(x.s || '')}</span></div>`).join('') : '<div class="sub">No match</div>';
    p.classList.remove('hide');
  };
  p.onclick = e => { const d = e.target.closest('[data-k]'); if (!d) return; p.classList.add('hide'); i.value = ''; pick(d.dataset.k); };
};

// service worker = required for "Install app"
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

// ── phone notifications via OneSignal (needs PUSH_APP_ID; on iPhone the app must be installed to the Home Screen, iOS 16.4+) ──
OWW.push = {
  alias: () => OWW.user.branch + ':' + OWW.user.id, // must match what the server sends to
  init() {
    if (!OWW.PUSH_APP_ID || OWW._pi) return; OWW._pi = 1;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const s = document.createElement('script'); s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'; s.defer = true; document.head.appendChild(s);
    OneSignalDeferred.push(async OS => {
      await OS.init({ appId: OWW.PUSH_APP_ID, serviceWorkerPath: location.pathname.replace(/^\/|[^/]*$/g, '') + 'sw.js', serviceWorkerParam: { scope: location.pathname.replace(/[^/]*$/, '') }, notifyButton: { enable: false } });
      if (OWW.user) OS.login(OWW.push.alias()); // links this phone to the person (BRANCH:USER), so the server can target them
    });
  },
  banner() { // a slim card at the top: "Get notified on this phone" (shown while the phone has not decided yet)
    if (!OWW.PUSH_APP_ID || !('Notification' in window) || Notification.permission !== 'default' || localStorage.getItem('oww_push_off_' + OWW.user.id) || OWW.$('pushbar')) return;
    const d = document.createElement('div'); d.id = 'pushbar'; d.className = 'card'; d.style.cssText = 'margin:10px 16px 0;padding:12px;display:flex;gap:10px;align-items:center';
    d.innerHTML = '<div class="grow"><div class="nm">🔔 Get notified on this phone</div><div class="sub">Low stock, requests, shift reminders.</div></div><button class="sm a" id="pb-on">Turn on</button><button class="sm" id="pb-no">Later</button>';
    OWW.$('main').prepend(d);
    OWW.$('pb-on').onclick = () => { d.remove(); OWW.push.enable(); };
    OWW.$('pb-no').onclick = () => { localStorage.setItem('oww_push_off_' + OWW.user.id, '1'); d.remove(); };
  },
  enable() {
    if (!window.OneSignalDeferred) OWW.push.init();
    OneSignalDeferred.push(async OS => {
      try { await OS.Notifications.requestPermission(); await OS.login(OWW.push.alias()); OWW.toast(OS.Notifications.permission ? 'Notifications on ✓' : 'Notifications are blocked in your phone settings', OS.Notifications.permission ? 'green' : 'amber'); }
      catch (e) { OWW.toast('Could not turn on notifications', 'red'); }
    });
  }
};

// ── switching between Kitchen and Admin: Director only. Everyone else never sees it, and the action does nothing for them. ──
// 'Open Admin / Kitchen / Sala' buttons: switchTo is one target or a list of targets { label, href, roles, icon }; each is shown only to the roles listed (default: Director)
OWW.targets = () => [].concat(OWW.switchCfg || []).filter(c => OWW.user && (c.roles || ['Director']).includes(OWW.user.role));
OWW.canSwitch = () => OWW.targets().length > 0;
OWW.goApp = i => { const t = OWW.targets()[i || 0]; if (t) location.href = t.href; };
OWW.addSwitch = () => {
  const rf = OWW.$('rf'); if (!rf) return;
  OWW.targets().forEach((c, i) => {
    const id = i ? 'swb' + i : 'swb'; if (OWW.$(id)) return;
    const b = document.createElement('button'); b.id = id; b.className = 'sm a swb';
    b.setAttribute('aria-label', c.label); b.title = c.label; b.innerHTML = '<span aria-hidden="true">' + (c.icon || '⇄') + '</span><span class="lbl"> ' + OWW.esc(c.label) + '</span>'; b.onclick = () => OWW.goApp(i); rf.before(b);
  });
};
