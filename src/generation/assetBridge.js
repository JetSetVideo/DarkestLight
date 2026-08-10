// Bridge between the synchronous procedural model factory (models.js) and the
// asynchronous generated-asset pipeline (assetCache -> img2threejs -> Imagen).
//
// The problem: buildBuilding()/buildHuman() must return a mesh *now*, during
// entity construction, but generating an asset is async and may involve a
// network round trip.
//
// The pattern: placeholder-then-upgrade. The procedural mesh is returned
// immediately and remains the permanent fallback; if generated assets are
// enabled, an upgrade is requested in the background and swapped in when it
// resolves. If generation is disabled, fails, or never returns, the game keeps
// exactly the visuals it has today.
//
// Two things must survive the swap:
//   1. Animated parts. models.js keeps live references (userData.flame,
//      .flame2, .light, .limbs, .wings) that the entity update loop reads every
//      frame. Removing those children would break animation, so anything
//      referenced or emissive is kept visible on top of the generated shell.
//   2. Entity back-links. entities.js tags every descendant with
//      userData.entity for picking; new children must be re-tagged or they
//      become unclickable.
import * as THREE from 'three';
import { AssetLibrary } from './assetCache.js';
import { ImagenService } from './imagen.js';

let library = null;
let enabled = null;   // null = decide on first use
const pending = new Map();
export const bridgeStats = { requested: 0, upgraded: 0, failed: 0, skipped: 0 };

/** Shared library, created lazily so nothing is built if the feature is off. */
export function assetLibrary() {
  if (!library) library = new AssetLibrary({ imagen: ImagenService.autoDetect() });
  return library;
}

/**
 * Whether generated assets replace procedural models.
 *
 * Default is deliberate: ON when a real Imagen provider is configured, OFF
 * with the offline procedural provider — whose lobed placeholder silhouettes
 * are a downgrade from the hand-authored models. Override explicitly with
 * setGeneratedAssets(true), or `?genassets=1` in the URL.
 */
export function generatedAssetsEnabled() {
  if (enabled !== null) return enabled;

  // Explicit URL opt-in/out wins.
  if (typeof location !== 'undefined' && location.search) {
    const p = new URLSearchParams(location.search).get('genassets');
    if (p === '1' || p === 'true') return (enabled = true);
    if (p === '0' || p === 'false') return (enabled = false);
  }
  enabled = assetLibrary().imagen.provider.name !== 'procedural-offline';
  return enabled;
}

/** Force the feature on or off (settings toggle / tests). */
export function setGeneratedAssets(on) {
  enabled = !!on;
  return enabled;
}

/** Children that must stay visible: animated parts and light sources. */
function isProtected(child, referenced) {
  if (referenced.has(child)) return true;
  if (child.isLight) return true;
  const m = child.material;
  if (m && m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)) return true;
  return false;
}

/** Every object the group references by name in userData (flame, limbs, ...). */
function referencedObjects(group) {
  const out = new Set();
  const visit = (v) => {
    if (!v) return;
    if (v.isObject3D) { out.add(v); return; }
    if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(group.userData);
  return out;
}

/**
 * Request an asynchronous generated-asset upgrade for a procedural group.
 *
 * Non-blocking and failure-tolerant by design: any error leaves the
 * procedural mesh untouched.
 *
 * @param {THREE.Group} group  the procedural mesh, already usable
 * @param {object} spec        AssetLibrary spec ({kind, name, era, ...})
 */
export function requestUpgrade(group, spec) {
  if (!group || !generatedAssetsEnabled()) { bridgeStats.skipped++; return null; }

  bridgeStats.requested++;
  const lib = assetLibrary();
  const job = lib.build(spec)
    .then((entry) => { applyUpgrade(group, entry); return entry; })
    .catch((err) => {
      bridgeStats.failed++;
      console.warn('[EnArché/assets] generation failed; keeping procedural mesh', err?.message || err);
      return null;
    });

  pending.set(group, job);
  return job;
}

/**
 * Swap generated geometry into a procedural group, preserving scale,
 * animated parts and entity back-links.
 */
export function applyUpgrade(group, entry) {
  if (!group || !entry?.geometries?.length) return false;
  // The group may have been disposed (building destroyed) while we generated.
  if (group.userData?.dlGenerated) return false;

  // Match the procedural silhouette's footprint so the generated mesh sits at
  // the same scale the gameplay code already assumes.
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const targetHeight = size.y || 1;

  const lod = new THREE.LOD();
  lod.name = 'generated';
  entry.geometries.forEach((geo, i) => {
    const mesh = new THREE.Mesh(geo, entry.material);
    mesh.castShadow = true;
    lod.addLevel(mesh, i === 0 ? 0 : i === 1 ? 26 : 60);
  });

  // Generated geometry is built around a unit box; scale to the placeholder.
  const gbox = new THREE.Box3().setFromObject(lod);
  const gsize = new THREE.Vector3();
  gbox.getSize(gsize);
  const s = gsize.y > 1e-4 ? targetHeight / gsize.y : 1;
  lod.scale.setScalar(s);
  lod.position.y = targetHeight / 2;

  // Hide the procedural shell but keep animated/emissive parts on top.
  const referenced = referencedObjects(group);
  for (const child of [...group.children]) {
    if (!isProtected(child, referenced)) child.visible = false;
  }
  group.add(lod);

  // Re-tag for picking — entities.js tags descendants at construction time,
  // and these children did not exist then.
  const entity = group.userData?.entity;
  if (entity) {
    lod.traverse((o) => Object.defineProperty(o.userData, 'entity', {
      value: entity, enumerable: false, writable: true, configurable: true,
    }));
  }

  group.userData.dlGenerated = lod;
  bridgeStats.upgraded++;
  return true;
}

/** Revert a group to its procedural appearance. */
export function revertUpgrade(group) {
  const lod = group?.userData?.dlGenerated;
  if (!lod) return false;
  group.remove(lod);
  for (const child of group.children) child.visible = true;
  delete group.userData.dlGenerated;
  return true;
}

/** Wait for all in-flight upgrades (tests). */
export function flushUpgrades() {
  return Promise.all([...pending.values()]);
}

export function resetBridge() {
  pending.clear();
  library = null;
  enabled = null;
  Object.assign(bridgeStats, { requested: 0, upgraded: 0, failed: 0, skipped: 0 });
}
