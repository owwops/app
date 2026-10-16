// Reads the weekly HAVI delivery note (DDT, PDF) in the Admin app and turns it into stock-in for BOTH areas.
// Each line goes to the Kitchen or the Sala stock according to the item it is linked to. A manager only sees the lines of their own area;
// Director and Owner see both. Nothing is saved until the review list has been checked and the green button is pressed.
// How the next Friday finds the items by itself:  1) same article code  2) a keyword you typed for a product  3) otherwise it is a new product: pick / create once.
const DDT = {
  PDFJS: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  PDFW: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  SECTION: { 'SURGELATO/CONGELATO': 'Cella Negativa', 'REFRIGERATO': 'Frigo +', 'SECCO GENERALE': 'Scaffale' }, // where the item lives, from the note's headings
  area: (group, over) => over || (String(group).toUpperCase() === 'FOOD' ? 'KITCHEN' : 'SALA'),
  num: s => { const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }, // 21,890 -> 21.89
  iso: d => d.slice(6, 10) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2),
  key: rimos => String(rimos).replace(/^0+/, ''), // 0000056096-500-000 -> 56096-500-000 (the supplier code we remember)
  clean: d => String(d).replace(/^O\./, '').replace(/\s+/g, ' ').trim()
};

// lines (text, top to bottom) -> { doc, lines[] }. Pure function: easy to test.
DDT.parse = function (rows) {
  const ITEM = /^(\d{10}-\d{3}-\d{3})\s+(\S+)\s+(.+?)\s+(\d+,\d{2})\s+(KG|PCE|L)\s+(\d+,\d{3})\s+_+\s*(KG|BOX|PCE|FUS)\s+(\d+)?\s*(FOOD|BEVE|PAPER|OPER|UNIF)\b/;
  const LOT = /^(\d{2}\/\d{2}\/\d{4})\s+(KG|PCE|L)\s+(\d+,\d{3})\s+(KG|BOX|PCE|FUS)(?:\s+(\d+))?\s*$/;
  const doc = { no: '', date: '', colli: 0, kg: 0 }, out = [], byCode = {};
  let cur = null, section = '';
  rows.map(r => String(r).replace(/\s+/g, ' ').trim()).filter(Boolean).forEach(t => {
    let m;
    if (!doc.no && (m = /Documento N\.\s*(\d+)/.exec(t))) doc.no = m[1];
    if (!doc.date && (m = /Data consegna\s*(\d{2}\/\d{2}\/\d{4})/.exec(t))) doc.date = DDT.iso(m[1]);
    if ((m = /Numero totale colli\s*(\d+)/.exec(t))) doc.colli = +m[1];
    if ((m = /Totale peso lordo\s*([\d.,]+)/.exec(t))) doc.kg = DDT.num(m[1]);
    if (DDT.SECTION[t]) { section = t; cur = null; return; }
    if ((m = ITEM.exec(t))) {
      cur = { rimos: m[1], code: DDT.key(m[1]), alias: m[2], desc: DDT.clean(m[3]), content: DDT.num(m[4]), uom: m[5], qty: DDT.num(m[6]), un: m[7],
        crtns: m[8] ? +m[8] : 0, group: m[9], section: section, storage: DDT.SECTION[section] || '', lots: [], ordered: null, runOut: false, subFor: '', subBy: '', note: '' };
      byCode[cur.code] = cur; out.push(cur); return;
    }
    if (!cur) return;
    if ((m = LOT.exec(t))) { cur.lots.push({ exp: DDT.iso(m[1]), qty: DDT.num(m[3]), un: m[4] }); return; }
    if ((m = /Ordinata\s*([\d.,]+)/.exec(t)) && /Attenzione/i.test(t)) { cur.ordered = DDT.num(m[1].replace(/[.,]$/, '')); cur.note = 'Delivered quantity differs from the order'; return; }
    if (/run-?out/i.test(t)) { cur.runOut = true; const o = /Ordinato\s*([\d.,]+)/.exec(t), s = /(\d{5}-\d{3}-\d{3})/.exec(t); cur.ordered = o ? DDT.num(o[1].replace(/[.,]$/, '')) : cur.ordered; cur.subBy = s ? s[1] : ''; cur.note = 'Discontinued item: replaced by ' + (s ? s[1] : 'another article'); return; }
    if ((m = /sostitutivo per\s*(\d{5}-\d{3}-\d{3})/i.exec(t))) { cur.subFor = m[1]; cur.note = 'Replaces ' + m[1]; }
  });
  return { doc: doc, lines: out };
};

// default conversion: how many STOCK units one delivered unit is worth (editable on the review screen, then remembered)
DDT.factor = l => l.content || 1; // the note says how much of the unit (kg, pieces, litres) is inside ONE delivered box / piece / keg

// ---- PDF -> text lines (same technique as the stock-count import) ----
DDT.lib = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load the PDF reader. Check your internet connection.')); document.head.appendChild(s); });
DDT.pdfRows = async function (file) {
  await DDT.lib(DDT.PDFJS); pdfjsLib.GlobalWorkerOptions.workerSrc = DDT.PDFW;
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent(), rows = {};
    tc.items.forEach(i => { if (!i.str.trim()) return; const y = Math.round(i.transform[5] / 5); (rows[y] = rows[y] || []).push(i); });
    Object.keys(rows).map(Number).sort((a, b) => b - a).forEach(y => lines.push(rows[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ')));
  }
  return lines;
};

// ---- review + apply screen ----
// DDT.mount('elementId', { after: () => reload })
DDT.mount = function (id, cfg) {
  const $ = document.getElementById.bind(document), esc = OWW.esc, S = { M: null, P: null, L: [], busy: false, other: 0 };
  const el = $(id), say = t => $(id + '-s').textContent = t, both = () => S.M && S.M.scope.length > 1, AREA = { KITCHEN: 'Kitchen', SALA: 'Sala' };
  el.innerHTML = `<div class="card"><div class="row" style="display:grid;gap:10px">
      <div class="nm">Friday delivery note (PDF)</div>
      <div class="sub">One note feeds both the Kitchen and the Sala stock. You only see the lines of your own area. Nothing changes until you press the green button.</div>
      <input type="file" id="${id}-f" accept="application/pdf">
      <button class="btn p w" id="${id}-b">Read delivery note</button><div class="sub" id="${id}-s"></div></div></div><div id="${id}-r"></div>`;
  $(id + '-b').onclick = async () => {
    const f = $(id + '-f').files[0]; if (!f) return OWW.toast('Choose the PDF first', 'amber');
    const b = $(id + '-b'); b.disabled = true; say('Reading…');
    try {
      const p = DDT.parse(await DDT.pdfRows(f)); if (!p.lines.length || !p.doc.no) throw new Error('This does not look like a HAVI delivery note.');
      S.M = await OWW.api('ddtMatch', { no: p.doc.no }); S.P = p;
      const all = p.lines.map(l => DDT.prep(l, S.M)); S.L = all.filter(l => S.M.scope.includes(l.area)); S.other = all.length - S.L.length; say('');
    } catch (e) { OWW.toast(e.message, 'red'); say(''); S.P = null; }
    b.disabled = false; draw();
  };
  const itemsOf = a => S.M.items.filter(i => i.area === a), nameOf = i => (S.M.items.find(x => x.id === i) || {}).name || '';
  function draw() {
    const r = $(id + '-r'); if (!S.P) { r.innerHTML = ''; return; }
    const pend = S.L.filter(l => !l.skip), nw = pend.filter(l => l.itemId === '+').length, un = pend.filter(l => !l.itemId).length, kwn = pend.filter(l => l.via === 'keyword').length;
    const done = S.M.scope.filter(a => S.M.done[a]), ready = pend.filter(l => l.itemId).length;
    r.innerHTML = `<div class="sec">Delivery note ${esc(S.P.doc.no)} · ${esc(S.P.doc.date)}</div>
      <div class="note">${S.L.length} lines for you${S.other ? ' · ' + S.other + ' line(s) belong to the other area' : ''}. ${done.length ? '<b style="color:var(--amber)">Already applied for: ' + done.map(a => AREA[a]).join(', ') + '.</b> ' : ''}${un ? '<b style="color:var(--amber)">' + un + ' line(s) still need an item.</b> ' : ''}${kwn ? kwn + ' matched by keyword: please check. ' : ''}${nw ? nw + ' new item(s) will be created.' : ''}</div>
      ${un ? `<div class="bar"><button class="btn" id="${id}-new">Create the ${un} unmatched lines as new items</button></div>` : ''}
      <div class="card">${S.L.map((l, i) => row(l, i)).join('') || '<div class="empty">No lines for your area</div>'}</div>
      <div class="bar"><button class="btn g" id="${id}-go" ${S.busy ? 'disabled' : ''}>Add to stock (${ready} items)</button></div>`;
  }
  function row(l, i) {
    const opts = '<option value="">— choose item —</option><option value="+">+ Create as new item</option>' + itemsOf(l.area).map(x => `<option value="${esc(x.id)}" ${x.id === l.itemId ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    const tag = l.qty === 0 ? '<span class="tag r">Not delivered</span>' : l.ordered !== null && l.ordered !== l.qty ? `<span class="tag a">Short: ordered ${esc(String(l.ordered).replace('.', ','))}</span>` : '';
    const lots = l.lots.length ? l.lots.map(x => x.exp.split('-').reverse().join('/')).filter((v, k, a) => a.indexOf(v) === k).join(', ') : '';
    const nw = l.itemId === '+' ? `<div class="two" style="margin-top:6px"><input data-n="${i}" value="${esc(l.newName)}" placeholder="Item name" aria-label="New item name"><input data-u="${i}" value="${esc(l.newUnit)}" placeholder="Stock unit" aria-label="Stock unit"></div>` : '';
    const ar = both() && !l.itemId || l.itemId === '+' && both() ? `<select data-a="${i}" aria-label="Area" style="margin-top:6px"><option value="KITCHEN" ${l.area === 'KITCHEN' ? 'selected' : ''}>Kitchen item</option><option value="SALA" ${l.area === 'SALA' ? 'selected' : ''}>Sala item</option></select>` : '';
    const kw = l.itemId && l.via !== 'code' ? `<div style="display:flex;gap:6px;margin-top:6px"><input data-w="${i}" value="${esc(l.kw)}" placeholder="Keyword for next time (optional)" aria-label="Keyword" maxlength="80"><button class="sm" data-ks="${i}">Suggest</button></div>` : '';
    return `<div class="row" style="flex-wrap:wrap;${l.skip ? 'opacity:.45' : ''}"><div class="grow" style="min-width:180px"><div class="nm">${esc(l.desc)}</div>
      <div class="sub">${esc(String(l.qty).replace('.', ','))} ${esc(l.un)}${l.content && l.un !== l.uom ? ' × ' + esc(String(l.content).replace('.', ',')) + ' ' + esc(l.uom) : ''}${lots ? ' · expires ' + esc(lots) : ''} ${both() ? `<span class="tag ${l.area === 'SALA' ? 'b' : 'a'}">${AREA[l.area]}</span>` : ''} ${l.via === 'keyword' ? '<span class="tag a">by keyword · check</span>' : ''} ${tag}</div>${l.note ? `<div class="sub" style="color:var(--amber)">${esc(l.note)}</div>` : ''}
      ${!l.itemId && l.sugg ? `<button class="sm a" data-g="${i}" style="margin:6px 0 2px">Use “${esc(nameOf(l.sugg))}”</button>` : ''}
      <select data-i="${i}" aria-label="Item" style="margin-top:6px">${opts}</select>${ar}${nw}${kw}</div>
      <div style="display:grid;gap:3px;justify-items:end"><input class="qty" type="number" step="any" min="0" inputmode="decimal" data-q="${i}" value="${l.stock}" aria-label="Quantity to add to stock"><div class="sub">to stock · ×${esc(String(l.factor).replace('.', ','))}</div>
      <button class="sm" data-k="${i}">${l.skip ? 'Include' : 'Skip'}</button></div></div>`;
  }
  const choose = (l, v) => { l.itemId = v; l.via = v && v !== '+' ? 'pick' : ''; l.factor = DDT.factor(l); const m = S.M.map[l.code]; if (v && v !== '+' && m && m.itemId === v) l.factor = m.factor; l.stock = DDT.round(l.qty * l.factor); };
  el.addEventListener('change', e => {
    const t = e.target, L = S.L; let i;
    if ((i = t.dataset.i) !== undefined) { choose(L[i], t.value); draw(); }
    else if ((i = t.dataset.a) !== undefined) { L[i].area = t.value; if (L[i].itemId && L[i].itemId !== '+') L[i].itemId = ''; L[i].sugg = DDT.guess(L[i].desc, itemsOf(t.value)); draw(); }
    else if ((i = t.dataset.q) !== undefined) { L[i].stock = parseFloat(t.value) || 0; L[i].factor = L[i].qty ? DDT.round(L[i].stock / L[i].qty) : L[i].factor; draw(); }
    else if ((i = t.dataset.n) !== undefined) L[i].newName = t.value; else if ((i = t.dataset.u) !== undefined) L[i].newUnit = t.value; else if ((i = t.dataset.w) !== undefined) L[i].kw = t.value.trim();
  });
  el.addEventListener('click', async e => {
    const k = e.target.closest('[data-k]'); if (k) { S.L[k.dataset.k].skip = !S.L[k.dataset.k].skip; draw(); return; }
    const g = e.target.closest('[data-g]'); if (g) { const l = S.L[g.dataset.g]; choose(l, l.sugg); draw(); return; }
    const ks = e.target.closest('[data-ks]'); if (ks) { const l = S.L[ks.dataset.ks]; l.kw = DDT.kwSuggest(l.desc); draw(); return; }
    if (e.target.closest('#' + id + '-new')) { S.L.forEach(l => { if (!l.skip && !l.itemId) choose(l, '+'); }); draw(); return; }
    if (!e.target.closest('#' + id + '-go') || S.busy) return;
    const go = S.L.filter(l => !l.skip && l.itemId && l.qty > 0), bad = go.filter(l => l.itemId === '+' && !l.newName.trim());
    if (bad.length) return OWW.toast('Give each new item a name', 'amber');
    if (!go.length) return OWW.toast('Nothing to add yet', 'amber');
    const again = S.M.scope.some(a => S.M.done[a] && go.some(l => l.area === a));
    if (again && !confirm('This delivery note was already applied for your area. Add it to stock AGAIN?')) return;
    if (!confirm('Add ' + go.length + ' items from delivery note ' + S.P.doc.no + ' to your stock?')) return;
    S.busy = true; draw();
    try {
      const res = await OWW.api('ddtApply', { doc: S.P.doc, again, lines: go.map(l => ({ code: l.code, desc: l.desc, group: l.group, uom: l.uom, un: l.un, content: l.content, qty: l.qty, ordered: l.ordered, lots: l.lots, note: l.note,
        itemId: l.itemId, factor: l.factor, stock: l.stock, kw: l.kw || '', area: l.area, newName: l.newName.trim(), newUnit: l.newUnit.trim(), storage: l.area === 'SALA' ? (l.group === 'BEVE' ? 'Bevande' : 'Magazzino') : l.storage })) });
      OWW.toast(res.items + ' items added to stock' + (res.created ? ' · ' + res.created + ' new' : '') + (res.refilled ? ' · ' + res.refilled + ' alert(s) closed' : '') + ' ✓'); S.P = null; $(id + '-f').value = ''; if (cfg.after) await cfg.after();
    } catch (x) { OWW.toast(x.message, 'red'); }
    S.busy = false; draw();
  });
};
DDT.round = x => Math.round(x * 1000) / 1000;
// A line is pre-selected ONLY when its code was confirmed before, or a keyword you typed matches (then it is marked "check"). Name similarity is only a one-tap SUGGESTION.
DDT.prep = function (l, M) {
  const m = M.map[l.code], area = (m && m.area) || (String(l.group).toUpperCase() === 'FOOD' ? 'KITCHEN' : 'SALA');
  const o = { ...l, skip: l.qty === 0, itemId: '', factor: DDT.factor(l), stock: 0, kw: '', via: '', area: area, sugg: '', newName: DDT.title(l.desc), newUnit: DDT.unitName(l) };
  const ok = id => M.items.some(i => i.id === id && i.area === area);
  if (m && ok(m.itemId)) { o.itemId = m.itemId; o.factor = m.factor; o.via = 'code'; }
  else { const r = DDT.byKeyword(l.desc, M, area); if (r) { o.itemId = r.itemId; o.factor = r.factor; o.via = 'keyword'; } else { const g = DDT.guess(l.desc, M.items.filter(i => i.area === area)); if (g) o.sugg = g; } }
  o.stock = DDT.round(o.qty * o.factor); return o;
};
// keyword rules saved in SUPPLIER_MAP: ALL the words of a keyword must appear in the description; the rule with the most words wins
DDT.byKeyword = function (desc, M, area) {
  const t = ' ' + DDT.norm(desc).replace(/\s+/g, ' ') + ' '; let best = null, n = 0;
  (M.rules || []).forEach(r => { const w = DDT.norm(r.kw).split(/\s+/).filter(Boolean); if (w.length && w.length >= n && w.every(x => t.includes(x)) && M.items.some(i => i.id === r.itemId && (!area || i.area === area))) { best = r; n = w.length; } });
  return best;
};
DDT.kwSuggest = d => DDT.norm(d).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => /^[a-z]{3,}$/.test(w)).slice(0, 2).join(' ');
DDT.title = d => d.toLowerCase().replace(/\b([a-zà-ú])/g, c => c.toUpperCase());
DDT.unitName = l => l.uom === 'KG' ? 'kg' : l.uom === 'L' ? 'litri' : 'pz';
DDT.norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/(\d),(\d)/g, '$1.$2').replace(/[^a-z0-9.\s]/g, ' ');
DDT.guess = function (desc, items) { // simple word overlap; only a suggestion, the manager confirms
  const w = s => DDT.norm(s).split(/\s+/).filter(t => t.length > 2 && !/^\d/.test(t)), a = w(desc); if (!a.length) return '';
  let best = '', bs = 0; items.forEach(it => { const b = w(it.name), c = a.filter(t => b.some(u => u === t || (t.length > 4 && u.length > 4 && (u.startsWith(t.slice(0, 5)) || t.startsWith(u.slice(0, 5)))))).length, sc = 2 * c / (a.length + b.length); if (sc > bs) { bs = sc; best = it.id; } });
  return bs >= .4 ? best : '';
};
if (typeof module !== 'undefined') module.exports = DDT;
