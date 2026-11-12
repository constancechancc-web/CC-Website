// Pixel work: colour adjustments, blur, flood erase, and the AI subject mask.
// Nothing here uses ctx.filter (Safari does not support it).

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
export function cloneCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

export const zeroAdj = () => ({ brightness: 0, contrast: 0, saturation: 0, warmth: 0, blur: 0 });
export const isIdentity = a => !a.brightness && !a.contrast && !a.saturation && !a.warmth && !a.blur;

// Brightness / contrast / colour strength / warmth on raw RGBA data (in place).
export function applyAdjust(d, a) {
  if (!a.brightness && !a.contrast && !a.saturation && !a.warmth) return;
  const b = a.brightness * 1.1, c = a.contrast * 0.9;
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const s = 1 + a.saturation / 100, w = a.warmth * 0.45;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = (d[i] - 128) * cf + 128 + b + w;
    let g = (d[i + 1] - 128) * cf + 128 + b;
    let bl = (d[i + 2] - 128) * cf + 128 + b - w;
    if (s !== 1) {
      const gr = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = gr + (r - gr) * s; g = gr + (g - gr) * s; bl = gr + (bl - gr) * s;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = bl;
  }
}

function blurPass(s, d, w, h, r, horiz) {
  const win = r * 2 + 1;
  const outer = horiz ? h : w, inner = horiz ? w : h;
  const step = horiz ? 4 : w * 4;
  for (let o = 0; o < outer; o++) {
    const base = horiz ? o * w * 4 : o * 4;
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
    for (let k = -r; k <= r; k++) {
      const i = base + Math.min(inner - 1, Math.max(0, k)) * step;
      a0 += s[i]; a1 += s[i + 1]; a2 += s[i + 2]; a3 += s[i + 3];
    }
    for (let x = 0; x < inner; x++) {
      const i = base + x * step;
      d[i] = a0 / win; d[i + 1] = a1 / win; d[i + 2] = a2 / win; d[i + 3] = a3 / win;
      const ia = base + Math.min(inner - 1, x + r + 1) * step;
      const ir = base + Math.max(0, x - r) * step;
      a0 += s[ia] - s[ir]; a1 += s[ia + 1] - s[ir + 1]; a2 += s[ia + 2] - s[ir + 2]; a3 += s[ia + 3] - s[ir + 3];
    }
  }
}

// Returns a new, blurred copy of the canvas. Big radii are done on a smaller
// copy and scaled back up, which is fast and looks the same.
export function blurCanvas(src, radius) {
  const w = src.width, h = src.height;
  const out = makeCanvas(w, h), octx = out.getContext('2d');
  if (radius < 0.5) { octx.drawImage(src, 0, 0); return out; }
  const f = Math.max(1, radius / 5);
  const sw = Math.max(1, Math.round(w / f)), sh = Math.max(1, Math.round(h / f));
  const small = makeCanvas(sw, sh), sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, sw, sh);
  const id = sctx.getImageData(0, 0, sw, sh), d = id.data;
  const pm = new Float32Array(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    pm[i] = d[i] * a; pm[i + 1] = d[i + 1] * a; pm[i + 2] = d[i + 2] * a; pm[i + 3] = d[i + 3];
  }
  const tmp = new Float32Array(d.length);
  const r = Math.max(1, Math.round(radius / f / 1.6));
  for (let p = 0; p < 3; p++) { blurPass(pm, tmp, sw, sh, r, true); blurPass(tmp, pm, sw, sh, r, false); }
  for (let i = 0; i < d.length; i += 4) {
    const a = pm[i + 3] / 255;
    if (a > 0.001) { d[i] = pm[i] / a; d[i + 1] = pm[i + 1] / a; d[i + 2] = pm[i + 2] / a; }
    d[i + 3] = pm[i + 3];
  }
  sctx.putImageData(id, 0, 0);
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(small, 0, 0, w, h);
  return out;
}

// Make the connected area of similar colour around (x, y) see-through.
// Returns how many pixels were cleared.
export function floodErase(canvas, x, y, tol) {
  x = Math.floor(x); y = Math.floor(y);
  const w = canvas.width, h = canvas.height;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  const ctx = canvas.getContext('2d');
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  const i0 = (y * w + x) * 4;
  if (d[i0 + 3] < 8) return 0;
  const sr = d[i0], sg = d[i0 + 1], sb = d[i0 + 2];
  const thr = (tol * 2.6) ** 2;
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h);
  let sp = 0, n = 0;
  stack[sp++] = y * w + x; seen[y * w + x] = 1;
  const push = q => {
    if (seen[q]) return;
    seen[q] = 1;
    const j = q * 4;
    if (d[j + 3] < 8) return;
    const dr = d[j] - sr, dg = d[j + 1] - sg, db = d[j + 2] - sb;
    if (dr * dr + dg * dg + db * db <= thr) stack[sp++] = q;
  };
  const last = w * (h - 1);
  while (sp) {
    const p = stack[--sp];
    d[p * 4 + 3] = 0; n++;
    const px = p % w;
    if (px > 0) push(p - 1);
    if (px < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < last) push(p + w);
  }
  ctx.putImageData(id, 0, 0);
  return n;
}

// ---------- AI subject mask (U2-Netp via onnxruntime-web, loaded on first use) ----------
let sessionP = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.append(s);
  });
}
export function loadAI() {
  if (!sessionP) {
    sessionP = (async () => {
      const base = new URL('assets/ai/', document.baseURI).href;
      if (!window.ort) await loadScript(base + 'ort.wasm.min.js');
      const ort = window.ort;
      ort.env.wasm.wasmPaths = base;
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = 'error';
      return ort.InferenceSession.create(base + 'u2netp.onnx', { executionProviders: ['wasm'] });
    })();
    sessionP.catch(() => { sessionP = null; });
  }
  return sessionP;
}

// Returns a 320x320 canvas whose alpha channel is the "this is the subject" mask.
export async function subjectMask(src) {
  const session = await loadAI();
  const S = 320, c = makeCanvas(S, S), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, S, S);
  const px = ctx.getImageData(0, 0, S, S).data;
  let max = 1;
  for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
  const n = S * S, input = new Float32Array(3 * n);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) input[ch * n + i] = (px[i * 4 + ch] / max - mean[ch]) / std[ch];
  const out = await session.run({ [session.inputNames[0]]: new window.ort.Tensor('float32', input, [1, 3, S, S]) });
  const m = out[session.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (m[i] < lo) lo = m[i]; if (m[i] > hi) hi = m[i]; }
  const id = ctx.createImageData(S, S), range = hi - lo || 1;
  for (let i = 0; i < n; i++) {
    const v = (m[i] - lo) / range;
    id.data[i * 4 + 3] = Math.max(0, Math.min(1, (v - 0.2) / 0.6)) * 255;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}
