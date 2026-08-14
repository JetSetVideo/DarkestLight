// Self-contained helpers: PRNG, value noise, shape recognition, misc math.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (rng, a, b) => a + rng() * (b - a);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// Hang guard (debug): main.js stamps __DL_FRAME_T0 each frame; if a single
// frame exceeds 4s we throw to unwind whatever is spinning, with a full stack.
const _glob = typeof window !== 'undefined' ? window : globalThis;
export function dlGuard(label) {
  const t0 = _glob.__DL_FRAME_T0;
  // A hidden or occluded tab has its rAF throttled or paused, so the frame
  // epoch stops advancing and every subsequent check looks like a 4s hang.
  // That is exactly the false alarm behind the 2026-08-01 "freeze" scare, and
  // it also fires for work started outside the loop (menu clicks, console).
  // Re-baseline instead of throwing: a real hang will still be caught on the
  // next genuine frame.
  if (typeof document !== 'undefined' && document.hidden) {
    _glob.__DL_FRAME_T0 = performance.now();
    return;
  }
  if (t0 && performance.now() - t0 > 4000) {
    _glob.__DL_FRAME_T0 = 0;
    const err = new Error('DL-HANG@' + label);
    _glob.__DL_HANG = { label, stack: err.stack };
    try { _glob.localStorage?.setItem('DL_HANG', err.stack); } catch { /* ignore */ }
    console.error('[DL-HANG]', label, err.stack);
    throw err;
  }
}

export const dist2 = (ax, az, bx, bz) => {
  dlGuard('dist2');
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

// ---------------- Value noise (own implementation, no deps) ----------------
export function makeNoise2D(seed) {
  const rng = mulberry32(seed);
  const SIZE = 256;
  const grid = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (x, y) => grid[((y & (SIZE - 1)) * SIZE + (x & (SIZE - 1)))];
  const smooth = (t) => t * t * (3 - 2 * t);
  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  };
}

export function makeFBM(seed, octaves = 4) {
  const n = makeNoise2D(seed);
  return function (x, y) {
    let v = 0, amp = 0.5, f = 1, tot = 0;
    for (let o = 0; o < octaves; o++) {
      v += n(x * f, y * f) * amp;
      tot += amp; amp *= 0.5; f *= 2;
    }
    return v / tot; // 0..1
  };
}

// ---------------- Spell shape recognition ----------------
// Output: 'circle' | 'circle_soft' | 'circle_hold' | 'line' | 'zigzag' | 'zigzag_heavy' | 'spiral' | 'star' | null
export function recognizeShape(pts) {
  if (pts.length < 6) return null;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (len < 40) return null;

  const start = pts[0], end = pts[pts.length - 1];
  const endDist = Math.hypot(end.x - start.x, end.y - start.y);

  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  let rSum = 0;
  for (const p of pts) rSum += Math.hypot(p.x - cx, p.y - cy);
  const rMean = rSum / pts.length;
  let rVar = 0;
  for (const p of pts) { const d = Math.hypot(p.x - cx, p.y - cy) - rMean; rVar += d * d; }
  rVar = Math.sqrt(rVar / pts.length);

  // Spiral: radius grows/shrinks while winding (angle progress high)
  let angProg = 0, prevA = Math.atan2(pts[0].y - cy, pts[0].x - cx);
  let rFirst = Math.hypot(pts[0].x - cx, pts[0].y - cy);
  let rLast = Math.hypot(end.x - cx, end.y - cy);
  for (let i = 1; i < pts.length; i++) {
    const a = Math.atan2(pts[i].y - cy, pts[i].x - cx);
    let d = a - prevA;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    angProg += d;
    prevA = a;
  }
  if (Math.abs(angProg) > Math.PI * 2.2 && Math.abs(rLast - rFirst) / Math.max(rMean, 1) > 0.25)
    return 'spiral';

  // Star: closed-ish, many sharp turns, high radius variance
  let turns = 0, prevAng = null;
  for (let i = 2; i < pts.length; i += 2) {
    const ang = Math.atan2(pts[i].y - pts[i - 2].y, pts[i].x - pts[i - 2].x);
    if (prevAng !== null) {
      let d = Math.abs(ang - prevAng);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d > 1.0) turns++;
    }
    prevAng = ang;
  }
  if (endDist < rMean * 1.1 && turns >= 5 && rVar / rMean > 0.28) return 'star';

  // Soft heal circle: small, smooth, closed (Healing Aura)
  if (endDist < rMean * 0.95 && rVar / rMean < 0.28 && rMean > 12 && rMean < 55 && len < 280)
    return 'circle_soft';
  // Firm large closed circle → Shield (Lexicon circle_hold). Mid-size stays rain.
  if (endDist < rMean * 0.85 && rVar / rMean < 0.22 && rMean > 70 && len > 400)
    return 'circle_hold';
  // Full rain circle: larger closed loop
  if (endDist < rMean * 0.9 && rVar / rMean < 0.35 && rMean > 25) return 'circle';
  // Long jagged stroke → Earthquake (Lexicon zigzag_heavy). Shorter zigzags stay fire.
  if (turns >= 5 && len > 420) return 'zigzag_heavy';
  if (turns >= 3) return 'zigzag';
  if (endDist / len > 0.82) return 'line';
  return null;
}

// ---------------- Name generation (form-specific per civilization) ----------------
// Each civ has a naming grammar: prefix/root/suffix patterns that feel cultural.
const NAME_FORMS = {
  chinese: {
    forms: ['{family} {given}', '{given}{given2}', '{family}{given}'],
    family: ['Li', 'Wei', 'Zhang', 'Chen', 'Wang', 'Liu', 'Zhao', 'Sun', 'Wu', 'Zhou'],
    given: ['Mei', 'Yun', 'Xia', 'Feng', 'Bao', 'Jin', 'Hao', 'Lan', 'Qi', 'Tao', 'An', 'Bo'],
    given2: ['wei', 'ming', 'hua', 'ling', 'jun', 'xin', 'yan'],
  },
  vikings: {
    forms: ['{root}{suffix}', '{root}{patron}'],
    root: ['Bjorn', 'Ulf', 'Sig', 'Ragn', 'Thor', 'Leif', 'Gud', 'Hall', 'Eir', 'Astr', 'Inga', 'Ket'],
    suffix: ['ar', 'olf', 'mund', 'hild', 'dis', 'var', 'stein', 'brand'],
    patron: ['sson', 'sdottir'],
  },
  franks: {
    forms: ['{root}{suffix}', '{pref}{root}'],
    pref: ['Char', 'Ber', 'Clo', 'Thi', 'Ade', 'Gis', 'Pep', 'Mer'],
    root: ['lot', 'tram', 'bert', 'bald', 'win', 'gard', 'mund', 'hild'],
    suffix: ['ric', 'bert', 'ard', 'ilde', 'ois', 'aine'],
  },
  orcs: {
    forms: ['{harsh}{harsh2}', '{harsh}\'{harsh2}', 'G{harsh}'],
    harsh: ['Grum', 'Zog', 'Mork', 'Ug', 'Thra', 'Gna', 'Bol', 'Ruk', 'Sha', 'Dur', 'Naz', 'Krag'],
    harsh2: ['zog', 'nak', 'gul', 'bash', 'ruk', 'thar', 'mok', 'ush'],
  },
  elves: {
    forms: ['{soft}{soft2}', '{soft}\'{soft2}iel', '{soft}an{soft2}'],
    soft: ['Ael', 'Thal', 'Lor', 'Syl', 'Fae', 'Nim', 'Ela', 'Vae', 'Ith', 'Ria', 'Cel', 'Lir'],
    soft2: ['wen', 'dor', 'ith', 'iel', 'anor', 'ys', 'ael', 'oth'],
  },
  aztecs: {
    forms: ['{root}{root2}', '{root}tl{root2}', '{root}-{root2}'],
    root: ['Xochi', 'Tla', 'Cua', 'Itz', 'Teo', 'Mixt', 'Citla', 'Nau', 'Atl', 'Coa', 'Yoli', 'Metz'],
    root2: ['tl', 'coatl', 'calli', 'pan', 'tec', 'mitl', 'xochitl', 'ton'],
  },
};

function fillForm(rng, form, bags) {
  return form.replace(/\{(\w+)\}/g, (_, key) => {
    const bag = bags[key];
    return bag ? pick(rng, bag) : key;
  });
}

export function genName(rng, civKey) {
  const cfg = NAME_FORMS[civKey] || NAME_FORMS.franks;
  const form = pick(rng, cfg.forms);
  let n = fillForm(rng, form, cfg);
  // tidy: collapse double spaces, capitalize first letter of each word
  n = n.replace(/\s+/g, ' ').trim();
  n = n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return n;
}

/** Procedural canvas noise map → THREE-ready data URL. style: grain | bark | cloth | moss | rock | skin */
export function noiseTextureDataURL(seed, size = 64, baseHex = 0x888888, variance = 40, style = 'grain') {
  const canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (!canvas) return null;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rng = mulberry32(seed >>> 0);
  const br = (baseHex >> 16) & 255, bg = (baseHex >> 8) & 255, bb = baseHex & 255;
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + (seed % 997) * 0.013) * 43758.5453;
    return n - Math.floor(n);
  };
  const value = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y) => {
    let s = 0, a = 0.55, f = 1, tot = 0;
    for (let o = 0; o < 4; o++) { s += value(x * f, y * f) * a; tot += a; a *= 0.5; f *= 2; }
    return s / tot;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = fbm(x * 0.18, y * 0.18);
      if (style === 'bark') n = n * 0.65 + value(x * 0.9, y * 0.12) * 0.35;
      else if (style === 'cloth') n = n * 0.55 + ((x + y) % 4 < 1 ? 0.2 : 0) + value(x * 0.4, y * 0.4) * 0.25;
      else if (style === 'moss') n = Math.pow(n, 1.4);
      else if (style === 'rock') n = n * 0.7 + hash(x, y) * 0.3;
      else if (style === 'skin') n = n * 0.4 + 0.5;
      const delta = (n - 0.5) * 2 * variance;
      const o = (y * size + x) * 4;
      img.data[o] = clamp(br + delta, 0, 255);
      img.data[o + 1] = clamp(bg + delta * 0.9, 0, 255);
      img.data[o + 2] = clamp(bb + delta * 0.8, 0, 255);
      img.data[o + 3] = 255;
    }
  }
  if (style === 'grain' || style === 'cloth') {
    for (let y = 0; y < size; y += 3) {
      for (let x = 0; x < size; x++) {
        const o = (y * size + x) * 4;
        img.data[o] = clamp(img.data[o] - 8, 0, 255);
        img.data[o + 1] = clamp(img.data[o + 1] - 6, 0, 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
