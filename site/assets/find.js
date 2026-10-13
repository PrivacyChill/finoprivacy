/* Fino: the search behind the lens (also Ctrl+K or "/") and click-to-define on decision, explainer and law pages.
   Data: /data/find.json (glossary, key cases, law articles, explainers; built by pipeline/build_seo.mjs) and
   /data/home.json (the fines, shared with the homepage). Both load only when first needed. Hand-written, not built. */
(() => {
  const LENS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6"/></svg>';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, "'");
  let data = null, fines = null, findP = null, finesP = null;   // the loaded data, and the requests that fetch it once
  const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
  const loadFind = () => findP ||= getJSON('/data/find.json').then(d => (data = d));
  const loadFines = () => finesP ||= getJSON('/data/home.json').then(d => (fines = d));

  /* ---------- the search dialog ---------- */
  let dlg, input, out, items = [], sel = -1, lastFocus = null;
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'find-dlg';
    dlg.setAttribute('aria-label', 'Search Fino');
    dlg.innerHTML = `<form class="find-bar" method="dialog" role="search">${LENS}<label class="sr" for="find-q" style="position:absolute;left:-9999px">Search terms, key cases, law articles and fines</label>`
      + `<input id="find-q" type="search" autocomplete="off" spellcheck="false" placeholder="A term, a case, an article or a fine…" aria-controls="find-out">`
      + `<button class="find-x" type="button" data-close>Close</button></form>`
      + `<div class="find-out" id="find-out" role="listbox" aria-label="Results"></div>`
      + `<div class="find-foot"><span><kbd>&uarr;</kbd> <kbd>&darr;</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>`;
    document.body.appendChild(dlg);
    input = dlg.querySelector('input'); out = dlg.querySelector('.find-out');
    dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { if (lastFocus) lastFocus.focus(); });
    input.addEventListener('input', () => run());
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter') { e.preventDefault(); const a = items[sel] || items[0]; if (a) location.href = a.href; }
    });
    out.addEventListener('click', e => { const b = e.target.closest('button[data-q]'); if (b) { input.value = b.dataset.q; run(); input.focus(); } });
  }
  function open() {
    if (!dlg) build();
    lastFocus = document.activeElement;
    document.querySelectorAll('.laws-menu').forEach(m => { m.hidden = true; });
    dlg.showModal(); input.focus(); input.select();
    run();
    loadFind().then(() => run(), () => { out.innerHTML = '<p class="find-tip">The search could not load. Please check your connection and try again.</p>'; });
    loadFines().then(() => run(), () => {});
  }
  function move(d) {
    if (!items.length) return;
    if (items[sel]) items[sel].removeAttribute('aria-selected');
    sel = (sel + d + items.length) % items.length;
    items[sel].setAttribute('aria-selected', 'true');
    items[sel].scrollIntoView({ block: 'nearest' });
  }
  const hi = (s, q) => { if (!q) return esc(s); const i = fold(s).indexOf(q); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
  /* how well a text matches: whole phrase at the start > at a word start > anywhere > every word somewhere */
  function score(hay, q, words) {
    const h = fold(hay);
    if (h === q) return 120;
    if (h.startsWith(q)) return 100;
    if (new RegExp('(^|[^a-z0-9])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(h)) return 70;
    if (h.includes(q)) return 45;
    return words.length > 1 && words.every(w => h.includes(w)) ? 30 : 0;
  }
  function run() {
    if (!out) return;
    const raw = input.value.trim(), q = fold(raw).replace(/\s+/g, ' '), words = q.split(' ').filter(Boolean);
    if (!q) {
      out.innerHTML = `<p class="find-tip">Find any official term, court ruling, article of the GDPR or AI Act, or fine. Try:<br>`
        + ['consent', 'Article 83', 'Planet49', 'cookie banner', 'TikTok', 'deployer'].map(t => `<button type="button" data-q="${esc(t)}">${esc(t)}</button>`).join('') + '</p>';
      items = []; sel = -1; return;
    }
    const groups = [];
    if (data) {
      /* "art 83", "article 5", "gdpr 6", "ai act 50", "83" */
      const m = q.match(/^(?:(gdpr|ai act|aia)\s*)?(?:art(?:icle)?\.?\s*)?(\d{1,3}[a-z]?)$/);
      const arts = data.articles.map(a => {
        let s = m && a[1] === m[2] ? (m[1] ? ((m[1] === 'gdpr') === (a[0] === 'GDPR') ? 130 : 0) : (a[0] === 'GDPR' ? 125 : 115)) : 0;
        if (!s && !m) s = score(a[2], q, words) * 0.8;
        return [s, `<b>${esc(a[4])}</b><span>${hi(a[2], q)}</span>`, a[3], ''];
      });
      const terms = data.terms.map(t => {
        const s = Math.max(score(t[1], q, words), ...t[2].split('|').filter(Boolean).map(x => score(x, q, words) - 5));
        return [s, t[4] === 'k' ? 'k' : 'g', `<b>${hi(t[1], q)}</b><span>${esc(t[5].length > 110 ? t[5].slice(0, 108).replace(/\s+\S*$/, '') + '…' : t[5])}</span>`, t[6] ? `/${t[4] === 'k' ? 'key-cases' : 'glossary'}/${t[0]}.html` : `/glossary/#${t[0]}`, t[3]];
      });
      const ex = data.explainers.map(e => [score(e[0], q, words) || score(e[2], q, words) * 0.7, `<b>${hi(e[0], q)}</b><span>Explainer</span>`, e[1], '']);
      const top = (list, n) => list.filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, n);
      const g = top(terms.filter(t => t[1] === 'g'), 5).map(t => [t[0], t[2], t[3], t[4]]);
      const k = top(terms.filter(t => t[1] === 'k'), 4).map(t => [t[0], t[2], t[3], t[4]]);
      const a = top(arts, 5), x = top(ex, 3);
      if (g.length) groups.push(['Glossary', g]);
      if (k.length) groups.push(['Key cases', k]);
      if (a.length) groups.push(['Law articles', a]);
      if (x.length) groups.push(['Explainers', x]);
    }
    if (fines && q.length > 1) {
      const F = fines, ix = Object.fromEntries(F.fields.map((f, i) => [f, i]));
      const hits = [];
      for (const r of F.rows) {
        const s = Math.max(score(r[ix.name], q, words), score(F.countries[r[ix.cc]] || '', q, words) * 0.5);
        if (s) hits.push([s + Math.log10((r[ix.eur] || 0) + 1), r]);
      }
      hits.sort((p, n) => n[0] - p[0]);
      const f = hits.slice(0, 6).map(([s, r]) => [s, `<b>${hi(r[ix.name], q)}</b><span>${esc(F.countries[r[ix.cc]] || '')}${r[ix.date] ? ' &middot; ' + esc(r[ix.date].slice(0, 4)) : ''}</span>`,
        `/decisions/${r[ix.slug]}.html`, r[ix.amount] ? esc(r[ix.amount]) : '']);
      if (f.length) groups.push([hits.length > 6 ? `Fines and decisions (${hits.length.toLocaleString('en-GB')})` : 'Fines and decisions', f]);
    }
    /* the group holding the best match goes first */
    groups.sort((p, n) => n[1][0][0] - p[1][0][0]);
    out.innerHTML = groups.length ? groups.map(([h, list]) => `<p class="find-g">${h}</p><ul>${list.map(([, html, href, right]) =>
      `<li><a href="${href}" role="option">${html}${right ? `<i>${right}</i>` : ''}</a></li>`).join('')}</ul>`).join('')
      : (data ? `<p class="find-tip">Nothing found for &ldquo;${esc(raw)}&rdquo;. Try a shorter word, an article number, or a company name.</p>` : '<p class="find-tip">Loading&hellip;</p>');
    items = [...out.querySelectorAll('a')]; sel = -1;
    if (items.length) move(1);
  }

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
