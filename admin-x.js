// Admin extras: HACCP fridges + readings, weekly rota, hours approval + export
const stTag = x => x.status === 'APPROVED' ? '<span class="tag g">Approved</span>' : x.status === 'REJECTED' ? '<span class="tag r">Rejected</span>' : '<span class="tag">Pending</span>';
const apBtn = x => x.status === 'APPROVED' ? '' : `<button class="sm g" aria-label="Approve" onclick="setSt('${esc(x.id)}','APPROVED')">✓</button>` + (x.status === 'REJECTED' ? '' : `<button class="sm" aria-label="Reject" onclick="setSt('${esc(x.id)}','REJECTED')">⊘</button>`);

// ── hours approval + export ──
async function setSt(id, st) {
  let note = ''; if (st === 'REJECTED') { note = prompt('Reason (shown to the staff member)'); if (note === null) return; }
  try { await OWW.api('shiftApprove', { ids: [id], status: st, note }); await loadDash(); } catch (e) { OWW.toast(e.message, 'red'); }
}
async function approveAll() {
  const ids = S.filter(x => x.status === 'PENDING').map(x => x.id); if (!ids.length) return OWW.toast('Nothing pending in this period', 'amber');
  if (!confirm('Approve ' + ids.length + ' pending shifts in this period?')) return;
  try { await OWW.api('shiftApprove', { ids, status: 'APPROVED' }); OWW.toast('Approved ✓'); await loadDash(); } catch (e) { OWW.toast(e.message, 'red'); }
}
function exportCsv() {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', n = h => h.toFixed(2).replace('.', ','), per = {};
  const l = ['Date;Name;Role;Start;End;Hours;Status;Note'];
  [...S].reverse().forEach(x => { l.push([x.date, q(x.name), q(x.role), x.start, x.end, n(x.hours), x.status, q(x.memo)].join(';'));
    const p = per[x.name] = per[x.name] || { APPROVED: 0, PENDING: 0, REJECTED: 0 }; p[x.status] = (p[x.status] || 0) + x.hours; });
  l.push('', 'Summary;Approved hours;Pending hours;Rejected hours');
  Object.keys(per).sort().forEach(k => l.push([q(k), n(per[k].APPROVED), n(per[k].PENDING), n(per[k].REJECTED)].join(';')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + l.join('\r\n')], { type: 'text/csv' }));
  a.download = `oww-hours-${$('df').value}_${$('dt').value}.csv`; a.click();
}

// ── HACCP (kitchen only) ──
let H = { fridges: [], logs: [] };
OWW.hooks['p-haccp'] = () => loadH();
$('hd').value = OWW.ymd(new Date()); $('hd').onchange = () => loadH();
async function loadH() {
  if (!SCOPE(OWW.user).includes('KITCHEN')) return;
  try { H = await OWW.api('tempData', { date: $('hd').value || OWW.ymd(new Date()) }); } catch (e) { return OWW.toast(e.message, 'red'); }
  renderH();
}
const hcell = l => l ? `<span class="tag ${l.status === 'ALERT' ? 'r' : 'g'}">${l.temp}°</span>` : '<span class="tag">—</span>';
function renderH() {
  const act = H.fridges.filter(f => f.active), alerts = H.logs.filter(l => l.status === 'ALERT').length, isToday = $('hd').value === OWW.ymd(new Date());
  $('hb').textContent = alerts; $('hb').classList.toggle('hide', !alerts || !isToday);
  $('hstats').innerHTML = [['Fridges', act.length, ''], ['Readings', H.logs.length, ''], ['Out of range', alerts, alerts ? 'var(--red)' : '']].map(s => `<div class="stat"><small>${s[0]}</small><b style="color:${s[2] || 'inherit'}">${s[1]}</b></div>`).join('');
  const g = (f, sh, p) => hcell(H.logs.find(l => l.fridgeId === f.id && l.shift === sh && l.phase === p));
  $('hgrid').innerHTML = act.length ? '<div class="card">' + act.map(f => `<div class="row" style="flex-wrap:wrap"><div class="grow"><div class="nm">${esc(f.name)}</div><div class="sub">${f.min}° to ${f.max}°C</div></div>
    <div style="display:grid;grid-template-columns:auto auto auto;gap:4px 8px;align-items:center;font-size:12px;color:var(--tx3)"><span></span><span>Start</span><span>End</span>
      <span>Day</span>${g(f, 'Day', 'Start')}${g(f, 'Day', 'End')}<span>Night</span>${g(f, 'Night', 'Start')}${g(f, 'Night', 'End')}</div></div>`).join('') + '</div>'
    : '<div class="card"><div class="empty">No fridges yet. Tap “Add fridge”.</div></div>';
  $('hfr').innerHTML = H.fridges.length ? H.fridges.map(f => `<div class="row"><div class="grow"><div class="nm">${esc(f.name)}</div><div class="sub">${esc(f.type)} · ${f.min}° to ${f.max}°C</div></div>
    <span class="tag ${f.active ? 'g' : ''}">${f.active ? 'Active' : 'Inactive'}</span><button class="sm" onclick="fridgeForm('${esc(f.id)}')">Edit</button></div>`).join('') : '<div class="empty">No fridges yet. Tap “Add fridge”.</div>';
}
const DEF = { Fridge: [0, 5], Freezer: [-30, -18], Other: [0, 5] };
function fridgeForm(id) {
  const f = H.fridges.find(x => x.id === id) || { type: 'Fridge', min: 0, max: 5, name: '', active: true };
  OWW.sheet(`<div class="nm" style="font-size:18px">${id ? 'Edit fridge' : 'Add fridge'}</div><input id="fn" placeholder="Name, e.g. Fridge 3 – sauces" value="${esc(f.name)}" maxlength="60">
    <select id="ft" onchange="const d=DEF[this.value];$('fmin').value=d[0];$('fmax').value=d[1]">${['Fridge', 'Freezer', 'Other'].map(t => `<option ${t === f.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <div class="two"><label class="fld"><small>Min °C</small><input id="fmin" type="number" step="0.5" value="${f.min}"></label><label class="fld"><small>Max °C</small><input id="fmax" type="number" step="0.5" value="${f.max}"></label></div>
    <select id="fa"><option value="1" ${f.active ? 'selected' : ''}>Active</option><option value="0" ${f.active ? '' : 'selected'}>Inactive</option></select><div class="err" id="fer"></div>
    <button class="btn p w" onclick="saveFridge('${esc(id || '')}')">Save</button><button class="btn w" onclick="OWW.close()">Cancel</button>`);
}
async function saveFridge(id) {
  try { await OWW.api('fridgeSave', { id: id || undefined, name: $('fn').value, type: $('ft').value, min: $('fmin').value, max: $('fmax').value, active: $('fa').value === '1' }); OWW.close(); await loadH(); }
  catch (e) { $('fer').textContent = e.message; }
}

// ── weekly rota: quick-add planner + totals + absences ──
const addd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const tmin = t => parseInt(t) * 60 + parseInt(t.split(':')[1]);
const hrsOf = r => { let m = tmin(r.end) - tmin(r.start); if (m <= 0) m += 1440; return m / 60; };
const ABS = { REST: ['Rest', 'o'], HOLIDAY: ['Holiday', 'h'], SICK: ['Sick', 's'], LEAVE: ['Leave', 'o'], ABSENT: ['Absent', 's'] };
let RM = (() => { const x = new Date(); x.setHours(12); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; })(), RD = { rows: [], users: [], presets: [] }, PQ = null;
OWW.hooks['p-rota'] = () => loadRota();
const rk = () => RA === 'SALA' ? 'rotaS' : 'rotaK', canEditRota = () => OWW.user.role !== 'Owner' && SCOPE(OWW.user).includes(RA);
async function loadRota() { try { RD = await OWW.api('rotaWeek', { from: OWW.ymd(RM), area: RA }); RA = RD.area || RA; } catch (e) { return OWW.toast(e.message, 'red'); } renderRota(); }
function wk(n) { RM = addd(RM, 7 * n); loadRota(); }
function renderRota() {
  const days = [0, 1, 2, 3, 4, 5, 6].map(i => addd(RM, i)), dir = canEditRota(), t = OWW.ymd(new Date()), f = (d, o) => d.toLocaleDateString(OWW.loc(), o);
  $('rtitle').textContent = 'Weekly rota · ' + AREAN[RA];
  $('wlab').textContent = f(days[0], { day: 'numeric', month: 'short' }) + ' – ' + f(days[6], { day: 'numeric', month: 'short', year: 'numeric' });
  $('rbar').classList.toggle('hide', !dir);
  $('rnote').textContent = dir ? 'Tap a name or a day to plan shifts. Staff get a phone notification (and email) about an hour before.' : 'You can only view this rota.';
  const dayTot = days.map(() => 0); let grand = 0;
  const rows = RD.users.map(u => { let tot = 0;
    const cells = days.map((d, k) => { const ds = OWW.ymd(d), l = RD.rows.filter(r => r.uid === u.id && r.date === ds);
      l.forEach(r => { if (r.type === 'SHIFT') { const h = hrsOf(r); tot += h; dayTot[k] += h; } });
      return `<td class="c" data-u="${esc(u.id)}" data-d="${ds}">${l.map(r => r.type === 'SHIFT' ? `<span class="chipx">${esc(r.start)}–${esc(r.end)}</span>` : `<span class="chipx ${ABS[r.type][1]}">${ABS[r.type][0]}</span>`).join('')}</td>`; }).join('');
    grand += tot;
    return `<tr><td class="c" data-u="${esc(u.id)}"><b>${esc(u.full)}</b><br><span class="sub">${esc(u.role)}</span></td>${cells}<td><b>${OWW.hrs(tot)}</b></td></tr>`; }).join('');
  $('rtab').innerHTML = '<table class="rt"><tr><th>Staff</th>' + days.map(d => `<th${OWW.ymd(d) === t ? ' style="color:var(--amber)"' : ''}>${f(d, { weekday: 'short' })}<br>${d.getDate()}</th>`).join('') + '<th>Total</th></tr>' + rows +
    '<tr><td><b>Total</b></td>' + dayTot.map(h => `<td>${h ? OWW.hrs(h) : ''}</td>`).join('') + `<td><b>${OWW.hrs(grand)}</b></td></tr></table>`;
}
$('rtab').onclick = e => { const c = e.target.closest('[data-u]'); if (c && canEditRota()) planForm(c.dataset.u, c.dataset.d); };
function planForm(uid, ds) { PQ = { uid, days: new Set(ds ? [ds] : []), rng: new Set(), off: '', replace: true, cs: '', ce: '' }; drawPlan(); }
function drawPlan() {
  const u = RD.users.find(x => x.id === PQ.uid), days = [0, 1, 2, 3, 4, 5, 6].map(i => addd(RM, i)), mine = RD.rows.filter(r => r.uid === PQ.uid), f = (d, o) => d.toLocaleDateString(OWW.loc(), o);
  const pre = RD.presets || [], extra = [...PQ.rng].filter(p => !pre.includes(p)), tag = p => `<button class="chip ${PQ.rng.has(p) ? 'on' : ''}" data-qr="${p}">${p.replace('-', ' - ')}</button>`;
  OWW.sheet(`<div><div class="nm" style="font-size:18px">${esc(u.full)}</div><div class="sub">${f(days[0], { day: 'numeric', month: 'short' })} – ${f(days[6], { day: 'numeric', month: 'short' })}</div></div>
    <div><div class="sub" style="margin-bottom:6px">Days</div><div class="chips" style="padding:0">${days.map(d => `<button class="chip ${PQ.days.has(OWW.ymd(d)) ? 'on' : ''}" data-qd="${OWW.ymd(d)}">${f(d, { weekday: 'short' })} ${d.getDate()}</button>`).join('')}</div>
      <div class="chips" style="padding:6px 0 0"><button class="chip" data-qq="wd">Mon–Fri</button><button class="chip" data-qq="we">Sat–Sun</button><button class="chip" data-qq="all">All week</button><button class="chip" data-qq="none">Clear</button></div></div>
    <div><div class="sub" style="margin-bottom:6px">Times (tap one or more — two for a split shift)</div><div class="chips" style="padding:0">${pre.map(tag).join('')}${extra.map(tag).join('')}</div>
      <div class="two" style="margin-top:8px"><label class="fld"><small>Other start</small><input type="time" id="qs" value="${PQ.cs}"></label><label class="fld"><small>Other end</small><input type="time" id="qe" value="${PQ.ce}"></label></div>
      <button class="sm a" style="margin-top:6px" data-qq="addr">+ Add this time</button></div>
    <div><div class="sub" style="margin-bottom:6px">Or mark as</div><div class="chips" style="padding:0">${['REST', 'HOLIDAY', 'SICK'].map(k => `<button class="chip ${PQ.off === k ? 'on' : ''}" data-qo="${k}">${ABS[k][0]}</button>`).join('')}</div></div>
    <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="qrep" ${PQ.replace ? 'checked' : ''} style="width:auto"> Replace what is already planned on these days</label>
    ${mine.length ? `<div><div class="sub" style="margin-bottom:4px">Already planned this week</div>${mine.map(r => `<div class="row" style="padding:4px 0;min-height:0"><span class="grow">${OWW.day(r.date)} · ${r.type === 'SHIFT' ? esc(r.start) + ' → ' + esc(r.end) : ABS[r.type][0]}</span><button class="sm" aria-label="Delete" onclick="rotaDel('${esc(r.id)}',true)">✕</button></div>`).join('')}</div>` : ''}
    <div class="err" id="qer"></div><button class="btn p w" onclick="planApply()">Apply</button><button class="btn w" onclick="OWW.close()">Close</button>`);
}
$('sheetc').onclick = e => {
  if (!PQ || !$('sheet').classList.contains('on')) return; const b = e.target.closest('[data-qd],[data-qq],[data-qr],[data-qo]'); if (!b) return; const D = b.dataset;
  if (D.qd) { PQ.days.has(D.qd) ? PQ.days.delete(D.qd) : PQ.days.add(D.qd); }
  else if (D.qr) { PQ.off = ''; PQ.rng.has(D.qr) ? PQ.rng.delete(D.qr) : PQ.rng.add(D.qr); }
  else if (D.qo) { PQ.off = PQ.off === D.qo ? '' : D.qo; if (PQ.off) PQ.rng.clear(); }
  else if (D.qq === 'addr') { if (PQ.cs && PQ.ce && PQ.cs !== PQ.ce) { PQ.rng.add(PQ.cs + '-' + PQ.ce); PQ.off = ''; PQ.cs = PQ.ce = ''; } else return; }
  else { const ds = [0, 1, 2, 3, 4, 5, 6].map(i => OWW.ymd(addd(RM, i))); PQ.days = new Set(D.qq === 'wd' ? ds.slice(0, 5) : D.qq === 'we' ? ds.slice(5) : D.qq === 'all' ? ds : []); }
  drawPlan();
};
$('sheetc').oninput = e => { if (!PQ) return; if (e.target.id === 'qs') PQ.cs = e.target.value; if (e.target.id === 'qe') PQ.ce = e.target.value; if (e.target.id === 'qrep') PQ.replace = e.target.checked; };
async function planApply() {
  const days = [...PQ.days].sort(), items = [];
  if (!days.length) { $('qer').textContent = 'Pick at least one day'; return; }
  if (PQ.off) days.forEach(d => items.push({ userId: PQ.uid, date: d, type: PQ.off }));
  else { if (!PQ.rng.size) { $('qer').textContent = 'Pick a time, or mark the days as rest / holiday / sick'; return; }
    days.forEach(d => PQ.rng.forEach(r => { const [a, b] = r.split('-'); items.push({ userId: PQ.uid, date: d, start: a, end: b }); })); }
  try { const r = await OWW.api('rotaImport', { from: OWW.ymd(RM), items, replace: PQ.replace, dates: days }); OWW.close(); OWW.toast(r.added + ' added' + (r.removed ? ' · ' + r.removed + ' replaced' : '') + ' ✓'); await loadRota(); }
  catch (e) { $('qer').textContent = e.message; }
}
async function rotaDel(id, again) { try { await OWW.api('rotaDelete', { id }); await loadRota(); if (again && PQ) drawPlan(); else OWW.close(); } catch (e) { OWW.toast(e.message, 'red'); } }
async function copyWeek() {
  if (!confirm('Copy the previous week into this week?')) return;
  try { const n = await OWW.api('rotaCopy', { from: OWW.ymd(addd(RM, -7)), to: OWW.ymd(RM), area: RA }); OWW.toast(n + ' entries copied ✓'); await loadRota(); } catch (e) { OWW.toast(e.message, 'red'); }
}

// ── rota import: Excel / CSV / photo → review → one request ──
const XLSXJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const OFFW = ['riposo', 'ferie', 'infortunio', 'malattia', 'permesso', 'assente'], TM = '\\d{1,2}(?:[,.:]\\d{2})?';
const CHAIN = new RegExp('^' + TM + '(?:\\s*[-–—]\\s*' + TM + ')+$');
const CELLRX = new RegExp(TM + '(?:\\s*[-–—~]\\s*' + TM + ')+|r[il1]p[o0]s[o0]|f[e3]r[il1][e3]|[il1]nf[o0]rtun[il1][o0]|malatt[il1]a|perm[e3]ss[o0]|assente', 'gi');
const ROLEW = /direttore|capo|servizio|sala|cucina|lavapiatti|riposo|ferie|infortunio/gi;
let RR = [];
const lettersOf = s => nz(s).replace(/[^a-z]/g, '');
const monOf = s => { const d = new Date((s || OWW.ymd(RM)) + 'T12:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; };
const hh = x => { const m = /^(\d{1,2})(?:[,.:](\d{2}))?$/.exec(x); if (!m) return ''; const h = +m[1], mi = m[2] ? +m[2] : 0; return h > 24 || mi > 59 ? '' : String(h % 24).padStart(2, '0') + ':' + String(mi).padStart(2, '0'); };
// "12,00-15,00-19,00-22,30" = two split shifts (12:00-15:00 and 19:00-22:30); RIPOSO/FERIE/INFORTUNIO = no shift
function segs(cell) {
  const t = String(cell || '').trim(); if (!t) return { segs: [], off: '', bad: false };
  const w = lettersOf(/[a-z]{3,}/i.test(t) ? t.replace(/0/g, 'o') : t);
  if (w.length > 3 && OFFW.some(k => w === k || lev(w, k) <= 1)) return { segs: [], off: t, bad: false };
  const n = t.match(new RegExp(TM, 'g')) || [], out = [];
  if (n.length < 2 || n.length % 2) return { segs: [], off: '', bad: true };
  for (let i = 0; i < n.length; i += 2) { const a = hh(n[i]), b = hh(n[i + 1]); if (!a || !b || a === b) return { segs: [], off: '', bad: true }; out.push([a, b]); }
  return { segs: out, off: '', bad: false };
}
const shiftLike = c => { const t = String(c || '').trim(); return CHAIN.test(t) || (/[a-z]{4,}/i.test(t) && OFFW.some(k => lettersOf(t) === k)); };
function findWeek(txt) {
  const m = /dal\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\s*al\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/i.exec(txt); if (!m) return '';
  let y = +m[6]; if (y < 100) y += 2000; let y1 = m[3] ? +m[3] : (+m[2] > +m[5] ? y - 1 : y); if (y1 < 100) y1 += 2000;
  return y1 + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
}
function xlRows(aoa) {
  const wk = findWeek(aoa.map(r => r.join(' ')).join(' '));
  let dc = null;
  for (const r of aoa) { const ix = []; r.forEach((c, i) => { if (/^(lun|mar|mer|gio|ven|sab|dom|mon|tue|wed|thu|fri|sat|sun)/.test(nz(c).trim())) ix.push(i); }); if (ix.length >= 7) { dc = ix.slice(0, 7); break; } }
  if (!dc) for (const r of aoa) { const ix = []; r.forEach((c, i) => { if (shiftLike(c)) ix.push(i); }); if (ix.length >= 7) { dc = ix.slice(0, 7); break; } }
  if (!dc) return { wk, rows: [] };
  const rows = [];
  aoa.forEach(r => {
    const cells = dc.map(i => String(r[i] ?? '').trim()); if (cells.filter(shiftLike).length < 2) return;
    const names = r.slice(0, dc[0]).map(x => String(x ?? '').trim()).filter(x => /[a-zA-ZÀ-ÿ]{2}/.test(x) && !/^(direttore|capo servizio|sala|cucina|lavapiatti)$/i.test(x));
    rows.push({ name: names[0] || '', role: '', cells, flag: false });
  });
  return { wk, rows };
}
function ocrRows(lines) {
  const rows = [];
  lines.forEach(l => {
    const ms = [...l.matchAll(CELLRX)]; if (ms.length < 3) return;
    const name = l.slice(0, ms[0].index).replace(ROLEW, ' ').replace(/[^A-Za-zÀ-ÿ' ]/g, ' ').replace(/\s+/g, ' ').trim(), c = ms.map(m => m[0].trim());
    rows.push({ name, role: '', cells: c.slice(0, 7).concat(Array(Math.max(0, 7 - c.length)).fill('')), flag: c.length !== 7 });
  });
  return { wk: findWeek(lines.join(' ')), rows };
}
function matchUser(name) {
  const nt = nz(name).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(t => t.length > 1); if (!nt.length) return '';
  let best = '', bs = 0;
  RD.users.forEach(u => {
    const ut = nz(u.full).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
    const sc = nt.reduce((s, t) => s + Math.max(0, ...ut.map(x => x === t ? 1 : (Math.max(x.length, t.length) >= 3 && 1 - lev(x, t) / Math.max(x.length, t.length) >= .72 ? .85 : 0))), 0) / nt.length;
    if (sc > bs) { bs = sc; best = u.id; }
  });
  return bs >= .7 ? best : '';
}
async function toJpeg(f) {
  const bm = await createImageBitmap(f, { imageOrientation: 'from-image' }), k = Math.min(1, 1800 / Math.max(bm.width, bm.height)), c = document.createElement('canvas');
  c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
  return { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] };
}
OWW.hooks['p-rimp'] = async () => { if (!RD.users.length) await loadRota(); $('rwk').value = $('rwk').value || OWW.ymd(RM);
  $('rhint').textContent = RD.ai ? 'Photos are read with AI (accurate). Excel / CSV is exact.' : 'Excel / CSV is exact. Photos use the free on-device reader: best effort, so check every cell.'; };
async function rimpRead() {
  const f = $('rfile').files[0]; if (!f) return OWW.toast('Choose a file first', 'amber');
  const b = $('rscan'), pg = t => $('rprog').textContent = t; b.disabled = true; RR = [];
  try {
    if (!RD.users.length) await loadRota();
    let res = { wk: '', rows: [] };
    if (/\.(xlsx|xls|csv)$/i.test(f.name)) {
      pg('Reading the spreadsheet…'); await lib(XLSXJS); let wb;
      if (/\.csv$/i.test(f.name)) { const t = await f.text(); wb = XLSX.read(t, { type: 'string', FS: (t.match(/;/g) || []).length >= 5 ? ';' : (t.match(/\t/g) || []).length >= 5 ? '\t' : ',' }); }
      else wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      wb.SheetNames.forEach(n => { const r = xlRows(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' })); if (r.rows.length > res.rows.length) res = r; });
    } else if (RD.ai) {
      pg('Reading the picture with AI…'); const j = await OWW.api('rotaScan', await toJpeg(f));
      res = { wk: j.week_start || '', rows: (j.rows || []).map(r => ({ name: r.name || '', role: '', cells: [0, 1, 2, 3, 4, 5, 6].map(i => String((r.cells || [])[i] ?? '')), flag: (r.cells || []).some(c => String(c).includes('?')) })) };
    } else { pg('Reading the picture on this device (can take a minute)…'); res = ocrRows(await ocr([await toCanvas(f)])); }
    if (!res.rows.length) OWW.toast('No timetable rows found. Try the Excel file or a sharper, flatter photo.', 'amber');
    RR = res.rows.map(r => ({ ...r, uid: matchUser(r.name) })); if (res.wk) $('rwk').value = res.wk;
  } catch (e) { OWW.toast(e.message, 'red'); }
  pg(''); b.disabled = false; renderRimp();
}
function renderRimp() {
  if (!RR.length) { $('rrev').innerHTML = ''; return; }
  const base = monOf($('rwk').value), dn = [0, 1, 2, 3, 4, 5, 6].map(k => { const d = addd(base, k); return d.toLocaleDateString(OWW.loc(), { weekday: 'short' }) + ' ' + d.getDate(); });
  const opts = RD.users.map(u => `<option value="${esc(u.id)}">${esc(u.full)}</option>`).join('');
  const ok = RR.filter(r => r.uid).length, chk = RR.filter(r => r.flag || r.cells.some(c => segs(c).bad)).length;
  $('rrev').innerHTML = `<div class="sec">Review</div><div class="note">${ok} matched to app users · ${RR.length - ok} not in the app (skipped unless you choose a person) · ${chk} to double-check. Week of ${esc(OWW.ymd(base))}.</div>` +
    RR.map((r, i) => `<div class="card" style="padding:12px;display:grid;gap:8px"><div style="display:flex;gap:8px;align-items:center"><div class="grow"><div class="sub">“${esc(r.name || '?')}”</div>
      <select data-ri="${i}" aria-label="Person"><option value="">— skip (not in the app) —</option>${opts.replace(`value="${esc(r.uid)}"`, `value="${esc(r.uid)}" selected`)}</select></div>${r.flag ? '<span class="tag a">check</span>' : ''}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px">${r.cells.map((c, k) => `<label class="fld"><small>${esc(dn[k])}</small><input data-rc="${i}:${k}" value="${esc(c)}" style="${segs(c).bad ? 'border-color:var(--red)' : ''}"></label>`).join('')}</div></div>`).join('') +
    '<div class="bar"><button class="btn g" onclick="rimpApply()">Import shifts</button></div>';
}
$('rwk').onchange = () => renderRimp();
$('rrev').onchange = e => { const i = e.target.dataset.ri; if (i !== undefined) RR[i].uid = e.target.value; };
$('rrev').oninput = e => { const p = e.target.dataset.rc; if (!p) return; const [i, k] = p.split(':'); RR[i].cells[k] = e.target.value; e.target.style.borderColor = segs(e.target.value).bad ? 'var(--red)' : ''; };
async function rimpApply() {
  const base = monOf($('rwk').value), items = []; let ppl = 0;
  const offType = t => { const w = lettersOf(t); return /ferie/.test(w) ? 'HOLIDAY' : /infort|malat/.test(w) ? 'SICK' : /perm/.test(w) ? 'LEAVE' : /assent/.test(w) ? 'ABSENT' : 'REST'; };
  RR.forEach(r => { if (!r.uid) return; let n = 0; r.cells.forEach((c, k) => { const p = segs(c), date = OWW.ymd(addd(base, k));
    p.segs.forEach(s => { items.push({ userId: r.uid, date, start: s[0], end: s[1] }); n++; }); if (p.off) { items.push({ userId: r.uid, date, type: offType(p.off) }); n++; } }); if (n) ppl++; });
  if (!items.length) return OWW.toast('Nothing to import yet. Choose a person for each row.', 'amber');
  if (RR.some(r => r.uid && r.cells.some(c => segs(c).bad)) && !confirm('Some cells (red) could not be read and will be skipped. Continue?')) return;
  if (!confirm('Import ' + items.length + ' entries (shifts, rest days, holidays, sick) for ' + ppl + ' people for the week starting ' + OWW.ymd(base) + '?\nExisting shifts of these people in that week are replaced.')) return;
  try { const r = await OWW.api('rotaImport', { from: OWW.ymd(base), items, replace: true }); OWW.toast(r.added + ' entries imported ✓'); RM = base; RR = []; $('rfile').value = ''; navGo(rk()); }
  catch (e) { OWW.toast(e.message, 'red'); }
}

// ── Today screen ──
let TD = null;
OWW.hooks['p-today'] = () => loadToday();
async function loadToday() { try { TD = await OWW.api('today'); } catch (e) { return OWW.toast(e.message, 'red'); } renderToday(); }
async function decideReq(id, ok) {
  let note = ''; if (!ok) { note = prompt('Reason (optional)'); if (note === null) return; }
  try { await OWW.api('reqDecide', { id, approve: ok, note }); OWW.toast(ok ? 'Approved ✓' : 'Declined'); await loadToday(); } catch (e) { OWW.toast(e.message, 'red'); }
}
function renderToday() {
  const d = TD, t = d.temps, k = SCOPE(OWW.user).includes('KITCHEN'), bo = SCOPE(OWW.user).length > 1, at = x => bo ? ` <span class="tag ${x.area === 'SALA' ? 'b' : 'a'}">${AREAN[x.area] || ''}</span>` : '', crit = Object.values(d.stock || {}).reduce((s, x) => s + x.crit, 0), st = { now: ['g', 'Now'], upcoming: ['a', 'Later'], done: ['', 'Finished'] }, none = x => `<div class="empty">${x}</div>`;
  const nowN = d.team.filter(x => x.state === 'now').length, pend = d.requests.length + d.hoursPending;
  $('tdate').textContent = OWW.day(d.date);
  $('tstats').innerHTML = [['On shift now', nowN, ''], ['Shifts today', d.team.length, ''], ...(k ? [['Temp. out of range', t.bad.length, t.bad.length ? 'var(--red)' : '']] : []), ['Critical stock', crit, crit ? 'var(--red)' : ''], ['Open stock alerts', d.alerts.length, d.alerts.length ? 'var(--amber)' : ''], ['To approve', pend, pend ? 'var(--amber)' : ''], ['Over late limit', d.punct ? d.punct.people.filter(p => p.over).length : 0, d.punct && d.punct.people.some(p => p.over) ? 'var(--red)' : '']]
    .map(s => `<div class="stat"><small>${s[0]}</small><b style="color:${s[2] || 'inherit'}">${s[1]}</b></div>`).join('');
  $('tteam').innerHTML = (d.team.length ? d.team.map(x => `<div class="row"><div class="grow"><div class="nm">${esc(x.name)}${at(x)}</div><div class="sub">${esc(x.start)} → ${esc(x.end)}</div></div><span class="tag ${st[x.state][0]}">${st[x.state][1]}</span></div>`).join('') : none('Nobody is planned today'))
    + (d.off.length ? `<div class="row"><div class="grow"><div class="sub">Off today</div><div class="nm" style="font-size:13px">${d.off.map(o => esc(o.name) + ' (' + (ABS[o.type] || [o.type])[0] + ')').join(', ')}</div></div></div>` : '');
  const tl = (k, label) => `<div class="row"><span class="grow">${label}</span><span class="tag ${t.fridges && t.n[k] >= t.fridges ? 'g' : 'a'}">${t.n[k]}/${t.fridges}</span></div>`;
  $('tsecT').classList.toggle('hide', !k); $('ttemp').classList.toggle('hide', !k);
  $('ttemp').innerHTML = t.fridges ? tl('DayStart', 'Day · start') + tl('DayEnd', 'Day · end') + tl('NightStart', 'Night · start') + tl('NightEnd', 'Night · end') + t.bad.map(b => `<div class="row"><span class="tag r">Out of range</span><span class="grow">${esc(b)}</span></div>`).join('') : none('No fridges set up yet');
  $('troutine').innerHTML = (d.routine.length ? d.routine.map(r => `<div class="row"><span class="tag b">Today</span><span class="grow nm">${esc(r)}</span></div>`).join('') : none('Nothing scheduled today'))
    + (d.lastDelivery ? `<div class="row"><span class="sub">Last delivery received: ${esc(d.lastDelivery)}</span></div>` : '')
    + `<div class="row"><div class="grow"><div class="sub">Stock count</div><div class="nm" style="font-size:13px">${d.count && d.count.open ? 'In progress: ' + d.count.open.n + ' counted' : d.count && d.count.last ? 'Last count: ' + esc(d.count.last) : 'Never counted'}</div></div><button class="sm a" onclick="navGo('count')">Count →</button></div>`;
  $('treq').innerHTML = (d.requests.length ? d.requests.map(r => `<div class="row" style="flex-wrap:wrap"><div class="grow"><div class="nm">${esc(r.name)}${r.type === 'SWAP' ? ' → ' + esc(r.peerName) : ''}${at(r)}</div>
      <div class="sub">${r.type === 'SWAP' ? 'Cover' : (ABS[r.kind] || [r.kind])[0]} · ${OWW.day(r.from)}${r.to && r.to !== r.from ? ' → ' + OWW.day(r.to) : ''}${r.shift ? ' · ' + esc(r.shift) : ''}${r.note ? ' · ' + esc(r.note) : ''}</div></div>
      <button class="sm g" onclick="decideReq('${esc(r.id)}',true)">Approve</button><button class="sm" onclick="decideReq('${esc(r.id)}',false)">Decline</button></div>`).join('') : '')
    + (d.hoursPending ? `<div class="row"><div class="grow"><div class="nm">${d.hoursPending} shifts</div><div class="sub">Hours waiting for approval</div></div><button class="sm a" onclick="navGo('hours')">Review hours →</button></div>` : '')
    + (!d.requests.length && !d.hoursPending ? none('Nothing waiting for approval') : '');
  $('talerts').innerHTML = d.alerts.length ? d.alerts.slice(0, 8).map(x => `<div class="row" style="flex-wrap:wrap"><div class="grow"><div class="nm">${esc(x.item)}${at(x)} <span class="tag ${x.supplier === 'VERDURA' ? 'g' : ''}">${x.supplier === 'VERDURA' ? 'Verdura' : 'Havi'}</span></div><div class="sub">${esc(x.qty)} · ${esc(x.by)} · ${esc(x.date)}</div></div><button class="sm g" data-tr="${esc(x.id)}" aria-label="Refilled" title="Refilled" style="font-size:16px;padding:6px 14px">✓</button></div>`).join('')
    + `<div class="row" style="gap:8px;flex-wrap:wrap"><button class="sm a" onclick="navGo('havi')">Havi alerts →</button><button class="sm a" onclick="navGo('verd')">Verdura alerts →</button></div>` : none('No open alerts');
  $('tevents').innerHTML = d.events.length ? d.events.map(e => `<div class="row"><div class="grow"><div class="nm">${esc(e.title)}</div><div class="sub">${OWW.day(e.date)}${e.time ? ' · ' + esc(e.time) : ''}${e.notes ? ' · ' + esc(e.notes) : ''}</div></div></div>`).join('') : none('No events this week');
  renderPunct(d.punct);
}

// ── punctuality (late arrivals / early leaves), month by month ──
let PU = null;
function renderPunct(p) {
  PU = p || PU; if (!PU) { $('tpunct').innerHTML = ''; return; }
  const mo = new Date(PU.month + '-01T12:00').toLocaleDateString(OWW.loc(), { month: 'long', year: 'numeric' });
  $('tpunct').innerHTML = `<div class="row"><button class="sm" onclick="punctGo(-1)" aria-label="Previous month">‹</button><span class="grow nm" style="text-align:center">${mo}</span><button class="sm" onclick="punctGo(1)" aria-label="Next month">›</button></div>` +
    (PU.people.length ? PU.people.map(x => `<div class="row"><div class="grow"><div class="nm">${esc(x.name)}</div><div class="sub">Late ${x.late}× · Early leave ${x.early}×${x.excused ? ' · excused ' + x.excused : ''}${x.lateMin ? ' · ' + x.lateMin + ' min late in total' : ''}</div></div>
      ${x.over ? `<span class="tag r">Over limit${x.warned === 'sent' ? ' · warned' : x.warned === 'noemail' ? ' · no email on file' : ''}</span>` : x.late === PU.limit ? '<span class="tag a">1 more = warning</span>' : ''}</div>`).join('')
      : '<div class="empty">No late arrivals or early leaves this month</div>') +
    (PU.events.length ? '<div class="row"><div class="sub">Details</div></div>' + PU.events.slice(0, 20).map(e => `<div class="row" style="flex-wrap:wrap"><div class="grow"><div class="nm">${esc(e.name)} · ${OWW.day(e.date)}</div>
      <div class="sub">Planned ${esc(e.plannedStart)}–${esc(e.plannedEnd)} · Actual ${esc(e.start)}–${esc(e.end)}${e.reason ? ' · ' + esc(e.reason) : ''}${e.memo ? ' · “' + esc(e.memo) + '”' : ''}</div></div>
      ${e.late > PU.grace ? `<span class="tag a">Late ${e.late} min</span>` : ''}${e.early > PU.grace ? `<span class="tag a">Left early ${e.early} min</span>` : ''}
      <button class="sm ${e.excused ? '' : 'g'}" onclick="excuse('${esc(e.id)}',${!e.excused})">${e.excused ? 'Undo' : 'Excuse'}</button></div>`).join('') : '');
}
async function punctGo(n) {
  const d = new Date(PU.month + '-01T12:00'); d.setMonth(d.getMonth() + n);
  try { renderPunct(await OWW.api('punctual', { month: OWW.ymd(d).slice(0, 7) })); } catch (e) { OWW.toast(e.message, 'red'); }
}
async function excuse(id, on) { try { await OWW.api('lateExcuse', { id, excused: on }); renderPunct(await OWW.api('punctual', { month: PU.month })); } catch (e) { OWW.toast(e.message, 'red'); } }

// ── weekly summary email (Director) ──
async function sendSummary(which) {
  try { const r = await OWW.api('summarySend', { which }); OWW.toast('Summary sent to ' + r.to + ' ✓'); } catch (e) { OWW.toast(e.message, 'red'); }
}

// tick on the Dashboard alert list = refilled
$('talerts').onclick = async e => { const b = e.target.closest('[data-tr]'); if (!b) return; try { await OWW.api('resolveAlert', { alertId: b.dataset.tr, how: 'refilled' }); OWW.toast('Marked as refilled ✓'); await loadAll(); } catch (x) { OWW.toast(x.message, 'red'); } };
