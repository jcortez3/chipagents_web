(() => {
  if (window.__chipagentsPasteInstalled) return;
  window.__chipagentsPasteInstalled = true;
  const TOKEN_KEY = 'chipagents-web-token';
  let seenToken = '';
  const remember = (t) => { if (t && typeof t === 'string') seenToken = t; };
  const fromUrl = (u) => {
    try { remember(new URL(String(u), location.href).searchParams.get('token')); } catch { seenToken = seenToken || ''; }
  };
  function fromHeaders(h) {
    if (!h) return;
    if (h instanceof Headers) {
      remember(h.get('x-access-token'));
      return remember((/^Bearer\s+(\S+)$/i.exec(h.get('authorization') || '') || [])[1]);
    }
    const pairs = Array.isArray(h) ? h : Object.entries(h);
    for (const [k, v] of pairs) {
      const name = String(k).toLowerCase();
      if (name === 'x-access-token') remember(v);
      else if (name === 'authorization') remember((/^Bearer\s+(\S+)$/i.exec(String(v)) || [])[1]);
    }
  }
  fromUrl(location.href);
  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      if (input instanceof Request) { fromHeaders(input.headers); fromUrl(input.url); } else fromUrl(input);
      if (init) fromHeaders(init.headers);
    } catch {
      seenToken = seenToken || '';
    }
    return nativeFetch.apply(window, arguments);
  };
  for (const name of ['WebSocket', 'EventSource']) {
    const Native = window[name];
    if (typeof Native !== 'function') continue;
    const Wrapped = function (url, ...rest) {
      fromUrl(url);
      return new Native(url, ...rest);
    };
    Wrapped.prototype = Native.prototype;
    Object.setPrototypeOf(Wrapped, Native);
    window[name] = Wrapped;
  }
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
  const LOOKS_LIKE_TOKEN = /^[\w.~+/=-]{16,512}$/;
  const token = () => {
    if (seenToken) return seenToken;
    for (const store of [() => localStorage, () => sessionStorage]) {
      try {
        const s = store();
        const v = s.getItem(TOKEN_KEY);
        if (v) return v;
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          const val = /token/i.test(k || '') ? s.getItem(k) : '';
          if (val && LOOKS_LIKE_TOKEN.test(val)) return val;
        }
      } catch {
        continue;
      }
    }
    return '';
  };
  const BUILD = window.__CA_PASTE_BUILD || 'unknown';
  const MAX_FILE = 100 * 1048576;
  const MAX_DIR = 1024 * 1048576;
  const MAX_FILES = 2000;
  const human = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  async function upload(file, extra) {
    const r = await fetch('/__paste/upload', {
      method: 'POST',
      headers: Object.assign({
        'Content-Type': file.type || 'application/octet-stream', 'X-ChipAgents-Paste': '1', 'x-access-token': token(),
        'X-File-Name': encodeURIComponent(file.name || 'file'),
      }, extra),
      body: file,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) {
      throw new Error((token() ? 'hub access token was rejected. Reopen the link printed in the launcher window'
        : 'this tab has no hub access token. Open the link printed in the launcher window') + ` (paste build ${BUILD})`);
    }
    if (!r.ok || !j.path) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }
  function setValue(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const ZW = '\u200B';
  const tray = { box: null, el: null, items: [] };
  const unsent = () => tray.items.filter((i) => !i.sent);
  const hasPending = (el) => !!el && el === tray.el && 'value' in el && unsent().length > 0;
  function keepSendable(el) {
    if (hasPending(el) && el.value === '') setValue(el, ZW);
  }
  function stripZw(el) {
    if ('value' in el && el.value.includes(ZW)) setValue(el, el.value.split(ZW).join(''));
  }
  function attachPending(el) {
    const items = unsent().filter((i) => i.marker && !i.busy);
    if (!items.length) return;
    const typed = el.value.split(ZW).join('');
    const marks = items.map((i) => i.marker).join(' ');
    setValue(el, typed.trim() ? marks + ' ' + typed : marks);
    for (const i of items) i.sent = true;
  }
  let waiting = false;
  const busy = () => unsent().some((i) => i.busy);
  function sendWhenReady(el, fn) {
    if (waiting) return;
    const t0 = Date.now();
    const go = () => {
      if (busy() && Date.now() - t0 < 600000) return void setTimeout(go, 200);
      waiting = false;
      if (busy()) return toast('Attach failed: folder upload still running after 10 minutes', true);
      attachPending(el);
      resend(fn);
    };
    waiting = true;
    if (busy()) toast('Waiting for folder upload to finish\u2026');
    go();
  }
  function placeTray() {
    if (!tray.box) return;
    if (!tray.items.length || !tray.el || !tray.el.isConnected) { tray.box.style.display = 'none'; return; }
    const r = tray.el.getBoundingClientRect();
    tray.box.style.display = 'flex';
    tray.box.style.left = Math.max(4, r.left) + 'px';
    tray.box.style.bottom = (window.innerHeight - r.top + 6) + 'px';
  }
  function dropThumb(item) {
    if (item.url) URL.revokeObjectURL(item.url);
    item.node.remove();
    tray.items = tray.items.filter((i) => i !== item);
    placeTray();
  }
  function syncTray() {
    if (!tray.items.length) return;
    const gone = !tray.el || !tray.el.isConnected;
    const text = gone ? '' : (tray.el.value ?? tray.el.innerText ?? '');
    for (const item of [...tray.items]) if (gone || (item.sent && !text.includes(item.marker))) dropThumb(item);
    if (!gone) keepSendable(tray.el);
    placeTray();
  }
  function useTray(el) {
    if (!tray.box) {
      tray.box = document.createElement('div');
      tray.box.setAttribute('data-ca-img-root', '');
      tray.box.style.cssText = 'position:fixed;z-index:2147483645;display:none;gap:6px;padding:6px;' +
        'background:rgba(30,30,30,.85);border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.4);max-width:70vw;overflow-x:auto;';
      document.body.appendChild(tray.box);
      window.addEventListener('resize', placeTray);
      document.addEventListener('scroll', placeTray, true);
      document.addEventListener('input', syncTray, true);
      setInterval(syncTray, 700);
    }
    if (tray.el !== el) { for (const i of [...tray.items]) dropThumb(i); tray.el = el; }
  }
  function addItem(el, item, content, what) {
    item.node.style.cssText = 'position:relative;flex:0 0 auto;';
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '\u2715';
    x.title = 'Remove ' + what;
    x.style.cssText = 'position:absolute;top:-4px;right:-4px;width:18px;height:18px;padding:0;border:0;' +
      'border-radius:50%;background:#b3261e;color:#fff;font:11px/18px sans-serif;cursor:pointer;';
    x.addEventListener('mousedown', (e) => e.preventDefault());
    x.addEventListener('click', () => {
      dropThumb(item);
      if (el.isConnected && !hasPending(el)) stripZw(el);
      el.focus();
    });
    item.node.append(content, x);
    tray.box.appendChild(item.node);
    tray.items.push(item);
    placeTray();
    return item;
  }
  function addThumb(el, file, marker) {
    const item = { marker, sent: false, url: URL.createObjectURL(file), node: document.createElement('div') };
    const img = new Image();
    img.src = item.url;
    img.title = marker.slice(15, -1).split('/').pop();
    img.style.cssText = 'display:block;height:56px;max-width:120px;object-fit:cover;border-radius:4px;background:#fff;';
    return addItem(el, item, img, 'image');
  }
  function addChip(el, text, title, marker, what) {
    const item = { marker, sent: false, node: document.createElement('div'), label: document.createElement('div') };
    item.label.textContent = text;
    item.label.title = title;
    item.label.style.cssText = 'height:56px;line-height:56px;padding:0 12px;max-width:260px;overflow:hidden;white-space:nowrap;' +
      'text-overflow:ellipsis;border-radius:4px;background:rgba(255,255,255,.14);color:#fff;font:12px/56px sans-serif;';
    return addItem(el, item, item.label, what);
  }
  async function attachFiles(el, files, verb) {
    const done = [];
    for (const f of files) {
      const img = TYPES.includes(f.type);
      if (f.size > MAX_FILE) { toast(`${f.name} is larger than 100 MB`, true); continue; }
      try {
        const path = (await upload(f)).path;
        done.push({ f, img, path, marker: img ? `[pasted image: ${path}]` : `[attached file: ${path}]` });
      } catch (e) {
        toast((img ? `Image ${verb === 'saved' ? 'paste' : 'drop'} failed: ` : 'Attach failed: ') + e.message, true);
      }
    }
    if (!done.length) return;
    useTray(el);
    for (const d of done) {
      if (d.img) addThumb(el, d.f, d.marker);
      else addChip(el, `\u{1F4C4} ${d.f.name} \u00B7 ${human(d.f.size)}`, d.path, d.marker, 'file');
    }
    el.focus();
    keepSendable(el);
    const names = done.map((d) => d.img ? d.path.split('/').pop() : d.f.name).join(', ');
    toast((done.every((d) => d.img) ? `Image ${verb}: ` : 'Attached: ') + names);
  }
  const readAll = (reader) => new Promise((res, rej) => {
    const all = [];
    const next = () => reader.readEntries((batch) => {
      if (!batch.length) return res(all);
      all.push(...batch);
      next();
    }, rej);
    next();
  });
  async function walk(entry, prefix, out) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (out.length > MAX_FILES) return out;
    if (entry.isFile) out.push({ file: await new Promise((res, rej) => entry.file(res, rej)), rel });
    else if (entry.isDirectory) for (const e of await readAll(entry.createReader())) await walk(e, rel, out);
    return out;
  }
  async function attachFolder(el, dir) {
    const name = dir.name;
    useTray(el);
    const item = addChip(el, `\u{1F4C1} ${name} \u00B7 scanning\u2026`, name, '', 'folder');
    item.busy = true;
    keepSendable(el);
    const label = (s) => { item.label.textContent = `\u{1F4C1} ${name} \u00B7 ${s}`; };
    const live = () => tray.items.includes(item);
    const fail = (msg) => {
      if (!live()) return;
      dropThumb(item);
      toast('Attach failed: ' + msg, true);
      if (el.isConnected && !hasPending(el)) stripZw(el);
    };
    try {
      const all = await walk(dir, '', []);
      if (all.length > MAX_FILES) return fail(`${name} has more than ${MAX_FILES} files`);
      if (all.reduce((n, f) => n + f.file.size, 0) > MAX_DIR) return fail(`${name} is larger than 1 GB`);
      const files = all.filter(({ file }) => {
        if (file.size <= MAX_FILE) return true;
        toast(`${file.name} is larger than 100 MB`, true);
        return false;
      });
      if (!files.length) return fail(`${name} has no files to upload`);
      const total = files.reduce((n, f) => n + f.file.size, 0);
      const batch = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const queue = [...files];
      let count = 0;
      let folder = '';
      label(`0/${files.length}\u2026`);
      const worker = async () => {
        while (queue.length && live()) {
          const { file, rel } = queue.shift();
          const j = await upload(file, { 'X-Batch': batch, 'X-Rel-Path': encodeURIComponent(rel) });
          folder = folder || j.folder || '';
          if (live()) label(`${++count}/${files.length}\u2026`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
      if (!live()) return;
      if (!folder) return fail('server did not report the folder path');
      item.marker = `[attached folder: ${folder}]`;
      item.busy = false;
      item.label.title = folder;
      label(`${files.length} files \u00B7 ${human(total)}`);
      toast(`Folder attached: ${name} (${files.length} files)`);
    } catch (e) {
      fail(e.message);
    }
  }
  function grab(dt) {
    const out = [];
    for (const i of [...(dt.items || [])]) {
      if (i.kind !== 'file') continue;
      const entry = i.webkitGetAsEntry ? i.webkitGetAsEntry() : null;
      if (entry && entry.isDirectory) out.push({ dir: entry });
      else {
        const f = i.getAsFile();
        if (f) out.push({ file: f });
      }
    }
    if (!out.length) for (const f of [...(dt.files || [])]) out.push({ file: f });
    return out;
  }
  function take(el, got, verb) {
    const files = got.filter((g) => g.file).map((g) => g.file);
    if (files.length) attachFiles(el, files, verb);
    for (const g of got) if (g.dir) attachFolder(el, g.dir);
  }
  window.addEventListener('paste', (ev) => {
    const el = document.activeElement;
    const dt = ev.clipboardData;
    if (!dt || !isEditable(el)) return;
    if ((dt.getData('text/plain') || '').trim()) return;
    const got = grab(dt);
    if (!got.length) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    take(el, got, 'saved');
  }, true);
  const draggingFiles = (dt) => !!dt &&
    ([...(dt.types || [])].includes('Files') || [...(dt.items || [])].some((i) => i.kind === 'file'));
  const composer = (target) => {
    if (isEditable(target)) return target;
    if (isEditable(document.activeElement)) return document.activeElement;
    return [...document.querySelectorAll('textarea')].filter((t) => t.offsetParent && !t.disabled).pop() || null;
  };
  let dropHint = null;
  const hideHint = () => { if (dropHint) dropHint.style.display = 'none'; };
  window.addEventListener('dragover', (ev) => {
    if (!draggingFiles(ev.dataTransfer)) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    const el = composer(ev.target);
    if (!el) return;
    if (!dropHint) {
      dropHint = document.createElement('div');
      dropHint.setAttribute('data-ca-img-root', '');
      dropHint.textContent = 'Drop files or folders to attach';
      dropHint.style.cssText = 'position:fixed;z-index:2147483644;pointer-events:none;border:2px dashed #4fc3f7;' +
        'border-radius:8px;background:rgba(79,195,247,.12);color:#4fc3f7;font:600 13px sans-serif;' +
        'display:flex;align-items:center;justify-content:center;';
      document.body.appendChild(dropHint);
    }
    const r = el.getBoundingClientRect();
    Object.assign(dropHint.style, { display: 'flex', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  }, true);
  window.addEventListener('dragleave', (ev) => { if (!ev.relatedTarget) hideHint(); }, true);
  window.addEventListener('drop', (ev) => {
    hideHint();
    const dt = ev.dataTransfer;
    if (!draggingFiles(dt)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const el = composer(ev.target);
    if (!el) return toast('Attach failed: chat box not found', true);
    const got = grab(dt);
    if (!got.length) return toast('Attach failed: nothing to attach', true);
    el.focus();
    take(el, got, 'attached');
  }, true);
  const DIR = window.__CA_GEN_DIR || '';
  const SVG2IMG = window.__CA_SVG2IMG || '';
  const IMG_CMD = /^\s*\/img(?:\s+(png|jpe?g|svg)\b)?\s+([\s\S]+)$/i;
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
  function imageRequest(prompt, svg, out) {
    const draw = `Create an image: ${prompt.trim()} — Draw it as one standalone SVG file (xmlns, width, height and ` +
      'viewBox set; inline styles only; no <script>, no external images, links or fonts). ' +
      `Save it with the Edit tool to ${svg}`;
    if (!out) return draw + ' and create no other files. Reply with the saved path.';
    return draw + `, then convert it by running: python3 "${SVG2IMG}" "${svg}" "${out}" — ` +
      `Create no other files. Reply with the ${out.split('.').pop().toUpperCase()} path: ${out}`;
  }
  function resend(fn) {
    setTimeout(() => {
      bypassEnter = true;
      try { fn(); } finally { bypassEnter = false; }
    }, 60);
  }
  const pressEnter = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  window.addEventListener('keydown', (ev) => {
    if (bypassEnter || ev.key !== 'Enter' || ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey || ev.isComposing) return;
    const el = document.activeElement;
    if (!isEditable(el)) return;
    const m = textOf(el).split(ZW).join('').match(IMG_CMD);
    if (!m) {
      if (!hasPending(el)) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return sendWhenReady(el, () => pressEnter(el));
    }
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (!DIR) return toast('Image request failed: image folder unknown', true);
    const fmt = (m[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
    if (fmt !== 'svg' && !SVG2IMG) return toast('Image request failed: converter unknown', true);
    const base = `${DIR}/gen_${stamp()}`;
    const out = fmt === 'svg' ? '' : `${base}.${fmt}`;
    const name = (out || `${base}.svg`).split('/').pop();
    replaceAll(el, imageRequest(m[2], `${base}.svg`, out));
    sendWhenReady(el, () => {
      pressEnter(el);
      toast('Image requested: ' + name + ' (press Enter if it was not sent)');
    });
  }, true);
  window.addEventListener('submit', (ev) => {
    const form = ev.target;
    if (bypassEnter || !(form instanceof HTMLFormElement) || !tray.el || !form.contains(tray.el) || !hasPending(tray.el)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const by = ev.submitter && form.contains(ev.submitter) ? ev.submitter : undefined;
    sendWhenReady(tray.el, () => form.requestSubmit(by));
  }, true);
  window.addEventListener('click', (ev) => {
    const btn = ev.target instanceof Element && ev.target.closest('.hub-background-action');
    if (bypassEnter || !btn || !hasPending(tray.el)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    sendWhenReady(tray.el, () => btn.click());
  }, true);
  const IMG_EXT = /\.(?:svg|png|jpe?g|gif|webp)$/i;
  const IMG_HINT = /\.(?:svg|png|jpe?g|gif|webp)\b/i;
  const GEN_NAME = /(?:^|[\\/])(?:gen|paste)_\d{8}_\d{6}_\d{3}\.\w+$/i;
  const BLOCK = 'p,li,pre,td,blockquote,h1,h2,h3,h4,h5,h6,div';
  const MARK = /\[pasted image: ([^\]\n]+?\.(?:png|jpe?g|gif|webp))\]\s?/gi;
  const FMARK = /\[attached (file|folder): ([^\]\n]+)\]\s?/g;
  const FMARK_HINT = /\[attached (?:file|folder): /;
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
    const base = () => '/__img?path=' + encodeURIComponent(file) + '&token=' + encodeURIComponent(token());
    const maxTries = GEN_NAME.test(file) ? 150 : 15;
    let tries = 0;
    const load = () => { img.src = loaded.has(file) ? base() : base() + '&t=' + Date.now(); };
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
  const leaf = (p) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
  function chip(n, kind, path) {
    const host = n.parentElement.closest(BLOCK) || n.parentElement;
    const key = kind + ':' + path;
    if ([...host.querySelectorAll('[data-ca-file]')].some((c) => c.dataset.caFile === key)) return;
    const c = document.createElement('span');
    c.setAttribute('data-ca-img-root', '');
    c.dataset.caFile = key;
    c.textContent = (kind === 'file' ? '\u{1F4C4} ' : '\u{1F4C1} ') + leaf(path);
    c.title = path;
    c.style.cssText = 'display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;' +
      'background:rgba(127,127,127,.18);font-size:12px;margin:2px;' + (kind === 'file' ? 'cursor:pointer;' : '');
    if (kind === 'file') {
      c.addEventListener('click', () => window.open('/__file?path=' + encodeURIComponent(path) +
        '&token=' + encodeURIComponent(token()), '_blank', 'noopener'));
    }
    n.parentNode.insertBefore(c, n);
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
        const v = n.nodeValue;
        if (!p || p.closest(SKIP) || !(IMG_HINT.test(v) || FMARK_HINT.test(v))) return NodeFilter.FILTER_REJECT;
        const a = p.closest('a[href]');
        return a && linkPath(a) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    const hits = [];
    while (walker.nextNode()) hits.push(walker.currentNode);
    for (const n of hits) {
      const files = [...n.nodeValue.matchAll(FMARK)];
      if (files.length) {
        for (const m of files) chip(n, m[1], m[2].trim());
        n.nodeValue = n.nodeValue.replace(FMARK, '');
      }
      MARK.lastIndex = 0;
      const marks = [...n.nodeValue.matchAll(MARK)];
      if (marks.length) {
        for (const m of marks) attach(n.parentElement, m[1]);
        n.nodeValue = n.nodeValue.replace(MARK, '');
      }
      const found = [...new Set(pathsInText(n.nodeValue))];
      const stems = new Set(found.filter((f) => !/\.svg$/i.test(f)).map((f) => f.replace(/\.\w+$/, '')));
      for (const f of found) if (!/\.svg$/i.test(f) || !stems.has(f.replace(/\.\w+$/, ''))) attach(n.parentElement, f);
    }
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
