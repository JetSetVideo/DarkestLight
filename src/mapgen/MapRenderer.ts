import { idx, type WorldMap } from "./MapTypes";

export class MapRenderer {
  static renderToImageData(map: WorldMap): ImageData {
    const { width: w, height: h, cells } = map;
    const img = new ImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = cells[idx(w, x, y)];
        const off = (y * w + x) * 4;

        const col = colorFor(c.tile, c.h, c.m);
        d[off + 0] = col[0];
        d[off + 1] = col[1];
        d[off + 2] = col[2];
        d[off + 3] = 255;
      }
    }

    // Decorations drawn as a second pass (simple tiny glyphs).
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const c = cells[idx(w, x, y)];
        if (c.deco !== "tree") continue;
        drawTreeGlyph(d, w, h, x, y);
      }
    }

    return img;
  }
}

function colorFor(tile: string, h: number, m: number): [number, number, number] {
  switch (tile) {
    case "sea": {
      const deep = [10, 28, 60] as const;
      const shallow = [18, 70, 86] as const;
      const t = clamp01((h - 0.2) / 0.28);
      return [
        lerp(deep[0], shallow[0], t),
        lerp(deep[1], shallow[1], t),
        lerp(deep[2], shallow[2], t),
      ];
    }
    case "river":
      return [38, 140, 172];
    case "sand": {
      const a = [156, 140, 88] as const;
      const b = [196, 182, 118] as const;
      const t = clamp01(0.35 + m * 0.3);
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    }
    case "grass": {
      const a = [42, 110, 64] as const;
      const b = [64, 150, 86] as const;
      const t = clamp01(0.25 + m * 0.7);
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    }
    case "rock": {
      const a = [72, 74, 80] as const;
      const b = [110, 112, 120] as const;
      const t = clamp01((h - 0.62) / 0.18);
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    }
    case "mountain": {
      const a = [92, 88, 86] as const;
      const b = [140, 132, 126] as const;
      const t = clamp01((h - 0.74) / 0.12);
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    }
    case "snow":
      return [232, 238, 246];
    default:
      return [255, 0, 255];
  }
}

function drawTreeGlyph(d: Uint8ClampedArray, w: number, h: number, x: number, y: number) {
  // A tiny plus-ish tree symbol.
  const points = [
    [0, 0],
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const;
  for (const [dx, dy] of points) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const off = (ny * w + nx) * 4;
    d[off + 0] = Math.min(255, d[off + 0] * 0.55);
    d[off + 1] = Math.min(255, 120 + d[off + 1] * 0.2);
    d[off + 2] = Math.min(255, d[off + 2] * 0.55);
  }
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

