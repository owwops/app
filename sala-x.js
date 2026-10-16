// Sala extras: events, my rota, day-off / cover requests, punctuality, next shift (same code as the Kitchen app, minus prep / fridge checks)
// Kitchen extras: upcoming events, fridge temperature checks, my rota, recipe cards
const stTag = x => x.pending ? '<span class="tag a">syncing</span>' : x.status === 'APPROVED' ? '<span class="tag g">Approved</span>' : x.status === 'REJECTED' ? '<span class="tag r">Rejected</span>' : '<span class="tag">Pending</span>';
let EVK = [];
const relD = d => { const n = Math.round((new Date(d + 'T12:00') - new Date(OWW.ymd(new Date()) + 'T12:00')) / 864e5); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'in ' + n + ' days'; };

let RQ = { list: [], users: [] };
// ── events ──
function renderEvk() {
  const l = EVK.slice(0, 5);
  $('evk').innerHTML = l.length ? '<div class="sec">Upcoming events</div><div class="card">' + l.map(e => { const d = new Date(e.date + 'T12:00');
    return `<div class="row"><div style="min-width:46px;text-align:center"><div style="font-weight:700;font-size:20px;line-height:1">${d.getDate()}</div><div class="sub">${d.toLocaleDateString(OWW.loc(), { month: 'short' })}</div></div>
      <div class="grow"><div class="nm">${esc(e.title)}</div><div class="sub">${relD(e.date)}${e.time ? ' · ' + esc(e.time) : ''}${e.notes ? ' · ' + esc(e.notes) : ''}</div></div></div>`; }).join('') + '</div>' : '';
}

// ── my planned shifts (inside the Shifts tab) ──
const ABSL = { REST: 'Rest', HOLIDAY: 'Holiday', SICK: 'Sick', LEAVE: 'Leave', ABSENT: 'Absent' };
function renderRota() {
  renderNext(); renderUpc();
  const l = A.rota || [];
  $('rotam').innerHTML = l.length ? '<div class="sec">My upcoming shifts</div><div class="card">' + l.map(r => r.type && r.type !== 'SHIFT'
    ? `<div class="row"><div class="grow"><div class="nm">${OWW.day(r.date)}</div></div><span class="tag ${r.type === 'HOLIDAY' ? 'g' : r.type === 'SICK' ? 'r' : ''}">${ABSL[r.type] || r.type}</span></div>`
    : `<div class="row"><div class="grow"><div class="nm">${OWW.day(r.date)}</div><div class="sub">${esc(r.start)} → ${esc(r.end)}${r.note ? ' · ' + esc(r.note) : ''}</div></div><button class="sm a" data-use="${esc(r.id)}">Use for log</button></div>`).join('') + '</div>'
    : '<div class="note">No planned shifts yet. Your manager adds them in the rota.</div>';
}
$('rotam').onclick = e => {
  const b = e.target.closest('[data-use]'); if (!b) return; const r = (A.rota || []).find(x => x.id === b.dataset.use); if (!r) return;
  $('ad').value = r.date; $('as').value = r.start; $('ae').value = r.end; $('am').value = r.note || '';
  document.querySelector('#aseg [data-v=log]').click(); durUpdate(); $('a-log').scrollIntoView({ behavior: 'smooth' });
};

// ── requests: day off + ask a colleague to cover ──
const KIND = { HOLIDAY: 'Holiday', REST: 'Rest day', LEAVE: 'Leave' };
const RST = { PENDING_PEER: ['a', 'Waiting for colleague'], PENDING: ['a', 'Waiting for manager'], APPROVED: ['g', 'Approved'], DECLINED: ['r', 'Declined'], CANCELLED: ['', 'Cancelled'] };
async function loadReq() { try { RQ = await OWW.api('reqList'); } catch (e) { return; } renderReq(); }
function renderReq() {
  const me = OWW.user.id, mine = RQ.list.filter(r => r.uid === me), toMe = RQ.list.filter(r => r.peerId === me && r.status === 'PENDING_PEER');
  $('reqs').innerHTML = '<div class="sec">Requests</div><div class="bar"><button class="btn" onclick="reqForm(\'off\')">Request day off</button><button class="btn" onclick="reqForm(\'swap\')">Ask a colleague to cover</button></div>' +
    (toMe.length ? '<div class="card">' + toMe.map(r => `<div class="row" style="flex-wrap:wrap"><div class="grow"><div class="nm">${esc(r.name)} asks you to cover</div><div class="sub">${OWW.day(r.from)} · ${esc(r.shift)}</div></div><button class="sm g" data-rp="${esc(r.id)}:1">Accept</button><button class="sm" data-rp="${esc(r.id)}:0">Decline</button></div>`).join('') + '</div>' : '') +
    (mine.length ? '<div class="card">' + mine.slice(0, 8).map(r => { const s = RST[r.status] || ['', r.status];
      return `<div class="row"><div class="grow"><div class="nm">${r.type === 'DAY_OFF' ? (KIND[r.kind] || 'Day off') : 'Cover: ' + esc(r.peerName)}</div><div class="sub">${OWW.day(r.from)}${r.to && r.to !== r.from ? ' → ' + OWW.day(r.to) : ''}${r.shift ? ' · ' + esc(r.shift) : ''}${r.dnote ? ' · “' + esc(r.dnote) + '”' : ''}</div></div>
        <span class="tag ${s[0]}">${s[1]}</span>${String(r.status).startsWith('PENDING') ? `<button class="sm" data-rc="${esc(r.id)}" aria-label="Cancel request">✕</button>` : ''}</div>`; }).join('') + '</div>' : '');
}
$('reqs').onclick = async e => {
  const p = e.target.closest('[data-rp]'), c = e.target.closest('[data-rc]'); if (!p && !c) return;
  try { if (p) { const [id, ok] = p.dataset.rp.split(':'); await OWW.api('reqPeer', { id, accept: ok === '1' }); OWW.toast(ok === '1' ? 'Accepted ✓' : 'Declined'); } else await OWW.api('reqCancel', { id: c.dataset.rc }); await loadReq(); }
  catch (x) { OWW.toast(x.message, 'red'); }
};
function reqForm(kind) {
  if (kind === 'off') return OWW.sheet(`<div class="nm" style="font-size:18px">Request day off</div>
    <div class="two"><label class="fld"><small>From</small><input type="date" id="rf1" value="${OWW.ymd(new Date())}"></label><label class="fld"><small>To (optional)</small><input type="date" id="rf2"></label></div>
    <select id="rk"><option value="HOLIDAY">Holiday</option><option value="REST">Rest day</option><option value="LEAVE">Leave</option></select>
    <input id="rn2" placeholder="Note (optional)" maxlength="120"><div class="err" id="rerr"></div>
    <button class="btn p w" onclick="sendReq('DAY_OFF')">Send request</button><button class="btn w" onclick="OWW.close()">Cancel</button>`);
  const sh = (A.rota || []).filter(r => !r.type || r.type === 'SHIFT');
  if (!sh.length) return OWW.toast('You have no planned shifts to hand over yet', 'amber');
  OWW.sheet(`<div class="nm" style="font-size:18px">Ask a colleague to cover</div>
    <select id="rs1">${sh.map(r => `<option value="${esc(r.id)}">${OWW.day(r.date)} · ${esc(r.start)} → ${esc(r.end)}</option>`).join('')}</select>
    <select id="rp1">${RQ.users.map(u => `<option value="${esc(u.id)}">${esc(u.full)}</option>`).join('')}</select>
    <input id="rn2" placeholder="Note (optional)" maxlength="120"><div class="err" id="rerr"></div>
    <button class="btn p w" onclick="sendReq('SWAP')">Send request</button><button class="btn w" onclick="OWW.close()">Cancel</button>`);
}
async function sendReq(type) {
  const b = type === 'DAY_OFF' ? { type, from: $('rf1').value, to: $('rf2').value || $('rf1').value, kind: $('rk').value, note: $('rn2').value.trim() } : { type, rotaId: $('rs1').value, peerId: $('rp1').value, note: $('rn2').value.trim() };
  try { await OWW.api('reqCreate', b); OWW.close(); OWW.toast('Request sent ✓'); await loadReq(); } catch (e) { $('rerr').textContent = e.message; }
}


// ── punctuality: late / early leave versus the rota ──
const REASONS = ['Transport', 'Illness', 'Personal', 'Approved by manager', 'Other'];
let REASON_CB = null;
function nowT(id) { const d = new Date(); $(id).value = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); durUpdate(); }
function dev(date, st, en) { // minutes late / left early compared with the planned shift of that day (planned shifts known: today and the next 3 weeks)
  const p = (A.rota || []).filter(r => (!r.type || r.type === 'SHIFT') && r.date === date); if (!p.length) return null;
  const a = toM(st); let best = null;
  p.forEach(r => { const d = ((a - toM(r.start) + 1440 + 720) % 1440) - 720; if (!best || Math.abs(d) < Math.abs(best.d)) best = { r, d }; });
  const ps = toM(best.r.start), pe = ((toM(best.r.end) - ps + 1440) % 1440) || 1440, ae = ((toM(en) - ps + 1440) % 1440) || 1440;
  return { ps: best.r.start, pe: best.r.end, late: Math.max(0, best.d), early: Math.max(0, pe - ae) };
}
function devText(d) {
  const g = A.grace ?? 5, o = [];
  if (d.late > g) o.push('Late arrival: ' + d.late + ' min'); if (d.early > g) o.push('Early leave: ' + d.early + ' min'); if (d.ps) o.push('Planned ' + d.ps + '–' + d.pe);
  return o.join(' · ');
}
function reasonSheet(info, go) {
  REASON_CB = go;
  OWW.sheet(`<div><div class="nm" style="font-size:18px">Please tell us why</div><div class="sub" style="margin-top:4px">${esc(info)}</div></div>
    <select id="rsn">${REASONS.map(r => `<option>${r}</option>`).join('')}</select>
    <button class="btn p w" onclick="REASON_CB($('rsn').value);OWW.close()">Save shift</button><button class="btn w" onclick="OWW.close()">Cancel</button>`);
}
function pTags(x) {
  const g = A.grace ?? 5;
  return (x.late > g ? `<span class="tag a">Late ${x.late} min</span>` : '') + (x.early > g ? `<span class="tag a">Left early ${x.early} min</span>` : '') + (x.excused ? '<span class="tag g">Excused</span>' : '');
}
function lateN() {
  const g = A.grace ?? 5, m = OWW.ymd(new Date()).slice(0, 7);
  return A.shifts.filter(x => x.date.slice(0, 7) === m && x.late > g && !x.excused && x.status !== 'REJECTED').length + ' / ' + (A.limit ?? 3);
}



// everything the Sala screens need besides the shift log: events, requests, and the Sala item list for low-stock flags
let SD = { items: [], alerts: [] };
async function loadX() {
  const [e, q] = await Promise.all([OWW.api('eventList').catch(() => null), OWW.api('reqList').catch(() => null)]);
  if (e) EVK = e; if (q) RQ = q; renderEvk(); renderReq();
}

// ── dashboard card: my next planned shift ──
function renderNext() {
  const el = $('nxt'); if (!el) return;
  const l = (A.rota || []).filter(r => !r.type || r.type === 'SHIFT'), r = l[0], more = l.length - 1, t = OWW.ymd(new Date());
  el.innerHTML = r ? `<div class="card" style="padding:14px;display:grid;gap:8px"><div style="display:flex;justify-content:space-between;align-items:center"><div class="sub">Your next shift</div><span class="tag ${r.date === t ? 'g' : 'a'}">${relD(r.date)}</span></div>
      <div style="font-size:26px;font-weight:700;letter-spacing:-.5px">${esc(r.start)} → ${esc(r.end)}</div>
      <div class="sub">${OWW.day(r.date)} · ${OWW.kind(r.start)}${r.note ? ' · ' + esc(r.note) : ''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${r.date <= t ? `<button class="sm a" data-nu="${esc(r.id)}">Log these hours</button>` : ''}<button class="sm" data-ng>My rota${more > 0 ? ' (+' + more + ' more)' : ''}</button></div></div>`
    : `<div class="card" style="padding:14px"><div class="sub">Your next shift</div><div class="nm" style="margin-top:4px">No planned shifts yet</div><div class="sub">Your manager adds them in the rota.</div></div>`;
}
document.getElementById('nxt').onclick = e => {
  if (e.target.closest('[data-ng]')) return OWW.go('p-att');
  const b = e.target.closest('[data-nu]'); if (!b) return; const r = (A.rota || []).find(x => x.id === b.dataset.nu); if (!r) return;
  $('ad').value = r.date; $('as').value = r.start; $('ae').value = r.end; $('am').value = r.note || '';
  OWW.go('p-att'); document.querySelector('#aseg [data-v=log]').click(); durUpdate(); $('a-log').scrollIntoView({ behavior: 'smooth' });
};

// ── dashboard: the whole upcoming plan (shifts, rest days, holidays) ──
function renderUpc() {
  const el = $('upc'); if (!el) return; const l = (A.rota || []).slice(0, 10), t = OWW.ymd(new Date());
  el.innerHTML = '<div class="sec">Upcoming shifts</div>' + (l.length ? '<div class="card">' + l.map(r => r.type && r.type !== 'SHIFT'
    ? `<div class="row"><div class="grow"><div class="nm">${OWW.day(r.date)}</div><div class="sub">${relD(r.date)}</div></div><span class="tag ${r.type === 'HOLIDAY' ? 'g' : r.type === 'SICK' ? 'r' : ''}">${ABSL[r.type] || r.type}</span></div>`
    : `<div class="row"><div class="grow"><div class="nm">${OWW.day(r.date)}</div><div class="sub">${relD(r.date)} · ${esc(r.start)} → ${esc(r.end)} · ${OWW.kind(r.start)}${r.note ? ' · ' + esc(r.note) : ''}</div></div>${r.date <= t ? `<button class="sm a" data-nu="${esc(r.id)}">Log hours</button>` : ''}</div>`).join('') + '</div>'
    : '<div class="note">No planned shifts yet. Your manager adds them in the rota.</div>');
}
$('upc').onclick = e => { const b = e.target.closest('[data-nu]'); if (!b) return; const r = (A.rota || []).find(x => x.id === b.dataset.nu); if (!r) return;
  $('ad').value = r.date; $('as').value = r.start; $('ae').value = r.end; $('am').value = r.note || '';
  OWW.go('p-att'); document.querySelector('#aseg [data-v=log]').click(); durUpdate(); $('a-log').scrollIntoView({ behavior: 'smooth' }); };
