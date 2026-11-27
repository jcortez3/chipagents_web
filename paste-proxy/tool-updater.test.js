// jcortez3
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const toolUpdater = require('./tool-updater');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-updater-test-'));
const repo = path.join(tmp, 'repo');
const G = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryG = (...a) => {
  try {
    return G(...a);
  } catch {
    return null;
  }
};
function write(rel, body, mode) {
  const f = path.join(repo, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
  if (mode) fs.chmodSync(f, mode);
}
function commit(msg) {
  G('add', '-A');
  G('commit', '-qm', msg);
  return G('rev-parse', 'HEAD');
}
function installArchive(sha, dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('sh', ['-c', `git -C "${repo}" archive ${sha} | tar -x -C "${dir}"`]);
  return dir;
}

fs.mkdirSync(repo, { recursive: true });
G('init', '-q', '-b', 'main');
write('.gitattributes', 'paste-proxy/build-info.txt export-subst\n');
write('paste-proxy/build-info.txt', '$Format:%H %cI$\n');
write('paste-proxy/paste-proxy.js', "'use strict';\nconsole.log('v1');\n");
write('paste-proxy/start.sh', '#!/bin/sh\necho v1\n', 0o755);
write('paste-proxy/skill-catalog.json', '[]\n');
write('skill-catalog/README.md', 'catalog v1\n');
write('chipagents-web-paste.bat', '@echo v1\r\n');
write('old.txt', 'remove me\n');
write('keep-local.txt', 'upstream\n');
write('companion-extension/a.js', 'v1\n');
const v1 = commit('first version');
write('paste-proxy/paste-proxy.js', "'use strict';\nconsole.log('v2');\n");
write('paste-proxy/start.sh', '#!/bin/sh\necho v2\n', 0o755);
write('paste-proxy/skill-catalog.json', '[{"name":"x","path":"y"}]\n');
write('skill-catalog/README.md', 'catalog v2\n');
write('chipagents-web-paste.bat', '@echo v2\r\n');
write('new.txt', 'new\n');
write('companion-extension/a.js', 'v2\n');
fs.rmSync(path.join(repo, 'old.txt'));
fs.rmSync(path.join(repo, 'keep-local.txt'));
commit('second version');
G('checkout', '-qb', 'side');
G('commit', '-q', '--allow-empty', '-m', 'side change');
G('checkout', '-q', 'main');
G('merge', '-q', '--no-ff', '-m', "Merge branch 'side'", 'side');
const v2 = G('rev-parse', 'HEAD');

function compare(a, b) {
  if (tryG('cat-file', '-e', `${a}^{commit}`) === null) return null;
  const status = a === b ? 'identical' : tryG('merge-base', '--is-ancestor', a, b) !== null ? 'ahead'
    : tryG('merge-base', '--is-ancestor', b, a) !== null ? 'behind' : 'diverged';
  const commits = status === 'ahead' ? G('rev-list', '--reverse', '--topo-order', `${a}..${b}`).split('\n').filter(Boolean).map((sha) => ({
    sha, parents: G('log', '-1', '--format=%P', sha).split(' ').filter(Boolean),
    commit: { message: G('log', '-1', '--format=%B', sha), committer: { date: G('log', '-1', '--format=%cI', sha) } },
  })) : [];
  const files = G('diff', '--name-status', '-M', a, b).split('\n').filter(Boolean).map((l) => {
    const [st, x, y] = l.split('\t');
    if (st === 'D') return { filename: x, status: 'removed', sha: G('rev-parse', `${a}:${x}`) };
    if (st.startsWith('R')) return { filename: y, status: 'renamed', previous_filename: x, sha: G('rev-parse', `${b}:${y}`) };
    return { filename: x, status: st === 'A' ? 'added' : 'modified', sha: G('rev-parse', `${b}:${x}`) };
  });
  return { status, commits, files };
}

let server;
let base;
const calls = [];
test.before(async () => {
  server = http.createServer((req, res) => {
    calls.push(req.url);
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    let m;
    if ((m = /^\/repos\/o\/r\/commits\/(\w+)$/.exec(req.url))) {
      const sha = G('rev-parse', m[1]);
      return json(200, { sha, commit: { message: G('log', '-1', '--format=%B', sha), committer: { date: G('log', '-1', '--format=%cI', sha) } } });
    }
    if ((m = /^\/repos\/o\/r\/compare\/(\w+)\.\.\.(\w+)$/.exec(req.url))) {
      const c = compare(m[1], m[2]);
      return c ? json(200, c) : json(404, { message: 'Not Found' });
    }
    if ((m = /^\/codeload\/o\/r\/tar\.gz\/(\w+)$/.exec(req.url))) {
      res.writeHead(200, { 'Content-Type': 'application/x-gzip' });
      return res.end(execFileSync('git', ['-C', repo, 'archive', '--format=tar.gz', `--prefix=r-${m[1]}/`, m[1]]));
    }
    json(404, { message: 'Not Found' });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const make = (appDir, extra = {}) => toolUpdater.create({
  appDir, stateDir: path.join(appDir + '-state'), repo: 'o/r', branch: 'main', api: base, codeload: `${base}/codeload`, token: '', ...extra,
});
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

test('archive install: check, prefetch, apply keeps user data', async () => {
  const app = installArchive(v1, path.join(tmp, 'app1'));
  fs.mkdirSync(path.join(app, 'skill-catalog', 'my-skill'), { recursive: true });
  fs.writeFileSync(path.join(app, 'skill-catalog', 'my-skill', 'SKILL.md'), 'mine\n');
  fs.writeFileSync(path.join(app, 'paste-proxy', 'skill-catalog.json'), '[{"name":"mine"}]\n');
  fs.writeFileSync(path.join(app, 'keep-local.txt'), 'edited by user\n');
  fs.writeFileSync(path.join(app, 'notes.txt'), 'not in repo\n');
  const u = make(app);
  const inst = await u.installed();
  assert.deepStrictEqual([inst.mode, inst.sha], ['archive', v1]);
  const s = await u.status(true);
  assert.strictEqual(s.updateAvailable, true);
  assert.strictEqual(s.status, 'ahead');
  assert.deepStrictEqual(s.commits.map((c) => c.message), ['side change', 'second version']);
  assert.strictEqual(s.companion, true);
  await u.prefetch(s.latest.sha, s.latest.date);
  assert.strictEqual((await u.status(false)).ready, true);
  const phases = [];
  const r = await u.apply((p) => phases.push(p));
  assert.deepStrictEqual(phases, ['checking', 'downloading', 'backing up', 'installing']);
  assert.deepStrictEqual([r.from, r.to], [v1, v2]);
  assert.match(read(app, 'paste-proxy/paste-proxy.js'), /v2/);
  assert.match(read(app, 'paste-proxy/start.sh'), /v2/);
  assert.ok(fs.statSync(path.join(app, 'paste-proxy/start.sh')).mode & 0o100);
  assert.strictEqual(read(app, 'new.txt'), 'new\n');
  assert.ok(!fs.existsSync(path.join(app, 'old.txt')));
  assert.strictEqual(read(app, 'keep-local.txt'), 'edited by user\n');
  assert.strictEqual(read(app, 'skill-catalog/README.md'), 'catalog v2\n');
  assert.strictEqual(read(app, 'skill-catalog/my-skill/SKILL.md'), 'mine\n');
  assert.strictEqual(read(app, 'paste-proxy/skill-catalog.json'), '[{"name":"mine"}]\n');
  assert.strictEqual(read(app, 'notes.txt'), 'not in repo\n');
  assert.strictEqual(read(app, 'chipagents-web-paste.bat'), '@echo v1\r\n');
  assert.strictEqual(read(app, 'chipagents-web-paste.bat.new'), '@echo v2\r\n');
  assert.strictEqual(r.bat, true);
  assert.strictEqual(r.companion, true);
  assert.deepStrictEqual(r.kept.sort(), ['keep-local.txt', 'paste-proxy/skill-catalog.json']);
  assert.match(read(app, 'paste-proxy/build-info.txt'), new RegExp(`^${v2} `));
  assert.deepStrictEqual(fs.readdirSync(app).filter((n) => n.endsWith('.update-tmp')), []);
  const manifest = JSON.parse(fs.readFileSync(path.join(r.backup, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.from, v1);
  assert.match(fs.readFileSync(path.join(r.backup, 'files', 'paste-proxy', 'paste-proxy.js'), 'utf8'), /v1/);
  const after = await u.status(true);
  assert.deepStrictEqual([after.installed.sha, after.status, after.updateAvailable], [v2, 'identical', false]);
  await assert.rejects(u.apply(), /already up to date/);
});

test('failed install is rolled back', async () => {
  const app = installArchive(v1, path.join(tmp, 'app2'));
  const before = read(app, 'paste-proxy/paste-proxy.js');
  const u = make(app, { hooks: { beforeWrite: (op) => { if (op.dst === 'skill-catalog/README.md') throw new Error('disk full'); } } });
  await assert.rejects(u.apply(), /update failed and was undone: disk full/);
  assert.strictEqual(read(app, 'paste-proxy/paste-proxy.js'), before);
  assert.match(read(app, 'paste-proxy/build-info.txt'), new RegExp(v1));
  assert.ok(!fs.existsSync(path.join(app, 'new.txt')));
  assert.ok(!fs.existsSync(path.join(app, 'chipagents-web-paste.bat.new')));
  assert.ok(fs.existsSync(path.join(app, 'old.txt')));
  assert.strictEqual((await u.installed()).sha, v1);
});

test('unknown local version is diverged, missing version offers an update', async () => {
  const app = installArchive(v1, path.join(tmp, 'app3'));
  fs.writeFileSync(path.join(app, 'paste-proxy', 'build-info.txt'), `${'a'.repeat(40)} 2026-01-01T00:00:00Z\n`);
  const u = make(app);
  const s = await u.status(true);
  assert.deepStrictEqual([s.status, s.updateAvailable], ['diverged', false]);
  fs.writeFileSync(path.join(app, 'paste-proxy', 'build-info.txt'), '$Format:%H %cI$\n');
  const s2 = await u.status(true);
  assert.deepStrictEqual([s2.status, s2.updateAvailable], ['unknown', true]);
  await u.dismiss(s2.latest.sha);
  assert.strictEqual((await u.status(false)).dismissed, true);
});

test('a broken update is refused before anything changes', async () => {
  const app = installArchive(v2, path.join(tmp, 'app4'));
  write('paste-proxy/broken.js', 'function (\n');
  const v3 = commit('broken change');
  try {
    const u = make(app);
    const s = await u.status(true);
    assert.strictEqual(s.latest.sha, v3);
    await assert.rejects(u.apply(), /broken paste-proxy\/broken\.js/);
    assert.ok(!fs.existsSync(path.join(app, 'paste-proxy', 'broken.js')));
    assert.strictEqual((await u.installed()).sha, v2);
  } finally {
    G('reset', '-q', '--hard', v2);
  }
});

test('handoff file is read once and expires', async () => {
  const app = path.join(tmp, 'app5');
  fs.mkdirSync(app, { recursive: true });
  const u = make(app);
  await u.writeHandoff({ tokens: ['t1'], from: v1, to: v2 });
  const file = path.join(app + '-state', 'handoff.json');
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  const h = await u.takeHandoff();
  assert.deepStrictEqual(h.tokens, ['t1']);
  assert.strictEqual(await u.takeHandoff(), null);
  fs.writeFileSync(file, JSON.stringify({ tokens: ['t1'], until: Date.now() - 1 }));
  assert.strictEqual(await u.takeHandoff(), null);
  assert.ok(!fs.existsSync(file));
});

test('git checkout: refuses local changes, then pulls', async () => {
  const app = path.join(tmp, 'app6');
  execFileSync('git', ['clone', '-q', repo, app]);
  execFileSync('git', ['-C', app, 'reset', '-q', '--hard', v1]);
  const u = make(app);
  const inst = await u.installed();
  assert.deepStrictEqual([inst.mode, inst.sha, inst.branch, inst.dirty], ['git', v1, 'main', false]);
  fs.appendFileSync(path.join(app, 'old.txt'), 'local edit\n');
  const s = await u.status(true);
  assert.strictEqual(s.blocked, 'it has local changes');
  await assert.rejects(u.apply(), /local changes/);
  execFileSync('git', ['-C', app, 'checkout', '-q', '--', 'old.txt']);
  const r = await u.apply();
  assert.deepStrictEqual([r.mode, r.from, r.to], ['git', v1, v2]);
  assert.strictEqual(execFileSync('git', ['-C', app, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), v2);
  assert.ok(!calls.some((c) => c.startsWith('/codeload/') && c.endsWith(v1)));
});
