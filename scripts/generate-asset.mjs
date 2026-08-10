// Phase 2 verification: run the full asset pipeline headlessly.
//
//   node scripts/generate-asset.mjs                 # all sample specs
//   node scripts/generate-asset.mjs structure       # one kind
//
// Chain: spec -> Imagen concept -> img2threejs -> LOD set -> live scene.
// Uses real Imagen when IMAGEN_API_KEY / GOOGLE_API_KEY / GEMINI_API_KEY is
// set, and the deterministic offline provider otherwise.
import * as THREE from 'three';
import { ImagenService, buildPrompt } from '../src/generation/imagen.js';
import { AssetLibrary } from '../src/generation/assetCache.js';

const SPECS = [
  { kind: 'race', race: 'frankish', era: 'bronze', role: 'farmer', adjective: 'stout' },
  { kind: 'tool', name: 'stone axe', era: 'stone' },
  { kind: 'fauna', name: 'boar', adjective: 'tamed' },
  { kind: 'structure', name: 'town hall', era: 'bronze', material: 'timber' },
  { kind: 'prop', name: 'road tile' },
];

const only = process.argv[2];
const specs = only ? SPECS.filter((s) => s.kind === only) : SPECS;
if (!specs.length) {
  console.error(`No specs for kind "${only}". Known: ${[...new Set(SPECS.map(s => s.kind))].join(', ')}`);
  process.exit(1);
}

const imagen = ImagenService.autoDetect();
const library = new AssetLibrary({ imagen });
const scene = new THREE.Scene();

console.log(`provider: ${imagen.provider.name}` +
  (imagen.provider.name === 'procedural-offline'
    ? '  (no IMAGEN_API_KEY / GOOGLE_API_KEY / GEMINI_API_KEY set)'
    : ''));

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`    ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
};

for (const spec of specs) {
  console.log(`\n=== ${spec.kind}: ${spec.name || spec.race} ===`);
  console.log(`  prompt: "${buildPrompt(spec).slice(0, 96)}…"`);

  const t0 = performance.now();
  const lod = await library.instantiate(spec, { outline: true });
  const ms = performance.now() - t0;

  const entry = library.entries.get(lod.name);
  const triCounts = entry.geometries.map((g) => g.attributes.position.count / 3);

  console.log(`  contour: ${entry.stats.rawContourPoints} pts -> ${entry.stats.simplifiedPoints} simplified`);
  console.log(`  LOD triangles: ${triCounts.join(' / ')}   palette: ${entry.palette.map(c => '#' + c.toString(16).padStart(6, '0')).join(' ')}`);
  console.log(`  built in ${ms.toFixed(1)}ms`);

  scene.add(lod);

  check('produced 3 LOD levels', lod.levels.length === 3, `${lod.levels.length}`);
  check('geometry is non-empty', triCounts[0] > 0, `${triCounts[0]} tris`);
  check('LODs decrease in detail', triCounts[0] > triCounts[1] && triCounts[1] >= triCounts[2],
    triCounts.join(' > '));
  check('respects triangle budget', triCounts[0] <= (spec.targetTris ?? 1300) * 1.6,
    `${triCounts[0]} tris`);
  check('has UVs', !!entry.geometries[0].attributes.uv);
  check('has normals', !!entry.geometries[0].attributes.normal);
  check('bounding box is finite', Number.isFinite(entry.geometries[0].boundingBox.max.x));
  check('material is cel-shaded', entry.material.userData?.dlToon === true);
  check('added to the live scene', scene.children.includes(lod));
}

// Cache behaviour: rebuilding the same spec must not regenerate.
console.log('\n=== cache ===');
const before = { ...library.stats };
await library.instantiate(specs[0]);
check('second instantiate hit the cache',
  library.stats.cacheHits === before.cacheHits + 1 && library.stats.built === before.built,
  `built=${library.stats.built} hits=${library.stats.cacheHits}`);

// Concurrent identical requests must share one build, not race.
const freshLib = new AssetLibrary({ imagen: ImagenService.autoDetect() });
await Promise.all([1, 2, 3, 4].map(() => freshLib.instantiate(specs[0])));
check('concurrent requests shared a single build', freshLib.stats.built === 1,
  `built=${freshLib.stats.built}`);

console.log('\nlibrary report:', JSON.stringify(library.report(), null, 2));
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
