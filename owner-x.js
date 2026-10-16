// Owner app: all branches at one glance. It only LOOKS: nothing here changes a branch.
let OV = null, DET = null, BL = [], CFG = null, AF = 'ALL', CMP = { k: 'name', d: 1 }, TR = { b: 'ALL', m: 'openAlerts', days: 28, data: null };
const LANG = () => String(OWW.loc ? OWW.loc() : 'en').slice(0, 2) === 'it' ? 'it' : 'en', tx = a => a[LANG()] || a.en;
const ago = m => m === null || m === undefined ? '—' : m < 1 ? 'now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago';
const HN = { green: 'OK', amber: 'To watch', red: 'Problem', grey: 'Not reachable' }, AREA = { KITCHEN: 'Kitchen', SALA: 'Sala' }, areaTag = a => a ? `<span class="tag ${a === 'SALA' ? 'b' : 'a'}">${AREA[a] || a}</span>` : '';
const toTop = () => { OWW.$('main').scrollTop = 0; };

async function load(fresh) {
  try { OV = await OWW.api('overview', { fresh: !!fresh }); } catch (e) { OWW.toast(e.message, 'red'); return; }
  renderOv(); renderAt(); renderCmp(); const r = OV.attention.filter(a => a.sev === 'red').length; $('atb').textContent = r; $('atb').classList.toggle('hide', !r);
}
async function refresh() { const b = $('rf'); b.disabled = true; b.textContent = '…'; try { await load(true); if ($('p-br').classList.contains('on') && DET) await openBranch(DET.id, false); if ($('p-tr').classList.contains('on')) await loadTrends(); OWW.toast('Updated'); } finally { b.disabled = false; b.textContent = '↻'; } }

// ── overview ──
function card(b) {
  const c = b.card, st = b.status, tag = st === 'PAUSED' ? '<span class="tag">Paused</span>' : st === 'OK' ? `<span class="tag">${ago(b.ageMin)}</span>` : `<span class="tag a">No answer${b.ageMin !== null ? ' · ' + ago(b.ageMin) : ''}</span>`;
  const k = (l, v) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`;
  const fr = !c ? '' : c.fridges ? (c.readingsToday ? '✓ ' + c.readingsToday : '—') + (c.outOfRange ? ' <span style="color:var(--red)">✕' + c.outOfRange + '</span>' : '') : 'n/a';
  return `<button class="bcard ${b.health}" data-b="${esc(b.id)}"><div class="h"><span class="dot ${b.health}"></span><b>${esc(b.name)}</b>${tag}</div>` + (c ?
    `<div class="kpis">${k('On shift', c.onShift + '/' + c.scheduled)}${k('Hours today', c.hoursToday)}${k('Open alerts', c.openAlerts)}${k('Critical', c.critical)}${k('Fridge checks', fr)}${k('Last delivery', c.lastDelivery ? c.lastDelivery.daysAgo + ' d' + (c.lastDelivery.short ? ' ⚠' : '') : '—')}</div>` : '<div class="sub" style="margin-top:8px">No data yet</div>') +
    b.attention.slice(0, 2).map(a => `<div class="at"><span class="dot ${a.sev}" style="width:8px;height:8px;margin-top:4px"></span><span>${esc(tx(a))}</span></div>`).join('') + '</button>';
}
function renderOv() {
  const c = OV.counts;
  $('ov-sum').innerHTML = [['green', c.green, 'OK'], ['amber', c.amber, 'To watch'], ['red', c.red, 'Problem'], ['grey', c.grey, 'Not reachable']].filter(x => x[1] || x[0] !== 'grey').map(x => `<span class="chip"><span class="dot ${x[0]}" style="width:9px;height:9px;margin-right:6px"></span>${x[1]} ${x[2]}</span>`).join('');
  $('ov-upd').textContent = OV.branches.length ? 'Updated ' + OV.now.slice(11, 16) + ' · tap ↻ to ask every branch right now' : '';
  $('ov-cards').innerHTML = OV.branches.length ? OV.branches.map(card).join('') : '<div class="empty">No branch yet. Add one in Settings → Branches.</div>';
}
$('ov-cards').onclick = e => { const b = e.target.closest('[data-b]'); if (b) openBranch(b.dataset.b, false); };

// ── attention ──
function renderAt() {
  const l = OV.attention, n = f => l.filter(f).length;
  $('at-f').innerHTML = [['ALL', 'All', l.length], ['red', 'Problems', n(a => a.sev === 'red')], ['amber', 'To watch', n(a => a.sev === 'amber')]].map(x => `<button class="chip ${AF === x[0] ? 'on' : ''}" data-f="${x[0]}">${x[1]} ${x[2]}</button>`).join('') + OV.branches.filter(b => l.some(a => a.branchId === b.id)).map(b => `<button class="chip ${AF === b.id ? 'on' : ''}" data-f="${esc(b.id)}">${esc(b.name)}</button>`).join('');
  const sh = l.filter(a => AF === 'ALL' || a.sev === AF || a.branchId === AF);
  $('at-list').innerHTML = sh.length ? sh.map(a => `<div class="row" data-b="${esc(a.branchId)}" style="cursor:pointer"><span class="dot ${a.sev}"></span><div class="grow"><div class="nm">${esc(tx(a))}</div><div class="sub">${esc(a.branch)} ${areaTag(a.area)}</div></div></div>`).join('') : '<div class="empty">Nothing needs your attention 🎉</div>';
}
$('at-f').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { AF = b.dataset.f; renderAt(); } };
$('at-list').onclick = e => { const r = e.target.closest('[data-b]'); if (r) openBranch(r.dataset.b, false); };

// ── compare ──
const COLS = [['name', 'Branch', 0], ['punctuality', 'On time %', 1], ['hoursVsPlan', 'Hours vs plan %', 0], ['avgRefillDays', 'Alert refill (days)', -1], ['openAlerts', 'Open alerts', -1], ['critical', 'Critical items', -1], ['fridgeDays', 'Fridge days of 7', 1], ['shortRate', 'Short deliveries %', -1], ['pendingHours', 'Hours pending', -1], ['countDays', 'Days since count', -1]];
function renderCmp() {
  const l = OV.branches.filter(b => b.metrics), val = (b, k) => k === 'name' ? b.name : b.metrics[k];
  l.sort((a, b) => { const x = val(a, CMP.k), y = val(b, CMP.k); if (x === y) return 0; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return (x > y ? 1 : -1) * CMP.d; });
  const mark = {}; COLS.forEach(c => { if (!c[2] || l.length < 3) return; const v = l.map(b => val(b, c[0])).filter(x => x !== null && x !== undefined); if (v.length < 3) return; const mx = Math.max(...v), mn = Math.min(...v); if (mx === mn) return; mark[c[0]] = { best: c[2] > 0 ? mx : mn, worst: c[2] > 0 ? mn : mx }; });
  $('cmp').innerHTML = l.length ? `<table class="rt" style="min-width:760px"><thead><tr>${COLS.map(c => `<th data-sort="${c[0]}">${c[1]}${CMP.k === c[0] ? (CMP.d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>` +
    l.map(b => `<tr data-b="${esc(b.id)}" style="cursor:pointer">${COLS.map(c => { const v = val(b, c[0]), m = mark[c[0]], cl = m && v === m.best ? 'best' : m && v === m.worst ? 'worst' : ''; return `<td class="${cl}">${c[0] === 'name' ? `<span class="dot ${b.health}" style="width:9px;height:9px;margin-right:6px"></span>${esc(v)}` : v === null || v === undefined ? '—' : v}</td>`; }).join('')}</tr>`).join('') + '</tbody></table>' : '<div class="empty">No data yet</div>';
}
$('cmp').onclick = e => { const h = e.target.closest('[data-sort]'), r = e.target.closest('tr[data-b]'); if (h) { const k = h.dataset.sort; CMP = { k, d: CMP.k === k ? -CMP.d : 1 }; renderCmp(); } else if (r) openBranch(r.dataset.b, false); };

// ── trends ──
const TM = [['lateRate', 'Late arrivals % (7 days)'], ['openAlerts', 'Open stock alerts'], ['critical', 'Critical stock items'], ['avgRefill', 'Alert refill time (days)'], ['fridgeDays', 'Days with fridge checks (of 7)'], ['outOfRange', 'Fridge readings out of range (24 h)'], ['short30', 'Short delivery lines (30 days)'], ['pending', 'Shifts waiting for approval'], ['worked', 'Hours worked (7 days)'], ['onShift', 'People on shift']];
const PAL = ['#E8A020', '#3DB87A', '#5B9BD5', '#E05252', '#B58BD6', '#4FD1C5', '#F78FB3', '#A0AEC0'];
async function loadTrends() {
  if (!OV) return; $('tr-b').innerHTML = '<option value="ALL">All branches</option>' + OV.branches.map(b => `<option value="${esc(b.id)}" ${TR.b === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  $('tr-m').innerHTML = TM.map(m => `<option value="${m[0]}" ${TR.m === m[0] ? 'selected' : ''}>${m[1]}</option>`).join(''); $('tr-d').innerHTML = [[28, '4 weeks'], [84, '12 weeks']].map(x => `<button class="chip ${TR.days === x[0] ? 'on' : ''}" data-d="${x[0]}">${x[1]}</button>`).join('');
  try { TR.data = await OWW.api('trends', { id: TR.b, days: TR.days }); } catch (e) { return OWW.toast(e.message, 'red'); } drawTrend();
}
function chart(labels, series) {
  const W = 640, H = 250, L = 38, R = 12, T = 12, B = 26, vals = series.flatMap(s => s.data.filter(v => v !== null)); if (!vals.length) return '';
  const max = Math.max(...vals), top = max <= 0 ? 1 : max * 1.15, X = i => L + (W - L - R) * (labels.length < 2 ? 0 : i / (labels.length - 1)), Y = v => T + (H - T - B) * (1 - v / top), fmt = v => Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  let g = '', i; for (i = 0; i <= 4; i++) { const v = top * i / 4, y = Y(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--bd)" stroke-width="1"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--tx3)">${fmt(v)}</text>`; }
  [0, Math.floor((labels.length - 1) / 2), labels.length - 1].forEach(k => { const d = labels[k].slice(8, 10) + '/' + labels[k].slice(5, 7); g += `<text x="${X(k)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === labels.length - 1 ? 'end' : 'middle'}" font-size="11" fill="var(--tx3)">${d}</text>`; });
  series.forEach((s, n) => { let d = '', pen = false, last = -1; s.data.forEach((v, k) => { if (v === null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(v).toFixed(1) + ' '; pen = true; last = k; });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>` + (last >= 0 ? `<circle cx="${X(last)}" cy="${Y(s.data[last])}" r="3.5" fill="${s.color}"/>` : ''); });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend chart">${g}</svg>`;
}
function drawTrend() {
  const d = TR.data, ids = Object.keys(d.series); let ser = ids.map((id, n) => ({ name: d.series[id].name, color: PAL[n % PAL.length], data: d.series[id][TR.m] }));
  if (TR.m === 'worked' && ids.length === 1) ser.push({ name: 'Planned hours', color: '#7A7A80', data: d.series[ids[0]].planned });
  ser = ser.filter(x => x.data.some(v => v !== null)); // a branch with no data yet has no line
  $('tr-l').innerHTML = ser.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join(''); const svg = chart(d.labels, ser);
  $('tr-c').innerHTML = svg || '<div class="empty">No data yet. The chart fills up day by day (one point per day per branch).</div>';
  $('tr-n').textContent = svg ? 'One point per day. The branches are read every 30 minutes.' : '';
}
$('tr-b').onchange = e => { TR.b = e.target.value; loadTrends(); }; $('tr-m').onchange = e => { TR.m = e.target.value; drawTrend(); };
$('tr-d').onclick = e => { const b = e.target.closest('[data-d]'); if (b) { TR.days = +b.dataset.d; loadTrends(); } };

// ── one branch ──
async function openBranch(id, fresh) {
  OWW.go('p-br'); document.querySelectorAll('.nb').forEach(b => b.classList.toggle('on', b.dataset.p === 'p-ov')); toTop();
  if (!DET || DET.id !== id) { $('br-head').innerHTML = ''; $('br-body').innerHTML = '<div class="empty">Loading…</div>'; }
  try { DET = await OWW.api('branchDetail', { id, fresh: !!fresh }); } catch (e) { OWW.toast(e.message, 'red'); return; } renderDet();
}
function renderDet() {
  const b = DET, s = b.summary, tag = b.status === 'PAUSED' ? '<span class="tag">Paused</span>' : b.status === 'OK' ? `<span class="tag">${ago(b.ageMin)}</span>` : `<span class="tag a">No answer · ${ago(b.ageMin)}</span>`;
  $('br-head').innerHTML = `<div class="card" style="padding:14px;display:grid;gap:10px"><div class="h" style="display:flex;align-items:center;gap:8px"><span class="dot ${b.health}"></span><b style="font-size:18px;flex:1">${esc(b.name)}</b>${tag}</div>${b.error ? `<div class="sub" style="color:var(--amber)">${esc(b.error)}</div>` : ''}
    <div class="two"><button class="btn" id="br-live">↻ Refresh live</button><button class="btn p" id="br-open" ${s ? '' : 'disabled'}>Open Admin (view only)</button></div></div>`;
  if (!s) { $('br-body').innerHTML = '<div class="empty">No data from this branch yet</div>'; return; }
  const sec = (t, h) => `<div class="sec">${t}</div><div class="card">${h}</div>`, row = (l, v, x) => `<div class="row"><div class="grow"><div class="nm">${l}</div>${x ? `<div class="sub">${x}</div>` : ''}</div><b>${v}</b></div>`, none = t => `<div class="empty">${t}</div>`;
  const w = s.hours.week, m = s.hours.month, st = s.stock, h = s.haccp, d = s.deliveries, al = s.alerts;
  $('br-body').innerHTML =
    sec('Needs attention', b.attention.length ? b.attention.map(a => `<div class="row"><span class="dot ${a.sev}"></span><div class="grow"><div class="nm">${esc(tx(a))}</div></div>${areaTag(a.area)}</div>`).join('') : none('Nothing 🎉')) +
    sec('People today', s.staff.people.length ? s.staff.people.map(p => `<div class="row"><div class="grow"><div class="nm">${esc(p.name)} ${areaTag(p.area)}</div><div class="sub">${esc(p.start)} → ${esc(p.end)}</div></div><span class="tag ${p.state === 'now' ? 'g' : ''}">${p.state === 'now' ? 'On shift' : p.state === 'done' ? 'Finished' : 'Later'}</span></div>`).join('') + row('Hours logged today', s.staff.hoursToday + ' h') : none('Nobody planned today')) +
    sec('Hours', row('This week', w.worked + ' h', 'of ' + w.planned + ' h planned · ' + w.shifts + ' shifts') + row('This month', m.worked + ' h', 'of ' + m.planned + ' h planned') + row('Late arrivals (week)', w.late, 'early leaves ' + w.early) + row('Waiting for approval', s.hours.pending, s.hours.pending ? 'oldest ' + s.hours.pendingOldestDays + ' d' : '') + row('Staff requests waiting', s.requests.pending, s.requests.pending ? 'oldest ' + s.requests.oldestDays + ' d' : '')) +
    sec('Open stock alerts (' + al.open + ')', al.list.length ? al.list.map(a => `<div class="row"><div class="grow"><div class="nm">${esc(a.item)} ${areaTag(a.area)} <span class="tag ${a.supplier === 'VERDURA' ? 'g' : ''}">${a.supplier === 'VERDURA' ? 'Verdura' : 'Havi'}</span></div><div class="sub">${esc(a.by)}</div></div><b>${a.days} d</b></div>`).join('') + row('Average time to refill', al.avgRefillDays === null ? '—' : al.avgRefillDays + ' d', 'last 30 days · raised ' + al.raised7d + ' · refilled ' + al.refilled7d + ' this week') : none('No open alerts')) +
    sec('Stock', ['KITCHEN', 'SALA'].map(a => row(AREA[a], st[a].critical + ' critical', st[a].items + ' items · ' + st[a].low + ' low · ' + st[a].uncounted + ' not counted')).join('') + s.criticalList.map(c => `<div class="row"><div class="grow"><div class="nm">${esc(c.item)} ${areaTag(c.area)}</div><div class="sub">minimum ${c.min} ${esc(c.unit)}</div></div><b style="color:var(--red)">${c.cur}</b></div>`).join('') + row('Last stock count', s.counts.daysAgo === null ? 'never' : s.counts.daysAgo + ' d ago')) +
    sec('HACCP (fridges)', row('Fridges set up', h.fridges) + row('Readings today', h.readingsToday) + row('Days with checks (7)', h.daysWithChecks7d + ' / 7', h.lastReading ? 'last reading ' + h.lastReading : '') + (h.issues.length ? h.issues.map(x => `<div class="row"><div class="grow"><div class="nm" style="color:var(--red)">${esc(x.fridge)} ${x.temp}°</div><div class="sub">${esc(x.date)} · ${esc(x.shift)} · ${esc(x.by)}</div></div><span class="tag r">Out of range</span></div>`).join('') : row('Out of range (24 h)', 0))) +
    sec('Havi deliveries', (d.last ? row('Last delivery note', d.last.date, d.last.lines + ' lines · applied ' + d.last.daysAgo + ' d ago' + (d.last.short ? ' · ' + d.last.short + ' short' : '')) : none('No delivery note applied yet')) + row('Short lines (30 days)', d.short30d + ' / ' + d.lines30d) + d.shortList.map(x => `<div class="row"><div class="grow"><div class="nm">${esc(x.item)}</div><div class="sub">${esc(x.date)} · ordered ${x.ordered} · received ${x.received}</div></div><span class="tag a">Short</span></div>`).join('')) +
    sec('Delivered lots expiring within 14 days', d.expiring.length ? d.expiring.map(x => `<div class="row"><div class="grow"><div class="nm">${esc(x.item)} ${areaTag(x.area)}</div><div class="sub">${esc(x.expiry)} · ${x.qty}</div></div><b>${x.daysLeft} d</b></div>`).join('') : none('None')) +
    sec('Kitchen prep', row('Prep entries today', s.prep.logsToday));
}
$('br-head').onclick = async e => {
  if (e.target.closest('#br-live')) { $('br-live').disabled = true; await openBranch(DET.id, true); OWW.toast('Branch updated'); }
  else if (e.target.closest('#br-open')) openAdmin(DET.id);
};
async function openAdmin(id) { // the branch's Admin, view only, without another password
  try { const p = await OWW.api('branchPass', { id }); localStorage.setItem('oww_s', JSON.stringify({ tk: p.token, user: p.user, url: p.url, layer: true, bname: p.branch })); location.href = 'inventory.html'; }
  catch (e) { OWW.toast(e.message, 'red'); }
}

// ── settings: branches + thresholds ──
async function loadSettings() {
  try { BL = await OWW.api('branchList'); CFG = await OWW.api('configGet'); } catch (e) { return OWW.toast(e.message, 'red'); }
  $('br-list').innerHTML = BL.length ? '<div class="card">' + BL.map(b => `<div class="row" style="flex-wrap:wrap"><div class="grow"><div class="nm">${esc(b.name)} <span class="sub">${esc(b.id)}</span></div><div class="sub">${b.status === 'PAUSED' ? 'Paused' : b.lastOk ? 'Last answer ' + esc(String(b.lastOk).slice(0, 16).replace('T', ' ')) : 'Never answered'}</div>${b.error ? `<div class="sub" style="color:var(--amber)">${esc(b.error)}</div>` : ''}</div>
      <button class="sm" data-e="${esc(b.id)}">Edit</button><button class="sm" data-p="${esc(b.id)}:${b.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED'}">${b.status === 'PAUSED' ? 'Resume' : 'Pause'}</button><button class="sm" data-x="${esc(b.id)}" aria-label="Remove ${esc(b.name)}">✕</button></div>`).join('') + '</div>' : '<div class="empty">No branch yet</div>';
  $('cfg').innerHTML = Object.keys(CFG.config).map(k => `<div class="row"><div class="grow"><div class="sub" style="font-size:13px;color:var(--tx)">${esc(CFG.meaning[k])}</div></div><input class="qty" type="number" min="0" step="1" inputmode="numeric" data-c="${esc(k)}" value="${CFG.config[k]}" aria-label="${esc(k)}"></div>`).join('');
}
function branchForm(id) {
  const b = BL.find(x => x.id === id) || {};
  OWW.sheet(`<div class="nm" style="font-size:18px">${id ? 'Edit branch' : 'Add a branch'}</div>
    <div class="note" style="padding:0">In the branch sheet open <b>OWW Tools → 6. Connect to the Owner app</b>: it shows the three things below.</div>
    <input id="bi" placeholder="Branch code, e.g. BR001" value="${esc(b.id || '')}" ${id ? 'readonly' : ''} maxlength="5"><input id="bn" placeholder="Name, e.g. Viareggio" value="${esc(b.name || '')}" maxlength="60">
    <input id="bu" placeholder="Web app address (https://script.google.com/…/exec)" value="${esc(b.url || '')}" autocapitalize="none"><input id="bk" placeholder="${id ? 'Owner key (leave empty to keep the current one)' : 'Owner key'}" autocapitalize="none" autocomplete="off">
    <div class="err" id="ber"></div><button class="btn p w" id="bsave">${id ? 'Save' : 'Add and test the connection'}</button><button class="btn w" onclick="OWW.close()">Cancel</button>`);
  $('bsave').onclick = async () => {
    $('bsave').disabled = true; $('ber').textContent = '';
    try { const r = await OWW.api('branchSave', { id: $('bi').value, name: $('bn').value, url: $('bu').value, key: $('bk').value }); OWW.close(); OWW.toast(r.connected ? 'Branch connected ✓' : 'Saved, but the branch did not answer: ' + r.error, r.connected ? 'green' : 'amber'); await loadSettings(); await load(false); }
    catch (e) { $('ber').textContent = e.message; $('bsave').disabled = false; }
  };
}
$('br-add').onclick = () => branchForm('');
$('br-list').onclick = async e => {
  const ed = e.target.closest('[data-e]'), p = e.target.closest('[data-p]'), x = e.target.closest('[data-x]');
  try {
    if (ed) return branchForm(ed.dataset.e);
    if (p) { const [id, st] = p.dataset.p.split(':'); await OWW.api('branchStatus', { id, status: st }); await loadSettings(); await load(false); }
    if (x) { const b = BL.find(y => y.id === x.dataset.x); if (!confirm('Remove “' + b.name + '” from the Owner app? The branch itself is not touched.')) return; await OWW.api('branchDelete', { id: b.id }); OWW.toast('Removed'); await loadSettings(); await load(false); }
  } catch (er) { OWW.toast(er.message, 'red'); }
};
$('cfg-save').onclick = async () => { const values = {}; document.querySelectorAll('#cfg [data-c]').forEach(i => values[i.dataset.c] = i.value); try { await OWW.api('configSave', { values }); OWW.toast('Saved ✓'); await load(false); } catch (e) { OWW.toast(e.message, 'red'); } };
