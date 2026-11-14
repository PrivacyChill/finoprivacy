/* Fino: the search behind the lens (also Ctrl+K or "/"), the box on the home page, and click-to-define on decision, explainer and law pages.
   ONE engine serves both boxes: search() below ranks everything the same way, and the lens and the home box only draw its answer.
   Data: /data/find.json (glossary, key cases, law articles, explainers, tools, documents, countries, regulators and the pages of the menu; built by
   pipeline/build_seo.mjs) and /data/home.json (the fines, shared with the homepage). Both load only when first needed. Hand-written, not built.
   The engine is plain functions with no page in them: pipeline/find_search_test.py runs them under Node. */
(() => {
  const LENS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6"/></svg>';
  const HMM = '<svg class="mini hmm" viewBox="0 0 200 180" role="img" aria-label="Fino, the site\'s mascot, tilting its head, puzzled"><ellipse cx="100" cy="172" rx="62" ry="6" fill="var(--ink)" opacity=".12"/><g class="m-body"><path d="M100 24 C152 24 184 60 186 106 C188 148 152 166 100 166 C48 166 12 148 14 106 C16 60 48 24 100 24 Z" fill="var(--puff)" stroke="var(--ink)" stroke-width="4"/><g class="m-ant"><path d="M98 24 C96 14 102 8 110 9" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/><circle cx="111" cy="9" r="5" fill="var(--accent)" stroke="var(--ink)" stroke-width="2.5"/></g><ellipse cx="54" cy="120" rx="14" ry="8" fill="var(--blush)" opacity=".55"/><ellipse cx="146" cy="120" rx="14" ry="8" fill="var(--blush)" opacity=".55"/><path d="M62 82 Q75 70 89 78 M112 84 H136" fill="none" stroke="var(--eye)" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="78" cy="104" rx="8" ry="11" fill="var(--eye)"/><circle cx="81" cy="99" r="3" fill="#FFFFFF"/><ellipse cx="122" cy="104" rx="8" ry="11" fill="var(--eye)"/><circle cx="125" cy="99" r="3" fill="#FFFFFF"/><path d="M93 129 Q101 125 108 130" fill="none" stroke="var(--eye)" stroke-width="3" stroke-linecap="round"/></g><text class="m-q" x="156" y="48">?</text></svg>';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'");   // for the highlight only

  /* ================= the engine: no page in it ================= */
  /* key(): what is compared. Lower case, no accents, no punctuation, one space between words; "II", "III" and "IV" on their own are 2, 3 and 4 (so "Schrems 2" finds Schrems II). */
  const SUB = { 'ø': 'o', 'ð': 'd', 'đ': 'd', 'ł': 'l', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th' }, ROMAN = { ii: '2', iii: '3', iv: '4' };
  const key = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[øðđłßæœþ]/g, c => SUB[c]).replace(/\b(?:[a-z]\.){2,}/g, m => m.replace(/\./g, '')).replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map(w => ROMAN[w] || w).join(' ');
  /* prep(): one searchable thing: its name, the words searched with it, and other names it goes by (aliases) */
  const prep = (name, words, aliases) => {
    const n = key(name), w = key(words), al = (aliases || []).map(key).filter(Boolean);
    return { n, nn: n.replace(/ /g, ''), nt: n.split(' '), w, wt: [...(w ? w.split(' ') : []), ...al.flatMap(a => a.split(' '))], al };
  };
  /* a number at the end of what was typed is a whole number: "art 6" is not "art 65" */
  const endsNum = q => /\d$/.test(q);
  const inPhrase = (h, q) => endsNum(q) ? (' ' + h + ' ').includes(' ' + q + ' ') : (' ' + h).includes(' ' + q);
  const starts = (h, q) => h.startsWith(q) && (!endsNum(q) || h.length === q.length || h[q.length] === ' ');
  const hasTok = (list, t) => /^\d+$/.test(t) ? list.includes(t) : list.some(x => x.startsWith(t));   // a word made of digits must be a whole word
  /* the strict match, best first: the name is the words typed > starts with them > a word of the name starts with them > every word starts a word of the name > they sit inside a word of the name;
     then the words searched with it (250 to 150); an alias counts a little less than a name. Nothing strict scores under 150. */
  function strict(e, q, qt, inner = 3) {
    const n = e.n;
    let s = 0;
    if (n === q) s = 1000;
    else if (starts(n, q)) s = 800;
    else if (inPhrase(n, q)) s = 600;
    else if (qt.length > 1 && qt.every(t => hasTok(e.nt, t))) s = 500;
    else if (q.length >= inner && !endsNum(q) && n.includes(q)) s = 300;
    if (s < 900) for (const a of e.al) { const t = a === q ? 900 : starts(a, q) ? 700 : inPhrase(a, q) ? 550 : 0; if (t > s) s = t; }
    if (s < 600) {   // "tik tok" is TikTok: the words typed run together are the name, or start it
      const z = q.replace(/ /g, '');
      if (z.length >= 4 && !endsNum(q) && (qt.length > 1 || z.length >= 5) && e.nn.startsWith(z)) s = e.nn === z ? 700 : 550;
    }
    if (s < 250 && e.w) {
      if (inPhrase(e.w, q)) s = 250;
      else if (qt.every(t => hasTok(e.nt, t) || hasTok(e.wt, t))) s = 200;
      else if (s < 150 && q.length >= inner && !endsNum(q) && e.w.includes(q)) s = 150;
    }
    return s ? s - Math.min(n.length, 99) / 100 : 0;   // a shorter name first among equals
  }
  /* typos: the letters a word may be wrong by (none under 5 letters, one up to 8, two from 9); a swap of two letters counts as one */
  const lim = l => l >= 9 ? 2 : l >= 5 ? 1 : 0;
  function dist(a, b, max) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let p2 = null, p1 = Array.from({ length: lb + 1 }, (_, j) => j);
    for (let i = 1; i <= la; i++) {
      const cur = [i]; let low = i;
      for (let j = 1; j <= lb; j++) {
        let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        cur[j] = v; if (v < low) low = v;
      }
      if (low > max) return max + 1;
      p2 = p1; p1 = cur;
    }
    return p1[lb];
  }
  /* how far a typed word is from the nearest word in a list: 0 when a word starts with it; Infinity when none is near enough */
  function near(t, list, max) {
    let best = Infinity;
    for (const x of list) {
      if (x.startsWith(t)) return 0;
      if (!max) continue;
      let d = dist(t, x, max);
      if (x.length > t.length) d = Math.min(d, dist(t, x.slice(0, t.length), max));   // a typo in a word that is still being typed
      if (d < best) best = d;
    }
    return best <= max ? best : Infinity;
  }
  /* the fuzzy match: every typed word is a word of the name or of the words searched, give or take a typo, and at least one is off. Never above 100: under every strict match. */
  function fuzzy(e, qt) {
    let sum = 0, inName = true;
    for (const t of qt) {
      const L = lim(t.length);
      if (/\d/.test(t)) { if (!e.nt.includes(t) && !e.wt.includes(t)) return 0; continue; }
      let d = near(t, e.nt, L);
      if (d === Infinity) { d = near(t, e.wt, L); inName = false; }
      if (d === Infinity) return 0;
      sum += d;
    }
    return sum ? (inName ? 100 : 60) - 15 * sum : 0;
  }

  /* what is searched, made once from the two data files */
  const KINDS = { t: 'tool', d: 'doc', c: 'ctry', g: 'reg', p: 'pg' };
  function indexFind(D) {
    if (D._ix) return D._ix;
    const ix = { gl: [], kc: [], art: [], ex: [], rul: [], tool: [], doc: [], ctry: [], reg: [], pg: [] };
    for (const t of D.terms) {
      const e = prep(t[1], '', t[2].split('|').filter(Boolean));
      e.name = t[1]; e.line = t[5].length > 110 ? t[5].slice(0, 108).replace(/\s+\S*$/, '') + '…' : t[5]; e.right = t[3];
      e.href = t[6] ? `/${t[4] === 'k' ? 'key-cases' : 'glossary'}/${t[0]}.html` : `/glossary/#${t[0]}`;
      (t[4] === 'k' ? ix.kc : ix.gl).push(e);
    }
    for (const a of D.articles) { const e = prep(a[4], a[2]); e.name = a[4]; e.line = a[2]; e.href = a[3]; e.law = a[0]; e.num = a[1]; ix.art.push(e); }
    for (const x of D.explainers) { const e = prep(x[0], x[2]); e.name = x[0]; e.line = 'Explainer'; e.href = x[1]; ix.ex.push(e); }
    /*rulings:start*/
    /* Court of Justice rulings and EDPB guidance: D.rulings = [address, name, small line, words searched, kind]; find.json has the list only while the rulings pages are on */
    ix.rul = (D.rulings || []).map(r => { const e = prep(r[1], r[3] + ' ' + r[2]); e.name = r[1]; e.line = r[2]; e.href = r[0]; return e; });
    /*rulings:end*/
    /* D.pages = [address, name, small line, "words searched|other name|other name", kind]: tools, documents and checklists, countries, regulators, and the pages of the menu */
    for (const p of D.pages || []) { const [w, ...al] = p[3].split('|'), e = prep(p[1], w, al); e.name = p[1]; e.line = p[2]; e.href = p[0]; if (p[5]) e.cname = p[5]; ix[KINDS[p[4]] || 'pg'].push(e); }
    return (D._ix = ix);
  }
  function indexFines(F) {
    if (F._ix) return F._ix;
    const f = Object.fromEntries(F.fields.map((x, i) => [x, i])), byId = new Map(), rows = [];
    for (const r of F.rows) {
      const e = prep(r[f.name], F.countries[r[f.cc]] || ''); e.r = r; e.eur = r[f.eur] || 0; rows.push(e);
      byId.set(r[f.slug].toLowerCase(), e);
    }
    return (F._ix = { f, rows, byId });
  }

  /* the groups: their name, how many show, and which goes first when two have an equal best hit */
  const GROUPS = { dec: ['Decision', 1], pg: ['Pages', 4], tool: ['Tools', 5], doc: ['Documents and checklists', 4], ctry: ['Countries', 3], reg: ['Regulators', 4], gl: ['Glossary', 5], kc: ['Key cases', 4],
    art: ['Law articles', 5], ex: ['Explainers', 3], rul: ['Rulings and guidance', 5], fin: ['Fines and decisions', 6] };
  const ORDER = Object.keys(GROUPS);
  /* "art 83", "article 5", "Artikel 6", "articolo 6", "gdpr 6", "6 gdpr", "art. 6 DSGVO", "ai act 50", "83", "83(5)", "6(1)(a)": the number is the article; the law may come before or after */
  const ARTW = 'art|article|artikel|articolo|artigo|articulo|artykul', LAWW = 'gdpr|dsgvo|rgpd|ai act|aia', PARW = 'abs|absatz|para|paragraph|paragrafo|comma|par';
  const ART = new RegExp(`^(?:(${LAWW})\\s*)?(?:(?:${ARTW})\\s*)?(\\d{1,3}[a-z]?)(?:\\s+(?:(?:${PARW})\\s*)?\\d{1,2}(?:\\s+[a-z])?)?(?:\\s+(${LAWW}))?$`);
  const lawOf = x => !x ? '' : /^(gdpr|dsgvo|rgpd)$/.test(x) ? 'gdpr' : 'ai';
  const DECISION_ID = /^(?:decision\s+)?(\d{4})[\s\/\-]+([a-z]{2})[\s\/\-]+(\d{1,3})$/i;   // 2023-IE-003, 2023/IE/003 or 2023 IE 003
  /* a fine as a result: the amount struck through when a court annulled it or the regulator withdrew it, and the status on the small line (the fines page's own wording) */
  const fineHit = (F, f, r, extra) => ({ name: r[f.name], line: [`${F.countries[r[f.cc]] || ''}${r[f.date] ? ', ' + r[f.date].slice(0, 4) : ''}`, r[f.note], r[f.status]].filter(Boolean).join(' · '),
    right: r[f.amount] || '', amt: 1, struck: r[f.struck] ? 1 : 0, href: `/decisions/${r[f.slug]}.html`, ...extra });
  /* search(raw, find.json, home.json): { groups: [{ k, label, total, hits: [{ s, name, line, right, href }] }], fuzzy }; the groups come best first, so the first hit is the best match overall.
     Either file may be missing (not loaded yet); the groups that need it are then simply not there. */
  function search(raw, D, F) {
    const q = key(raw), qt = q ? q.split(' ') : [], res = { q, groups: [], fuzzy: false };
    if (!q) return res;
    const got = {}, add = (k, s, e, extra) => { if (s > 0) (got[k] ||= []).push({ s, name: e.name, line: e.line, right: e.right || '', amt: e.amt, struck: e.struck, cname: e.cname, law: e.law, num: e.num, href: e.href, ...extra }); };
    let strictN = 0, best = 0;
    /* an exact decision number goes straight to that decision */
    const id = String(raw).trim().match(DECISION_ID);
    if (id && F) {
      const fx = indexFines(F), e = fx.byId.get(`${id[1]}-${id[2]}-${id[3].padStart(3, '0')}`.toLowerCase());
      if (e) { best = 2000; const f = fx.f, r = e.r; add('dec', 2000, fineHit(F, f, r, { name: `Decision ${id[1]}/${id[2].toUpperCase()}/${id[3].padStart(3, '0')}`, line: [`${r[f.name]}, ${F.countries[r[f.cc]] || ''}${r[f.date] ? ', ' + r[f.date].slice(0, 4) : ''}`, r[f.note], r[f.status]].filter(Boolean).join(' · ') })); strictN++; }
    }
    const pool = [];   // the things not strict-matched, for the typo pass
    if (D) {
      const ix = indexFind(D), m = q.match(ART);
      for (const k of Object.keys(ix)) for (const e of ix[k]) {
        let s;
        if (k === 'art' && m) { const law = lawOf(m[1] || m[3]); s = e.num.toLowerCase() === m[2] ? (law ? ((law === 'gdpr') === (e.law === 'GDPR') ? 1000 : 0) : (e.law === 'GDPR' ? 1000 : 900)) : 0; }   // the exact number only: Article 6, never Article 60
        else s = strict(e, q, qt);
        if (s) { add(k, s, e); strictN++; if (s > best) best = s; } else if (!(k === 'art' && m)) pool.push([k, e]);
      }
    }
    let fines = null, fx = null, shown = [];
    if (F && q.length > 1) {
      fx = indexFines(F); fines = [];
      for (const e of fx.rows) { const s = strict(e, q, qt, 4); if (s) { fines.push([(s >= 800 ? 800 : Math.round(s)) + Math.log10(e.eur + 1), e]); if (s > best) best = s; } else pool.push(['fin', e]); }   // a name that is, or starts with, the words counts the same: the larger fine first (an annulled fine has no amount in the data: it does not win on size)
      strictN += fines.length;
    }
    /* typos, only when there is no strict hit at all: a guess never sits beside a real match */
    if (strictN === 0) {
      for (const [k, e] of pool) {
        const s = fuzzy(e, qt); if (!s) continue;
        if (k === 'fin') { (fines ||= []).push([s + Math.log10(e.eur + 1) / 100, e]); } else add(k, s, e);
        res.fuzzy = true;
      }
    }
    if (fines && fines.length) {
      fines.sort((a, b) => b[0] - a[0]);
      const f = fx.f; shown = fines.slice(0, GROUPS.fin[1]).map(([s, e]) => fineHit(F, f, e.r, { s }));
      got.fin = shown; got.fin.total = fines.length;
    }
    for (const k of ORDER) {
      const list = got[k]; if (!list) continue;
      if (k !== 'fin') list.sort((a, b) => b.s - a.s);
      res.groups.push({ k, label: GROUPS[k][0], total: list.total || list.length, hits: list.slice(0, GROUPS[k][1]) });
    }
    res.groups.sort((a, b) => b.hits[0].s - a.hits[0].s || ORDER.indexOf(a.k) - ORDER.indexOf(b.k));
    const ag = ART.test(q) && (got.art || []).find(h => h.s >= 1000 && h.law === 'GDPR');   // a GDPR article was meant: its own filter on the fines page
    if (ag) res.article = ag.num; else if (ART.test(q) && got.art) res.noMore = true;       // an AI Act article alone: the fines page has no filter for it
    const c = (got.ctry || []).find(h => h.s >= 800);   // a country was meant: the last row goes to that country's decisions
    if (c) res.country = { name: c.cname, label: c.name };
    res.fuzzy = res.fuzzy && res.groups.length > 0 && res.groups.every(g => g.hits.every(h => h.s < 150));
    return res;
  }
  const Engine = { key, search, dist, fuzzy, prep, strict, GROUPS };
  if (typeof document === 'undefined') { if (typeof module !== 'undefined') module.exports = Engine; return; }

  /* ================= the page: loading, drawing, keys ================= */
  let data = null, fines = null, findP = null, finesP = null, finesFailed = false;   // the loaded data, and the requests that fetch it once
  const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
  const loadFind = () => findP ||= getJSON('/data/find.json').then(d => (data = d));
  const loadFines = () => finesP ||= getJSON('/data/home.json').then(d => (fines = d), e => { finesFailed = true; });
  const ready = () => Promise.all([loadFind(), loadFines()]);

  const hi = (s, q) => { s = String(s ?? ''); const f = fold(s), i = q ? f.indexOf(q) : -1; return i < 0 || f.length !== s.length ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
  const TIPS = `Find any official term, court ruling, article of the GDPR or AI Act, tool, document, country, regulator or fine. Try:<br>`
    + ['consent', 'Article 83', 'Planet49', 'cookie banner', 'TikTok', 'deployer'].map(t => `<button type="button" data-q="${esc(t)}">${esc(t)}</button>`).join('');

  /* One result list for a box: the lens and the home box both make one of these, so they draw the same list for the same words.
     o: { input, out, count, empty (what to show for no words), onShow(open) } */
  function makeView(o) {
    const { input, out } = o;
    let items = [], sel = -1, shown = true;
    const id = i => `${out.id}-o${i}`;
    const show = open => { shown = open; input.setAttribute('aria-expanded', String(open)); if (!open) select(-1); if (o.onShow) o.onShow(open); };
    function select(n, scroll = true) {
      if (items[sel]) items[sel].setAttribute('aria-selected', 'false');
      if (n < 0) { sel = -1; input.removeAttribute('aria-activedescendant'); return; }
      sel = n;
      if (items[sel]) { items[sel].setAttribute('aria-selected', 'true'); input.setAttribute('aria-activedescendant', items[sel].id); if (scroll) items[sel].scrollIntoView({ block: 'nearest' }); }
      else input.removeAttribute('aria-activedescendant');
    }
    function move(d) { if (items.length) select((sel + d + items.length) % items.length); }
    const money = h => h.right ? `<i${h.amt ? ' class="amt"' : ''}>${h.struck ? `<s>${esc(h.right)}</s>` : esc(h.right)}</i>` : '';
    const link = h => `<li role="presentation"><a href="${esc(h.href)}" role="option" aria-selected="false"${h.more ? ' data-more="1"' : ''}>${h.html}${money(h)}</a></li>`;
    const list = (label, rows) => `<div role="listbox" aria-label="${esc(label)}"><ul role="presentation">${rows.map(link).join('')}</ul></div>`;
    function paint() {
      const raw = input.value.trim(), q = fold(raw).replace(/\s+/g, ' '), cnt = o.count, enc = encodeURIComponent(raw);
      let html, picked = true;
      if (!raw) { html = o.empty || ''; picked = false; show(!!o.empty); }
      else {
        const res = search(raw, data, fines);
        const busy = !data || (!fines && !finesFailed);
        if (res.groups.length) {
          /* every list ends with the way to the decisions: the country's own filter when a country was meant, else the fines page's word search (not for a decision number) */
          const more = res.groups[0].k === 'dec' || res.fuzzy || res.noMore ? null : res.article
            ? { href: `/fines.html#fines-art-${res.article}`, html: `<b>See all decisions under GDPR Article ${esc(res.article)}</b><span>On the fines page</span>`, more: 1 } : res.country
            ? { href: `/fines.html#fines-country-${encodeURIComponent(res.country.name)}`, html: `<b>See all decisions from ${esc(res.country.label)}</b><span>On the fines page</span>`, more: 1 }
            : { href: `/fines.html#fines-q-${enc}`, html: `<b>Search all decisions for &ldquo;${esc(raw)}&rdquo;</b><span>On the fines page</span>`, more: 1 };
          html = (res.fuzzy ? '<p class="find-tip find-near">No exact match. These are the closest.</p>' : '') + '<div role="listbox" aria-label="Results">' + res.groups.map(g => {
            const rows = g.hits.map(h => ({ ...h, html: `<b>${hi(h.name, q)}</b><span>${hi(h.line, q)}</span>` }));
            return `<div role="group" aria-label="${esc(g.label)}"><p class="find-g" aria-hidden="true">${esc(g.label)}</p><ul role="presentation">${rows.map(link).join('')}</ul></div>`;
          }).join('') + (more ? `<div role="group" aria-label="More"><ul role="presentation">${link(more)}</ul></div>` : '') + '</div>';
          show(true);
        } else if (busy) { html = '<p class="find-tip">Loading&hellip;</p>'; picked = false; show(true); }
        else {
          picked = false;
          html = `<div class="find-none">${HMM}<p class="find-tip">Nothing found for &ldquo;${esc(raw)}&rdquo;. Try a shorter word, an article number or a company name, or go to:</p></div>`
            + list('Other places to look', [{ href: `/fines.html#fines-q-${enc}`, html: `<b>Search all decisions for &ldquo;${esc(raw)}&rdquo;</b>` }, { href: '/glossary/', html: '<b>Glossary</b>' }, { href: '/Tool.html', html: '<b>All tools</b>' }]);
          show(true);
        }
      }
      out.innerHTML = html;
      /* the options are numbered in one run across the groups */
      items = [...out.querySelectorAll('a[role="option"]')]; items.forEach((a, i) => { a.id = id(i); });
      sel = -1; input.removeAttribute('aria-activedescendant');
      if (picked && items.length) select(0, false);
      const real = items.filter(a => !a.dataset.more).length;   // the rows that lead on to the fines page are not results
      if (cnt) cnt.textContent = !raw ? '' : picked ? `${real} shown` : (data ? 'No results' : 'Loading');
    }
    /* Enter: the chosen result (the first is chosen for you: the best match overall); with no result, the fines page's word search.
       With the panel closed (after Esc or a click away) a key press opens it again and does nothing else; the Search button always goes. */
    async function enter(force) {
      const raw = input.value.trim(); if (!raw) return;
      if (!shown && !force) { paint(); return; }
      if (!data || (!fines && !finesFailed)) { try { await ready(); } catch (e) {} paint(); }
      const a = items[sel];
      location.href = a ? a.href : `/fines.html#fines-q-${encodeURIComponent(raw)}`;
    }
    input.addEventListener('input', paint);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length || !shown) paint(); else move(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter') { e.preventDefault(); enter(); }
    });
    out.addEventListener('click', e => { const b = e.target.closest('button[data-q]'); if (b) { input.value = b.dataset.q; paint(); input.focus(); } });
    return { paint, enter, show, close: () => show(false), items: () => items };
  }

  /* ---------- the search dialog ---------- */
  let dlg, input, out, view, lastFocus = null;
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'find-dlg';
    dlg.setAttribute('aria-label', 'Search Fino');
    dlg.innerHTML = `<form class="find-bar" method="dialog" role="search">${LENS}<label class="sr" for="find-q" style="position:absolute;left:-9999px">Search terms, key cases, law articles, tools, documents, countries, regulators and fines</label>`
      + `<input id="find-q" type="search" autocomplete="off" spellcheck="false" placeholder="A term, a case, a tool, a country or a fine…" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="find-out">`
      + `<button class="find-x" type="button" data-close>Close</button></form>`
      + `<p class="find-count" id="find-count" role="status" aria-live="polite"></p><div class="find-out" id="find-out"></div>`
      + `<div class="find-foot"><span><kbd>&uarr;</kbd> <kbd>&darr;</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>`;
    document.body.appendChild(dlg);
    input = dlg.querySelector('input'); out = dlg.querySelector('.find-out');
    dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
    dlg.querySelector('form').addEventListener('submit', e => { e.preventDefault(); view.enter(true); });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => {
      const back = lastFocus && lastFocus.isConnected && lastFocus.getClientRects().length ? lastFocus : document.getElementById('find-btn');   // the opener may be hidden (the search row of the phone menu)
      if (back) back.focus();
    });
    view = makeView({ input, out, count: dlg.querySelector('#find-count'), empty: `<p class="find-tip">${TIPS}</p>` });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); dlg.close(); } });
  }
  function open() {
    if (!dlg) build();
    lastFocus = document.activeElement;
    document.querySelectorAll('.laws-menu').forEach(m => { m.hidden = true; });
    document.querySelectorAll('.top .laws > button').forEach(b => b.setAttribute('aria-expanded', 'false'));
    dlg.showModal(); input.focus(); input.select();
    view.paint();
    loadFind().then(() => view.paint(), () => { out.innerHTML = '<p class="find-tip">The search could not load. Please check your connection and try again.</p>'; });
    loadFines().then(() => view.paint());
  }

  /* ---------- the box on the home page: the same engine and the same list, in a panel under the box ---------- */
  const homeQ = document.getElementById('home-q'), homeOut = document.getElementById('home-out');
  if (homeQ && homeOut) {
    const wrap = homeQ.closest('.find-wrap') || homeQ.parentElement, form = homeQ.form;
    const hv = makeView({ input: homeQ, out: homeOut, count: document.getElementById('home-count'), onShow: open => { homeOut.hidden = !open; } });
    const load = () => { loadFind().then(() => hv.paint(), () => {}); loadFines().then(() => hv.paint()); };
    homeQ.addEventListener('focus', () => { load(); if (homeQ.value.trim()) hv.paint(); });
    homeQ.addEventListener('pointerdown', load, { once: true });
    homeQ.addEventListener('input', load, { once: true });
    form.addEventListener('submit', e => { e.preventDefault(); hv.enter(true); });
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape' && !homeOut.hidden) { e.preventDefault(); hv.close(); homeQ.focus(); } });
    homeOut.addEventListener('mousedown', e => e.preventDefault());   // a tap on a result must not first take the focus off the box
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) hv.close(); });
    wrap.addEventListener('focusout', e => { if (!e.relatedTarget || !wrap.contains(e.relatedTarget)) hv.close(); });
    homeQ.setAttribute('aria-expanded', 'false');
  }
  window.FinoFind = { search, key };

  /* the skip link moves focus to the main part without touching the address (the fines page reads its address as a route) */
  document.addEventListener('click', e => { if (!e.target.closest('.skip')) return; e.preventDefault(); const m = document.getElementById('main'); if (m) { m.tabIndex = -1; m.focus(); m.scrollIntoView(); } });

  /* open: the lens, the panel's search row, Ctrl+K / Cmd+K, or "/" when not typing */
  document.addEventListener('click', e => { if (e.target.closest('[data-find-open]')) { e.preventDefault(); open(); } });
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); if (dlg?.open) input.focus(); else open(); }
  });

  /* ---------- click-to-define ---------- */
  const P = location.pathname;
  const onDecision = /^\/decisions\//.test(P), onGdpr = /^\/gdpr\/article-/.test(P) && !/article-4\.html$/.test(P);
  const onAi = /^\/ai-act\/(article|annex)-/.test(P) && !/article-3\.html$/.test(P);
  const onExplainer = /^\/(cookies|staff-monitoring|data-breach-fines|ai-training)\.html$/.test(P) || document.body.dataset.defs === 'on';
  if (!(onDecision || onGdpr || onAi || onExplainer)) return;
  /* words too common to underline usefully */
  const SKIP = new Set(['processing', 'call', 'communication', 'user', 'recipient', 'third party', 'enterprise', 'risk', 'subscriber', 'electronic mail', 'input data',
    'filing system', 'value added service', 'placing on the market', 'making available on the market', 'putting into service', 'intended purpose', 'performance',
    'european commission', 'european council', 'council of the european union', 'european parliament', 'the eu institutions']);
  const MAX = 14;
  loadFind().then(D => {
    const root = document.querySelector('main'); if (!root) return;
    const names = new Map();
    for (const t of D.terms) {
      if (t[7] === 'ai' && !onAi) continue;      // AI Act meanings only on AI Act pages
      if (t[7] === 'gdpr' && onAi) continue;
      for (const n of [t[1]]) {   // the term's own name only: looser aliases matched the wrong words
        const c = n.replace(/\s*\(.*?\)\s*/g, ' ').trim();
        if (c.length < 4 || SKIP.has(c.toLowerCase()) || /[^\w\s'’&.-]/.test(c.replace(/[À-ž]/g, 'a'))) continue;
        if (!names.has(c.toLowerCase())) names.set(c.toLowerCase(), t);
      }
    }
    if (!names.size) return;
    const list = [...names.keys()].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]"));
    const re = new RegExp(`(?<![\\w-])(${list.join('|')})(?![\\w-])`, 'i');
    const used = new Set(); let count = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n =>
      n.parentElement.closest('a, button, h1, h2, h3, h4, code, kbd, label, input, select, textarea, script, style, .crumbs, .eurlex, nav, figure, svg, [data-nodefs]')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (let node of nodes) {
      if (count >= MAX) break;
      let m;
      while (count < MAX && node && (m = node.data.match(re))) {
        const t = names.get(m[1].toLowerCase().replace(/’/g, "'"));
        if (!t || used.has(t[0])) {  // already marked: look further along this text
          const rest = node.data.slice(m.index + m[1].length), tail = node.splitText(m.index + m[1].length);
          node = rest ? tail : null; continue;
        }
        used.add(t[0]); count++;
        const word = node.splitText(m.index), after = word.splitText(m[1].length);
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'def'; b.dataset.def = t[0]; b.setAttribute('aria-expanded', 'false'); b.textContent = word.data;
        word.replaceWith(b); node = after;
      }
    }
    if (!count) return;
    const byslug = new Map(D.terms.map(t => [t[0], t]));
    const card = document.createElement('div');
    card.className = 'def-card'; card.hidden = true; card.setAttribute('role', 'dialog'); card.id = 'def-card';
    document.body.appendChild(card);
    let cur = null;
    const close = () => { if (!cur) return; card.hidden = true; cur.setAttribute('aria-expanded', 'false'); cur = null; };
    document.addEventListener('click', e => {
      const b = e.target.closest('button.def');
      if (!b) { if (cur && !e.target.closest('.def-card')) close(); return; }
      if (cur === b) { close(); return; }
      close();
      const t = byslug.get(b.dataset.def); if (!t) return;
      const href = t[6] ? `/${t[4] === 'k' ? 'key-cases' : 'glossary'}/${t[0]}.html` : `/glossary/#${t[0]}`;
      card.setAttribute('aria-label', t[1]);
      card.innerHTML = `<button class="def-close" type="button" aria-label="Close">&times;</button><h3>${esc(t[1])}</h3><p>${esc(t[5])}</p>`
        + `<p class="def-src">${esc(t[3])}</p><a class="def-go" href="${href}">${t[4] === 'k' ? 'The ruling' : 'The official meaning'} &rarr;</a>`;
      card.hidden = false; cur = b; b.setAttribute('aria-expanded', 'true');
      if (innerWidth > 600) {
        const r = b.getBoundingClientRect(), w = card.offsetWidth;
        card.style.left = Math.max(12, Math.min(scrollX + r.left, scrollX + document.documentElement.clientWidth - w - 12)) + 'px';
        card.style.top = (scrollY + r.bottom + 8) + 'px';
      }
      card.querySelector('.def-close').addEventListener('click', () => { const b0 = cur; close(); b0?.focus(); });
      card.querySelector('.def-go').focus({ preventScroll: true });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) { const b = cur; close(); b.focus(); } });
  }, () => {});
})();

/* The header menu: Fines, Law, Tools and About each open a short list. A click opens one and closes the others; Escape,
   a click elsewhere or choosing a link closes it. On a phone the lists open one under the other, inside the full-screen menu. */
(() => {
  if (typeof document === 'undefined') return;   // run under Node by the tests: only the search is there to test
  const groups = [...document.querySelectorAll('.top .laws')]
    .map(g => ({ btn: g.querySelector(':scope > button'), menu: g.querySelector(':scope > .laws-menu') })).filter(x => x.btn && x.menu);
  if (!groups.length) return;
  const set = (x, open) => { x.btn.setAttribute('aria-expanded', String(open)); x.menu.hidden = !open; };
  groups.forEach(x => {
    x.btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = x.menu.hidden;
      groups.forEach(y => set(y, false));
      set(x, open);
      if (open && matchMedia('(min-width: 761px)').matches) x.menu.querySelector('a').focus();
    });
    x.menu.addEventListener('click', e => { if (e.target.closest('a')) set(x, false); });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.top .laws')) groups.forEach(y => set(y, false)); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const x = groups.find(y => !y.menu.hidden);
    if (x) { set(x, false); x.btn.focus(); }
  });
})();
