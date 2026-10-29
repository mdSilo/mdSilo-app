/**
 * The assets of the site, with no dependency: it works offline, from the
 * disk too (the data of the graph and the search are scripts, not fetched).
 */

const STYLE = `:root {
  --bg: #fcfcfa; --fg: #1f2328; --muted: #656d76; --line: #d8dee4; --accent: #0969da;
  --note: #0969da; --book: #8250df; --issue: #1a7f37; --mark: #fff8c5; --code: #f3f4f6;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117; --fg: #e6edf3; --muted: #8d96a0; --line: #30363d; --accent: #4493f8;
    --note: #4493f8; --book: #ab7df8; --issue: #3fb950; --mark: #4d3d00; --code: #161b22;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.7 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
header { display: flex; flex-wrap: wrap; gap: 8px 20px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); }
header .site { font-weight: 600; color: var(--fg); }
header nav { display: flex; flex-wrap: wrap; gap: 14px; }
header .search { margin-left: auto; }
header input { padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--fg); font: inherit; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; overflow-wrap: break-word; }
footer { padding: 16px; text-align: center; color: var(--muted); font-size: 13px; border-top: 1px solid var(--line); }
h1 { line-height: 1.3; }
.meta { color: var(--muted); font-size: 14px; margin-top: -8px; }
pre, code { background: var(--code); border-radius: 6px; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
code { padding: 1px 4px; }
pre { padding: 12px; overflow-x: auto; }
pre code { padding: 0; }
blockquote { margin: 0; padding: 0 16px; border-left: 4px solid var(--line); color: var(--muted); }
img { max-width: 100%; }
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--line); padding: 4px 10px; }
.highlight { background: var(--mark); }
.sup { vertical-align: super; font-size: .8em; }
.sub { vertical-align: sub; font-size: .8em; }
.underline { text-decoration: underline; }
.placeholder { color: var(--muted); border-bottom: 1px dashed var(--muted); }
main.wide { max-width: 1200px; }
.tag { white-space: nowrap; }
.hashtag::before, a.tag:not(.tags a)::before { content: "#"; }
.notice { padding: 8px 16px; margin: 12px 0; border-left: 4px solid var(--accent); background: var(--code); border-radius: 4px; }
.notice-tip { border-left-color: var(--issue); }
.notice-warning { border-left-color: #d29922; }
.checkbox-list-item { list-style: none; }
.pages { padding-left: 20px; }
.tags { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 16px; }
.backlinks { margin-top: 40px; padding-top: 8px; border-top: 1px solid var(--line); }
.backlinks h2 { font-size: 16px; color: var(--muted); }
.comment { margin-top: 24px; padding-top: 8px; border-top: 1px dashed var(--line); }
.num { color: var(--muted); font-weight: normal; }
.state { font-size: 12px; padding: 1px 8px; border-radius: 10px; color: #fff; background: var(--muted); }
.state.open { background: var(--issue); }
.label { font-size: 12px; padding: 1px 8px; border: 1px solid var(--line); border-radius: 10px; }
.label { display: inline-block; font-size: 12px; line-height: 18px; padding: 0 8px; border-radius: 10px; border: 0; text-decoration: none; }
a.label:hover { text-decoration: none; filter: brightness(1.1); }
.due.overdue { color: #cf222e; font-weight: 600; }
.due.overdue::after { content: " · overdue"; }
.progress { display: inline-block; width: 80px; height: 6px; border-radius: 3px; background: var(--line); vertical-align: middle; overflow: hidden; }
.progress span { display: block; height: 100%; background: var(--issue); }
.subnav { margin-top: -8px; }
.issue { display: flex; flex-wrap: wrap; gap: 24px; }
.issue-main { flex: 1 1 420px; min-width: 0; }
.issue-side { flex: 0 1 200px; font-size: 14px; }
.issue-side h3 { margin: 0 0 4px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.issue-side > div { padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--line); }
.issue-body { padding: 4px 16px; border: 1px solid var(--line); border-radius: 8px; }
.subtasks ul { list-style: none; padding-left: 4px; }
.subtasks .done { color: var(--muted); text-decoration: line-through; }
.subtasks h2 { font-size: 16px; }
.timeline { margin-top: 16px; border-left: 2px solid var(--line); padding-left: 16px; }
.timeline .event { margin: 10px 0; font-size: 14px; position: relative; }
.timeline .dot { position: absolute; left: -22px; top: 8px; width: 10px; height: 10px; border-radius: 50%; background: var(--line); }
.timeline .comment { border: 1px solid var(--line); border-radius: 8px; padding: 4px 16px; margin: 12px 0; }
.timeline .comment .meta { margin: 8px 0 0; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
.filters .tabs button { font: inherit; padding: 2px 10px; border: 1px solid var(--line); background: transparent; color: var(--fg); cursor: pointer; }
.filters .tabs button:first-child { border-radius: 6px 0 0 6px; }
.filters .tabs button:last-child { border-radius: 0 6px 6px 0; }
.filters .tabs button.on { background: var(--code); font-weight: 600; }
.filters select { font: inherit; padding: 2px 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
.issues { list-style: none; padding: 0; border: 1px solid var(--line); border-radius: 8px; }
.issue-row { padding: 8px 12px; border-top: 1px solid var(--line); }
.issue-row:first-child { border-top: 0; }
.issue-row .meta { display: block; margin: 2px 0 0; font-size: 13px; }
.board { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
.column { flex: 0 0 220px; background: var(--code); border-radius: 8px; padding: 8px; border-top: 3px solid var(--line); }
.column h3 { margin: 4px 0 8px; font-size: 14px; }
.card { background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 8px; margin-bottom: 8px; font-size: 14px; }
.card .meta { margin: 4px 0 0; font-size: 12px; }
.diagram { margin: 16px 0; padding: 12px; overflow-x: auto; text-align: center; background: #ffffff; border-radius: 8px; border: 1px solid var(--line); }
.diagram svg { max-width: 100%; height: auto; }
math[display="block"] { margin: 12px 0; padding: 4px 0; overflow-x: auto; overflow-y: hidden; }
#graph { width: 100%; height: 70vh; border: 1px solid var(--line); border-radius: 8px; cursor: grab; touch-action: none; }
#results li { margin-bottom: 12px; }
#results .snippet { display: block; color: var(--muted); font-size: 14px; }
`;

/** A force layout on a canvas: repulsion, springs, a pull to the center. */
const GRAPH = `(function () {
  var data = window.MDSILO_GRAPH, canvas = document.getElementById('graph');
  if (!data || !canvas) return;
  var root = document.body.dataset.root || '';
  var ctx = canvas.getContext('2d'), css = getComputedStyle(document.documentElement);
  var color = { note: css.getPropertyValue('--note'), book: css.getPropertyValue('--book'), issue: css.getPropertyValue('--issue') };
  var line = css.getPropertyValue('--line'), fg = css.getPropertyValue('--fg');
  var degree = data.nodes.map(function () { return 0; });
  data.links.forEach(function (l) { degree[l[0]]++; degree[l[1]]++; });
  var n = data.nodes.length;
  var nodes = data.nodes.map(function (d, i) {
    var a = i * 2.4, r = 30 * Math.sqrt(i + 1);
    return { d: d, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, r: 3 + Math.sqrt(degree[i]) * 1.5 };
  });
  var view = { x: 0, y: 0, k: 1 }, hover = null, alpha = 1, w = 0, h = 0, touched = false;
  function size() {
    var dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function tick() {
    var i, j, a, b, dx, dy, d2, f;
    for (i = 0; i < n; i++) {
      a = nodes[i];
      for (j = i + 1; j < n; j++) {
        b = nodes[j]; dx = b.x - a.x; dy = b.y - a.y; d2 = dx * dx + dy * dy + 0.01;
        if (d2 > 250000) continue;
        f = 800 * alpha / d2; a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
      a.vx -= a.x * 0.005 * alpha; a.vy -= a.y * 0.005 * alpha;
    }
    data.links.forEach(function (l) {
      a = nodes[l[0]]; b = nodes[l[1]]; dx = b.x - a.x; dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1; f = (d - 70) / d * 0.04 * alpha;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    });
    nodes.forEach(function (p) { if (p === drag) return; p.vx *= 0.6; p.vy *= 0.6; p.x += p.vx; p.y += p.vy; });
    alpha *= 0.99;
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2 + view.x, h / 2 + view.y); ctx.scale(view.k, view.k);
    ctx.strokeStyle = line; ctx.lineWidth = 1 / view.k; ctx.beginPath();
    data.links.forEach(function (l) { var a = nodes[l[0]], b = nodes[l[1]]; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); });
    ctx.stroke();
    nodes.forEach(function (p) {
      ctx.fillStyle = color[p.d.k] || color.note; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill();
    });
    ctx.fillStyle = fg; ctx.font = (12 / view.k) + 'px system-ui, sans-serif'; ctx.textAlign = 'center';
    nodes.forEach(function (p) {
      if (p === hover || view.k > 1.4 || degree[nodes.indexOf(p)] > 4) ctx.fillText(p.d.t, p.x, p.y - p.r - 4 / view.k);
    });
    ctx.restore();
  }
  // the whole graph in view, until moved or zoomed by hand
  function fit() {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach(function (p) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    if (!n) return;
    view.k = Math.min(3, Math.max(0.1, 0.85 * Math.min(w / (x1 - x0 + 60), h / (y1 - y0 + 60))));
    view.x = -(x0 + x1) / 2 * view.k; view.y = -(y0 + y1) / 2 * view.k;
  }
  function loop() { if (alpha > 0.005) { tick(); if (!touched) fit(); } draw(); requestAnimationFrame(loop); }
  function at(e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left - w / 2 - view.x) / view.k, y = (e.clientY - rect.top - h / 2 - view.y) / view.k;
    for (var i = n - 1; i >= 0; i--) {
      var p = nodes[i], dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy < (p.r + 4) * (p.r + 4)) return { node: p, x: x, y: y };
    }
    return { node: null, x: x, y: y };
  }
  var drag = null, pan = null, moved = false;
  canvas.addEventListener('pointerdown', function (e) {
    var hit = at(e); moved = false; touched = true; canvas.setPointerCapture(e.pointerId);
    if (hit.node) { drag = hit.node; alpha = Math.max(alpha, 0.3); } else pan = { x: e.clientX - view.x, y: e.clientY - view.y };
  });
  canvas.addEventListener('pointermove', function (e) {
    var hit = at(e); moved = true;
    if (drag) { drag.x = hit.x; drag.y = hit.y; drag.vx = drag.vy = 0; }
    else if (pan) { view.x = e.clientX - pan.x; view.y = e.clientY - pan.y; }
    else { hover = hit.node; canvas.style.cursor = hover ? 'pointer' : 'grab'; }
  });
  canvas.addEventListener('pointerup', function (e) {
    var hit = at(e);
    if (!moved && hit.node) location.href = root + encodeURI(hit.node.d.u);
    drag = null; pan = null;
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault(); touched = true; view.k = Math.min(8, Math.max(0.1, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
  }, { passive: false });
  window.addEventListener('resize', size);
  size(); loop();
})();
`;

/** Search the titles and the text: every word of the query. */
const SEARCH = `(function () {
  var data = window.MDSILO_SEARCH || [], list = document.getElementById('results');
  var root = document.body.dataset.root || '';
  var q = new URLSearchParams(location.search).get('q') || '';
  var input = document.querySelector('header input');
  if (input) input.value = q;
  var words = q.toLowerCase().split(/\\s+/).filter(Boolean);
  if (!list || !words.length) return;
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var hits = data.map(function (d) {
    var t = d.t.toLowerCase(), x = d.x.toLowerCase(), score = 0;
    for (var i = 0; i < words.length; i++) {
      if (t.indexOf(words[i]) >= 0) score += 10; else if (x.indexOf(words[i]) >= 0) score += 1; else return null;
    }
    var at = Math.max(0, x.indexOf(words[0]) - 60);
    return { d: d, score: score, snippet: (at ? '…' : '') + d.x.slice(at, at + 200) + '…' };
  }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
  list.innerHTML = hits.length ? hits.map(function (h) {
    return '<li><a href="' + root + encodeURI(h.d.u) + '">' + esc(h.d.t) + '</a><span class="snippet">' + esc(h.snippet) + '</span></li>';
  }).join('') : '<li>Nothing found.</li>';
})();
`;

/** The issues: the filters of the list, the due dates past as of today. */
const ISSUES = `(function () {
  var today = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('.due[data-due]').forEach(function (el) {
    if (el.dataset.state === 'open' && el.dataset.due < today) el.classList.add('overdue');
  });
  var form = document.querySelector('form.filters');
  if (!form) return;
  var params = new URLSearchParams(location.search);
  var state = params.has('state') ? params.get('state') : 'open';
  var label = form.elements.label, milestone = form.elements.milestone;
  if (label) label.value = params.get('label') || '';
  if (milestone) milestone.value = params.get('milestone') || '';
  function apply() {
    var shown = 0;
    document.querySelectorAll('.issue-row').forEach(function (row) {
      var ok = (!state || row.dataset.state === state)
        && (!label || !label.value || row.dataset.labels.split('\\n').indexOf(label.value) >= 0)
        && (!milestone || !milestone.value || row.dataset.milestone === milestone.value);
      row.hidden = !ok; if (ok) shown++;
    });
    form.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.state === state); });
    var empty = document.querySelector('.empty'); if (empty) empty.hidden = shown > 0;
  }
  form.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { state = b.dataset.state; apply(); });
  });
  form.addEventListener('change', apply);
  apply();
})();
`;

export const ASSETS: Record<string, string> = {
  'issues.js': ISSUES,
  'style.css': STYLE,
  'graph.js': GRAPH,
  'search.js': SEARCH,
};
