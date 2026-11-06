// Speed reading (RSVP), a word at a time: of the book open, in a panel
// of the reader (index.html: reader.blocks from the page shown, the book
// behind kept at the paragraph read by reader.goTo and reader.mark), or
// of the note open, as a mode of it (note.html: note.blocks).
const IN_NOTE = window.RSVP_SOURCE === "note";

// # talking with the app #
let calls = 0;
const waiting = new Map();
const call = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++calls;
    waiting.set(id, { resolve, reject });
    parent.postMessage({ mdsilo: 1, id, method, params }, "*");
  });
window.addEventListener("message", (event) => {
  if (event.source !== parent) return;
  const msg = event.data;
  if (msg?.mdsilo !== 1) return;
  if ("id" in msg && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    msg.error ? reject(new Error(msg.error)) : resolve(msg.result);
  } else if (msg.event === "style") applyStyle(msg.data);
});

function applyStyle(style) {
  const vars = style?.vars ?? {};
  const root = document.documentElement.style;
  if (vars["--color-base-100"]) root.setProperty("--bg", vars["--color-base-100"]);
  if (vars["--color-base-content"]) root.setProperty("--fg", vars["--color-base-content"]);
  if (vars["--color-error"]) root.setProperty("--accent", vars["--color-error"]);
}

// # the words #
const segmenter =
  typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;

/** The words of a paragraph, punctuation kept with the word before it */
function wordsOf(text) {
  if (!segmenter) return text.split(/\s+/).filter(Boolean);
  const words = [];
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    if (/^\s+$/.test(segment)) {
      words.push("");
      continue;
    }
    if (!isWordLike && words.length && words[words.length - 1] !== "") words[words.length - 1] += segment;
    else if (words.length && words[words.length - 1] !== "" && isWide(segment) && isWide(words[words.length - 1]) && words[words.length - 1].length + segment.length <= 3)
      // short words of CJK together: a few characters at once
      words[words.length - 1] += segment;
    else words.push(segment);
  }
  return words.filter(Boolean);
}
const isWide = (s) => /[⺀-鿿가-힯豈-﫿]/.test(s);

/** The letter the eye rests on */
function pivotOf(word) {
  const n = [...word.replace(/[^\p{L}\p{N}]+$/u, "")].length;
  if (isWide(word)) return Math.floor((n - 1) / 2);
  return n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
}

/** How long a word shows, times the time of a word */
function weightOf(word, last) {
  let w = 1;
  if ([...word].length > 8) w += 0.3;
  if (/[,;:，；：、]$/.test(word)) w += 0.5;
  if (/[.!?。！？…]["'”’」』)]*$/.test(word)) w += 1;
  if (last) w += 1;
  return w;
}

// # reading #
let blocks = []; // { cfi, text, words }
let next; // where to go on from, a CFI
let b = 0; // the block read
let w = 0; // its word
let playing = false;
let timer;
let wpm = 300;
let loading;

const $ = (id) => document.getElementById(id);

async function load(from) {
  const res = IN_NOTE
    ? await call("note.blocks", { from: from === "current" ? 0 : from, count: 40 })
    : await call("reader.blocks", { from, count: 40 });
  for (const block of res.blocks) blocks.push({ ...block, words: wordsOf(block.text) });
  next = res.next;
}

/** More blocks before they run out */
function loadMore() {
  if (loading || !next || blocks.length - b > 8) return;
  loading = load(next).finally(() => (loading = undefined));
}

function show() {
  const block = blocks[b];
  const word = block?.words[w] ?? "";
  const chars = [...word];
  const p = pivotOf(word);
  const [pre, pivot, post] = $("word").children;
  pre.textContent = chars.slice(0, p).join("");
  pivot.textContent = chars[p] ?? "";
  post.textContent = chars.slice(p + 1).join("");
  // the paragraph, the word in it, when paused
  const ctx = $("context");
  ctx.replaceChildren();
  block?.words.forEach((x, i) => {
    const el = i === w ? document.createElement("b") : document.createTextNode("");
    el.textContent = x;
    // CJK runs on, without spaces
    ctx.append(el, isWide(x) && isWide(block.words[i + 1] ?? "") ? "" : " ");
  });
}

let shownBlock = -1;
/** The book behind at the paragraph read, marked */
function follow() {
  const block = blocks[b];
  // a note: nothing behind to follow
  if (IN_NOTE || !block || shownBlock === b) return;
  shownBlock = b;
  call("reader.clearMarks").catch(() => {});
  call("reader.goTo", { cfi: block.cfi }).catch(() => {});
  call("reader.mark", { cfi: block.cfi, color: "green" }).catch(() => {});
}

function tick() {
  const block = blocks[b];
  if (!block) return pause();
  show();
  follow();
  const last = w === block.words.length - 1;
  const delay = (60000 / wpm) * weightOf(block.words[w] ?? "", last);
  timer = setTimeout(() => {
    if (step(1)) return tick();
    // more on the way: read on once there
    if (loading)
      return loading.then(() => (playing && blocks[b] ? tick() : pause()));
    pause();
  }, delay);
}

/** One word on or back; false at the end */
function step(dir) {
  w += dir;
  while (blocks[b] && (w >= blocks[b].words.length || w < 0)) {
    if (w < 0) {
      if (b === 0) { w = 0; break; }
      b -= 1;
      w = blocks[b].words.length - 1;
    } else {
      b += 1;
      w = 0;
    }
  }
  loadMore();
  return Boolean(blocks[b]);
}

function play() {
  if (!blocks[b]) return;
  playing = true;
  document.body.classList.remove("paused");
  $("play").textContent = "⏸ Pause";
  tick();
}
function pause() {
  playing = false;
  clearTimeout(timer);
  document.body.classList.add("paused");
  $("play").textContent = "▶ Play";
  show();
  follow();
}
const toggle = () => (playing ? pause() : play());

function jump(dir) {
  b = Math.max(0, Math.min(blocks.length - 1, b + dir));
  w = 0;
  loadMore();
  clearTimeout(timer);
  playing ? tick() : (show(), follow());
}

function setWpm(value) {
  wpm = Math.max(100, Math.min(1000, value));
  $("wpm").textContent = `${wpm} wpm`;
  try { localStorage.setItem("wpm", String(wpm)); } catch {}
}

$("play").onclick = toggle;
$("back").onclick = () => jump(-1);
$("fwd").onclick = () => jump(1);
$("slower").onclick = () => setWpm(wpm - 25);
$("faster").onclick = () => setWpm(wpm + 25);
document.addEventListener("keydown", (e) => {
  const keys = {
    " ": toggle,
    ArrowLeft: () => jump(-1),
    ArrowRight: () => jump(1),
    ArrowUp: () => setWpm(wpm + 25),
    ArrowDown: () => setWpm(wpm - 25),
    Escape: () => (IN_NOTE ? pause() : call("panel.close")),
  };
  const fn = keys[e.key];
  if (!fn) return;
  e.preventDefault();
  fn();
});

(async () => {
  let saved = 300;
  // the storage of a sandboxed page may be refused
  try { saved = Number(localStorage.getItem("wpm")) || 300; } catch {}
  setWpm(saved);
  call("app.style").then(applyStyle, () => {});
  document.body.focus();
  if (IN_NOTE) $("help").textContent = "Space play/pause · ← → paragraph · ↑ ↓ speed";
  try {
    if (!IN_NOTE) await call("reader.clearMarks");
    await load("current");
    show();
  } catch (e) {
    $("word").textContent = "";
    $("help").textContent = e.message;
    $("help").className = "error";
  }
})();
    
