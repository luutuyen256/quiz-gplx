/* GPLX Audio Quiz Player (web) - ban nghe cua tools/audio_quiz_gui_v2.py.
 *
 * Chay: phuc vu thu muc goc du an qua HTTP (fetch khong chay duoc voi file://), vi du
 *   python -m http.server 8080      (tai thu muc goc du an)
 * roi mo http://localhost:8080/web/audio_quiz/
 *
 * File audio duoc nap kem ?v=<checksum trong manifest>; manifest doc lai (no-store) moi cau,
 * nen wav vua render lai se duoc dung ngay ma khong can tai lai trang.
 */
"use strict";

// Cau hinh mac dinh (chay tu thu muc du an); ban deploy ghi de qua window.AUDIO_QUIZ_CONFIG trong index.html
const CFG = Object.assign({
  questionsUrl: "../../data/pdf/questions.json",
  classificationUrl: "../../data/pdf/classification.json",
  manifestUrl: "../../data/audio/manifest.json",
  audioRoot: "../../data/audio",  // thu muc chua clipDir
  clipDir: "wav",
  ext: "wav",
}, window.AUDIO_QUIZ_CONFIG || {});
const QUESTIONS_URL = CFG.questionsUrl;
const CLASSIFICATION_URL = CFG.classificationUrl;
const MANIFEST_URL = CFG.manifestUrl;
const MISSING_CLIP_MS = 1500;
const SETTINGS_KEY = "gplx_audio_quiz_settings";

class Stopped extends Error {}
class NavInterrupt extends Error {}

const $ = (id) => document.getElementById(id);
const pad3 = (n) => String(n).padStart(3, "0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  questions: [],        // cac cau nghe duoc
  checksums: new Map(), // "wav/q001_prompt.wav" (theo CFG) -> checksum
  manifestStamp: null,
  session: null,        // { token, stopped, nav, clipReplay, lastClip }
  token: 0,
  paused: false,
  sessionCount: 0,
  studySeconds: 0,
  audio: new Audio(),
  cfg: { autoloop: true, shuffle: true, ready: true, think: 3.0, limit: 0 },
};

/* ------------------------------------------------------------------ data */

async function fetchJson(url, noStore = false) {
  const res = await fetch(url, noStore ? { cache: "no-store" } : undefined);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function refreshManifest() {
  try {
    const m = await fetchJson(`${MANIFEST_URL}?t=${Date.now()}`, true);
    state.checksums = new Map((m.assets || []).map((a) => [a.path, a.checksum]));
  } catch (e) { /* giu ban cu */ }
}

async function loadData() {
  const raw = await fetchJson(QUESTIONS_URL);
  const map = new Map(raw.map((q) => [q.id, q]));
  let ids = raw.map((q) => q.id);
  try { ids = (await fetchJson(CLASSIFICATION_URL)).audio_capable_ids || ids; } catch (e) { /* khong loc */ }
  state.questions = ids.filter((id) => map.has(id)).map((id) => map.get(id));
  await refreshManifest();
  updateVoiceStats();
}

const clipPath = (qid, name) => `${CFG.clipDir}/q${pad3(qid)}_${name}.${CFG.ext}`;
const hasClip = (qid, name) => state.checksums.has(clipPath(qid, name));
const isReady = (q) => hasClip(q.id, "prompt") && hasClip(q.id, "answer");

function clipUrl(qid, name) {
  const p = clipPath(qid, name);
  if (!state.checksums.has(p)) return null;
  return `${CFG.audioRoot}/${p}?v=${state.checksums.get(p) || Date.now()}`;
}

function updateVoiceStats() {
  return state.questions.filter(isReady).length;
}

function buildSessionList() {
  let items = state.questions.filter(isReady);
  {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
  if (state.cfg.limit) items = items.slice(0, state.cfg.limit);
  return items;
}

/* -------------------------------------------------------------------- UI */

function setStatus(text, color) {
  const el = $("status");
  el.textContent = text;
  el.style.color = color;
}

function setThink(text, color, progress) {
  const el = $("thinkMsg");
  el.textContent = text;
  el.style.color = color;
  if (progress !== undefined) $("progThink").value = progress;
}

const PLAY_IC = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_IC = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

function updateButtons() {
  const on = !!state.session;
  if (on) document.body.classList.add("started");
  for (const id of ["btnPrev", "btnReplay", "btnClip", "btnNext", "btnStop"]) $(id).disabled = !on;
  const play = $("btnPlay");
  if (!on) { play.innerHTML = PLAY_IC + "<span>Bắt đầu học</span>"; play.classList.remove("paused"); }
  else if (state.paused) { play.innerHTML = PLAY_IC + "<span>Tiếp tục từ đầu câu</span>"; play.classList.remove("paused"); }
  else { play.innerHTML = PAUSE_IC + "<span>Tạm dừng</span>"; play.classList.add("paused"); }
}

function resetOptions() {
  document.querySelectorAll(".opt").forEach((o) => o.classList.remove("active", "correct"));
}

function highlightOption(idx) {
  resetOptions();
  const el = $("options").children[idx];
  if (el) el.classList.add("active");
}

function highlightCorrect(corrId, q) {
  resetOptions();
  const idx = q.options.findIndex((o) => o.id === corrId);
  const el = $("options").children[idx];
  if (el) el.classList.add("correct");
}

function showQuestion(q, index, total) {
  $("qId").textContent = `CÂU ${q.id}`;
  $("qChapter").textContent = `Chương ${q.chapter || "I"}`;
  $("qCrit").hidden = !q.critical;
  $("qMiss").hidden = true;
  const p = $("prompt");
  p.className = "";
  p.textContent = q.prompt;
  $("counter").textContent = `Câu: ${index} / ${total} (${((index / total) * 100).toFixed(1)}%)`;
  $("progSession").value = (index / total) * 100;
  $("progThink").value = 0;

  const box = $("options");
  box.innerHTML = "";
  for (const o of q.options || []) {
    const div = document.createElement("div");
    div.className = "opt";
    div.innerHTML = '<span class="n"></span><span class="t"></span><span class="ok">✓ ĐÚNG</span>';
    div.querySelector(".n").textContent = `[${o.id}]`;
    div.querySelector(".t").textContent = o.text;
    box.appendChild(div);
  }
}

/* ---------------------------------------------------------------- engine */

function check(sess) {
  if (sess.stopped) throw new Stopped();
  if (sess.nav) throw new NavInterrupt();
}

async function waitWhilePaused(sess) {
  while (state.paused) { check(sess); await sleep(100); }
}

/** Cho ms mili-giay; thoi gian tam dung khong tinh; phuc vu yeu cau nghe lai doan. */
async function sleepI(sess, ms) {
  let left = ms;
  while (left > 0) {
    check(sess);
    if (sess.clipReplay && sess.lastClip) await playClip(sess, sess.lastClip);
    if (state.paused) { await waitWhilePaused(sess); continue; }
    await sleep(50);
    left -= 50;
  }
}

/** Phat 1 clip; tam dung la dung that su roi tiep tuc dung cho dang do. Tra ve false neu thieu file. */
async function playClip(sess, url) {
  if (!url) { await sleepI(sess, MISSING_CLIP_MS); return false; }
  sess.lastClip = url;
  sess.clipReplay = false;
  const a = state.audio;
  a.src = url;
  let failed = false;
  a.onerror = () => { failed = true; };
  try { await a.play(); } catch (e) { failed = true; }
  try {
    while (!a.ended && !failed) {
      check(sess);
      if (sess.clipReplay) {
        sess.clipReplay = false;
        a.currentTime = 0;
        if (!state.paused) a.play().catch(() => {});
      }
      if (state.paused && !a.paused) a.pause();
      else if (!state.paused && a.paused && !a.ended) a.play().catch(() => {});
      await sleep(50);
    }
  } catch (e) {
    a.pause();
    throw e;
  }
  if (failed) { await sleepI(sess, MISSING_CLIP_MS); return false; }
  return true;
}

async function playQuestion(sess, q) {
  const qid = q.id;
  sess.lastClip = null;
  sess.clipReplay = false;
  await refreshManifest();
  updateVoiceStats();

  let missing = false;
  const markMissing = () => { missing = true; $("qMiss").hidden = false; };

  setThink("Đang đọc câu hỏi…", "var(--blue)");
  if (!(await playClip(sess, clipUrl(qid, "prompt")))) markMissing();
  await sleepI(sess, 1000);

  for (let i = 0; i < (q.options || []).length; i++) {
    const opt = q.options[i];
    highlightOption(i);
    setThink(`Đang đọc lựa chọn [${opt.id}]…`, "var(--orange)");
    if (!(await playClip(sess, clipUrl(qid, `option_${opt.id}`)))) markMissing();
    await sleepI(sess, 800);
  }

  // Thoi gian suy nghi
  resetOptions();
  const steps = Math.max(Math.round(state.cfg.think * 10), 1);
  for (let step = steps; step > 0; step--) {
    await waitWhilePaused(sess);
    check(sess);
    if (sess.clipReplay && sess.lastClip) await playClip(sess, sess.lastClip);
    setThink(`⏱ Thời gian suy nghĩ: ${(step / 10).toFixed(1)}s`, "var(--orange)", (1 - step / steps) * 100);
    await sleep(100);
  }

  // Dap an dung
  const corr = q.pdf_correct_option;
  if (corr == null) setThink("⚠ Câu này chưa có dữ liệu đáp án đúng", "var(--red)", 100);
  else {
    highlightCorrect(corr, q);
    setThink(`✓ ĐÁP ÁN CHÍNH XÁC: [${corr}]`, "var(--green)", 100);
  }
  if (!(await playClip(sess, clipUrl(qid, "answer")))) markMissing();
  await sleepI(sess, 2000);
  return missing;
}

async function sessionLoop(sess) {
  let finished = false;
  try {
    while (true) {
      state.sessionCount++;
      $("sessionBadge").textContent = `PHIÊN SỐ ${state.sessionCount}`;
      $("hint").textContent = "";
      await refreshManifest();
      const list = buildSessionList();
      if (!list.length) break;

      let i = 0;
      while (i < list.length) {
        sess.nav = null;
        showQuestion(list[i], i + 1, list.length);
        try {
          await playQuestion(sess, list[i]);
          i++;
        } catch (e) {
          if (!(e instanceof NavInterrupt)) throw e;
          const act = sess.nav;
          sess.nav = null;
          if (act === "prev") i = Math.max(i - 1, 0);
          else if (act === "next") i++;
          // "replay": giu nguyen i
        }
      }

      if (!state.cfg.autoloop) { finished = true; break; }
      setThink("★ Hoàn thành phiên! Đang chuẩn bị phiên mới…", "var(--green)");
      try { await sleepI(sess, 3000); } catch (e) { if (!(e instanceof NavInterrupt)) throw e; sess.nav = null; }
    }
  } catch (e) {
    if (!(e instanceof Stopped)) console.error(e);
  }
  if (state.session === sess) endSession(finished);
}

/* -------------------------------------------------------------- controls */

function startSession() {
  readConfig();
  if (updateVoiceStats() === 0) {
    alert("Chưa có câu nào có đủ file audio.\nHãy tạo voice trước.");
    return;
  }
  const sess = { token: ++state.token, stopped: false, nav: null, clipReplay: false, lastClip: null };
  state.session = sess;
  state.paused = false;
  setStatus("● ĐANG PHÁT AUDIO", "var(--green)");
  updateButtons();
  sessionLoop(sess);
}

function pause() {
  state.paused = true;
  state.audio.pause();
  setStatus("⏸ ĐÃ TẠM DỪNG", "var(--orange)");
  setThink("Đã tạm dừng — nhấn Tiếp tục để nghe lại câu từ đầu.", "var(--orange)");
  updateButtons();
}

function resume() {
  state.paused = false;
  setStatus("● ĐANG PHÁT AUDIO", "var(--green)");
  updateButtons();
}

function togglePlay() {
  if (!state.session) startSession();
  else if (state.paused) nav("replay");
  else pause();
}

function stop() {
  const sess = state.session;
  if (!sess) return;
  sess.stopped = true;
  endSession(false);
}

function endSession(finished) {
  state.session = null;
  state.paused = false;
  state.audio.pause();
  if (finished) {
    setStatus("✔ HOÀN THÀNH PHIÊN", "var(--green)");
    setThink("★ Đã học hết các câu trong phiên.", "var(--green)", 0);
  } else {
    setStatus("⏹ ĐÃ DỪNG LẠI", "var(--red)");
    setThink("Đã dừng phiên học.", "var(--text-muted)", 0);
  }
  $("hint").textContent = "";
  resetOptions();
  updateButtons();
}

function nav(action) {
  const sess = state.session;
  if (!sess) return;
  sess.nav = action;
  state.audio.pause();
  if (state.paused) resume();
}

function replayClip() {
  const sess = state.session;
  if (!sess) return;
  sess.clipReplay = true;
  if (state.paused) resume();
}

/* ---------------------------------------------------------------- config */

function readConfig() {
  const prev = JSON.stringify([state.cfg.limit]);
  state.cfg = {
    autoloop: true,
    shuffle: true,
    ready: true,
    think: parseFloat($("cfgThink").value) || 3.0,
    limit: parseInt($("cfgLimit").value, 10) || 0,
  };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.cfg)); } catch (e) { /* bo qua */ }
  const changed = prev !== JSON.stringify([state.cfg.limit]);
  $("hint").textContent = state.session && changed ? "↻ Áp dụng từ phiên sau" : "";
}

function initConfig() {
  try { Object.assign(state.cfg, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch (e) { /* mac dinh */ }
  Object.assign(state.cfg, { autoloop: true, shuffle: true, ready: true });
  $("cfgThink").value = state.cfg.think.toFixed(1);
  $("cfgLimit").value = String(state.cfg.limit);
  for (const id of ["cfgThink", "cfgLimit"]) {
    $(id).addEventListener("change", readConfig);
  }
}

/* ------------------------------------------------------------------ init */

function init() {
  initConfig();
  $("btnPlay").onclick = togglePlay;
  $("btnPrev").onclick = () => nav("prev");
  $("btnNext").onclick = () => nav("next");
  $("btnReplay").onclick = () => nav("replay");
  $("btnClip").onclick = replayClip;
  $("btnStop").onclick = stop;

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.ctrlKey || e.altKey || e.metaKey) return;
    const actions = {
      " ": togglePlay, ArrowRight: () => nav("next"), ArrowLeft: () => nav("prev"),
      ArrowUp: replayClip, r: () => nav("replay"), R: () => nav("replay"), Escape: stop,
    };
    const fn = actions[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });

  setInterval(() => {
    if (state.session && !state.paused) {
      state.studySeconds++;
      const s = state.studySeconds;
      $("studyTime").textContent = "⏱ " + [s / 3600, (s % 3600) / 60, s % 60]
        .map((v) => String(Math.floor(v)).padStart(2, "0")).join(":");
    }
  }, 1000);

  updateButtons();
  loadData().catch((e) => {
    $("voiceStatus").textContent = `⚠ Không tải được dữ liệu (${e.message}). Hãy chạy qua HTTP server từ thư mục gốc dự án.`;
  });
}

init();
