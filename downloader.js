/* Vethos downloader
   Streams Hugging Face model files straight into the Cache API, under the exact keys Transformers.js reads.
   - never loads the model while downloading (no RAM/GPU spike, no pipeline())
   - big files are fetched in small Range chunks (resumable, low memory); falls back to one streamed request
   - every file is size-checked; partial data never counts as "installed"
   - retries with backoff, waits when offline, keeps the screen awake */
(function (root) {
'use strict';
const HF = 'https://huggingface.co', CACHE = 'transformers-cache', PARTS = 'vethos-parts', PARTHOST = 'https://vethos.local/__parts/';
const cfg = { ch: 4 * 1024 * 1024, retry: 40 };
const SUFD = { fp32: '', fp16: '_fp16', q8: '_quantized', int8: '_int8', uint8: '_uint8', q4: '_q4', q4f16: '_q4f16', bnb4: '_bnb4' };
const furl = (id, p) => HF + '/' + id + '/resolve/main/' + p;
const isBig = p => /\.onnx(_data(_\d+)?)?$/.test(p);
const hdr = n => { const h = { 'content-type': 'application/octet-stream' }; if (n) h['content-length'] = String(n); return h };

function abortErr() { const e = new Error('Download cancelled'); e.name = 'AbortError'; return e }
function httpErr(s) {
  const e = new Error(s === 401 || s === 403 ? 'This model needs a Hugging Face login (gated model)' : s === 404 ? 'File not found on Hugging Face' : 'HTTP ' + s);
  e.status = s; e.fatal = s >= 400 && s < 500 && s !== 408 && s !== 429; return e;
}
function sleep(ms, sig) {
  return new Promise(res => {
    const done = () => { clearTimeout(t); sig.removeEventListener('abort', done); res() };
    const t = setTimeout(done, ms); sig.addEventListener('abort', done, { once: true });
  });
}
function why(e) {
  if (!e) return 'unknown';
  if (e.name === 'TypeError') return 'network blocked or dropped';
  return String(e.message || e).slice(0, 40);
}
async function pause(ctx, a, max, e) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    ctx.status('Waiting for internet…', true);
    await new Promise(res => {
      const done = () => { removeEventListener('online', done); ctx.sig.removeEventListener('abort', done); res() };
      addEventListener('online', done); ctx.sig.addEventListener('abort', done, { once: true });
    });
  } else ctx.status('Retry ' + (a + 1) + '/' + max + ': ' + why(e), true);
  await sleep(Math.min(10000, 800 * Math.pow(2, a)), ctx.sig);
  if (ctx.sig.aborted) throw abortErr();
}
async function retry(ctx, max, fn) {
  for (let a = 0; ; a++) {
    if (ctx.sig.aborted) throw abortErr();
    try { const v = await fn(a); if (a > 0 && ctx.cur) ctx.status(ctx.cur); return v }
    catch (e) {
      if (ctx.sig.aborted || (e && e.name === 'AbortError')) throw abortErr();
      if (e && (e.fatal || e.noRange)) throw e;
      if (a >= max) throw e;
      ctx.lastErr = e; await pause(ctx, a, max, e);
    }
  }
}

async function tree(id, sub, ctx) {
  return retry(ctx, 3, async () => {
    const r = await fetch(HF + '/api/models/' + id + '/tree/main' + (sub ? '/' + sub : ''), { signal: ctx.sig });
    if (r.status === 404 && sub) return [];
    if (!r.ok) throw httpErr(r.status);
    const j = await r.json();
    return j.filter(f => f.type === 'file').map(f => ({ path: f.path, size: (f.lfs && f.lfs.size) || f.size || 0 }));
  });
}
async function plan(id, dtype, ctx) {
  const suf = SUFD[dtype]; if (suf === undefined) throw new Error('Unknown model type: ' + dtype);
  const [rootF, onnxF] = await Promise.all([tree(id, '', ctx), tree(id, 'onnx', ctx)]);
  const re = new RegExp('^onnx/model' + suf + '\\.onnx(_data(_\\d+)?)?$');
  const model = onnxF.filter(f => re.test(f.path)).sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }));
  if (!model.some(f => /\.onnx$/.test(f.path))) throw new Error('No ' + dtype + ' ONNX file in this model');
  const small = rootF.filter(f => /\.(json|jinja|txt)$/i.test(f.path) && f.size <= 30e6 && !/index\.json$|safetensors|pytorch_model|flax_model|tf_model/i.test(f.path));
  if (!small.some(f => f.path === 'config.json')) throw new Error('config.json is missing in this model');
  const files = small.concat(model);
  return { files, small, model, total: files.reduce((a, f) => a + (f.size || 0), 0) };
}

async function hasFull(cache, u, size) {
  const r = await cache.match(u); if (!r) return false;
  if (!size) return true;
  const cl = +r.headers.get('content-length'); return !cl || cl === size;
}
async function small(cache, f, ctx, id) {
  const u = furl(id, f.path);
  if (await cache.match(u)) { ctx.add(f.size); return }
  await retry(ctx, 3, async () => {
    const r = await fetch(u, { signal: ctx.sig }); if (!r.ok) throw httpErr(r.status);
    await cache.put(u, r);
  });
  ctx.add(f.size);
}
async function rangeOK(u, ctx) {
  try {
    const r = await fetch(u, { headers: { Range: 'bytes=0-1023' }, signal: ctx.sig });
    const ok = r.status === 206; if (r.body) { try { await r.body.cancel() } catch (e) {} } return ok;
  } catch (e) { if (ctx.sig.aborted) throw abortErr(); return false }
}
async function streamed(cache, u, f, ctx) {
  await retry(ctx, 10, async () => {
    let got = 0;
    try {
      const r = await fetch(u, { signal: ctx.sig }); if (!r.ok) throw httpErr(r.status);
      if (!r.body || !r.body.pipeThrough) throw new Error('Streaming is not supported in this browser');
      const ts = new TransformStream({ transform(c, ctl) { got += c.byteLength; ctx.add(c.byteLength); ctl.enqueue(c) } });
      await cache.put(u, new Response(r.body.pipeThrough(ts), { headers: hdr(f.size) }));
      if (f.size && got !== f.size) { await cache.delete(u); throw new Error('Downloaded size does not match') }
    } catch (e) { ctx.add(-got); try { await cache.delete(u) } catch (_) {} throw e }
  });
}
async function dropParts(u) {
  const parts = await caches.open(PARTS), pre = PARTHOST + encodeURIComponent(u) + '/';
  for (const k of await parts.keys()) if (k.url.indexOf(pre) === 0) await parts.delete(k);
}
// Range download that keeps every byte it receives: a part is stored under its start offset with its real length,
// so a short/cut response is never thrown away and pause/resume/crash all continue from the first missing byte.
async function chunked(cache, u, f, ctx) {
  const parts = await caches.open(PARTS), size = f.size, CH = cfg.ch;
  const pre = PARTHOST + encodeURIComponent(u) + '/', pk = s => pre + s;
  const found = [];
  for (const k of await parts.keys()) {
    if (k.url.indexOf(pre) !== 0) continue;
    const s = +k.url.slice(pre.length), r = await parts.match(k);
    found.push({ s: s, l: r ? +r.headers.get('content-length') : 0, url: k.url });
  }
  found.sort((a, b) => a.s - b.s);
  const list = []; let pos = 0;
  for (const p of found) {
    if (p.s === pos && p.l > 0 && pos + p.l <= size) { list.push(p); pos += p.l; ctx.add(p.l) }
    else await parts.delete(p.url);
  }
  let fails = 0;
  while (pos < size) {
    const start = pos, end = Math.min(size - 1, start + CH - 1), want = end - start + 1;
    ctx.status('File ' + ctx.fi + '/' + ctx.fn);
    let got = 0, err = null; const bufs = [];
    try {
      const r = await fetch(u, { headers: { Range: 'bytes=' + start + '-' + end }, signal: ctx.sig });
      if (r.status === 200) { try { await r.body.cancel() } catch (e) {} const e = new Error('Server ignores Range'); e.noRange = true; throw e }
      if (r.status !== 206) throw httpErr(r.status);
      const rd = r.body.getReader();
      for (;;) {
        const x = await rd.read(); if (x.done) break;
        let v = x.value; if (got + v.byteLength > want) v = v.subarray(0, want - got);
        bufs.push(v); got += v.byteLength; ctx.add(v.byteLength);
        if (got >= want) { try { await rd.cancel() } catch (e) {} break }
      }
    } catch (e) { err = e }
    if (got > 0) {   // keep whatever arrived, even if the connection died or the server ended early
      await parts.put(pk(start), new Response(new Blob(bufs), { headers: { 'content-length': String(got) } }));
      list.push({ s: start, l: got, url: pk(start) }); pos += got; fails = 0;
    }
    if (err) {
      if (err.noRange) throw err;
      if (ctx.sig.aborted || err.name === 'AbortError') throw abortErr();
      if (err.fatal) throw err;
      if (got === 0) { if (++fails > cfg.retry) throw err; await pause(ctx, fails - 1, cfg.retry, err) }
    } else if (got === 0) {
      if (++fails > cfg.retry) throw new Error('Server sent no data');
      await pause(ctx, fails - 1, cfg.retry, new Error('empty response'));
    }
    if (ctx.sig.aborted) throw abortErr();
  }
  // assemble: stream the parts into one cache entry, deleting each part once consumed (keeps disk use ~1x)
  let i = 0;
  const stream = new ReadableStream({
    async pull(c) {
      if (i >= list.length) { c.close(); return }
      const p = list[i], r = await parts.match(p.url);
      if (!r) { c.error(new Error('A downloaded part is missing')); return }
      const b = new Uint8Array(await r.arrayBuffer()); await parts.delete(p.url); i++; c.enqueue(b);
    }
  });
  await cache.put(u, new Response(stream, { headers: hdr(size) }));
}
async function big(cache, f, ctx, id) {
  const u = furl(id, f.path);
  if (await hasFull(cache, u, f.size)) { ctx.add(f.size); return }
  await cache.delete(u);
  const base = ctx.loaded;
  ctx.status('File ' + ctx.fi + '/' + ctx.fn);
  if (ctx.mode === undefined) ctx.mode = (f.size > cfg.ch && await rangeOK(u, ctx)) ? 'range' : 'stream';
  if (ctx.mode === 'range' && f.size > cfg.ch) {
    try { await chunked(cache, u, f, ctx); return }
    catch (e) { if (!e.noRange) throw e; ctx.mode = 'stream'; ctx.add(base - ctx.loaded); await dropParts(u) }
  }
  await streamed(cache, u, f, ctx);
}

function wakeLock() {
  let lock = null, on = true;
  const get = () => { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { lock = l; if (!on) l.release().catch(() => {}) }).catch(() => {}) } catch (e) {} };
  const vis = () => { if (on && document.visibilityState === 'visible' && (!lock || lock.released)) get() };
  get(); try { document.addEventListener('visibilitychange', vis) } catch (e) {}
  return () => { on = false; try { document.removeEventListener('visibilitychange', vis) } catch (e) {} if (lock) lock.release().catch(() => {}) };
}

async function download(id, dtype, o) {
  o = o || {};
  if (!supported()) throw new Error('This browser cannot store models. Open the app over https or localhost.');
  const sig = o.signal || new AbortController().signal;
  const ctx = {
    sig, total: 0, loaded: 0, fi: 0, fn: 0, mode: o.mode,
    add(n) { this.loaded = Math.max(0, this.loaded + n); if (o.onProgress) o.onProgress(this.loaded, this.total) },
    status(s, tmp) { if (!tmp) this.cur = s; if (o.onStatus) o.onStatus(s) }
  };
  ctx.status('Checking files…');
  const pl = await plan(id, dtype, ctx);
  ctx.total = pl.total; ctx.fn = pl.files.length;
  const release = wakeLock();
  try {
    const cache = await caches.open(CACHE);
    for (let k = 0; k < pl.files.length; k++) {
      const f = pl.files[k]; ctx.fi = k + 1;
      if (isBig(f.path)) await big(cache, f, ctx, id); else await small(cache, f, ctx, id);
    }
    // generation_config.json is optional; cache an empty one so offline loading never tries the network for it
    const gu = furl(id, 'generation_config.json');
    if (!pl.small.some(f => f.path === 'generation_config.json') && !(await cache.match(gu)))
      await cache.put(gu, new Response('{}', { headers: { 'content-type': 'application/json' } }));
    ctx.status('Done');
    return { files: pl.files.length, bytes: pl.total };
  } finally { release() }
}


// ---- GGUF (llama.cpp) storage: same chunked/resumable downloader, stored in its own cache ----
const GCACHE = 'vethos-gguf';
async function downloadG(id, files, o) {
  o = o || {};
  if (!supported()) throw new Error('This browser cannot store models. Open the app over https or localhost.');
  const sig = o.signal || new AbortController().signal;
  const ctx = {
    sig, total: files.reduce((a, f) => a + (f.size || 0), 0), loaded: 0, fi: 0, fn: files.length, mode: o.mode,
    add(n) { this.loaded = Math.max(0, this.loaded + n); if (o.onProgress) o.onProgress(this.loaded, this.total) },
    status(s, tmp) { if (!tmp) this.cur = s; if (o.onStatus) o.onStatus(s) }
  };
  const release = wakeLock();
  try {
    const cache = await caches.open(GCACHE);
    for (let k = 0; k < files.length; k++) {
      if (!files[k].size) throw new Error('File size unknown');
      ctx.fi = k + 1; await big(cache, files[k], ctx, id);
    }
    ctx.status('Done');
    return { files: files.length, bytes: ctx.total };
  } finally { release() }
}
async function readyG(m) {
  try {
    if (!root.caches || !m || !m.files || !m.files.length) return false;
    const c = await caches.open(GCACHE);
    for (const f of m.files) if (!(await hasFull(c, furl(m.id, f.path), f.size))) return false;
    return true;
  } catch (e) { return false }
}
async function blobsG(m) {
  const c = await caches.open(GCACHE), out = [];
  for (const f of m.files) {
    const r = await c.match(furl(m.id, f.path));
    if (!r) throw new Error('MISSING');
    out.push(await r.blob());
  }
  return out;
}
async function purgeG(id, files) {
  try {
    if (!root.caches || !files) return;
    const c = await caches.open(GCACHE), p = await caches.open(PARTS);
    for (const f of files) {
      const u = furl(id, f.path); await c.delete(u);
      const pre = PARTHOST + encodeURIComponent(u) + '/';
      for (const k of await p.keys()) if (k.url.indexOf(pre) === 0) await p.delete(k);
    }
  } catch (e) {}
}
// copy .gguf files picked from phone storage into the cache under the same keys
async function importG(id, list, o) {
  o = o || {};
  if (!supported()) throw new Error('This browser cannot store models. Open the app over https or localhost.');
  const cache = await caches.open(GCACHE);
  const total = list.reduce((a, x) => a + x.size, 0); let done = 0;
  const release = wakeLock();
  try {
    for (let k = 0; k < list.length; k++) {
      const it = list[k], u = furl(id, it.path);
      if (o.onStatus) o.onStatus('Copying ' + (k + 1) + '/' + list.length + ': ' + it.path);
      try {
        let body = it.file, streamed = false;
        if (it.file.stream && root.TransformStream) {
          streamed = true;
          body = it.file.stream().pipeThrough(new TransformStream({ transform(c, ctl) { done += c.byteLength; if (o.onProgress) o.onProgress(done, total); ctl.enqueue(c) } }));
        }
        await cache.put(u, new Response(body, { headers: hdr(it.size) }));
        if (!streamed) { done += it.size; if (o.onProgress) o.onProgress(done, total) }
      } catch (e) { try { await cache.delete(u) } catch (_) {} throw e }
    }
    return { files: list.length, bytes: total };
  } finally { release() }
}

async function ready(id, dtype) {
  try {
    const suf = SUFD[dtype]; if (suf === undefined || !root.caches) return false;
    const c = await caches.open(CACHE);
    return !!(await c.match(furl(id, 'config.json'))) && !!(await c.match(furl(id, 'onnx/model' + suf + '.onnx')));
  } catch (e) { return false }
}
async function purgeParts(id, dtype) {
  try {
    if (!root.caches) return;
    const c = await caches.open(PARTS);
    const pre = encodeURIComponent(HF + '/' + id + '/resolve/main/' + (dtype && SUFD[dtype] !== undefined ? 'onnx/model' + SUFD[dtype] + '.onnx' : ''));
    for (const k of await c.keys()) if (k.url.indexOf(PARTHOST + pre) === 0) await c.delete(k);
  } catch (e) {}
}
function supported() { return !!(root.caches && root.ReadableStream && root.TransformStream && root.Response && root.Blob) }

root.VDL = { downloadG, readyG, blobsG, purgeG, importG, supported, cfg, ver: '10-gguf' };
})(typeof self !== 'undefined' ? self : globalThis);
