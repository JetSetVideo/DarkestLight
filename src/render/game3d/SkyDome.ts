import * as THREE from "three";

export type SkyDome = {
  mesh: THREE.Mesh;
  horizonColor: THREE.Color;
  dispose(): void;
};

// Banded anime sky: zenith -> mid -> horizon with softly quantized edges,
// plus a graphic sun disc with 8 triangular ray spikes (pure shader, no bloom).
export function createSkyDome(opts: { sunDir: THREE.Vector3; radius?: number }): SkyDome {
  const radius = opts.radius ?? 950;
  const horizonColor = new THREE.Color(0xcfe9f6);

  const geo = new THREE.SphereGeometry(radius, 32, 18);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: opts.sunDir.clone().normalize() },
      uZenith: { value: new THREE.Color(0x2f7fd0) },
      uMid: { value: new THREE.Color(0x6fb7e8) },
      uHorizon: { value: horizonColor.clone() },
      uSunColor: { value: new THREE.Color(0xfff4c2) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = pos.xyww; // pin to far plane
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uSunDir;
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        float t = clamp(d.y, 0.0, 1.0);

        // Quantize-ish gradient: smooth but with tight band transitions.
        vec3 col = uHorizon;
        col = mix(col, uMid, smoothstep(0.02, 0.16, t));
        col = mix(col, uZenith, smoothstep(0.22, 0.55, t));

        // Sun frame: project direction onto plane around the sun axis.
        vec3 sd = normalize(uSunDir);
        float c = dot(d, sd);
        if (c > 0.955) {
          vec3 tang = normalize(cross(sd, vec3(0.0, 1.0, 0.0)));
          vec3 bit = cross(sd, tang);
          vec2 off = vec2(dot(d, tang), dot(d, bit));
          float r = length(off);
          float ang = atan(off.y, off.x);

          // 8 triangular ray spikes.
          float spikeLen = 0.052 + 0.030 * pow(abs(sin(ang * 4.0)), 8.0);
          float rays = step(r, spikeLen);
          // Core disc with a hard halo ring.
          float disc = step(r, 0.030);
          float halo = step(r, 0.040);

          col = mix(col, mix(col, uSunColor, 0.55), rays);
          col = mix(col, mix(uSunColor, vec3(1.0), 0.25), halo * 0.6);
          col = mix(col, vec3(1.0, 0.98, 0.9), disc);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;

  return {
    mesh,
    horizonColor,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
