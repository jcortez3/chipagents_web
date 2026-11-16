'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const HOME = process.env.HOME || '';
const CONFIG = path.join(HOME, '.chipagents', 'config.toml');
const DEFAULT_ENDPOINT = 'https://agent.chipagents.ai';
const LATEST_TTL_MS = 3600 * 1000;
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;
const SYSTEM_CA = ['/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt'];

function compare(a, b) {
  const x = String(a || '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const y = String(b || '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  }
  return 0;
}

function create({ bin }) {
  let cache = { at: 0, value: null };
  const realBin = () => {
    try {
      return fs.realpathSync(bin);
    } catch {
      return '';
    }
  };
  const versionFromPath = (p) => {
    const m = /[\\/](\d+\.\d+\.\d+[\w.-]*)[\\/]bin[\\/]chipagents-[^\\/]+$/.exec(p);
    return m ? m[1] : '';
  };
  const installed = () => new Promise((resolve) => {
    const v = versionFromPath(realBin());
    if (v) return resolve(v);
    execFile(bin, ['--version'], { timeout: 20000 }, (err, out) => {
      const m = /\d+\.\d+\.\d+[\w.-]*/.exec(String(out || ''));
      resolve(!err && m ? m[0] : '');
    });
  });
  const writable = (p) => {
    try {
      fs.accessSync(p, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  };
  const managed = () => {
    if (process.env.CHIPAGENTS_INSTALL) return true;
    const real = realBin();
    if (!versionFromPath(real)) return true;
    let isLink = false;
    try {
      isLink = fs.lstatSync(bin).isSymbolicLink();
    } catch {
      isLink = false;
    }
    return !isLink || !writable(path.dirname(bin)) || !writable(path.dirname(path.dirname(path.dirname(real))));
  };
  const endpoint = () => {
    try {
      const m = /^\s*endpoint_url\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(CONFIG, 'utf8'));
      if (m) return m[1].replace(/\/+$/, '');
    } catch {
      return DEFAULT_ENDPOINT;
    }
    return DEFAULT_ENDPOINT;
  };
  const platform = () => {
    const base = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
    return path.basename(realBin()).includes('baseline') ? `${base}-baseline` : base;
  };
  async function latest(current, force = false) {
    if (!force && cache.value && Date.now() - cache.at < LATEST_TTL_MS) return cache.value;
    const ep = endpoint();
    let value;
    try {
      const r = await fetch(`${ep}/api/latest-version?platform=${encodeURIComponent(platform())}`, {
        headers: { 'X-Chipagents-Cli-Version': current || '', 'X-Chipagents-Platform': os.platform() },
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success || !j.data || !j.data.version) throw new Error(`HTTP ${r.status}`);
      value = { latest: j.data.version, endpoint: ep, checkedAt: Date.now(), error: '' };
    } catch (e) {
      value = { latest: null, endpoint: ep, checkedAt: Date.now(), error: (e.cause && e.cause.code) || e.message };
    }
    cache = { at: Date.now(), value };
    return value;
  }
  async function installer(dir) {
    if (process.env.UPDATE_INSTALLER) return process.env.UPDATE_INSTALLER;
    const r = await fetch(`${endpoint()}/install.sh`, { signal: AbortSignal.timeout(60000) });
    const text = await r.text();
    if (!r.ok || !text.startsWith('#!') || !text.includes('latest-version')) throw new Error(`could not download install.sh (HTTP ${r.status})`);
    const file = path.join(dir, 'install.sh');
    await fs.promises.writeFile(file, text, { mode: 0o700 });
    return file;
  }
  async function caBundle(dir) {
    const parts = [];
    for (const f of [...SYSTEM_CA, process.env.NODE_EXTRA_CA_CERTS]) {
      if (!f) continue;
      try {
        parts.push(await fs.promises.readFile(f, 'utf8'));
      } catch {
        continue;
      }
    }
    if (!parts.length) return '';
    const file = path.join(dir, 'ca.pem');
    await fs.promises.writeFile(file, parts.join('\n'));
    return file;
  }
  async function install(onPhase) {
    if (managed()) throw new Error('shared installation: ask your administrator to update it');
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ca-update-'));
    try {
      onPhase('downloading');
      const script = await installer(dir);
      const ca = await caBundle(dir);
      onPhase('installing');
      const env = { ...process.env };
      if (ca) env.CURL_CA_BUNDLE = ca;
      const { code, out, err } = await new Promise((resolve) => {
        const p = spawn('bash', [script, '--json'], { env, cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
        let o = '';
        let e = '';
        const t = setTimeout(() => p.kill('SIGKILL'), INSTALL_TIMEOUT_MS);
        p.stdout.on('data', (d) => { o += d; });
        p.stderr.on('data', (d) => { e += d; });
        p.on('error', (x) => { clearTimeout(t); resolve({ code: -1, out: o, err: x.message }); });
        p.on('close', (c) => { clearTimeout(t); resolve({ code: c, out: o, err: e }); });
      });
      let summary = null;
      try {
        summary = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
      } catch {
        summary = null;
      }
      if (code !== 0 || !summary || summary.exitCode !== 0) {
        const msg = (summary && summary.message) || err.trim().split('\n').pop() || `installer exited with ${code}`;
        throw new Error(msg.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 300));
      }
      const now = await installed();
      if (summary.version && now !== summary.version) throw new Error(`installer reported ${summary.version} but chipagents is ${now || 'missing'}`);
      return now;
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  return { installed, managed, endpoint, latest, install };
}

module.exports = { create, compare };
