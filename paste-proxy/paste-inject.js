(() => {
  if (window.__chipagentsPasteInstalled) return;
  window.__chipagentsPasteInstalled = true;
  const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const isEditable = (el) =>
    !!el && (el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' && /^(text|search)?$/i.test(el.type || '')) ||
      el.isContentEditable);
  function toast(msg, isErr) {
    const d = document.createElement('div');
    d.setAttribute('data-ca-img-root', '');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:8px 12px;' +
      'border-radius:6px;font:13px sans-serif;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.4);' +
      'background:' + (isErr ? '#b3261e' : '#2e7d32');
    document.body.appendChild(d);
    setTimeout(() => d.remove(), isErr ? 6000 : 3000);
  }
  function insertText(el, text) {
    el.focus();
    if (document.execCommand && document.execCommand('insertText', false, text)) return;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      const s = el.selectionStart ?? el.value.length;
      const e = el.selectionEnd ?? el.value.length;
      setter.call(el, el.value.slice(0, s) + text + el.value.slice(e));
      el.selectionStart = el.selectionEnd = s + text.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  const token = () => {
    try { return localStorage.getItem('chipagents-web-token') || ''; } catch { return ''; }
  };
  async function upload(file) {
    const r = await fetch('/__paste/upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'X-ChipAgents-Paste': '1', 'x-access-token': token() },
      body: file,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.path) throw new Error(j.error || 'HTTP ' + r.status);
    return j.path;
  }
  window.addEventListener('paste', async (ev) => {
    const el = document.activeElement;
    const dt = ev.clipboardData;
    if (!dt || !isEditable(el)) return;
    if ((dt.getData('text/plain') || '').trim()) return;
    const files = [...dt.items]
      .filter((i) => i.kind === 'file' && TYPES.includes(i.type))
      .map((i) => i.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    try {
      const paths = [];
      for (const f of files) paths.push(await upload(f));
      insertText(el, paths.map((p) => '[pasted image: ' + p + ']').join(' ') + ' ');
      toast('Image saved: ' + paths.map((p) => p.split('/').pop()).join(', '));
    } catch (e) {
      toast('Image paste failed: ' + e.message, true);
    }
  }, true);
  const DIR = window.__CA_PASTE_DIR || '';
  const IMG_CMD = /^\s*\/img\s+([\s\S]+)$/i;
  let bypassEnter = false;
  const stamp = () => {
    const d = new Date();
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
      `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${p(d.getMilliseconds(), 3)}`;
  };
  const textOf = (el) => (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.innerText) || '';
  function replaceAll(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.select();
    else document.execCommand('selectAll', false);
    insertText(el, text);
  }
  function imageRequest(prompt, file) {
    return `Create an image: ${prompt.trim()} — Draw it as one standalone SVG file (xmlns, width, height and ` +
      'viewBox set; inline styles only; no <script>, no external images, links or fonts). ' +
      `Save it with the Edit tool to ${file} and create no other files. Reply with the saved path.`;
  }
  window.addEventListener('keydown', (ev) => {
    if (bypassEnter || ev.key !== 'Enter' || ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey || ev.isComposing) return;
    const el = document.activeElement;
    if (!isEditable(el)) return;
    const m = textOf(el).match(IMG_CMD);
    if (!m) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (!DIR) return toast('Image request failed: image folder unknown', true);
    const name = `gen_${stamp()}.svg`;
    replaceAll(el, imageRequest(m[1], `${DIR}/${name}`));
    setTimeout(() => {
      bypassEnter = true;
      try {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      } finally {
        bypassEnter = false;
      }
      toast('Image requested: ' + name + ' (press Enter if it was not sent)');
    }, 60);
  }, true);
  const IMG_EXT = /\.(?:svg|png|jpe?g|gif|webp)$/i;
  const IMG_HINT = /\.(?:svg|png|jpe?g|gif|webp)\b/i;
  const GEN_NAME = /(?:^|[\\/])(?:gen|paste)_\d{8}_\d{6}_\d{3}\.\w+$/i;
  const BLOCK = 'p,li,pre,td,blockquote,h1,h2,h3,h4,h5,h6,div';
  const SKIP = '[data-ca-img-root],textarea,input,script,style,[contenteditable="true"],[contenteditable=""]';
  const loaded = new Set();
  function lightbox(src, name) {
    const o = document.createElement('div');
    o.setAttribute('data-ca-img-root', '');
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.85);display:flex;' +
      'align-items:center;justify-content:center;cursor:zoom-out;';
    const i = new Image();
    i.src = src;
    i.alt = name;
    i.style.cssText = 'max-width:95vw;max-height:95vh;background:#fff;border-radius:6px;';
    o.appendChild(i);
    const close = () => { o.remove(); window.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    o.addEventListener('click', close);
    window.addEventListener('keydown', onKey, true);
    document.body.appendChild(o);
  }
  const baseName = (p) => p.split(/[\\/]/).pop().toLowerCase();
  function preview(file) {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-ca-img-root', '');
    wrap.dataset.caImg = baseName(file);
    wrap.style.cssText = 'margin:6px 0;';
    const img = new Image();
    img.alt = file;
    img.title = 'Click to enlarge: ' + file;
    img.style.cssText = 'display:none;max-width:min(480px,100%);max-height:360px;background:#fff;' +
      'border:1px solid rgba(127,127,127,.4);border-radius:6px;cursor:zoom-in;';
    const base = '/__img?path=' + encodeURIComponent(file) + '&token=' + encodeURIComponent(token());
    const maxTries = GEN_NAME.test(file) ? 150 : 15;
    let tries = 0;
    const load = () => { img.src = loaded.has(file) ? base : base + '&t=' + Date.now(); };
    img.onload = () => { loaded.add(file); img.style.display = 'block'; };
    img.onerror = () => {
      img.style.display = 'none';
      if (++tries < maxTries && wrap.isConnected) setTimeout(load, 2000);
    };
    img.onclick = () => lightbox(img.src, file);
    wrap.appendChild(img);
    load();
    return wrap;
  }
  function pathsInText(s) {
    const out = [];
    for (let tok of s.split(/[\s()[\]<>"'`|]+/)) {
      tok = tok.replace(/^[\w-]+\(/, '').replace(/[.,;:!?)\]}]+$/, '');
      if (tok.length > 4 && IMG_EXT.test(tok) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(tok)) out.push(tok);
    }
    return out;
  }
  function linkPath(a) {
    let h = (a.getAttribute('href') || '').split(/[?#]/)[0];
    if (/^file:\/\//i.test(h)) h = h.replace(/^file:\/\/(localhost)?/i, '');
    else if (/^[a-z][a-z0-9+.-]*:/i.test(h) && !/^[A-Za-z]:[\\/]/.test(h)) return '';
    try { h = decodeURIComponent(h); } catch { return ''; }
    h = h.replace(/:\d+(:\d+)?$/, '');
    return IMG_EXT.test(h) ? h : '';
  }
  function attach(el, file) {
    const host = el.closest(BLOCK) || el;
    const key = baseName(file);
    if ([...host.children].some((c) => c.dataset && c.dataset.caImg === key)) return;
    host.appendChild(preview(file));
  }
  function scan() {
    for (const a of document.querySelectorAll('a[href]')) {
      if (a.closest(SKIP)) continue;
      const f = linkPath(a);
      if (f) attach(a.parentElement || a, f);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest(SKIP) || !IMG_HINT.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        const a = p.closest('a[href]');
        return a && linkPath(a) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    const hits = [];
    while (walker.nextNode()) hits.push(walker.currentNode);
    for (const n of hits) for (const f of new Set(pathsInText(n.nodeValue))) attach(n.parentElement, f);
  }
  let pending = null;
  function startPreviews() {
    new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => { pending = null; scan(); }, 400);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
  }
  if (document.body) startPreviews();
  else document.addEventListener('DOMContentLoaded', startPreviews, { once: true });
})();
