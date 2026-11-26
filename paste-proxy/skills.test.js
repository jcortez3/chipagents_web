// jcortez3
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const skills = require('./skills');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'));
const caHome = path.join(tmp, 'ca');
const wsRoot = path.join(tmp, 'ws');
const catDir = path.join(tmp, 'catalog');
const gitSrc = path.join(tmp, 'gitsrc');
const catalogFile = path.join(tmp, 'skill-catalog.json');
const src = path.join(tmp, 'src');
const ARCHIVE = path.join(__dirname, 'skill-archive.py');

function skill(dir, name, extra = '', files = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: "Test skill ${name}"\nkeywords: a b\n${extra}---\n\n# ${name}\n`);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}
const py = (code) => execFileSync('python3', ['-c', code], { cwd: tmp });
const run = (...a) => execFileSync(a[0], a.slice(1), { cwd: tmp, stdio: 'pipe' });

fs.mkdirSync(path.join(caHome, 'skills'), { recursive: true });
fs.mkdirSync(wsRoot, { recursive: true });
fs.writeFileSync(path.join(caHome, 'workspaces.json'), JSON.stringify({ workspaces: [{ id: 'project_t1', name: 'TestWS', roots: [wsRoot] }] }));
fs.writeFileSync(catalogFile, JSON.stringify([{ name: 'Local', path: catDir }, { name: 'Git', git: gitSrc, branch: 'main' }]));
skill(path.join(catDir, 'cat-one'), 'cat-one', '', { 'scripts/run.sh': 'echo 1\n' });
skill(path.join(gitSrc, 'skills', 'git-one'), 'git-one');
run('git', '-C', gitSrc, 'init', '-q', '-b', 'main');
run('git', '-C', gitSrc, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
run('git', '-C', gitSrc, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');

const core = skills.create({ caHome, catalogFile });

async function stageFrom(file) {
  const id = 'ut' + Math.random().toString(36).slice(2, 10);
  const up = path.join(caHome, 'skill-importer', 'staging', id, 'upload');
  fs.mkdirSync(up, { recursive: true });
  fs.copyFileSync(file, path.join(up, path.basename(file)));
  return core.stage({ stageId: id });
}

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('frontmatter parsing', () => {
  const fm = skills.frontmatter('---\nname: x\ndescription: >\n  line one\n  line two\nkeywords:\n  - k1\n  - k2\nauto-approve-scripts: true\n---\nbody');
  assert.strictEqual(fm.name, 'x');
  assert.strictEqual(fm.description, 'line one line two');
  assert.deepStrictEqual(fm.keywords, ['k1', 'k2']);
  assert.strictEqual(fm['auto-approve-scripts'], 'true');
  assert.strictEqual(skills.frontmatter('no frontmatter'), null);
});

test('zip import with two skills, install to user scope', async () => {
  skill(path.join(src, 'pack', 'alpha'), 'alpha', '', { 'lib/a.js': 'x', '.DS_Store': 'junk' });
  skill(path.join(src, 'pack', 'beta'), 'beta');
  run('python3', ARCHIVE, 'zip', path.join(src, 'pack'), path.join(tmp, 'pack.zip'), 'pack');
  const st = await stageFrom(path.join(tmp, 'pack.zip'));
  assert.deepStrictEqual(st.skills.map((s) => s.name), ['alpha', 'beta']);
  assert.deepStrictEqual(st.skills[0].errors, []);
  const r = await core.install({ stageId: st.stageId, key: st.skills[0].key, scope: 'user' });
  assert.strictEqual(r.replaced, false);
  assert.ok(fs.existsSync(path.join(caHome, 'skills', 'alpha', 'lib', 'a.js')));
  assert.ok(!fs.existsSync(path.join(caHome, 'skills', 'alpha', '.DS_Store')));
  assert.ok(!fs.existsSync(path.join(caHome, '.skill-importer-tmp')));
});

test('tgz import to workspace scope, shadowing reported', async () => {
  skill(path.join(src, 'tg', 'alpha'), 'alpha', '', { 'v2.txt': 'ws' });
  run('tar', '-czf', path.join(tmp, 'alpha.tgz'), '-C', path.join(src, 'tg'), 'alpha');
  const st = await stageFrom(path.join(tmp, 'alpha.tgz'));
  assert.deepStrictEqual(st.skills[0].installedIn.map((x) => x.scope), ['user']);
  await core.install({ stageId: st.stageId, key: st.skills[0].key, scope: 'ws:project_t1' });
  assert.ok(fs.existsSync(path.join(wsRoot, '.chipagents', 'skills', 'alpha', 'v2.txt')));
  const l = await core.list();
  const u = l.skills.find((s) => s.name === 'alpha' && s.scope === 'user');
  const w = l.skills.find((s) => s.name === 'alpha' && s.scope === 'ws:project_t1');
  assert.deepStrictEqual(u.shadowedBy, ['Workspace: TestWS']);
  assert.strictEqual(w.shadows, true);
});

test('single SKILL.md import', async () => {
  const f = path.join(tmp, 'SKILL.md');
  fs.writeFileSync(f, '---\nname: solo\ndescription: one file\n---\nhi\n');
  const st = await stageFrom(f);
  assert.strictEqual(st.skills[0].name, 'solo');
  await core.install({ stageId: st.stageId, key: st.skills[0].key, scope: 'user' });
  assert.ok(fs.existsSync(path.join(caHome, 'skills', 'solo', 'SKILL.md')));
});

test('flat zip (SKILL.md at archive root) installs under its name', async () => {
  const flat = skill(path.join(src, 'flat'), 'flatty');
  py(`import zipfile,os\nz=zipfile.ZipFile('flat.zip','w')\nfor f in os.listdir(${JSON.stringify(flat)}): z.write(os.path.join(${JSON.stringify(flat)},f),f)\nz.close()`);
  const st = await stageFrom(path.join(tmp, 'flat.zip'));
  assert.strictEqual(st.skills[0].key, '.');
  const r = await core.install({ stageId: st.stageId, key: '.', scope: 'user' });
  assert.strictEqual(r.name, 'flatty');
  assert.ok(fs.existsSync(path.join(caHome, 'skills', 'flatty', 'SKILL.md')));
});

test('malicious archives are rejected', async () => {
  py("import zipfile\nz=zipfile.ZipFile('slip.zip','w')\nz.writestr('../evil.txt','x')\nz.close()");
  await assert.rejects(stageFrom(path.join(tmp, 'slip.zip')), /escapes/);
  assert.ok(!fs.existsSync(path.join(caHome, 'skill-importer', 'staging', 'evil.txt')));
  py("import zipfile\nz=zipfile.ZipFile('link.zip','w')\ni=zipfile.ZipInfo('s/link')\ni.external_attr=(0o120777<<16)\nz.writestr(i,'/etc/passwd')\nz.close()");
  await assert.rejects(stageFrom(path.join(tmp, 'link.zip')), /symlink/);
  py("import zipfile\nz=zipfile.ZipFile('abs.zip','w')\nz.writestr('/tmp/abs.txt','x')\nz.close()");
  await assert.rejects(stageFrom(path.join(tmp, 'abs.zip')), /absolute/);
  fs.writeFileSync(path.join(tmp, 'x.exe'), 'MZ');
  await assert.rejects(stageFrom(path.join(tmp, 'x.exe')), /unsupported/);
});

test('bad frontmatter blocks install', async () => {
  fs.mkdirSync(path.join(src, 'bad', 'Bad_Name'), { recursive: true });
  fs.writeFileSync(path.join(src, 'bad', 'Bad_Name', 'SKILL.md'), '---\nname: Bad Name\n---\n');
  run('python3', ARCHIVE, 'zip', path.join(src, 'bad', 'Bad_Name'), path.join(tmp, 'bad.zip'), 'Bad_Name');
  const st = await stageFrom(path.join(tmp, 'bad.zip'));
  assert.ok(st.skills[0].errors.some((e) => /must be lowercase/.test(e)));
  assert.ok(st.skills[0].errors.some((e) => /no description/.test(e)));
  await assert.rejects(core.install({ stageId: st.stageId, key: st.skills[0].key, scope: 'user' }), /lowercase/);
});

test('auto-approve needs confirmation', async () => {
  skill(path.join(src, 'aa', 'auto'), 'auto', 'auto-approve-scripts: true\n');
  run('python3', ARCHIVE, 'zip', path.join(src, 'aa', 'auto'), path.join(tmp, 'auto.zip'), 'auto');
  const st = await stageFrom(path.join(tmp, 'auto.zip'));
  assert.ok(st.skills[0].warnings.some((w) => /auto-approve/.test(w)));
  await assert.rejects(core.install({ stageId: st.stageId, key: st.skills[0].key, scope: 'user' }), (e) => e.kind === 'auto_approve');
  await core.install({ stageId: st.stageId, key: st.skills[0].key, scope: 'user', allowAutoApprove: true });
});

test('conflict -> overwrite -> backup -> delete -> restore', async () => {
  skill(path.join(src, 'v2', 'alpha'), 'alpha', '', { 'new.txt': 'v2' });
  run('python3', ARCHIVE, 'zip', path.join(src, 'v2', 'alpha'), path.join(tmp, 'alpha2.zip'), 'alpha');
  const st = await stageFrom(path.join(tmp, 'alpha2.zip'));
  const body = { stageId: st.stageId, key: st.skills[0].key, scope: 'user' };
  await assert.rejects(core.install(body), (e) => e.kind === 'exists' && e.status === 409);
  const r = await core.install({ ...body, overwrite: true });
  assert.strictEqual(r.replaced, true);
  assert.ok(fs.existsSync(path.join(caHome, 'skills', 'alpha', 'new.txt')));
  assert.ok(!fs.existsSync(path.join(caHome, 'skills', 'alpha', 'lib')));
  await core.remove({ name: 'alpha', scope: 'user' });
  assert.ok(!fs.existsSync(path.join(caHome, 'skills', 'alpha')));
  const b = (await core.backups({ name: 'alpha' })).backups;
  assert.strictEqual(b.length, 2);
  assert.strictEqual(b[0].reason, 'deleted');
  assert.strictEqual(b[1].reason, 'replaced by install');
  await core.restore({ name: 'alpha', backupId: b[1].id, scope: 'user' });
  assert.ok(fs.existsSync(path.join(caHome, 'skills', 'alpha', 'lib', 'a.js')));
  await assert.rejects(core.remove({ name: '../x', scope: 'user' }), /bad skill name/);
});

test('catalog: folder + git, install, update detection', async () => {
  const l = await core.list();
  assert.deepStrictEqual(l.catalog.sources.map((s) => [s.name, s.count, s.error]), [['Local', 1, ''], ['Git', 1, '']]);
  const c = l.catalog.skills.find((s) => s.name === 'git-one');
  await core.install({ catalogId: c.id, scope: 'user' });
  let g = (await core.list()).skills.find((s) => s.name === 'git-one');
  assert.strictEqual(g.catalog.same, true);
  assert.strictEqual(g.source.source, 'catalog');
  fs.appendFileSync(path.join(gitSrc, 'skills', 'git-one', 'SKILL.md'), 'more\n');
  run('git', '-C', gitSrc, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'v2');
  g = (await core.list({ refresh: true })).skills.find((s) => s.name === 'git-one');
  assert.strictEqual(g.catalog.same, false);
  await core.install({ catalogId: g.catalog.id, scope: 'user', overwrite: true });
  g = (await core.list()).skills.find((s) => s.name === 'git-one');
  assert.strictEqual(g.catalog.same, true);
});

test('publish to catalog folder, export round trip', async () => {
  await core.publish({ name: 'solo', scope: 'user' });
  assert.ok(fs.existsSync(path.join(catDir, 'solo', 'SKILL.md')));
  await assert.rejects(core.publish({ name: 'solo', scope: 'user' }), (e) => e.kind === 'exists');
  const l = await core.list();
  assert.ok(l.catalog.skills.some((s) => s.name === 'solo' && s.installedIn.some((x) => x.same)));
  assert.strictEqual(l.publishTo.name, 'Local');
  const { file, cleanup } = await core.exportZip({ name: 'solo', scope: 'user' });
  const st = await stageFrom(file);
  await cleanup();
  assert.strictEqual(st.skills[0].name, 'solo');
  assert.strictEqual(st.skills[0].key, 'solo');
});

test('HTTP upload of a folder and auth checks', async () => {
  const sendJson = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  let allow = true;
  const handle = skills.http({ core, authorized: async () => allow, originAllowed: () => true, sendJson });
  const server = http.createServer((req, res) => handle(req, res, req.url.split('?')[0]));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { 'X-ChipAgents-Paste': '1' };
  try {
    const batch = 'b' + Date.now().toString(36);
    for (const [rel, body] of [['fold/SKILL.md', '---\nname: fold\ndescription: from folder\n---\n'], ['fold/scripts/x.py', 'print(1)']]) {
      const r = await fetch(`${base}/__skills/upload`, { method: 'POST', headers: { ...H, 'X-Batch': batch, 'X-Rel-Path': encodeURIComponent(rel), 'X-File-Name': 'f' }, body });
      assert.strictEqual(r.status, 200);
    }
    const s = await (await fetch(`${base}/__skills/stage`, { method: 'POST', headers: H, body: JSON.stringify({ stageId: batch }) })).json();
    assert.deepStrictEqual(s.skills[0].scripts, ['scripts/x.py']);
    const bad = await fetch(`${base}/__skills/upload`, { method: 'POST', headers: { ...H, 'X-Batch': batch, 'X-Rel-Path': encodeURIComponent('fold/../../x') }, body: 'x' });
    assert.strictEqual(bad.status, 400);
    const r = await fetch(`${base}/__skills/install`, { method: 'POST', headers: H, body: JSON.stringify({ stageId: batch, key: 'fold', scope: 'ws:project_t1' }) });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await fetch(`${base}/__skills/install`, { method: 'POST', body: '{}' })).status, 403);
    const ex = await fetch(`${base}/__skills/export?name=fold&scope=ws:project_t1`);
    assert.strictEqual(ex.headers.get('content-type'), 'application/zip');
    assert.ok((await ex.arrayBuffer()).byteLength > 100);
    allow = false;
    assert.strictEqual((await fetch(`${base}/__skills/list`)).status, 401);
  } finally {
    server.close();
  }
});
