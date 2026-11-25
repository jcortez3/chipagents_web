// jcortez3
(() => {
  if (!location.pathname.startsWith('/hub')) return;
  const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  const TOKEN_KEY = 'chipagents-web-token';
  const earlyToken = new URL(location.href).searchParams.get('token') || '';
  const token = () => {
    if (earlyToken) return earlyToken;
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  };
  const isProxy = () => !!document.querySelector('script[src="/__paste/inject.js"]');
  const parentOrigin = (location.ancestorOrigins && location.ancestorOrigins[0]) || '';
  const embedded = window !== window.top && parentOrigin === EXT_ORIGIN;
  if (window === window.top) {
    const capture = () => {
      const t = token();
      if (!t || !isProxy()) return;
      const hubUrl = `${location.origin}/hub?token=${encodeURIComponent(t)}`;
      chrome.storage.local.get('hubUrl', (o) => {
        if (o.hubUrl !== hubUrl) chrome.storage.local.set({ hubUrl });
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', capture, { once: true });
    else capture();
    return;
  }
  if (!embedded) return;
  const ZW = '\u200B';
  const IMG = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const post = (msg) => window.parent.postMessage({ caCompanion: 1, ...msg }, EXT_ORIGIN);
  let share = false;
  let bypass = false;
  let armed = false;
  let seq = 0;
  const pendingCtx = new Set();
  const key = () => {
    const u = new URL(location.href);
    u.searchParams.delete('token');
    const first = document.querySelector('[data-assistant-citation-source]');
    return `${u.pathname}${u.search}${u.hash}#${first ? first.getAttribute('data-assistant-citation-source') : ''}`;
  };
  const composer = () =>
    document.querySelector('.hub-steer-textarea:not(:disabled)') ||
    document.querySelector('.hub-new-thread-composer textarea:not(:disabled)') ||
    [...document.querySelectorAll('textarea')].filter((t) => t.offsetParent && !t.disabled).pop() || null;
  const isComposer = (el) => !!el && el.tagName === 'TEXTAREA' && !!el.closest('.hub-composer-wrapper,.hub-new-thread-composer');
  const onNewThread = () => !!document.querySelector('.hub-new-thread-composer');
  async function waitComposer(ms) {
    const t0 = Date.now();
    for (;;) {
      const c = composer();
      if (c || Date.now() - t0 > ms) return c;
      await sleep(200);
    }
  }
  function setValue(el, v) {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const pressEnter = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  async function upload(blob, name) {
    const r = await fetch('/__paste/upload', {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'X-ChipAgents-Paste': '1',
        'x-access-token': token(),
        'X-File-Name': encodeURIComponent(name || 'file'),
      },
      body: blob,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('the hub link expired. Open the new link from the launcher window in this browser');
    if (!r.ok || !j.path) throw new Error(j.error || `upload failed (HTTP ${r.status})`);
    return j.path;
  }
  async function doSend(m) {
    try {
      const ta = await waitComposer(10000);
      if (!ta) throw new Error('no message box in the hub. Open a conversation or New thread in the panel');
      const marks = [];
      for (const f of m.files || []) {
        const p = await upload(f.blob, f.name);
        marks.push(IMG.includes(f.blob.type) ? `[pasted image: ${p}]` : `[attached file: ${p}]`);
      }
      const typed = ta.value.split(ZW).join('').trim();
      const body = [typed, m.text].filter(Boolean).join(' ') || m.fallback || '';
      const full = [marks.join(' '), m.note, body].filter(Boolean).join(' ');
      if (!full) throw new Error('nothing to send');
      const from = key();
      const fresh = onNewThread();
      ta.focus();
      setValue(ta, full);
      await sleep(80);
      arm();
      bypass = true;
      try { pressEnter(ta); } finally { bypass = false; }
      post({ type: 'sent', id: m.id, key: from, fresh });
      await sleep(1500);
      if (ta.isConnected && ta.value === full) post({ type: 'error', id: m.id, message: 'The message is in the hub box but was not sent. Press Enter there.' });
    } catch (e) {
      post({ type: 'error', id: m.id, message: e.message });
    }
  }
  function msgText(m) {
    const c = (m.querySelector('.hub-line-agent') || m).cloneNode(true);
    c.querySelectorAll('pre,.markdown-code-embed').forEach((n) => n.replaceWith(' Code block omitted. '));
    c.querySelectorAll('table,.markdown-table-embed').forEach((n) => n.replaceWith(' Table omitted. '));
    c.querySelectorAll('li,p,h1,h2,h3,h4,h5,h6,br,div').forEach((n) => n.append(/[.!?:]\s*$/.test(n.textContent) ? ' ' : '. '));
    return (c.textContent || '').replace(/\s+/g, ' ').replace(/(\.\s*){2,}/g, '. ').trim();
  }
  const lastAgent = () => {
    const all = document.querySelectorAll('.hub-agent-message');
    return all.length ? all[all.length - 1] : null;
  };
  let armedAt = 0;
  let sawActive = false;
  let idleSince = 0;
  let baseline = null;
  function arm() {
    armed = true;
    armedAt = Date.now();
    sawActive = false;
    idleSince = 0;
    baseline = lastAgent();
  }
  function watch() {
    if (!armed) return;
    if (document.querySelector('.hub-steer-stop')) {
      sawActive = true;
      idleSince = 0;
      return;
    }
    if (!sawActive) {
      if (Date.now() - armedAt > 60000) armed = false;
      return;
    }
    if (!idleSince) idleSince = Date.now();
    if (Date.now() - idleSince < 700) return;
    armed = false;
    const m = lastAgent();
    if (m && m !== baseline) post({ type: 'reply', text: msgText(m) });
  }
  function readLast() {
    const all = document.querySelectorAll('.hub-agent-message');
    if (!all.length) return post({ type: 'error', message: 'No reply to read yet' });
    post({ type: 'reply', text: msgText(all[all.length - 1]), manual: true });
  }
  async function authOk() {
    try {
      const r = await fetch('/hub/api/settings', { headers: { 'x-access-token': token() }, cache: 'no-store' });
      return r.status !== 401 && r.status !== 403;
    } catch {
      return false;
    }
  }
  async function ready() {
    post({ type: 'ready', key: key(), fresh: onNewThread(), auth: await authOk(), proxy: isProxy() });
  }
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || e.origin !== EXT_ORIGIN || !e.data || !e.data.caCompanion) return;
    const m = e.data;
    if (m.type === 'send') doSend(m);
    else if (m.type === 'context' && pendingCtx.delete(m.id)) doSend(m);
    else if (m.type === 'share') share = !!m.on;
    else if (m.type === 'readLast') readLast();
    else if (m.type === 'ping') ready();
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.isTrusted && ev.altKey && !ev.ctrlKey && !ev.metaKey && /^[tr]$/i.test(ev.key)) {
      ev.preventDefault();
      return post({ type: 'key', key: ev.key.toLowerCase(), alt: true });
    }
    if (ev.isTrusted && ev.key === 'Escape') post({ type: 'key', key: 'Escape' });
    if (bypass || !ev.isTrusted || ev.key !== 'Enter' || ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey || ev.isComposing) return;
    const ta = ev.target;
    if (!isComposer(ta)) return;
    const text = ta.value.split(ZW).join('').trim();
    if (!text) return;
    arm();
    if (!share || /^\//.test(text)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const id = `b${++seq}`;
    pendingCtx.add(id);
    post({ type: 'needContext', id, text, key: key(), fresh: onNewThread() });
    setTimeout(() => { if (pendingCtx.delete(id)) doSend({ id, files: [] }); }, 15000);
  }, true);
  window.addEventListener('click', (ev) => {
    const b = ev.target instanceof Element && ev.target.closest('.hub-steer-send');
    if (b && !b.classList.contains('hub-steer-stop')) arm();
  }, true);
  let lastState = '';
  setInterval(() => {
    const k = key();
    const fresh = onNewThread();
    if (k + fresh !== lastState) {
      lastState = k + fresh;
      post({ type: 'path', key: k, fresh });
    }
  }, 700);
  setInterval(watch, 300);
  const start = () => ready();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
