export class RNG {
  private s: number;
  constructor(seed = 123456789) {
    this.s = seed >>> 0;
  }
  nextU32(): number {
    // xorshift32
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s;
  }
  next(): number {
    return this.nextU32() / 0xffffffff;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
}

function hash2i(x: number, y: number, seed: number): number {
  // 32-bit mix
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const h00 = hash2i(xi, yi, seed) / 0xffffffff;
  const h10 = hash2i(xi + 1, yi, seed) / 0xffffffff;
  const h01 = hash2i(xi, yi + 1, seed) / 0xffffffff;
  const h11 = hash2i(xi + 1, yi + 1, seed) / 0xffffffff;

  const u = fade(xf);
  const v = fade(yf);

  const x1 = lerp(h00, h10, u);
  const x2 = lerp(h01, h11, u);
  return lerp(x1, x2, v);
}

export function fbm2D(x: number, y: number, seed: number, octaves = 5): number {
  let v = 0;
  let amp = 0.55;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * (valueNoise2D(x * freq, y * freq, seed + i * 1013) * 2 - 1);
    norm += amp;
    amp *= 0.52;
    freq *= 2.02;
  }
  return v / norm; // roughly -1..1
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

