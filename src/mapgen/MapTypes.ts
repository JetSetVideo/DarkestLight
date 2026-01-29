export type Tile =
  | "sea"
  | "river"
  | "sand"
  | "grass"
  | "rock"
  | "mountain"
  | "snow";

export type Decoration = "tree";

export type MapCell = {
  h: number; // height 0..1
  m: number; // moisture 0..1
  tile: Tile;
  deco: Decoration | null;
};

export type WorldMap = {
  width: number;
  height: number;
  seed: number;
  seaLevel: number;
  cells: MapCell[]; // row-major
  spawn: { x: number; y: number };
};

export function idx(w: number, x: number, y: number): number {
  return y * w + x;
}

