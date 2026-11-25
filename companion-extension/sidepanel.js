// jcortez3
const $ = (s) => document.querySelector(s);
const POPUP = new URLSearchParams(location.search).has('popup');
const DEF = { hubUrl: '', voiceName: '', rate: 1.05, lang: 'en-US', pauseMs: 1500, brief: true, autoRead: true, share: false };
const BRIEF = '(Voice chat: answer in a few short, natural spoken sentences; no tables or code unless I ask.)';
const RESTRICTED = /^(chrome|edge|about|brave|opera|vivaldi|chrome-extension|extension|devtools|view-source|chrome-search|chrome-untrusted|data|javascript|blob):/i;
const STORE_RE = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/i;
const PAGE_RE = /\b(this|the|current|my)\s+(page|tab|article|site|web\s?site|web\s?page|doc|document|email|e-mail|post|pdf|paper|thread|spec|datasheet|link|video|table|code)\b|\bwhat (am i|i'm|i am) (looking at|reading|viewing|seeing)\b|\b(on|in) (my|the) (screen|browser)\b|\bread (it|this) (to me|for me|out)\b/i;
const SHOT_RE = /\b(screen|screenshot|chart|graph|diagram|figure|picture|image|photo|plot|layout|looks? like)\b/i;
const MAX_TEXT = 400000;
const PROMPTS = {
  page: "I'm sharing the browser tab I'm looking at. Read the attached snapshot and give me a short summary, then wait for my questions.",
  selection: 'Here is text I selected in my browser. Explain it briefly.',
  shot: 'Here is a screenshot of my browser tab. Describe briefly what it shows.',
};
const frame = $('#hub');
const synth = window.speechSynthesis;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let cfg = { ...DEF };
let hubOrigin = '';
let bridgeReady = false;
let readyTimer = null;
let curKey = '';
let curFresh = false;
let lastPageSend = null;
let seq = 0;
const ctxSeen = new Map();
const pending = new Map();
let talk = false;
let phase = 'idle';
let rec = null;
let heard = '';
let interim = '';
let silence = null;
let voices = [];
let gen = 0;
let statusTimer = null;
function status(text, kind) {
  const el = $('#status');
  el.textContent = text || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
  clearTimeout(statusTimer);
  if (text && kind !== 'live') {
    statusTimer = setTimeout(() => {
      if (el.textContent === text) { el.textContent = ''; el.className = 'status'; }
    }, kind === 'err' ? 9000 : 5000);
  }
}
function save(p) {
  Object.assign(cfg, p);
  return chrome.storage.local.set(p);
}
function render() {
  const b = $('#talk');
  b.classList.toggle('listening', talk && phase === 'listening');
  b.classList.toggle('busy', talk && phase !== 'listening');
  b.title = talk ? 'End the voice conversation (Alt+T)' : 'Start a voice conversation (Alt+T)';
  $('#autoRead').textContent = cfg.autoRead ? '🔊' : '🔇';
  $('#autoRead').classList.toggle('on', cfg.autoRead);
  $('#share').classList.toggle('on', cfg.share);
  $('#shareLabel').textContent = cfg.share ? 'Sharing tab' : 'Not sharing';
}
function setPhase(p) {
  phase = p;
  render();
}
function normalizeHub(raw) {
  const u = new URL(String(raw).trim());
  if (!/^https?:$/.test(u.protocol)) throw new Error('not a web link');
  const out = new URL('/hub', u.origin);
  const t = u.searchParams.get('token');
  if (t) out.searchParams.set('token', t);
  return out.href;
}
function showSetup(why) {
  const text = {
    first: 'The companion needs the ChipAgents Web link once.',
    down: `Can't reach ChipAgents Web at ${hubOrigin}. Is the launcher running?`,
    auth: 'The saved hub link has expired (the launcher was restarted).',
    bad: 'The saved hub link is not valid.',
    noproxy: 'This link is the plain hub. Use the launcher link (port 4300 or above), which adds file upload.',
  }[why];
  $('#setupText').textContent = text;
  $('#setupUrl').value = cfg.hubUrl || '';
  $('#setup').hidden = false;
}
function openHub() {
  bridgeReady = false;
  clearTimeout(readyTimer);
  if (!cfg.hubUrl) {
    frame.removeAttribute('src');
    return showSetup('first');
  }
  let u;
  try { u = new URL(cfg.hubUrl); } catch { return showSetup('bad'); }
  hubOrigin = u.origin;
  $('#setup').hidden = true;
  frame.src = u.href;
  readyTimer = setTimeout(() => { if (!bridgeReady) showSetup('down'); }, 15000);
}
function toHub(msg) {
  if (frame.contentWindow && hubOrigin) frame.contentWindow.postMessage({ caCompanion: 1, ...msg }, hubOrigin);
}
async function targetTab() {
  const w = POPUP ? await chrome.windows.getLastFocused({ windowTypes: ['normal'] }) : await chrome.windows.getCurrent();
  const [t] = await chrome.tabs.query({ active: true, windowId: w.id });
  if (!t) throw new Error('No active tab');
  return t;
}
function isHubUrl(url) {
  try { return !!hubOrigin && new URL(url).origin === hubOrigin; } catch { return false; }
}
function unreadable(tab) {
  const u = tab.url || tab.pendingUrl || '';
  if (!u) return "This tab's address isn't available";
  if (isHubUrl(u)) return 'That tab is the ChipAgents hub itself';
  if (RESTRICTED.test(u) || STORE_RE.test(u)) return "The browser doesn't let extensions read this kind of page";
  return '';
}
async function refreshTab() {
  try {
    const t = await targetTab();
    $('#tabTitle').textContent = t.title || t.url || '';
    $('#tabTitle').title = t.url || '';
  } catch {
    $('#tabTitle').textContent = '';
  }
}
function grabPage() {
  const sel = String(window.getSelection ? window.getSelection() : '').trim();
  const b = document.body;
  return { top: window === window.top, url: location.href, title: document.title, type: document.contentType, sel, text: b ? b.innerText : '' };
}
const looksPdf = (u) => /\.pdf($|[?#])/i.test(u || '');
const slug = (s) => String(s).replace(/[^\w.-]+/g, '_').replace(/^[_.]+|[_.]+$/g, '').slice(0, 60) || 'page';
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + s.length;
}
function scriptError(e, tab) {
  const s = String((e && e.message) || e);
  if (/^file:/i.test(tab.url)) return 'To read local files, turn on "Allow access to file URLs" in this extension\'s Details page';
  if (/Cannot access|cannot be scripted|gallery/i.test(s)) return "The browser doesn't let extensions read this page";
  return 'Could not read the page: ' + s;
}
function mdFile(tab, body, sel) {
  let md = `# Browser tab snapshot\n\n- Title: ${tab.title || ''}\n- URL: ${tab.url}\n- Captured: ${new Date().toLocaleString()}\n`;
  if (sel) md += `\n## Text the user selected\n\n${sel}\n`;
  if (body) md += `\n## Page text\n\n${body}\n`;
  return {
    blob: new Blob([md], { type: 'text/markdown' }),
    name: `${body ? 'tab' : 'selection'}_${slug(tab.title || 'page')}.md`,
    hash: hash(`${tab.url}\n${sel}\n${body}`),
    page: !!body,
    tab,
  };
}
async function pdfFile(tab) {
  const r = await fetch(tab.url, { credentials: 'include' });
  if (!r.ok) throw new Error(`Could not download the PDF (HTTP ${r.status})`);
  const blob = await r.blob();
  if (blob.size > 100 * 1048576) throw new Error('The PDF is larger than 100 MB');
  let base = new URL(tab.url).pathname.split('/').pop() || 'document';
  try { base = decodeURIComponent(base); } catch { base = 'document'; }
  return { blob: new Blob([blob], { type: 'application/pdf' }), name: slug(base.replace(/\.pdf$/i, '')) + '.pdf', hash: hash(tab.url + blob.size), page: true, tab };
}
async function readTab(tab, kind) {
  const why = unreadable(tab);
  if (why) throw new Error(why);
  let frames;
  try {
    frames = (await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: grabPage })).map((r) => r.result).filter(Boolean);
  } catch (e) {
    if (kind === 'page' && looksPdf(tab.url)) return pdfFile(tab);
    throw new Error(scriptError(e, tab));
  }
  const top = frames.find((f) => f.top) || frames[0] || { text: '', sel: '' };
  if (kind === 'page' && (top.type === 'application/pdf' || (looksPdf(tab.url) && !String(top.text).trim()))) return pdfFile(tab);
  const sel = frames.map((f) => f.sel).filter(Boolean).join('\n\n');
  if (kind === 'selection') {
    if (!sel) throw new Error('Select some text on the page first');
    return mdFile(tab, '', sel);
  }
  let body = '';
  for (const f of [top, ...frames.filter((x) => x !== top)]) {
    const t = String(f.text || '').trim();
    if (!t) continue;
    body += (f === top ? '' : `\n\n--- Embedded frame: ${f.title || f.url} ---\n\n`) + t;
    if (body.length > MAX_TEXT) { body = body.slice(0, MAX_TEXT) + '\n\n[page text truncated]'; break; }
  }
  if (!body && !sel) throw new Error('No readable text on this page. Try 📸 instead');
  return mdFile(tab, body, sel);
}
async function shot(tab) {
  const why = unreadable(tab);
  if (why && !isHubUrl(tab.url)) throw new Error(why);
  const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const bin = atob(url.split(',')[1]);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return { blob: new Blob([a], { type: 'image/png' }), name: 'screenshot.png', page: false, tab };
}
const pack = (f) => ({ blob: f.blob, name: f.name });
function noteFor(files) {
  const t = files[0] && files[0].tab;
  return t ? `(Shared from my browser tab "${t.title || t.url}" ${t.url})` : '';
}
async function shareContext(text, voice, key, fresh) {
  const files = [];
  let pageHash;
  const mentions = PAGE_RE.test(text);
  const wantPage = cfg.share || (voice && mentions);
  const wantShot = SHOT_RE.test(text) && (cfg.share || mentions || /\bscreen/i.test(text));
  if (!wantPage && !wantShot) return { files, note: '' };
  const tab = await targetTab();
  const why = unreadable(tab);
  if (why) {
    if (mentions) status(why, 'err');
    return { files, note: '' };
  }
  if (wantPage) {
    try {
      const f = await readTab(tab, 'page');
      if (fresh || ctxSeen.get(key) !== f.hash) { files.push(f); pageHash = f.hash; }
    } catch (e) {
      status(e.message, 'err');
    }
  }
  if (wantShot) {
    try { files.push(await shot(tab)); } catch (e) { status(e.message, 'err'); }
  }
  return { files, note: noteFor(files), pageHash };
}
async function ask(kind) {
  try {
    if (!bridgeReady) throw new Error('The hub is not connected yet');
    const tab = await targetTab();
    if (talk) { stopRec(); stopSpeaking(true); setPhase('sending'); }
    status(kind === 'shot' ? 'Taking a screenshot…' : 'Reading the tab…', 'live');
    const f = kind === 'shot' ? await shot(tab) : await readTab(tab, kind);
    const id = `p${++seq}`;
    pending.set(id, { pageHash: f.page ? f.hash : undefined });
    status('Sending to ChipAgents…', 'live');
    toHub({ type: 'send', id, files: [pack(f)], note: noteFor([f]), fallback: PROMPTS[kind] + (talk && cfg.brief ? ' ' + BRIEF : '') });
  } catch (e) {
    status(e.message, 'err');
    if (talk) listen();
  }
}
async function onNeedContext(m) {
  let ctx = { files: [], note: '' };
  try { ctx = await shareContext(m.text, false, m.key, m.fresh); } catch (e) { status(e.message, 'err'); }
  if (ctx.pageHash) pending.set(m.id, { pageHash: ctx.pageHash });
  if (ctx.files.length) status('Sharing the tab with your message…', 'live');
  toHub({ type: 'context', id: m.id, files: ctx.files.map(pack), note: ctx.note });
}
function onPath(m) {
  curKey = m.key;
  curFresh = m.fresh;
  if (lastPageSend && lastPageSend.fresh && !ctxSeen.has(m.key) && Date.now() - lastPageSend.at < 120000) {
    ctxSeen.set(m.key, lastPageSend.hash);
    lastPageSend = null;
  }
}
function onSent(m) {
  const p = pending.get(m.id);
  pending.delete(m.id);
  curKey = m.key;
  if (p && p.pageHash) {
    ctxSeen.set(m.key, p.pageHash);
    lastPageSend = { hash: p.pageHash, fresh: m.fresh, at: Date.now() };
  }
  if (talk) setPhase('thinking');
  status(talk ? 'Thinking…' : 'Sent. Waiting for the reply…', 'live');
}
function onError(m) {
  pending.delete(m.id);
  status(m.message, 'err');
  if (talk && phase !== 'listening' && phase !== 'speaking') speak('Sorry, ' + m.message);
}
function onReply(m) {
  if (talk || m.manual || cfg.autoRead) {
    if (m.text) return speak(m.text);
  }
  status('');
  if (talk) listen();
}
window.addEventListener('message', (e) => {
  const m = e.data;
  if (e.source !== frame.contentWindow || e.origin !== hubOrigin || !m || !m.caCompanion) return;
  if (m.type === 'ready') {
    bridgeReady = true;
    clearTimeout(readyTimer);
    curKey = m.key;
    curFresh = m.fresh;
    if (!m.auth) return showSetup('auth');
    if (!m.proxy) return showSetup('noproxy');
    $('#setup').hidden = true;
    toHub({ type: 'share', on: cfg.share });
  } else if (m.type === 'path') onPath(m);
  else if (m.type === 'sent') onSent(m);
  else if (m.type === 'error') onError(m);
  else if (m.type === 'reply') onReply(m);
  else if (m.type === 'needContext') onNeedContext(m);
  else if (m.type === 'key') hotkey(m.key, m.alt);
});
function withTimeout(p, ms, v) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(v), ms))]);
}
async function micAllowed() {
  try {
    const p = await navigator.permissions.query({ name: 'microphone' });
    if (p.state === 'granted') return true;
    if (p.state === 'denied') return false;
  } catch {
    status('Checking microphone…', 'live');
  }
  return withTimeout(navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
    s.getTracks().forEach((t) => t.stop());
    return true;
  }, () => false), 3000, false);
}
async function startTalk() {
  if (!SR) return status('This browser has no speech recognition', 'err');
  if (!(await micAllowed())) {
    $('#micBanner').hidden = false;
    return status('Allow the microphone first', 'err');
  }
  $('#micBanner').hidden = true;
  talk = true;
  listen();
}
function endTalk(quiet) {
  talk = false;
  stopRec();
  stopSpeaking(true);
  setPhase('idle');
  if (!quiet) status('Voice conversation ended');
}
function stopRec() {
  clearTimeout(silence);
  if (!rec) return;
  const r = rec;
  rec = null;
  r.onend = r.onresult = r.onerror = null;
  try { r.abort(); } catch { rec = null; }
}
function listen() {
  if (!talk) return;
  stopRec();
  stopSpeaking(true);
  heard = '';
  interim = '';
  const r = new SR();
  rec = r;
  r.lang = cfg.lang || 'en-US';
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const x = e.results[i];
      if (x.isFinal) heard += x[0].transcript + ' ';
      else interim += x[0].transcript;
    }
    status('🎙 ' + (heard + interim).trim(), 'live');
    clearTimeout(silence);
    silence = setTimeout(utterance, cfg.pauseMs);
  };
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    if (/not-allowed|service-not-allowed/.test(e.error)) {
      $('#micBanner').hidden = false;
      endTalk(true);
      return status('Microphone blocked. Click Enable microphone', 'err');
    }
    endTalk(true);
    if (e.error === 'network') return status("The browser's speech service could not be reached (the network or proxy may block it)", 'err');
    status('Mic: ' + e.error, 'err');
  };
  r.onend = () => {
    if (rec !== r) return;
    rec = null;
    if (!talk || phase !== 'listening') return;
    if ((heard + interim).trim()) utterance();
    else listen();
  };
  try {
    r.start();
    setPhase('listening');
    status('Listening…', 'live');
  } catch (err) {
    status('Mic: ' + err.message, 'err');
  }
}
function utterance() {
  clearTimeout(silence);
  const text = (heard + ' ' + interim).replace(/\s+/g, ' ').trim();
  heard = '';
  interim = '';
  if (!text) return;
  stopRec();
  if (/^(stop|cancel|never ?mind|wait)[.!]?$/i.test(text)) {
    status('Okay');
    return listen();
  }
  if (/^(good ?bye|bye|end (the )?conversation|stop listening|that'?s all)[.!]?$/i.test(text)) {
    endTalk(true);
    return speak('Okay. Talk to you later.');
  }
  submitVoice(text);
}
async function submitVoice(text) {
  setPhase('sending');
  status('🗣 ' + text, 'live');
  try {
    if (!bridgeReady) throw new Error('the hub is not connected');
    const ctx = await shareContext(text, true, curKey, curFresh);
    const id = `p${++seq}`;
    pending.set(id, { pageHash: ctx.pageHash });
    toHub({ type: 'send', id, text: cfg.brief ? `${text} ${BRIEF}` : text, files: ctx.files.map(pack), note: ctx.note });
  } catch (e) {
    status(e.message, 'err');
    speak('Sorry, ' + e.message);
  }
}
function loadVoices() {
  voices = synth ? synth.getVoices() : [];
}
function pickVoice() {
  const v = voices.find((x) => x.name === cfg.voiceName);
  if (v) return v;
  const local = voices.filter((x) => x.localService);
  return local.find((x) => /en-US/i.test(x.lang) && /Zira|Aria|Jenny|David|Mark/i.test(x.name)) ||
    local.find((x) => /^en/i.test(x.lang)) || local[0] || voices[0] || null;
}
function clean(t) {
  return String(t)
    .replace(/\[(pasted image|attached file|attached folder): [^\]]+\]/gi, ' ')
    .replace(/\(Voice chat:[^)]*\)/g, ' ')
    .replace(/https?:\/\/[^\s)]+/g, ' a link ')
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@-]+){2,}[\\/]?/g, (m) => ' ' + (m.split(/[\\/]/).filter(Boolean).pop() || '') + ' ')
    .replace(/[*_`#>|~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function chunks(t) {
  const out = [];
  let cur = '';
  t.split(/(?<=[.!?;:])\s+/).forEach((s) => {
    while (s.length > 220) { out.push(s.slice(0, 220)); s = s.slice(220); }
    if (cur && (cur + ' ' + s).length > 220) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
  });
  if (cur) out.push(cur);
  return out;
}
function afterSpeech(my) {
  if (my !== gen) return;
  if (phase === 'speaking') setPhase('idle');
  status('');
  if (talk) listen();
}
function speak(text) {
  stopRec();
  if (synth) synth.cancel();
  const my = ++gen;
  const parts = synth ? chunks(clean(text)) : [];
  if (!parts.length) return afterSpeech(my);
  const v = pickVoice();
  setPhase('speaking');
  status('🔈 Speaking… (⏹ or Space to interrupt)', 'live');
  parts.forEach((c, i) => {
    const u = new SpeechSynthesisUtterance(c);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = cfg.rate;
    if (i === parts.length - 1) u.onend = u.onerror = () => afterSpeech(my);
    synth.speak(u);
  });
}
function stopSpeaking(quiet) {
  gen++;
  if (synth) synth.cancel();
  if (!quiet && phase === 'speaking') {
    setPhase('idle');
    status('');
  }
}
function interrupt() {
  if (phase === 'speaking') {
    stopSpeaking();
    if (talk) listen();
  } else if (talk && phase !== 'listening') listen();
}
function hotkey(k, alt) {
  if (alt && k === 't') return talk ? endTalk() : startTalk();
  if (alt && k === 'r') return toHub({ type: 'readLast' });
  if (k === 'Escape' && !$('#dlg').open) return talk ? endTalk() : stopSpeaking();
}
document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,select,textarea,button,dialog')) return;
  if (e.key === ' ') { e.preventDefault(); return interrupt(); }
  if (e.altKey && /^[tr]$/i.test(e.key)) { e.preventDefault(); return hotkey(e.key.toLowerCase(), true); }
  if (e.key === 'Escape') hotkey('Escape');
});
function fillVoices() {
  const s = $('#sVoice');
  s.innerHTML = '';
  s.add(new Option('Automatic (offline English voice)', ''));
  voices.forEach((v) => s.add(new Option(`${v.name} (${v.lang}, ${v.localService ? 'offline' : 'online'})`, v.name)));
  s.value = voices.some((v) => v.name === cfg.voiceName) ? cfg.voiceName : '';
}
function openSettings() {
  loadVoices();
  fillVoices();
  $('#sUrl').value = cfg.hubUrl;
  $('#sRate').value = cfg.rate;
  $('#sRateV').textContent = cfg.rate + '×';
  $('#sLang').value = cfg.lang;
  $('#sPause').value = cfg.pauseMs;
  $('#sBrief').checked = cfg.brief;
  $('#sAuto').checked = cfg.autoRead;
  $('#dlg').showModal();
}
function openMicPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') });
}
async function connect(raw) {
  try {
    const hubUrl = normalizeHub(raw);
    if (hubUrl === cfg.hubUrl) openHub();
    else await save({ hubUrl });
  } catch {
    status('That hub link is not valid', 'err');
  }
}
$('#sRate').addEventListener('input', () => { $('#sRateV').textContent = $('#sRate').value + '×'; });
$('#dlg').addEventListener('close', async () => {
  if ($('#dlg').returnValue !== 'save') return;
  const p = {
    voiceName: $('#sVoice').value,
    rate: +$('#sRate').value || 1,
    lang: $('#sLang').value.trim() || 'en-US',
    pauseMs: Math.min(5000, Math.max(600, +$('#sPause').value || 1500)),
    brief: $('#sBrief').checked,
    autoRead: $('#sAuto').checked,
  };
  await save(p);
  const raw = $('#sUrl').value.trim();
  if (raw && raw !== cfg.hubUrl) await connect(raw);
  render();
});
$('#talk').addEventListener('click', () => (talk ? endTalk() : startTalk()));
$('#askTab').addEventListener('click', () => ask('page'));
$('#askSel').addEventListener('click', () => ask('selection'));
$('#askShot').addEventListener('click', () => ask('shot'));
$('#autoRead').addEventListener('click', async () => {
  await save({ autoRead: !cfg.autoRead });
  if (!cfg.autoRead && !talk) stopSpeaking();
  render();
});
$('#readLast').addEventListener('click', () => toHub({ type: 'readLast' }));
$('#stop').addEventListener('click', interrupt);
$('#share').addEventListener('click', async () => {
  await save({ share: !cfg.share });
  toHub({ type: 'share', on: cfg.share });
  status(cfg.share ? 'Sharing on: your messages include this tab when it changes' : 'Sharing off');
  render();
});
$('#settings').addEventListener('click', openSettings);
$('#popout').addEventListener('click', () => chrome.windows.create({ url: chrome.runtime.getURL('sidepanel.html?popup=1'), type: 'popup', width: 480, height: 840 }));
$('#micGrant').addEventListener('click', openMicPage);
$('#sMic').addEventListener('click', openMicPage);
$('#setupSave').addEventListener('click', () => connect($('#setupUrl').value));
$('#setupUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') connect($('#setupUrl').value); });
$('#setupRetry').addEventListener('click', openHub);
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  for (const [k, v] of Object.entries(ch)) if (k in DEF) cfg[k] = v.newValue ?? DEF[k];
  if (ch.hubUrl) openHub();
  if (ch.share) toHub({ type: 'share', on: cfg.share });
  render();
});
chrome.runtime.onMessage.addListener((m) => {
  if (m && m.type === 'micGranted') {
    $('#micBanner').hidden = true;
    status('Microphone enabled. Click 🎙 to talk');
  }
});
chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((id, info, tab) => { if (tab.active && (info.title || info.url)) refreshTab(); });
chrome.windows.onFocusChanged.addListener(refreshTab);
(async () => {
  cfg = { ...DEF, ...(await chrome.storage.local.get(Object.keys(DEF))) };
  if (POPUP) $('#popout').hidden = true;
  if (synth) {
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
  }
  render();
  refreshTab();
  openHub();
})();
