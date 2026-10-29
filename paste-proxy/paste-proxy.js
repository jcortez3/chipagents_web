#!/usr/bin/env node
'use strict';
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const PASTE_DIR = process.env.PASTE_DIR || '/mnt/c/Users/jcortez3/Desktop/screens';
const PROXY_START = parseInt(process.env.PASTE_PROXY_PORT || '4300', 10);
const HUB_START = process.env.HUB_PORT || '4242';
const CHIPAGENTS = process.env.CHIPAGENTS_BIN || path.join(process.env.HOME || '', '.local/bin/chipagents');
const OPEN_BROWSER = process.env.PASTE_NO_BROWSER !== '1';
const MAX_BYTES = 25 * 1024 * 1024;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const INJECT_JS = fs.readFileSync(path.join(__dirname, 'paste-inject.js'));
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

function handleUpload(req, res) {
  if (req.method !== 'POST' || req.headers['x-chipagents-paste'] !== '1' || !originAllowed(req)) {
    return sendJson(res, 403, { error: 'forbidden' });
  }
  const ext = EXT[String(req.headers['content-type'] || '').toLowerCase()];
  if (!ext) return sendJson(res, 415, { error: 'unsupported image type' });
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
        body = body.includes('</head>') ? body.replace('</head>', `${TAG}</head>`) : TAG + body;
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
  if (p === '/__paste/upload') return handleUpload(req, res);
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
  execFile('explorer.exe', [url], () => {});
}

(async () => {
  proxyPort = await listen(PROXY_START);
  console.log(`[paste] proxy listening on 127.0.0.1:${proxyPort}, images -> ${PASTE_DIR}`);
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
