// Count by shelf walk: shelf by shelf, in walking order. Progress is saved as a DRAFT; stock only changes at "Apply to stock".
let CN = null, CV = {}, CI = 0, CKEY = '', CD = new Set(), CSYNC = false;
OWW.hooks['p-count'] = () => cnOpen();
const fmtN = v => String(v).replace('.', ',');
async function cnOpen() {
  $('cn-body').innerHTML = '<div class="empty">Loading…</div>';
  try { CN = await OWW.api('countData'); }
  catch (e) { $('cn-body').innerHTML = `<div class="card" style="padding:16px;display:grid;gap:10px"><div class="nm" style="color:var(--red)">Could not load the count</div><div class="sub">${esc(e.message)}</div><button class="btn p w" onclick="cnOpen()">Try again</button></div>`; return; }
  cnInit(); cnRender();
}
function cnInit() {
  CKEY = CN.session ? 'oww_cnt_' + CN.session.id : ''; CV = Object.assign({}, CN.draft); CD = new Set(); CI = 0;
  if (CKEY) try { const l = JSON.parse(localStorage.getItem(CKEY) || '{}'); Object.keys(l).forEach(k => { if (l[k] !== CV[k]) { CV[k] = l[k]; CD.add(k); } }); } catch (e) {} // this phone's newer values win and are synced
}
const cnSave = () => { if (CKEY) try { localStorage.setItem(CKEY, JSON.stringify(CV)); } catch (e) {} };
async function cnSync() {
  if (!CD.size || !CN || !CN.session || CSYNC) return; CSYNC = true;
  const ids = [...CD];
  try { await OWW.api('countSave', { items: ids.map(id => ({ rawId: id, qty: CV[id] === undefined ? '' : CV[id] })) }); ids.forEach(i => CD.delete(i)); }
  catch (e) { /* stays on this phone and is retried */ }
  CSYNC = false;
}
setInterval(() => { if (CD.size) cnSync(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.hidden) cnSync(); });

async function cnStart() { try { CN = await OWW.api('countStart'); } catch (e) { return OWW.toast(e.message, 'red'); } cnInit(); cnRender(); }
function cnRender() {
  const el = $('cn-body');
  if (!CN.session) {
    el.innerHTML = `<div class="card" style="padding:16px;display:grid;gap:12px"><div class="nm">Walk the shelves and count what you see.</div>
      <div class="sub">Nothing changes in your stock until you press “Apply to stock”. You can stop at any time and continue later, and anything you did not count stays as it is.</div>
      ${CN.last ? `<div class="sub">Last count: ${esc(CN.last.at)} · ${esc(CN.last.by)} · ${CN.last.n} items</div>` : ''}
      <button class="btn p w" onclick="cnStart()">Start counting</button></div>`;
    return;
  }
  el.innerHTML = '<div class="note" id="cn-prog"></div><div class="chips" id="cn-chips"></div><div class="card" id="cn-list"></div><div class="bar" id="cn-foot"></div>';
  cnList(); cnChips();
}
const shelfDone = s => s.items.filter(i => CV[i.id] !== undefined).length;
function cnChips() {
  const t = CN.shelves.reduce((a, s) => a + s.items.length, 0), d = Object.keys(CV).length;
  $('cn-prog').textContent = 'Counted ' + d + ' of ' + t + ' items · started by ' + CN.session.by;
  $('cn-chips').innerHTML = CN.shelves.map((s, i) => { const c = shelfDone(s); return `<button class="chip ${i === CI ? 'on' : ''}" data-s="${i}">${c === s.items.length && c ? '✓ ' : ''}${esc(s.name)} ${c}/${s.items.length}</button>`; }).join('');
}
const cnLab = ct => OWW.UL[ct] || 'PZ';
function cnInputs(i) { // items in boxes: Boxes + loose Busta/PZ.  Everything else: one box (PZ, Busta or KG). The app adds them up.
  const v = CV[i.id], has = v !== undefined, lab = cnLab(i.ct), nm = esc(i.name);
  if (i.per > 1) { const b = has ? Math.floor(v / i.per + 1e-9) : '', l = has ? Math.round((v - b * i.per) * 100) / 100 : '';
    return `<span data-cg="${esc(i.id)}" data-per="${i.per}" style="display:flex;gap:6px"><input class="qty" style="width:60px" type="text" inputmode="numeric" enterkeyhint="next" data-cb value="${b === '' ? '' : esc(fmtN(b))}" placeholder="B" aria-label="Boxes counted of ${nm}"><input class="qty" style="width:74px" type="text" inputmode="decimal" enterkeyhint="next" data-cl value="${l === '' ? '' : esc(fmtN(l))}" placeholder="${lab}" aria-label="${lab} counted of ${nm}"></span>`; }
  return `<input class="qty" type="text" inputmode="decimal" enterkeyhint="next" data-c="${esc(i.id)}" value="${has ? esc(fmtN(v)) : ''}" placeholder="${lab}" aria-label="Counted quantity of ${nm} in ${lab}">`;
}
function cnList() {
  const s = CN.shelves[CI], last = CI === CN.shelves.length - 1;
  $('cn-list').innerHTML = s.items.map(i => `<div class="row" data-r="${esc(i.id)}" style="flex-wrap:wrap"><div class="grow" style="flex:1 1 120px"><div class="nm">${esc(i.name)}</div><div class="sub">${i.counted ? 'system: ' + esc(OWW.fmtQty(i.cur, i.ct, i.per)) : 'never counted'}${i.per > 1 ? ' · 1 box = ' + i.per : ''}</div></div>
    ${i.counted ? `<button class="sm" data-same="${esc(i.id)}" aria-label="Same as system" title="Same as system">=</button>` : ''}${cnInputs(i)}</div>`).join('') || '<div class="empty">No items on this shelf</div>';
  $('cn-foot').innerHTML = `<button class="btn" ${CI === 0 ? 'disabled' : ''} onclick="cnGo(${CI - 1})">‹ Previous shelf</button>` + (last ? '<button class="btn g" onclick="cnReview()">Review & finish</button>' : `<button class="btn p" onclick="cnGo(${CI + 1})">Next shelf ›</button>`);
  s.items.forEach(i => cnFlag(i.id));
}
function cnGo(i) { cnSync(); CI = Math.max(0, Math.min(CN.shelves.length - 1, i)); cnList(); cnChips(); $('main').scrollTop = 0; }
const big = (c, cur, was) => was && ((c === 0 && cur > 0) || (Math.abs(c - cur) >= 3 && Math.abs(c - cur) / Math.max(cur, 1) >= .5));
function cnFlag(id) { // amber box when the count is very different from the system value (likely a typo)
  const it = CN.shelves[CI].items.find(x => x.id === id), inp = document.querySelectorAll(`[data-c="${CSS.escape(id)}"],[data-cg="${CSS.escape(id)}"] input`); if (!it || !inp.length) return;
  inp.forEach(x => x.style.borderColor = CV[id] !== undefined && big(CV[id], it.cur, it.counted) ? 'var(--amber)' : '');
}
function cnFill(it) { // the '=' button: copy the system value into the box(es)
  const v = it.cur;
  if (it.per > 1) { const g = document.querySelector(`[data-cg="${CSS.escape(it.id)}"]`), b = Math.floor(v / it.per + 1e-9); g.querySelector('[data-cb]').value = b; g.querySelector('[data-cl]').value = fmtN(Math.round((v - b * it.per) * 100) / 100); }
  else document.querySelector(`[data-c="${CSS.escape(it.id)}"]`).value = fmtN(v);
  cnSet(it.id, v);
}
function cnSet(id, raw) {
  const t = String(raw).trim().replace(',', '.');
  if (t === '') delete CV[id]; else { const q = parseFloat(t); if (isNaN(q) || q < 0) return; CV[id] = q; }
  CD.add(id); cnSave(); cnChips(); cnFlag(id);
}
$('cn-body').addEventListener('input', e => {
  const t = e.target; if (t.dataset.c) return cnSet(t.dataset.c, t.value);
  const g = t.closest('[data-cg]'); if (!g) return; const b = g.querySelector('[data-cb]').value.trim(), l = g.querySelector('[data-cl]').value.trim();
  if (b === '' && l === '') return cnSet(g.dataset.cg, '');
  const bn = parseFloat(b.replace(',', '.')) || 0, ln = parseFloat(l.replace(',', '.')) || 0; if (bn < 0 || ln < 0) return;
  cnSet(g.dataset.cg, Math.round((bn * +g.dataset.per + ln) * 100) / 100);
});
$('cn-body').addEventListener('keydown', e => { const t = e.target; if (e.key === 'Enter' && (t.dataset.c || t.dataset.cb !== undefined || t.dataset.cl !== undefined)) { e.preventDefault(); const l = [...document.querySelectorAll('#cn-list [data-c],#cn-list [data-cb],#cn-list [data-cl]')], n = l[l.indexOf(t) + 1]; (n || t).focus(); } });
$('cn-body').addEventListener('click', e => {
  const sm = e.target.closest('[data-same]'), ch = e.target.closest('[data-s]');
  if (sm) cnFill(CN.shelves[CI].items.find(x => x.id === sm.dataset.same));
  else if (ch) cnGo(+ch.dataset.s);
});

// ── review + apply ──
async function cnReview() {
  await cnSync(); if (CD.size) return OWW.toast('Could not save your progress yet. Check the connection and try again.', 'amber');
  const t = CN.shelves.reduce((a, s) => a + s.items.length, 0), d = Object.keys(CV).length, changes = [], left = [];
  CN.shelves.forEach((s, i) => { const miss = s.items.length - shelfDone(s); if (miss) left.push({ i, name: s.name, n: miss });
    s.items.forEach(it => { const c = CV[it.id]; if (c !== undefined && big(c, it.cur, it.counted)) changes.push({ name: it.name, was: it.cur, now: c, ct: it.ct, per: it.per }); }); });
  changes.sort((a, b) => Math.abs(b.now - b.was) - Math.abs(a.now - a.was));
  $('cn-body').innerHTML = `<div class="stats"><div class="stat"><small>Counted</small><b>${d}</b></div><div class="stat"><small>Not counted</small><b>${t - d}</b></div><div class="stat"><small>Big changes</small><b style="color:${changes.length ? 'var(--amber)' : 'inherit'}">${changes.length}</b></div></div>
    <div class="note">Items you did not count keep their current stock. Nothing changes until you press Apply.</div>` +
    (changes.length ? `<div class="sec">Check these big changes</div><div class="card">${changes.slice(0, 15).map(c => `<div class="row"><div class="grow"><div class="nm">${esc(c.name)}</div><div class="sub">counted in ${esc(cnLab(c.ct))}</div></div><span class="tag a">${esc(OWW.fmtQty(c.was, c.ct, c.per))} → ${esc(OWW.fmtQty(c.now, c.ct, c.per))}</span></div>`).join('')}</div>` : '') +
    (left.length ? `<div class="sec">Shelves with items not counted</div><div class="card">${left.map(l => `<div class="row"><span class="grow">${esc(l.name)}</span><span class="tag">${l.n} left</span><button class="sm a" onclick="CI=${l.i};cnRender()">Go</button></div>`).join('')}</div>` : '') +
    `<div class="bar"><button class="btn" onclick="cnRender()">‹ Back to counting</button><button class="btn g" onclick="cnApply()">Apply to stock</button></div>
     <div class="bar"><button class="btn w" style="color:var(--red)" onclick="cnDiscard()">Discard this count</button></div>`;
}
async function cnApply() {
  if (!confirm('Apply ' + Object.keys(CV).length + ' counted items to your stock?')) return;
  try { const r = await OWW.api('countFinish'); OWW.toast(r.applied + ' items updated · ' + r.changed + ' changed ✓'); if (CKEY) localStorage.removeItem(CKEY); CN = null; await load(); navGo('havi'); }
  catch (e) { OWW.toast(e.message, 'red'); }
}
async function cnDiscard() {
  if (!confirm('Discard this count? Your stock stays exactly as it is.')) return;
  try { await OWW.api('countCancel'); if (CKEY) localStorage.removeItem(CKEY); await cnOpen(); } catch (e) { OWW.toast(e.message, 'red'); }
}
