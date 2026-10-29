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
  async function upload(file) {
    const r = await fetch('/__paste/upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'X-ChipAgents-Paste': '1' },
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
})();
