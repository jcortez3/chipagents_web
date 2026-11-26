// jcortez3
(() => {
  const api = window.__caPasteApi;
  if (!api || window.__caSkillsInstalled) return;
  window.__caSkillsInstalled = true;
  const { token, toast, human, walk } = api;
  const HINT = 'Start a new chat (or type /reload) to use it.';
  const MAX_FILES = 2000;
  const C = { bg: '#1e1f22', row: 'rgba(255,255,255,.05)', line: 'rgba(255,255,255,.12)', text: '#e8e8e8', dim: '#a3a3a3',
    green: '#2e7d32', red: '#b3261e', amber: '#b26a00', blue: '#1565c0' };
  const INPUT = `padding:5px 8px;border-radius:6px;border:1px solid ${C.line};background:#2b2d31;color:${C.text};font:inherit;`;
  const st = { root: null, body: null, tabs: null, tab: 'installed', data: null, error: '', loading: false, q: '', scope: 'all',
    target: 'user', stages: [], showBackups: false, backups: null };
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(3)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const btn = (label, title, onClick, color, disabled) => h('button', {
    type: 'button', title, disabled: !!disabled,
    style: `padding:4px 10px;border-radius:6px;border:0;font:inherit;color:#fff;cursor:${disabled ? 'default' : 'pointer'};` +
      `opacity:${disabled ? '.5' : '1'};background:${color || 'rgba(255,255,255,.14)'};`,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) onClick(e); },
  }, label);
  const badge = (text, color, title) => h('span', { title: title || '',
    style: `padding:1px 7px;border-radius:9px;font-size:11px;color:#fff;background:${color || 'rgba(255,255,255,.16)'};` }, text);
  const note = (text, color) => h('div', { style: `margin:4px 0;color:${color || C.dim};white-space:pre-wrap;` }, text);
  async function call(route, body) {
    const opts = body === undefined ? { headers: { 'x-access-token': token() }, cache: 'no-store' } : {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'X-ChipAgents-Paste': '1', 'x-access-token': token() },
    };
    const r = await fetch('/__skills/' + route, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { kind: j.kind || '', status: r.status });
    return j;
  }
  async function load(refresh) {
    st.loading = true;
    render();
    try {
      st.data = await call('list' + (refresh ? '?refresh=1' : ''));
      st.error = '';
      if (!st.data.scopes.some((s) => s.id === st.target)) st.target = 'user';
      if (st.showBackups) st.backups = (await call('backups')).backups;
    } catch (e) {
      st.error = e.message;
    }
    st.loading = false;
    render();
  }
  function close() {
    if (st.root) st.root.style.display = 'none';
  }
  function open() {
    if (!st.root) build();
    st.root.style.display = 'flex';
    void load(false);
  }
  window.__caSkillsOpen = open;
  function build() {
    st.root = h('div', { 'data-ca-img-root': true, 'data-ca-skills': true,
      style: 'position:fixed;inset:0;z-index:2147483640;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;',
      onmousedown: (e) => { if (e.target === st.root) close(); },
      ondragover: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; },
      ondrop: (e) => { e.preventDefault(); setTab('import'); void importDrop(e.dataTransfer); } });
    st.tabs = h('div', { style: 'display:flex;gap:4px;' });
    st.body = h('div', { style: 'flex:1;overflow:auto;padding:12px 14px;' });
    const panel = h('div', { style: `width:min(900px,94vw);height:min(740px,90vh);display:flex;flex-direction:column;background:${C.bg};` +
      `color:${C.text};border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.6);font:13px/1.45 system-ui,sans-serif;overflow:hidden;` },
    h('div', { style: `display:flex;align-items:center;gap:14px;padding:10px 14px;border-bottom:1px solid ${C.line};` },
      h('b', { style: 'font-size:15px;' }, '\u{1F9E9} Skills'), st.tabs, h('span', { style: 'flex:1' }), btn('\u2715', 'Close (Esc)', close)),
    st.body,
    h('div', { style: `padding:6px 14px;border-top:1px solid ${C.line};color:${C.dim};font-size:12px;` },
      'Changes apply to new chats (or type /reload). Turn skills on or off with /skills in a chat. Replaced and deleted skills are kept in Backups.'));
    st.root.append(panel);
    document.body.append(st.root);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && st.root.style.display !== 'none') { e.stopPropagation(); close(); }
    }, true);
  }
  function setTab(t) {
    st.tab = t;
    render();
  }
  function render() {
    if (!st.root) return;
    st.tabs.textContent = '';
    for (const [id, label] of [['installed', 'Installed'], ['catalog', 'Catalog'], ['import', 'Import']]) {
      st.tabs.append(btn(label, '', () => setTab(id), st.tab === id ? C.blue : 'transparent'));
    }
    st.body.textContent = '';
    if (st.tab === 'import') return void st.body.append(...importView());
    if (st.error) st.body.append(note('Could not load skills: ' + st.error, '#ff8a80'));
    if (!st.data) return void st.body.append(note(st.loading ? 'Loading\u2026' : ''));
    st.body.append(...(st.tab === 'installed' ? installedView() : catalogView()));
  }
  const scopeLabel = (id) => ((st.data && st.data.scopes.find((s) => s.id === id)) || { label: id }).label;
  function scopeSelect(value, onChange, all) {
    const s = h('select', { style: INPUT, onchange: (e) => onChange(e.target.value) },
      all ? h('option', { value: 'all' }, 'All scopes') : null,
      st.data.scopes.map((x) => h('option', { value: x.id, title: x.dir }, x.label)));
    s.value = value;
    return s;
  }
  function filterBox(onInput) {
    const i = h('input', { type: 'search', placeholder: 'Search name, description, keywords\u2026', value: st.q,
      style: INPUT + 'flex:1;min-width:180px;', oninput: (e) => { st.q = e.target.value; onInput(); } });
    return i;
  }
  const match = (s) => {
    const q = st.q.trim().toLowerCase();
    return !q || [s.name, s.folder, s.description, ...(s.keywords || [])].join(' ').toLowerCase().includes(q);
  };
  const rowBox = (...kids) => h('div', { style: `padding:8px 10px;margin:6px 0;border-radius:8px;background:${C.row};` }, ...kids);
  const desc = (t) => h('div', { title: t, style: `color:${C.dim};margin:2px 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;` }, t);
  const actions = (...b) => h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;' }, ...b);
  async function act(fn, ok) {
    try {
      const r = await fn();
      if (ok) toast(ok(r));
      await load(false);
      return r;
    } catch (e) {
      toast(e.message, true);
      return null;
    }
  }
  async function install(body) {
    try {
      const r = await call('install', body);
      toast(`${r.replaced ? 'Updated' : 'Installed'} ${r.name} in ${r.label}. ${HINT}`);
      await load(false);
      return r;
    } catch (e) {
      if (e.kind === 'exists' && !body.overwrite) {
        if (window.confirm(`${e.message}.\n\nReplace it? The current copy is kept in Backups.`)) return install({ ...body, overwrite: true });
        return null;
      }
      if (e.kind === 'auto_approve' && !body.allowAutoApprove) {
        if (window.confirm('This skill sets auto-approve-scripts: true.\n\nIts bundled scripts will run WITHOUT asking you first. ' +
          'Only continue if you trust where it came from.\n\nInstall anyway?')) return install({ ...body, allowAutoApprove: true });
        return null;
      }
      toast('Install failed: ' + e.message, true);
      return null;
    }
  }
  function exportSkill(sk) {
    window.open(`/__skills/export?name=${encodeURIComponent(sk.folder)}&scope=${encodeURIComponent(sk.scope)}&token=${encodeURIComponent(token())}`, '_blank', 'noopener');
  }
  async function publish(sk, overwrite) {
    try {
      const r = await call('publish', { name: sk.folder, scope: sk.scope, overwrite: !!overwrite });
      toast(`Published ${r.name} to catalog "${r.catalog}"`);
      await load(false);
    } catch (e) {
      if (e.kind === 'exists' && !overwrite && window.confirm(`${e.message}.\n\nReplace the catalog copy? The old copy is kept in Backups.`)) return publish(sk, true);
      if (e.kind !== 'exists') toast('Publish failed: ' + e.message, true);
    }
    return null;
  }
  function remove(sk) {
    if (!window.confirm(`Delete ${sk.name || sk.folder} from ${sk.scopeLabel}?\n\nIt is moved to Backups, so you can restore it later.`)) return;
    void act(() => call('delete', { name: sk.folder, scope: sk.scope }), (r) => `Deleted ${r.name} from ${r.label} (kept in Backups)`);
  }
  function installedRow(sk) {
    const b = [badge(sk.scopeLabel, sk.scope === 'user' ? C.blue : '#5e35b1', sk.dir)];
    if (sk.errors.length) b.push(badge('invalid', C.red, sk.errors.join('\n')));
    if (sk.autoApprove) b.push(badge('auto-approve scripts', C.amber, 'Its bundled scripts run without asking'));
    if (sk.shadowedBy.length) b.push(badge('overridden', C.amber, 'A workspace skill with the same name is used instead in: ' + sk.shadowedBy.join(', ')));
    if (sk.shadows) b.push(badge('overrides user skill', '#5e35b1', 'This workspace copy is used instead of the user skill with the same name'));
    const upd = sk.catalog && !sk.catalog.same;
    if (upd) b.push(badge('update available', C.green, `Catalog "${sk.catalog.sourceName}" has a different version`));
    if (sk.source && sk.source.source === 'catalog') b.push(badge('from catalog', 'rgba(255,255,255,.16)', sk.source.sourceName || ''));
    return rowBox(
      h('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;' }, h('b', {}, sk.name || sk.folder), b),
      desc(sk.description || sk.errors.join('; ')),
      h('div', { style: `color:${C.dim};font-size:11px;` }, `${sk.files} files \u00B7 ${human(sk.bytes)} \u00B7 ${sk.dir}`),
      actions(
        upd ? btn('\u2B06 Update', `Replace with the catalog version from "${sk.catalog.sourceName}" (current copy kept in Backups)`,
          () => install({ catalogId: sk.catalog.id, scope: sk.scope, overwrite: true }), C.green) : null,
        btn('\u2B07 Export .zip', 'Download as a .zip to share, for example on Teams', () => exportSkill(sk)),
        st.data.publishTo ? btn('\u{1F4E4} Publish', `Copy into the catalog "${st.data.publishTo.name}" so others can install it`, () => publish(sk), null, sk.errors.length) : null,
        btn('\u21BA Backups', 'Show older copies of this skill', () => { st.q = sk.name || sk.folder; void showBackups(true); }),
        btn('\u{1F5D1} Delete', 'Move to Backups', () => remove(sk), C.red)));
  }
  async function showBackups(on) {
    st.showBackups = on;
    st.backups = null;
    render();
    if (!on) return;
    try {
      st.backups = (await call('backups')).backups;
    } catch (e) {
      st.backups = [];
      toast('Could not load backups: ' + e.message, true);
    }
    render();
  }
  function backupsView() {
    if (!st.backups) return [note('Loading backups\u2026')];
    const q = st.q.trim().toLowerCase();
    const list = st.backups.filter((b) => !q || (b.name + ' ' + b.description).toLowerCase().includes(q));
    if (!list.length) return [note(q ? `No backups match "${st.q}".` : 'No backups yet.')];
    return list.map((b) => {
      const sel = scopeSelect(st.data.scopes.some((s) => s.id === b.scope) ? b.scope : 'user', () => {});
      return rowBox(
        h('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;' }, h('b', {}, b.name),
          badge(b.reason || 'backup', b.reason === 'deleted' ? C.red : 'rgba(255,255,255,.16)'),
          h('span', { style: `color:${C.dim};font-size:12px;` }, `${b.at ? new Date(b.at).toLocaleString() : b.id} \u00B7 from ${b.label || b.scope}`)),
        b.description ? desc(b.description) : null,
        actions(h('span', { style: `color:${C.dim};align-self:center;` }, 'Restore to'), sel,
          btn('\u21BA Restore', 'Put this copy back (the current copy, if any, goes to Backups)', () => {
            if (!window.confirm(`Restore ${b.name} from ${b.at ? new Date(b.at).toLocaleString() : b.id} to ${scopeLabel(sel.value)}?`)) return;
            void act(() => call('restore', { name: b.name, backupId: b.id, scope: sel.value }), (r) => `Restored ${r.name} to ${r.label}. ${HINT}`);
          }, C.green)));
    });
  }
  function installedView() {
    const listBox = h('div');
    const fill = () => {
      listBox.textContent = '';
      if (st.showBackups) return void listBox.append(...backupsView());
      const rows = st.data.skills.filter((s) => (st.scope === 'all' || s.scope === st.scope) && match(s));
      listBox.append(note(`${rows.length} of ${st.data.skills.length} skills`));
      listBox.append(...rows.map(installedRow));
    };
    fill();
    const bar = h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' }, filterBox(fill),
      st.showBackups ? null : scopeSelect(st.scope, (v) => { st.scope = v; fill(); }, true),
      btn(st.showBackups ? '\u2190 Installed skills' : '\u21BA Backups', st.showBackups ? '' : 'Deleted and replaced copies', () => void showBackups(!st.showBackups)),
      btn('\u27F3', 'Reload', () => void load(false)));
    return [bar, listBox];
  }
  function catalogRow(c) {
    const here = c.installedIn.find((x) => x.scope === st.target);
    const b = [badge(c.sourceName, 'rgba(255,255,255,.16)', c.dir)];
    if (c.errors.length) b.push(badge('invalid', C.red, c.errors.join('\n')));
    if (c.autoApprove) b.push(badge('auto-approve scripts', C.amber, 'Its bundled scripts run without asking'));
    for (const x of c.installedIn) b.push(badge(`${x.same ? '\u2713' : '\u2260'} ${x.label}`, x.same ? C.green : C.amber, x.same ? 'Installed, same version' : 'Installed, different version'));
    let action;
    if (c.errors.length) action = btn('Invalid', c.errors.join('\n'), () => {}, C.red, true);
    else if (here && here.same) action = btn('Installed \u2713', `Same version is installed in ${here.label}`, () => {}, C.green, true);
    else if (here) action = btn('\u2B06 Update', `Replace the copy in ${here.label} (kept in Backups)`, () => install({ catalogId: c.id, scope: st.target, overwrite: true }), C.green);
    else action = btn('Install', `Install into ${scopeLabel(st.target)}`, () => install({ catalogId: c.id, scope: st.target }), C.blue);
    return rowBox(h('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;' }, h('b', {}, c.name || c.folder), b),
      desc(c.description || c.errors.join('; ')),
      h('div', { style: `color:${C.dim};font-size:11px;` }, `${c.files} files \u00B7 ${human(c.bytes)}` + (c.scripts.length ? ` \u00B7 scripts: ${c.scripts.join(', ')}` : '')),
      actions(action));
  }
  function catalogView() {
    const cat = st.data.catalog;
    const out = [];
    const listBox = h('div');
    const fill = () => {
      listBox.textContent = '';
      const rows = cat.skills.filter(match);
      listBox.append(note(`${rows.length} of ${cat.skills.length} catalog skills`), ...rows.map(catalogRow));
    };
    out.push(h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' }, filterBox(fill),
      h('span', { style: `color:${C.dim};` }, 'Install into'), scopeSelect(st.target, (v) => { st.target = v; fill(); }),
      btn(st.loading ? 'Refreshing\u2026' : '\u27F3 Refresh', 'Re-scan folders and pull Git catalogs', () => void load(true))));
    if (cat.error) out.push(note(cat.error, '#ff8a80'));
    if (!cat.sources.length) {
      out.push(note(`No catalog is set up. Add a source to ${cat.file}, for example:\n` +
        '[{ "name": "Team skills", "path": "../skill-catalog" }, { "name": "Team git", "git": "https://\u2026/skills.git", "branch": "main" }]'));
    }
    for (const s of cat.sources) {
      out.push(h('div', { style: `font-size:12px;color:${s.error ? '#ff8a80' : C.dim};margin-top:6px;` },
        `${s.kind === 'git' ? '\u{1F500}' : '\u{1F4C1}'} ${s.name}: ${s.location}${s.branch ? ` (${s.branch})` : ''} \u00B7 ` +
        (s.error ? `error: ${s.error}` : `${s.count} skill${s.count === 1 ? '' : 's'}`) + (s.publish ? ' \u00B7 publish target' : '')));
    }
    fill();
    out.push(listBox);
    return out;
  }
  function stageCard(stg) {
    const head = h('div', { style: 'display:flex;align-items:center;gap:8px;' }, h('b', {}, stg.label),
      h('span', { style: `color:${stg.error ? '#ff8a80' : C.dim};` }, stg.error || stg.status), h('span', { style: 'flex:1' }),
      btn('\u2715', 'Remove from this list', () => { st.stages = st.stages.filter((x) => x !== stg); render(); }));
    const kids = [head];
    for (const sk of stg.skills || []) {
      const target = { v: st.target };
      const sel = st.data ? scopeSelect(target.v, (v) => { target.v = v; }) : null;
      const b = [];
      if (sk.autoApprove) b.push(badge('auto-approve scripts', C.amber));
      for (const x of sk.installedIn) b.push(badge(`already in ${x.label}`, C.amber, 'Installing there replaces it (old copy kept in Backups)'));
      kids.push(h('div', { style: `margin-top:8px;padding-top:8px;border-top:1px solid ${C.line};` },
        h('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;' }, h('b', {}, sk.name || sk.folder), b),
        desc(sk.description),
        h('div', { style: `color:${C.dim};font-size:11px;` }, `${sk.files} files \u00B7 ${human(sk.bytes)}` + (sk.key !== '.' ? ` \u00B7 ${sk.key}` : '')),
        sk.errors.map((e) => note('\u2716 ' + e, '#ff8a80')),
        sk.warnings.map((w) => note('\u26A0 ' + w, '#ffb74d')),
        sk.scripts.length ? h('details', {}, h('summary', { style: 'cursor:pointer;' }, `${sk.scripts.length} script${sk.scripts.length > 1 ? 's' : ''}`),
          note(sk.scripts.join('\n'))) : null,
        actions(h('span', { style: `color:${C.dim};align-self:center;` }, 'Install into'), sel,
          btn('Install', sk.errors.length ? 'Fix the errors first' : '', async () => {
            const r = await install({ stageId: stg.id, key: sk.key, scope: sel ? sel.value : 'user' });
            if (r) { sk.installedIn = [...sk.installedIn.filter((x) => x.scope !== r.scope), { scope: r.scope, label: r.label }]; render(); }
          }, C.blue, !!sk.errors.length || !sel))));
    }
    return rowBox(...kids);
  }
  function importView() {
    const pick = h('input', { type: 'file', accept: '.zip,.tgz,.gz,.tar,.md', multiple: true, style: 'display:none;',
      onchange: (e) => { for (const f of [...e.target.files]) void importFile(f); e.target.value = ''; } });
    const pickDir = h('input', { type: 'file', webkitdirectory: true, style: 'display:none;', onchange: (e) => {
      const files = [...e.target.files].map((f) => ({ file: f, rel: f.webkitRelativePath || f.name }));
      e.target.value = '';
      if (files.length) void importFolder(files[0].rel.split('/')[0], files);
    } });
    const zone = h('div', { style: `border:2px dashed #4fc3f7;border-radius:10px;padding:22px;text-align:center;background:rgba(79,195,247,.07);` },
      h('div', { style: 'font-size:14px;font-weight:600;color:#4fc3f7;' }, 'Drop a skill here'),
      note('.zip, .tar.gz or .tgz archive \u00B7 a skill folder \u00B7 a single SKILL.md. Archives with several skills are fine.'),
      actions(h('span', { style: 'flex:1' }), btn('Choose file\u2026', '', () => pick.click(), C.blue), btn('Choose folder\u2026', '', () => pickDir.click(), C.blue),
        h('span', { style: 'flex:1' })),
      pick, pickDir);
    const tip = note('Shared on Teams? Download the .zip, then drop it here. To share one of your skills, use \u2B07 Export .zip on the Installed tab.');
    return [zone, tip, ...st.stages.map(stageCard).reverse()];
  }
  async function upFile(file, extra) {
    const r = await fetch('/__skills/upload', {
      method: 'POST', body: file,
      headers: Object.assign({ 'Content-Type': 'application/octet-stream', 'X-ChipAgents-Paste': '1', 'x-access-token': token(),
        'X-File-Name': encodeURIComponent(file.name || 'upload') }, extra),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }
  function addStage(label) {
    const stg = { label, status: 'uploading\u2026', error: '', id: '', skills: null };
    st.stages.push(stg);
    if (st.tab === 'import') render();
    return stg;
  }
  async function finish(stg, stageId) {
    stg.status = 'checking\u2026';
    render();
    const j = await call('stage', { stageId });
    stg.id = stageId;
    stg.skills = j.skills;
    stg.status = `${j.skills.length} skill${j.skills.length > 1 ? 's' : ''} found`;
    if (!st.data) await load(false);
    render();
  }
  async function importFile(file) {
    const stg = addStage('\u{1F4E6} ' + file.name);
    try {
      await finish(stg, (await upFile(file)).stageId);
    } catch (e) {
      stg.error = e.message;
      render();
    }
  }
  async function importFolder(name, files) {
    const stg = addStage('\u{1F4C1} ' + name);
    try {
      if (files.length > MAX_FILES) throw new Error(`more than ${MAX_FILES} files`);
      const batch = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      const queue = [...files];
      let n = 0;
      const worker = async () => {
        while (queue.length) {
          const { file, rel } = queue.shift();
          await upFile(file, { 'X-Batch': batch, 'X-Rel-Path': encodeURIComponent(rel) });
          stg.status = `uploading ${++n}/${files.length}\u2026`;
          render();
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
      await finish(stg, batch);
    } catch (e) {
      stg.error = e.message;
      render();
    }
  }
  async function importDrop(dt) {
    const items = [...(dt.items || [])].filter((i) => i.kind === 'file');
    const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
    const files = items.map((i) => i.getAsFile());
    for (let k = 0; k < items.length; k++) {
      const e = entries[k];
      if (e && e.isDirectory) void walk(e, '', []).then((list) => importFolder(e.name, list));
      else if (files[k]) void importFile(files[k]);
    }
    if (!items.length) for (const f of [...(dt.files || [])]) void importFile(f);
  }
})();
