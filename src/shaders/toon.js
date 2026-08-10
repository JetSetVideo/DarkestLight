// EnArché cel-shading core. Two halves, usable independently:
//
//   applyToonShading(material)  — quantizes a MeshLambertMaterial's direct
//                                 light into hard bands + adds a rim wrap,
//                                 via onBeforeCompile. Non-destructive: call
//                                 sites keep using the same material objects.
//   attachOutline(mesh)         — inverted-hull outline child, so outlines
//                                 cost no post-process pass and survive the
//                                 existing forward renderer untouched.
//
// Why patch Lambert instead of swapping in MeshToonMaterial: the game already
// leans on Lambert everywhere (models.js `mat()`, the terrain ground shader),
// and Lambert keeps shadowMap + fog + vertexColors wiring we'd otherwise
// have to reimplement. Banding is applied after <lights_fragment_end> so it
// is light-count agnostic — one sun, hemi and ambient all fold in.
import * as THREE from 'three';

// Band edges in luminance space. Four steps reads as "mid-poly cartoon"
// without the posterized look 2-3 steps gives on curved surfaces.
export const TOON_BANDS = [0.18, 0.42, 0.68, 0.88];
// Light level emitted for each band (index 0 = below the first edge).
export const TOON_LEVELS = [0.34, 0.56, 0.76, 0.92, 1.0];

const BAND_GLSL = TOON_BANDS
  .map((edge, i) => `  lit += ${(TOON_LEVELS[i + 1] - TOON_LEVELS[i]).toFixed(4)} * step(${edge.toFixed(4)}, k);`)
  .join('\n');

// Quantize the direct light response into hard bands.
//
// Critical detail: three accumulates directDiffuse as
//   irradiance * BRDF_Lambert(diffuseColor)  ==  dotNL * lightColor * albedo / PI
// so its luminance scales with the *albedo*. Banding that value directly makes
// the thresholds mean something different for every object colour (dark
// materials collapse into the bottom band and read as smooth Lambert). We
// divide the albedo back out first, leaving a roughly albedo-independent
// lighting ramp, then band that and rescale — which preserves both the light's
// colour tint and the material's hue.
//
// uToonKey is the response treated as "fully lit". Default 0.85 matches a
// ~2.6-intensity sun after the 1/PI Lambert factor; the day/night cycle
// dimming the sun therefore darkens surfaces rather than rescaling the bands.
const TOON_FRAG_PATCH = /* glsl */`
{
  // Band the *total* diffuse response, not just the direct term. The scene's
  // hemisphere light varies smoothly with the normal, so leaving indirect
  // unbanded re-introduces the gradient the staircase just removed and the
  // result reads as plain Lambert. Folding both together and emitting the
  // result through directDiffuse keeps ambient acting as the floor of the
  // ramp, which is what a cel pipeline wants.
  vec3 tot = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  vec3 alb = max(diffuseColor.rgb, vec3(1e-4));
  float resp = dot(tot / alb, vec3(0.2126, 0.7152, 0.0722));
  float k = clamp(resp / max(uToonKey, 1e-4), 0.0, 1.0);

  float lit = ${TOON_LEVELS[0].toFixed(4)};
${BAND_GLSL}
  // Feathered variant of the same staircase, blended in by uToonSoft.
  lit = mix(lit, mix(lit, k, 0.5), uToonSoft);

  float target = lit * uToonKey;
  reflectedLight.directDiffuse = tot * (target / max(resp, 1e-4));
  reflectedLight.indirectDiffuse = vec3(0.0);

  // Rim wrap — a hard band near the silhouette. Gives the mid-poly shapes a
  // drawn edge without touching the outline hull.
  float rim = 1.0 - max(dot(normalize(vViewPosition), normal), 0.0);
  float rimBand = step(uToonRimStart, rim) * uToonRim;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * rimBand;
}
`;

/**
 * Patch a MeshLambertMaterial (or any material using the Lambert chunk set)
 * so its direct lighting is quantized into hard cel bands.
 *
 * Safe to call twice on the same material — the second call is a no-op.
 *
 * @param {THREE.Material} material
 * @param {{rim?: number, rimStart?: number, soft?: number, cacheKey?: string}} [opts]
 * @returns {THREE.Material} the same material, for chaining
 */
export function applyToonShading(material, opts = {}) {
  if (!material || material.userData?.dlToon) return material;

  const rim = opts.rim ?? 0.10;
  const rimStart = opts.rimStart ?? 0.72;
  const soft = opts.soft ?? 0.0;
  // Response treated as "fully lit": a ~2.6 sun plus ambient/hemi fill, after
  // the 1/PI Lambert factor and sRGB->linear conversion of the light colours.
  const key = opts.key ?? 0.95;

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    // Compose with any existing patch (the terrain ground shader has one).
    if (typeof prev === 'function') prev.call(material, shader, renderer);

    shader.uniforms.uToonRim = { value: rim };
    shader.uniforms.uToonRimStart = { value: rimStart };
    shader.uniforms.uToonSoft = { value: soft };
    shader.uniforms.uToonKey = { value: key };

    shader.fragmentShader =
      'uniform float uToonRim;\nuniform float uToonRimStart;\n' +
      'uniform float uToonSoft;\nuniform float uToonKey;\n' +
      shader.fragmentShader;

    const hook = '#include <lights_fragment_end>';
    if (shader.fragmentShader.indexOf(hook) === -1) {
      // Shader chunk set changed under us (three upgrade). Fail loud in dev
      // rather than silently rendering un-toon-shaded.
      console.warn('[EnArché/toon] lights_fragment_end hook missing; cel banding skipped');
      return;
    }
    shader.fragmentShader = shader.fragmentShader.replace(hook, hook + '\n' + TOON_FRAG_PATCH);
  };

  // Program cache must distinguish toon-patched materials from plain ones,
  // and must vary with the parameters baked into the patch.
  const prevKey = material.customProgramCacheKey;
  const tag = `dl-toon-v3|${rim}|${rimStart}|${soft}|${key}`;
  material.customProgramCacheKey = () =>
    (typeof prevKey === 'function' ? prevKey.call(material) : '') + tag;

  material.userData = material.userData || {};
  material.userData.dlToon = true;
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------------------
// Outlines — inverted hull.

const OUTLINE_VERT = /* glsl */`
uniform float uThickness;
void main() {
  // Expand along the normal in view space so thickness is uniform on screen
  // regardless of model scale, then push slightly away from the camera to
  // keep the hull behind the surface it wraps.
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  mv.xyz += n * uThickness * (-mv.z) * 0.012;
  gl_Position = projectionMatrix * mv;
}
`;

const OUTLINE_FRAG = /* glsl */`
precision mediump float;
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }
`;

/**
 * Build the shared material used by every outline hull.
 * BackSide + depthWrite keeps it behind the lit surface.
 */
export function createOutlineMaterial({ color = 0x14181f, thickness = 1.0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uThickness: { value: thickness },
    },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: THREE.BackSide,
    fog: false,
  });
}

// One material per (color, thickness) pair — outline hulls are the most
// duplicated object in the scene, so sharing the program matters.
const outlineMats = new Map();
function sharedOutlineMaterial(color, thickness) {
  const key = `${color}|${thickness}`;
  if (!outlineMats.has(key)) outlineMats.set(key, createOutlineMaterial({ color, thickness }));
  return outlineMats.get(key);
}

/**
 * Attach an inverted-hull outline to a mesh as a child.
 *
 * The hull shares the parent's geometry (no extra memory) and inherits its
 * transform, so animated/rigged parts stay wrapped for free.
 *
 * @param {THREE.Mesh} mesh
 * @param {{color?: number, thickness?: number}} [opts]
 * @returns {THREE.Mesh|null} the hull, or null if the mesh can't take one
 */
export function attachOutline(mesh, opts = {}) {
  if (!mesh?.isMesh || !mesh.geometry) return null;
  if (mesh.userData?.dlOutline) return mesh.userData.dlOutline;

  const hull = new THREE.Mesh(
    mesh.geometry,
    sharedOutlineMaterial(opts.color ?? 0x14181f, opts.thickness ?? 1.0),
  );
  hull.name = 'outline';
  // Outlines are decoration: never cast/receive shadows, never raycast.
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.raycast = () => {};
  hull.renderOrder = (mesh.renderOrder || 0) - 1;
  mesh.add(hull);

  mesh.userData = mesh.userData || {};
  mesh.userData.dlOutline = hull;
  return hull;
}

/**
 * Walk a group and outline every mesh in it. Returns the number added.
 * Skips meshes flagged `userData.dlNoOutline` (flames, glows, UI rings).
 */
export function outlineHierarchy(root, opts = {}) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.name === 'outline') return;
    if (o.userData?.dlNoOutline) return;
    if (o.material?.transparent) return; // hulls behind glass look wrong
    if (attachOutline(o, opts)) n++;
  });
  return n;
}
