// Imagen service wrapper — turns a game-domain asset request into a concept
// image the img2threejs pipeline can convert into a mesh.
//
// Two providers behind one interface:
//   RestImagenProvider       real Google Imagen, used when a key is present
//   ProceduralImageProvider  deterministic offline generator, no network
//
// The offline provider is not a mock for tests only — it is the fallback the
// game ships with, so asset generation works with no credentials, no network
// and no per-image cost. Same output contract either way: {width, height,
// data: RGBA Uint8ClampedArray, meta}.
import { mulberry32 } from '../util.js';

// ---------------------------------------------------------------------------
// Prompt construction

/** House style appended to every prompt so generated art matches the game. */
const STYLE_SUFFIX =
  'mid-poly cartoon game asset, cel shaded, bold clean silhouette, ' +
  'flat banded colours, thick dark outline, centred, orthographic side view, ' +
  'plain flat background, no text, no shadow';

export const ASSET_KINDS = {
  race: {
    template: (s) => `${s.adjective ?? ''} ${s.race} villager, ${s.era} age clothing, ${s.role ?? 'worker'}`,
    depth: 0.34, targetTris: 900,
  },
  tool: {
    template: (s) => `${s.era} age ${s.name}, hand tool, wooden handle`,
    depth: 0.16, targetTris: 320,
  },
  fauna: {
    template: (s) => `${s.adjective ?? 'tame'} ${s.name}, animal companion, side profile`,
    depth: 0.42, targetTris: 700,
  },
  structure: {
    template: (s) => `${s.era} age ${s.name} building, ${s.material ?? 'timber'} construction`,
    depth: 0.9, targetTris: 1200,
  },
  prop: {
    template: (s) => `${s.name}, small scenery prop`,
    depth: 0.25, targetTris: 260,
  },
};

/**
 * Build the full prompt for an asset request.
 * @param {{kind: keyof ASSET_KINDS} & Record<string, any>} spec
 */
export function buildPrompt(spec) {
  const kind = ASSET_KINDS[spec.kind];
  if (!kind) throw new Error(`Unknown asset kind: ${spec.kind}`);
  const subject = kind.template(spec).replace(/\s+/g, ' ').trim();
  return `${subject}, ${STYLE_SUFFIX}`;
}

/** Stable cache key for a request — same spec always hits the same asset. */
export function assetKey(spec) {
  const s = JSON.stringify(spec, Object.keys(spec).sort());
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${spec.kind}-${(h >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Providers

/**
 * Real Imagen via the Generative Language REST API.
 *
 * Deliberately not hard-wired to a model id: pass `model` in, because image
 * model names move faster than this file will.
 */
export class RestImagenProvider {
  constructor({ apiKey, model = 'imagen-3.0-generate-002', size = 256, fetchImpl } = {}) {
    if (!apiKey) throw new Error('RestImagenProvider requires an apiKey');
    this.apiKey = apiKey;
    this.model = model;
    this.size = size;
    this.fetch = fetchImpl || globalThis.fetch;
    this.name = 'imagen-rest';
  }

  async generate(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:predict`;
    const res = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '1:1' },
      }),
    });
    if (!res.ok) {
      throw new Error(`Imagen request failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
    const json = await res.json();
    const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error('Imagen response contained no image bytes');
    return { encoded: b64, mime: json.predictions[0].mimeType || 'image/png', prompt };
  }
}

/**
 * Deterministic offline concept generator.
 *
 * Produces a centred, bilaterally symmetric silhouette with a small banded
 * palette — which is exactly the shape of input img2threejs is built to read.
 * Everything derives from a hash of the prompt, so the same request always
 * yields the same asset and results are reproducible across machines.
 */
export class ProceduralImageProvider {
  constructor({ size = 128 } = {}) {
    this.size = size;
    this.name = 'procedural-offline';
  }

  async generate(prompt, spec = {}) {
    const S = this.size;
    const seed = hashString(prompt);
    const rng = mulberry32(seed);
    const data = new Uint8ClampedArray(S * S * 4);

    // A palette of 3 related hues — stands in for the cel bands real concept
    // art would have, and gives img2threejs something to sample colours from.
    const baseHue = rng();
    const palette = [0, 1, 2].map((i) => hsvToRgb(
      (baseHue + i * 0.06) % 1,
      0.45 + rng() * 0.3,
      0.55 + i * 0.16,
    ));

    // Silhouette: a vertical stack of lobes, mirrored horizontally. Different
    // asset kinds get different proportions so a "tool" doesn't come out the
    // same shape as a "structure".
    const lobes = [];
    const lobeCount = 3 + ((seed >>> 3) % 3);
    for (let i = 0; i < lobeCount; i++) {
      const t = i / (lobeCount - 1 || 1);
      lobes.push({
        cy: 0.14 + t * 0.72,
        rx: 0.10 + rng() * 0.22 * (spec.kind === 'structure' ? 1.5 : 1),
        ry: 0.08 + rng() * 0.16,
      });
    }

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / (S - 1);
        const v = y / (S - 1);
        // mirror about the vertical centre line
        const du = Math.abs(u - 0.5);

        let inside = false;
        let band = 0;
        for (let i = 0; i < lobes.length; i++) {
          const L = lobes[i];
          const d = Math.hypot(du / L.rx, (v - L.cy) / L.ry);
          if (d <= 1) { inside = true; band = Math.max(band, Math.min(2, Math.floor(d * 3))); }
        }

        const o = (y * S + x) * 4;
        if (inside) {
          const c = palette[band];
          data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
        } else {
          // transparent background — img2threejs keys on alpha
          data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 0;
        }
      }
    }
    return { width: S, height: S, data, prompt, meta: { provider: this.name, seed } };
  }
}

// ---------------------------------------------------------------------------

export class ImagenService {
  /**
   * @param {{provider?: object, cache?: Map}} [opts]
   */
  constructor({ provider, cache } = {}) {
    this.provider = provider || new ProceduralImageProvider();
    this.cache = cache || new Map();
    this.stats = { requests: 0, cacheHits: 0, generated: 0 };
  }

  /**
   * Pick the best available provider: real Imagen when a key is configured,
   * deterministic offline generation otherwise.
   */
  static autoDetect(env = (typeof process !== 'undefined' ? process.env : {})) {
    const apiKey = env.IMAGEN_API_KEY || env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
    if (apiKey && typeof globalThis.fetch === 'function') {
      return new ImagenService({ provider: new RestImagenProvider({ apiKey }) });
    }
    return new ImagenService({ provider: new ProceduralImageProvider() });
  }

  /**
   * Generate (or return cached) concept imagery for an asset spec.
   * @returns {Promise<{width:number,height:number,data:Uint8ClampedArray,prompt:string,meta:object}>}
   */
  async concept(spec) {
    this.stats.requests++;
    const key = assetKey(spec);
    if (this.cache.has(key)) {
      this.stats.cacheHits++;
      return this.cache.get(key);
    }
    const prompt = buildPrompt(spec);
    const image = await this.provider.generate(prompt, spec);
    image.key = key;
    image.spec = spec;
    this.cache.set(key, image);
    this.stats.generated++;
    return image;
  }
}

// --- helpers ---------------------------------------------------------------

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q],
  ][i % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
