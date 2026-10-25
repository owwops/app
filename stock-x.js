// Stock pages: Stock (Havi) and Stock (Verdura). One engine, two suppliers.
//   Havi    = arrives with the Friday delivery note (PDF): tabs Stock · Alerts · Order · Delivery
//   Verdura = greengrocer, no PDF: the list is kept by hand (add / remove an item in KG or PZ, then type the quantity): tabs Stock · Alerts · To buy
// Alerts: staff flag a finished item. It closes by itself (✓) when the item is refilled; the manager can also tick it. Items not refilled stay in the list.
const SCOPE = u => u.role === 'Director' || u.role === 'Owner' ? ['KITCHEN', 'SALA'] : u.role === 'Kitchen Manager' ? ['KITCHEN'] : u.role === 'Sala Manager' ? ['SALA'] : [];
const AREAN = { KITCHEN: 'Kitchen', SALA: 'Sala' };
const tagOf = s => ({ CRITICAL: ['r', 'Critical'], LOW: ['a', 'Low'], OK: ['g', 'OK'], UNCOUNTED: ['', 'Not counted'] }[s]);
const ULAB = ct => OWW.UL[ct] || 'PZ', QF = (n, i) => OWW.fmtQty(n, i.ct, i.per);
// the quantity boxes of one row: items that come in boxes get two (boxes + loose Busta/PZ), everything else one (PZ, Busta or KG)
function stockInputs(i) {
  const un = i.status === 'UNCOUNTED', lab = ULAB(i.ct), nm = esc(i.name);
  if (i.per > 1) { const b = un ? '' : Math.floor(i.cur / i.per + 1e-9), l = un ? '' : Math.round((i.cur - b * i.per) * 100) / 100;
    return `<span data-sg="${esc(i.id)}" data-per="${i.per}" style="display:flex;gap:6px"><input class="qty" style="width:64px" type="number" step="1" min="0" inputmode="numeric" data-sb value="${b}" placeholder="B" aria-label="Boxes of ${nm}"><input class="qty" style="width:78px" type="number" step="any" min="0" inputmode="decimal" data-sl value="${l}" placeholder="${lab}" aria-label="${lab} of ${nm}"></span>`; }
  return `<input class="qty" type="number" step="any" inputmode="decimal" min="0" data-sq="${esc(i.id)}" value="${un ? '' : i.cur}" placeholder="${lab}" aria-label="Stock of ${nm} in ${lab}">`;
}
function StockPage(cfg) {
  const k = cfg.key, V = cfg.supplier === 'VERDURA', root = $(cfg.root), P = { D: { inv: [], order: [], alerts: [] }, tab: 'list', filt: 'ALL', area: 'ALL', del: {}, ddt: false };
  const both = () => SCOPE(OWW.user).length > 1, inA = x => P.area === 'ALL' || x.area === P.area, id = s => k + '-' + s;
  root.innerHTML = `<div class="stats" id="${id('stats')}"></div>
    <div style="padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><div class="seg" id="${id('seg')}"></div><div class="chips" id="${id('areas')}" style="padding:0"></div></div>
    <div id="${id('list')}"></div><div id="${id('alerts')}" class="hide"></div><div id="${id('order')}" class="hide"></div>${V ? '' : `<div id="${id('del')}" class="hide"><div id="${id('ddt')}"></div><div class="sec">Or confirm by hand</div><div class="note">No PDF? Enter the boxes actually received.</div><div class="card" id="${id('man')}"></div><div class="find"><select id="${id('add')}"></select></div><div class="bar"><button class="btn g" id="${id('conf')}">Confirm &amp; update stock</button></div></div>`}`;
  root.insertAdjacentHTML('afterbegin', '');
  const listHtml = `<div class="bar">${V ? `<button class="btn p" data-a="add">+ Add item</button><button class="btn" data-a="cat">Add from catalog</button>` : `<button class="btn" onclick="navGo('imp')">Import count from photo / PDF / CSV</button><button class="btn p" onclick="navGo('count')">Count by shelf walk</button>`}</div>
    <div class="find"><input id="${id('q')}" name="oww-find-${k}" placeholder="Search stock…" autocomplete="off" data-lpignore="true" data-1p-ignore></div><div class="chips" id="${id('flt')}"></div><div class="note" id="${id('hint')}"></div><div class="note" id="${id('nw')}" style="color:var(--amber)"></div><div class="card" id="${id('rows')}"></div>`;
  $(id('list')).innerHTML = listHtml;
  P.load = async function () {
    try { P.D = await OWW.api('invData', { supplier: cfg.supplier }); } catch (e) { OWW.toast(e.message, 'red'); return; }
    P.draw(); if (cfg.onload) cfg.onload(P);
  };
  P.pending = () => (P.D.alerts || []).filter(a => a.status === 'OPEN' || a.status === 'ORDERED');
  P.draw = function () {
    const inv = P.D.inv.filter(inA), c = s => inv.filter(i => i.status === s).length, pend = P.pending().filter(inA), ord = P.D.order.filter(inA);
    $(id('stats')).innerHTML = [['Items', inv.length, ''], ['Critical', c('CRITICAL'), 'var(--red)'], ['Low', c('LOW'), 'var(--amber)'], ['Open alerts', pend.length, pend.length ? 'var(--amber)' : '']].map(s => `<div class="stat"><small>${s[0]}</small><b style="color:${s[2] || 'inherit'}">${s[1]}</b></div>`).join('');
    const tabs = [['list', 'Stock'], ['alerts', 'Alerts' + (pend.length ? ' ' + pend.length : '')], ['order', V ? 'To buy' + (ord.length ? ' ' + ord.length : '') : 'Order' + (ord.length ? ' ' + ord.length : '')]].concat(V ? [] : [['del', 'Delivery']]);
    $(id('seg')).innerHTML = tabs.map(t => `<button data-t="${t[0]}" class="${P.tab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('');
    $(id('areas')).innerHTML = both() ? [['ALL', 'All'], ['KITCHEN', 'Kitchen'], ['SALA', 'Sala']].map(a => `<button class="chip ${P.area === a[0] ? 'on' : ''}" data-ar="${a[0]}">${a[1]}</button>`).join('') : '';
    ['list', 'alerts', 'order', 'del'].forEach(t => { const e = $(id(t)); if (e) e.classList.toggle('hide', P.tab !== t); });
    drawList(inv); drawAlerts(); drawOrder(ord);
    if (cfg.badge) cfg.badge(P.pending().length);
  };
  function drawList(inv) {
    $(id('flt')).innerHTML = [['ALL', 'All'], ['CRITICAL', 'Critical'], ['LOW', 'Low'], ['UNCOUNTED', 'Not counted']].map(f => `<button class="chip ${P.filt === f[0] ? 'on' : ''}" data-f="${f[0]}">${f[1]}</button>`).join('');
    const q = $(id('q')).value.trim().toLowerCase(), l = inv.filter(i => (P.filt === 'ALL' || i.status === P.filt) && (!q || i.name.toLowerCase().includes(q)));
    const nw = (P.D.needWeight || []).filter(x => x.sup === cfg.supplier && inA(x));
    $(id('nw')).innerHTML = nw.length ? '⚠ ' + nw.length + ' item(s) used in recipes have no weight yet, so recipes do not take them off the stock: ' + nw.slice(0, 8).map(x => esc(x.name)).join(', ') + (nw.length > 8 ? '…' : '') + '. Fill “Weight per Unit (g)” in the Global sheet (RAW_INGREDIENTS).' : '';
    $(id('hint')).textContent = !inv.length ? (V ? 'No items yet. Tap “+ Add item”, choose KG or PZ, then type the quantity next to it.' : '') : inv.some(i => i.status === 'UNCOUNTED') ? 'Type the quantity you have now next to each item. Tap a name to set its minimum.' : 'Tap a name to set its minimum and critical level.';
    $(id('rows')).innerHTML = l.length ? l.map(i => { const t = tagOf(i.status);
      return `<div class="row" style="flex-wrap:wrap"><div class="grow" data-info="${esc(i.id)}" style="cursor:pointer;flex:1 1 130px"><div class="nm">${esc(i.name)}</div><div class="sub">${esc(i.storage)} · min ${esc(QF(i.min, i))}${i.per > 1 ? ' · 1 box = ' + i.per : ''} ${both() ? `<span class="tag ${i.area === 'SALA' ? 'b' : 'a'}">${AREAN[i.area]}</span>` : ''}</div></div>
        <div style="display:grid;gap:3px;justify-items:end;min-width:84px"><b style="white-space:nowrap">${i.status === 'UNCOUNTED' ? '—' : esc(QF(i.cur, i))}</b><span class="tag ${t[0]}">${t[1]}</span></div>${stockInputs(i)}${V ? `<button class="sm" data-rm="${esc(i.id)}" aria-label="Remove ${esc(i.name)}">✕</button>` : ''}</div>`; }).join('')
      : '<div class="empty">No items match</div>';
  }
  function drawAlerts() {
    const pend = P.pending().filter(inA), rec = (P.D.alerts || []).filter(a => a.status === 'REFILLED' && inA(a));
    $(id('alerts')).innerHTML = `<div class="note">Staff flag a finished item. It closes by itself (✓) when ${V ? 'you type a higher quantity' : 'a delivery or a higher quantity'} refills it. Items that were not refilled stay here.</div>` +
      (pend.length ? '<div class="card">' + pend.map(a => `<div class="row" style="flex-wrap:wrap"><div class="grow"><div class="nm">${esc(a.item)} ${both() ? `<span class="tag ${a.area === 'SALA' ? 'b' : 'a'}">${AREAN[a.area]}</span>` : ''}${a.status === 'ORDERED' ? ' <span class="tag a">Ordered</span>' : ''}</div>
        <div class="sub">${esc(a.by)} · ${esc(a.date)} · ${esc(a.qty)}${a.note ? ' · “' + esc(a.note) + '”' : ''}</div></div>
        <button class="sm g" data-r="${esc(a.id)}" aria-label="Refilled" title="Refilled" style="font-size:16px;padding:6px 14px">✓</button>${a.status === 'OPEN' ? `<button class="sm" data-o="${esc(a.id)}">Ordered</button>` : ''}<button class="sm" data-x="${esc(a.id)}">Dismiss</button></div>`).join('') + '</div>'
        : '<div class="empty">No open alerts</div>') +
      (rec.length ? '<div class="sec">Refilled recently</div><div class="card">' + rec.map(a => `<div class="row"><div class="grow"><div class="nm">${esc(a.item)}</div><div class="sub">${esc(a.by)} · flagged ${esc(a.date)} · refilled ${esc(a.refilled)}${a.refilledBy ? ' by ' + esc(a.refilledBy) : ''}</div></div><span class="tag g">✓ Refilled</span></div>`).join('') + '</div>' : '');
  }
  function drawOrder(ord) {
    $(id('order')).innerHTML = `<div class="note">${V ? 'Items at or below their minimum: how much to buy.' : 'Items at or below minimum stock, sized from weekly usage.'}</div><div class="card">` + (ord.length
      ? `<div class="ch"><span>${V ? 'Items to buy' : 'Items to order'}</span><span class="tag b">${ord.reduce((s, i) => s + i.boxes, 0)} ${V ? 'units' : 'boxes'}</span></div>` + ord.map(i => `<div class="row"><div class="grow"><div class="nm">${esc(i.name)} ${both() ? `<span class="tag ${i.area === 'SALA' ? 'b' : 'a'}">${AREAN[i.area]}</span>` : ''}</div><div class="sub">${esc(i.show || i.cur)} left${i.per > 1 ? ' · 1 box = ' + i.per + ' ' + ULAB(i.ct) : ''}</div></div><b style="color:var(--amber);font-size:18px">${i.boxes} ${i.per > 1 ? 'box' : ULAB(i.ct)}</b></div>`).join('')
      : `<div class="empty">Nothing to ${V ? 'buy' : 'order'}. Items at or below their minimum appear here (set the minimum by tapping an item).</div>`) + `</div><div class="bar"><button class="btn p" data-a="wa">Send ${V ? 'list' : 'order'} via WhatsApp</button></div>`;
  }
  // ── manual receipt (Havi only) ──
  function resetMan() { P.del = {}; P.D.order.forEach(i => P.del[i.rawId] = { name: i.name, ordered: i.boxes, got: i.boxes, box: i.box, per: i.per, unit: ULAB(i.ct) }); }
  function drawMan() {
    if (V) return; const ks = Object.keys(P.del);
    $(id('man')).innerHTML = ks.length ? ks.map(x => `<div class="row"><div class="grow"><div class="nm">${esc(P.del[x].name)}</div><div class="sub">ordered ${P.del[x].ordered} ${P.del[x].per > 1 ? 'box · 1 box = ' + P.del[x].per + ' ' + esc(P.del[x].unit) : esc(P.del[x].unit)}</div></div><input class="qty" type="number" min="0" step="1" inputmode="numeric" data-m="${esc(x)}" value="${P.del[x].got}" aria-label="Received"></div>`).join('') : '<div class="empty">No pending order. Add received items below.</div>';
    $(id('add')).innerHTML = '<option value="">+ Add another received item…</option>' + P.D.inv.filter(i => !P.del[i.id]).map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');
  }
  // ── events ──
  root.addEventListener('click', async e => {
    if (e.target.closest('#' + id('ddt'))) return;
    const t = e.target.closest('[data-t]'), ar = e.target.closest('[data-ar]'), f = e.target.closest('[data-f]'), a = e.target.closest('[data-a]'), r = e.target.closest('[data-r]'), o = e.target.closest('[data-o]'), x = e.target.closest('[data-x]'), rm = e.target.closest('[data-rm]'), inf = e.target.closest('[data-info]');
    if (t) { P.tab = t.dataset.t; P.draw(); if (P.tab === 'del') { if (!P.ddt) { P.ddt = true; DDT.mount(id('ddt'), { after: () => loadAll() }); } resetMan(); drawMan(); } return; }
    if (ar) { P.area = ar.dataset.ar; P.draw(); return; }
    if (f) { P.filt = f.dataset.f; P.draw(); return; }
    const res = async (aid, how) => { try { const rr = await OWW.api('resolveAlert', { alertId: aid, how }); OWW.toast(how === 'refilled' ? 'Marked as refilled ✓' : how === 'ordered' ? 'Marked as ordered' : 'Dismissed'); await loadAll(); } catch (er) { OWW.toast(er.message, 'red'); } };
    if (r) return res(r.dataset.r, 'refilled'); if (o) return res(o.dataset.o, 'ordered'); if (x) return res(x.dataset.x, 'dismissed');
    if (rm) { const it = P.D.inv.find(i => i.id === rm.dataset.rm); if (!confirm('Remove “' + it.name + '” from your Verdura list? Its history stays and you can add it again later.')) return;
      try { await OWW.api('itemRemove', { rawId: it.id }); OWW.toast('Removed'); await loadAll(); } catch (er) { OWW.toast(er.message, 'red'); } return; }
    if (inf) return limitsForm(inf.dataset.info);
    if (a) { const w = a.dataset.a; if (w === 'add') return addForm(); if (w === 'cat') return catalog(); if (w === 'wa') {
      const l = P.D.order.filter(inA); if (!l.length) return OWW.toast('Nothing to ' + (V ? 'buy' : 'order'), 'amber');
      window.open('https://wa.me/?text=' + encodeURIComponent((V ? '*Verdura*\n\n' : '*Ordine*\n\n') + l.map((i, n) => `${n + 1}. ${i.name} — ${i.boxes} ${i.per > 1 ? 'box' : ULAB(i.ct)}`).join('\n')), '_blank'); } }
  });
  root.addEventListener('input', e => { if (e.target.id === id('q')) drawList(P.D.inv.filter(inA)); });
  root.addEventListener('change', async e => {
    const el = e.target; if (el.closest('#' + id('ddt'))) return;
    if (el.dataset.sb !== undefined || el.dataset.sl !== undefined) {
      const g = el.closest('[data-sg]'), per = +g.dataset.per, bx = g.querySelector('[data-sb]').value, lo = g.querySelector('[data-sl]').value; if (bx === '' && lo === '') return;
      const tot = Math.round(((parseFloat(bx) || 0) * per + (parseFloat(lo) || 0)) * 100) / 100;
      try { const r = await OWW.api('updateInventory', { rawId: g.dataset.sg, stock: tot }); OWW.toast('Saved ✓' + (r.refilled ? ' · ' + r.refilled + ' alert(s) refilled' : '')); await loadAll(); } catch (x) { OWW.toast(x.message, 'red'); }
    }
    else if (el.dataset.sq !== undefined) { if (el.value === '') return; try { const r = await OWW.api('updateInventory', { rawId: el.dataset.sq, stock: el.value }); OWW.toast('Saved ✓' + (r.refilled ? ' · ' + r.refilled + ' alert(s) refilled' : '')); await loadAll(); } catch (x) { OWW.toast(x.message, 'red'); } }
    else if (el.dataset.m !== undefined) P.del[el.dataset.m].got = el.value;
    else if (el.id === id('add')) { const i = P.D.inv.find(x => x.id === el.value); if (i) { P.del[i.id] = { name: i.name, ordered: 0, got: 1, box: i.box, per: i.per, unit: ULAB(i.ct) }; drawMan(); } }
  });
  if (!V) $(id('conf')).onclick = async () => {
    const items = Object.keys(P.del).map(x => ({ rawId: x, name: P.del[x].name, boxesOrdered: P.del[x].ordered, boxesReceived: P.del[x].got })).filter(i => +i.boxesReceived > 0);
    if (!items.length) return OWW.toast('Enter received quantities first', 'amber');
    try { const r = await OWW.api('confirmDelivery', { items, orderDate: new Date().toISOString().slice(0, 10) }); OWW.toast('Stock updated' + (r.refilled ? ' · ' + r.refilled + ' alert(s) refilled' : '') + ' ✓'); await loadAll(); P.tab = 'list'; P.draw(); } catch (er) { OWW.toast(er.message, 'red'); }
  };
  // ── item limits ──
  function limitsForm(iid) {
    const i = P.D.inv.find(x => x.id === iid); if (!i) return;
    OWW.sheet(`<div><div class="nm" style="font-size:18px">${esc(i.name)}</div><div class="sub">${esc(i.storage)} · counted in ${ULAB(i.ct)}${i.per > 1 ? ' · 1 box = ' + i.per + ' ' + ULAB(i.ct) : ''}${both() ? ' · ' + AREAN[i.area] : ''}</div></div>
      <div class="two"><label class="fld"><small>Minimum in ${ULAB(i.ct)} (order below this)</small><input type="number" step="any" min="0" id="lm" value="${i.min}"></label><label class="fld"><small>Critical in ${ULAB(i.ct)} (very low)</small><input type="number" step="any" min="0" id="lc" value="${i.crit}"></label></div>
      <div class="err" id="ler"></div><button class="btn p w" id="lsave">Save</button><button class="btn w" onclick="OWW.close()">Cancel</button>`);
    $('lsave').onclick = async () => { try { await OWW.api('itemLimits', { rawId: iid, min: $('lm').value, crit: $('lc').value }); OWW.close(); OWW.toast('Saved ✓'); await loadAll(); } catch (er) { $('ler').textContent = er.message; } };
  }
  // ── Verdura: add / catalog ──
  function addForm() {
    const sc = SCOPE(OWW.user); let unit = '';
    OWW.sheet(`<div class="nm" style="font-size:18px">Add a Verdura item</div><input id="vn" placeholder="Name, e.g. Rucola" maxlength="80" autocomplete="off">
      <div><div class="sub" style="margin-bottom:6px">Counted in</div><div class="two"><button class="btn" id="vkg" type="button">KG</button><button class="btn" id="vpz" type="button">PZ (pieces)</button></div></div>
      ${sc.length > 1 ? `<select id="va"><option value="KITCHEN">Kitchen item</option><option value="SALA">Sala item</option></select>` : ''}
      <div class="two"><label class="fld"><small>Minimum (optional)</small><input type="number" step="any" min="0" id="vm"></label><label class="fld"><small>Critical (optional)</small><input type="number" step="any" min="0" id="vc"></label></div>
      <div class="err" id="ver"></div><button class="btn p w" id="vsave">Add to the list</button><button class="btn w" onclick="OWW.close()">Cancel</button>`);
    const pick = u => { unit = u; $('vkg').classList.toggle('p', u === 'KG'); $('vpz').classList.toggle('p', u === 'PZ'); };
    $('vkg').onclick = () => pick('KG'); $('vpz').onclick = () => pick('PZ');
    $('vsave').onclick = async () => {
      if (!$('vn').value.trim()) return $('ver').textContent = 'Give the item a name'; if (!unit) return $('ver').textContent = 'Choose KG or PZ';
      try { await OWW.api('itemAdd', { name: $('vn').value.trim(), unit, area: $('va') ? $('va').value : sc[0], min: $('vm').value, crit: $('vc').value }); OWW.close(); OWW.toast('Added ✓ Now type the quantity in the list'); await loadAll(); }
      catch (er) { $('ver').textContent = er.message; }
    };
  }
  async function catalog() {
    let l; try { l = await OWW.api('itemCatalog'); } catch (er) { return OWW.toast(er.message, 'red'); }
    OWW.sheet(`<div class="nm" style="font-size:18px">Add from catalog</div><div class="note" style="padding:0">Verdura items known to the system but switched off in this branch.</div>` + (l.length ? '<div class="card" style="margin:0">' + l.map(i => `<div class="row"><div class="grow"><div class="nm">${esc(i.name)}</div><div class="sub">${esc(i.unit)}${both() ? ' · ' + AREAN[i.area] : ''}</div></div><button class="sm g" data-ca="${esc(i.id)}">Add</button></div>`).join('') + '</div>' : '<div class="empty">Nothing to add: every known item is already in your list.</div>') + `<button class="btn w" onclick="OWW.close()">Close</button>`);
    document.querySelectorAll('[data-ca]').forEach(b => b.onclick = async () => { const i = l.find(x => x.id === b.dataset.ca); try { await OWW.api('itemAdd', { name: i.name, unit: String(i.unit).toLowerCase() === 'kg' ? 'KG' : 'PZ', area: i.area }); b.closest('.row').remove(); OWW.toast('Added ✓'); await loadAll(); } catch (er) { OWW.toast(er.message, 'red'); } });
  }
  return P;
}
