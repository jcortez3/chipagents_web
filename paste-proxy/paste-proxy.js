#!/usr/bin/env node
'use strict';
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const BUILD = '2026-11-04b';

const PASTE_DIR = process.env.PASTE_DIR || path.join(process.cwd(), 'screens');
const GEN_DIR = process.env.GEN_DIR || path.join(PASTE_DIR, 'generated_images');
fs.mkdirSync(GEN_DIR, { recursive: true });
const PROXY_START = parseInt(process.env.PASTE_PROXY_PORT || '4300', 10);
const HUB_START = process.env.HUB_PORT || '4242';
const CHIPAGENTS = process.env.CHIPAGENTS_BIN || path.join(process.env.HOME || '', '.local/bin/chipagents');
const OPEN_BROWSER = process.env.PASTE_NO_BROWSER !== '1';
const MAX_BYTES = 25 * 1024 * 1024;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const IMG_EXT_RE = /\.(svg|png|jpe?g|gif|webp)$/i;
const IMG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";
const TOKEN_TTL_MS = 60 * 1000;
const ROOTS_TTL_MS = 10 * 1000;
const WORKSPACES_JSON = path.join(process.env.HOME || '', '.chipagents', 'workspaces.json');
const EXTRA_ROOTS = (process.env.PREVIEW_ROOTS || '').split(path.delimiter).filter(Boolean);
const INJECT_JS = Buffer.concat([
  Buffer.from(`window.__CA_PASTE_BUILD=${JSON.stringify(BUILD)};window.__CA_GEN_DIR=${JSON.stringify(GEN_DIR)};\n`),
  Buffer.from(`window.__CA_SVG2IMG=${JSON.stringify(path.join(__dirname, 'svg2img.py'))};\n`),
  fs.readFileSync(path.join(__dirname, 'paste-inject.js')),
]);
const TAG = '<script src="/__paste/inject.js"></script>';
const URL_RE = /http:\/\/(localhost|127\.0\.0\.1):(\d+)(\/hub\S*)/;

let upstreamPort = null;
let proxyPort = null;

function swapPort(v, port) {
  if (typeof v !== 'string') return v;
  return v.replace(/^(\w+:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i,
    (m, scheme, host) => `${scheme || ''}${host}:${port}`);
}

function upstreamHeaders(h) {
  const out = { ...h };
  out.host = swapPort(h.host || 'localhost', upstreamPort);
  if (h.origin) out.origin = swapPort(h.origin, upstreamPort);
  if (h.referer) out.referer = swapPort(h.referer, upstreamPort);
  return out;
}

function sendJson(res, code, obj) {
  if (res.headersSent) return;
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${p(d.getMilliseconds(), 3)}`;
}

function originAllowed(req) {
  const o = req.headers.origin;
  return !o || new RegExp(`^http://(localhost|127\\.0\\.0\\.1):${proxyPort}$`, 'i').test(o);
}

const tokenCache = new Map();
let launchToken = '';

function bearer(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  return m ? m[1] : '';
}

function requestToken(req) {
  return req.headers['x-access-token'] || bearer(req) || new URL(req.url, 'http://localhost').searchParams.get('token') || '';
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const AUTH_PROBES = ['/hub/api/workspaces', '/hub/api/threads', '/hub/api/projects', '/hub/api/settings'];
const DENIED = new Set([401, 403]);

function probe(p, creds) {
  return new Promise((resolve) => {
    const headers = { host: `127.0.0.1:${upstreamPort}` };
    if (creds.token) headers['x-access-token'] = creds.token;
    if (creds.auth) headers.authorization = creds.auth;
    if (creds.cookie) headers.cookie = creds.cookie;
    const r = http.request({ host: '127.0.0.1', port: upstreamPort, method: 'GET', path: p, headers }, (up) => {
      up.resume();
      resolve(up.statusCode);
    });
    r.setTimeout(5000, () => r.destroy());
    r.on('error', () => resolve(0));
    r.end();
  });
}

let lastWarn = { msg: '', at: 0 };
function warnOnce(msg) {
  if (msg === lastWarn.msg && Date.now() - lastWarn.at < 30000) return;
  lastWarn = { msg, at: Date.now() };
  console.warn(`[paste] ${msg}`);
}

async function authorized(req) {
  const creds = { token: requestToken(req), auth: req.headers.authorization || '', cookie: req.headers.cookie || '' };
  if (!upstreamPort) return false;
  if (creds.token && launchToken && sameSecret(creds.token, launchToken)) return true;
  if (!creds.token && !creds.cookie) {
    warnOnce('request has no hub access token or cookie (open the link printed above in this browser)');
    return false;
  }
  const key = [creds.token, creds.auth, creds.cookie].join('\n');
  if ((tokenCache.get(key) || 0) > Date.now()) return true;
  const seen = [];
  for (const p of AUTH_PROBES) {
    const [withCreds, without] = await Promise.all([probe(p, creds), probe(p, {})]);
    seen.push(`${p} ${withCreds}/${without}`);
    if (DENIED.has(without) && withCreds && !DENIED.has(withCreds)) {
      tokenCache.set(key, Date.now() + TOKEN_TTL_MS);
      return true;
    }
    if (DENIED.has(without) && DENIED.has(withCreds)) break;
  }
  warnOnce(`hub rejected the request's credentials (token: ${creds.token ? 'yes' : 'no'}, cookie: ${creds.cookie ? 'yes' : 'no'}; status with/without: ${seen.join(', ')})`);
  return false;
}

let rootsCache = { at: 0, roots: [] };

async function previewRoots() {
  if (Date.now() - rootsCache.at < ROOTS_TTL_MS) return rootsCache.roots;
  let ws = [];
  try {
    const j = JSON.parse(await fs.promises.readFile(WORKSPACES_JSON, 'utf8'));
    ws = (j.workspaces || []).flatMap((w) => w.roots || []);
  } catch {
    ws = [];
  }
  const roots = [];
  for (const r of [PASTE_DIR, GEN_DIR, process.cwd(), ...EXTRA_ROOTS, ...ws]) {
    try {
      const real = await fs.promises.realpath(r);
      if (!roots.includes(real)) roots.push(real);
    } catch {
      continue;
    }
  }
  rootsCache = { at: Date.now(), roots };
  return roots;
}

function toPosix(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}` : p;
}

async function resolveImage(raw) {
  const p = toPosix(String(raw || '').trim());
  if (!p || p.includes('\0') || !IMG_EXT_RE.test(p)) return null;
  const roots = await previewRoots();
  const candidates = path.isAbsolute(p) ? [p] : roots.map((r) => path.join(r, p));
  for (const c of candidates) {
    try {
      const real = await fs.promises.realpath(c);
      if (!IMG_EXT_RE.test(real)) continue;
      if (!roots.some((r) => real.startsWith(r + path.sep))) continue;
      const st = await fs.promises.stat(real);
      if (st.isFile() && st.size <= MAX_BYTES) return real;
    } catch {
      continue;
    }
  }
  return null;
}

async function handleImage(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });
  if (!(await authorized(req))) return sendJson(res, 401, { error: 'unauthorized' });
  const file = await resolveImage(new URL(req.url, 'http://localhost').searchParams.get('path'));
  if (!file) return sendJson(res, 404, { error: 'not found' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    res.writeHead(200, {
      'Content-Type': MIME[file.split('.').pop().toLowerCase()],
      'Content-Length': data.length,
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': IMG_CSP,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

async function handleUpload(req, res) {
  if (req.method !== 'POST' || req.headers['x-chipagents-paste'] !== '1' || !originAllowed(req)) {
    return sendJson(res, 403, { error: 'forbidden' });
  }
  const ext = EXT[String(req.headers['content-type'] || '').toLowerCase()];
  if (!ext) return sendJson(res, 415, { error: 'unsupported image type' });
  if (!(await authorized(req))) {
    req.resume();
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  const chunks = [];
  let size = 0;
  let tooBig = false;
  req.on('data', (c) => {
    if (tooBig) return;
    size += c.length;
    if (size > MAX_BYTES) {
      tooBig = true;
      sendJson(res, 413, { error: 'image larger than 25 MB' });
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    if (tooBig) return;
    const file = path.join(PASTE_DIR, `paste_${stamp()}.${ext}`);
    fs.mkdir(PASTE_DIR, { recursive: true }, (mkErr) => {
      if (mkErr) return sendJson(res, 500, { error: mkErr.message });
      fs.writeFile(file, Buffer.concat(chunks), (err) => {
        if (err) return sendJson(res, 500, { error: err.message });
        console.log(`[paste] saved ${file} (${size} bytes)`);
        sendJson(res, 200, { path: file });
      });
    });
  });
}

function proxyHttp(req, res) {
  if (!upstreamPort) return sendJson(res, 503, { error: 'chipagents web is still starting' });
  const headers = upstreamHeaders(req.headers);
  if (String(req.headers.accept || '').includes('text/html')) delete headers['accept-encoding'];
  const up = http.request({ host: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url, headers }, (upRes) => {
    const h = { ...upRes.headers };
    if (h.location) h.location = swapPort(h.location, proxyPort);
    if (String(h['content-type'] || '').includes('text/html') && !h['content-encoding']) {
      const chunks = [];
      upRes.on('data', (c) => chunks.push(c));
      upRes.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        body = /<head[^>]*>/i.test(body) ? body.replace(/<head[^>]*>/i, (h) => h + TAG) : TAG + body;
        const buf = Buffer.from(body, 'utf8');
        h['content-length'] = String(buf.length);
        delete h['transfer-encoding'];
        res.writeHead(upRes.statusCode, h);
        res.end(buf);
      });
      return;
    }
    res.writeHead(upRes.statusCode, upRes.statusMessage, h);
    upRes.pipe(res);
  });
  up.on('error', (err) => {
    if (res.headersSent) res.destroy();
    else sendJson(res, 502, { error: `upstream unavailable: ${err.message}` });
  });
  res.on('close', () => up.destroy());
  req.pipe(up);
}

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/__paste/inject.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(INJECT_JS);
  }
  const fail = (e) => sendJson(res, 500, { error: e.message });
  if (p === '/__paste/upload') return void handleUpload(req, res).catch(fail);
  if (p === '/__img') return void handleImage(req, res).catch(fail);
  proxyHttp(req, res);
});
server.requestTimeout = 0;
server.headersTimeout = 0;

server.on('upgrade', (req, socket, head) => {
  if (!upstreamPort) return socket.destroy();
  const up = net.connect(upstreamPort, '127.0.0.1', () => {
    const headers = upstreamHeaders(req.headers);
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(headers)) for (const vv of [].concat(v)) raw += `${k}: ${vv}\r\n`;
    up.write(`${raw}\r\n`);
    if (head && head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  const kill = () => { up.destroy(); socket.destroy(); };
  up.on('error', kill);
  socket.on('error', kill);
  up.on('close', kill);
  socket.on('close', kill);
});

function listen(port) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => {
      server.removeListener('listening', onOk);
      if (e.code === 'EADDRINUSE' && port < PROXY_START + 50) resolve(listen(port + 1));
      else reject(e);
    };
    const onOk = () => { server.removeListener('error', onErr); resolve(port); };
    server.once('error', onErr);
    server.once('listening', onOk);
    server.listen(port, '127.0.0.1');
  });
}

function openBrowser(url) {
  if (!OPEN_BROWSER) return;
  execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], () => {});
}

(async () => {
  proxyPort = await listen(PROXY_START);
  console.log(`[paste] build ${BUILD}`);
  console.log(`[paste] proxy listening on 127.0.0.1:${proxyPort}, pasted -> ${PASTE_DIR}, generated -> ${GEN_DIR}`);
  const child = spawn(CHIPAGENTS, ['web'], {
    env: { ...process.env, HUB_PORT: HUB_START },
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const m = line.match(URL_RE);
      if (m && !upstreamPort) {
        upstreamPort = parseInt(m[2], 10);
        launchToken = new URL(m[3], 'http://localhost').searchParams.get('token') || '';
        const url = `http://localhost:${proxyPort}${m[3]}`;
        console.log(`  ChipAgents web (with image paste): ${url}`);
        console.log(`  (upstream chipagents web on port ${upstreamPort})`);
        openBrowser(url);
      } else if (!m) {
        console.log(line);
      }
    }
  });
  const stop = () => { child.kill('SIGTERM'); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('SIGHUP', stop);
  child.on('exit', (code) => { server.close(); process.exit(code ?? 0); });
})().catch((e) => {
  console.error(`[paste] failed: ${e.message}`);
  process.exit(1);
});
