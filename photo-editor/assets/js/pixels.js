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

export const ADJ_KEYS = ['brightness', 'contrast', 'highlights', 'shadows', 'saturation', 'warmth', 'tint', 'sharpen', 'vignette', 'blur'];
export const zeroAdj = () => Object.fromEntries(ADJ_KEYS.map(k => [k, 0]));
export const isIdentity = a => ADJ_KEYS.every(k => !a[k]);
const PIXEL_KEYS = ['brightness', 'contrast', 'highlights', 'shadows', 'saturation', 'warmth', 'tint', 'vignette'];

// All per-pixel changes on raw RGBA data (in place).
// geo = { x0, y0, w, W, H } says where this data sits in the whole picture (for dark corners).
export function applyAdjust(d, a, geo = null) {
  if (PIXEL_KEYS.every(k => !a[k])) return;
  // Brightness lifts or lowers the mid-tones (whites stay white), then contrast.
  const gamma = Math.pow(2, -(a.brightness || 0) / 60), c = (a.contrast || 0) * 0.9;
  const cf = (259 * (c + 255)) / (255 * (259 - c)), lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) lut[v] = (255 * Math.pow(v / 255, gamma) - 128) * cf + 128;
  const s = 1 + (a.saturation || 0) / 100, w = (a.warmth || 0) * 0.45, t = (a.tint || 0) * 0.35;
  const sh = (a.shadows || 0) / 100, hi = (a.highlights || 0) / 100, vg = (a.vignette || 0) / 100;
  const doVig = vg && geo;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] === 0) continue;
    // Colour balance first (like fixing the light source), then the tone curve.
    let r = lut[Math.max(0, Math.min(255, (d[i] + w + t) | 0))];
    let g = lut[Math.max(0, Math.min(255, (d[i + 1] - t) | 0))];
    let bl = lut[Math.max(0, Math.min(255, (d[i + 2] - w + t) | 0))];
    if (sh || hi) {
      const L = Math.max(1, 0.299 * r + 0.587 * g + 0.114 * bl) / 255;
      let nL = L;
      if (sh) { const ws = Math.max(0, 1 - L / 0.6) ** 2; nL += sh * ws * (sh > 0 ? 0.35 : 0.25 * L / 0.6 + 0.05); }
      if (hi) { const wh = Math.max(0, (L - 0.4) / 0.6) ** 2; nL += hi * 0.4 * wh; }
      const k = Math.max(0, nL) / L;
      r *= k; g *= k; bl *= k;
    }
    if (s !== 1) {
      const gr = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = gr + (r - gr) * s; g = gr + (g - gr) * s; bl = gr + (bl - gr) * s;
    }
    if (doVig) {
      const x = geo.x0 + (p % geo.w), y = geo.y0 + ((p / geo.w) | 0);
      const dx = (x - geo.W / 2) / (geo.W / 2), dy = (y - geo.H / 2) / (geo.H / 2);
      const dist = Math.sqrt(dx * dx + dy * dy) / 1.4142;
      const e = Math.min(1, Math.max(0, (dist - 0.35) / 0.65));
      const f = 1 - vg * 0.75 * e * e * (3 - 2 * e);
      r *= f; g *= f; bl *= f;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = bl;
  }
}

// Sharpness: unsharp mask on a canvas (in place).
export function sharpenCanvas(canvas, amount) {
  const w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d', { willReadFrequently: true });
  const soft = blurCanvas(canvas, Math.max(1.2, Math.max(w, h) * 0.0012)).getContext('2d').getImageData(0, 0, w, h).data;
  const id = ctx.getImageData(0, 0, w, h), d = id.data, k = amount / 100 * 1.6;
  for (let i = 0; i < d.length; i += 4) {
    d[i] += (d[i] - soft[i]) * k; d[i + 1] += (d[i + 1] - soft[i + 1]) * k; d[i + 2] += (d[i + 2] - soft[i + 2]) * k;
  }
  ctx.putImageData(id, 0, 0);
}

// "Auto fix": look at the picture and suggest slider values.
export function autoAdjust(src) {
  const m = Math.max(src.width, src.height), f = Math.min(1, 256 / m);
  const c = makeCanvas(src.width * f, src.height * f), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data, hist = new Uint32Array(256);
  let n = 0, sr = 0, sg = 0, sb = 0, sl = 0, dark = 0, bright = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    hist[L | 0]++; n++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; sl += L;
    if (L < 50) dark++; if (L > 235) bright++;
  }
  const out = zeroAdj();
  if (!n) return out;
  const pct = q => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * q) return v; } return 255; };
  const lo = pct(0.01), hiV = pct(0.99), mean = sl / n / 255;
  const cl = (v, a, b) => Math.round(Math.min(b, Math.max(a, v)));
  // Lift or lower the mid-tones towards a pleasant average.
  const gamma = Math.log(0.5) / Math.log(Math.min(0.95, Math.max(0.05, mean)));
  out.brightness = cl(-60 * Math.log2(gamma) * 0.7, -35, 55);
  out.contrast = cl((0.85 - (hiV - lo) / 255) * 60, -10, 25);
  out.shadows = dark / n > 0.12 ? cl(dark / n * 120, 10, 45) : 0;
  out.highlights = bright / n > 0.06 ? -cl(bright / n * 200, 10, 45) : 0;
  // Neutral colour balance (gently: only part of the way).
  out.warmth = cl(-(sr - sb) / n / 0.9 * 0.5, -35, 35);
  out.tint = cl(-((sg - (sr + sb) / 2) / n) / 0.35 * 0.35, -30, 30);
  out.saturation = 12; out.sharpen = 20;
  return out;
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
