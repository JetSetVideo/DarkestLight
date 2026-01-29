import*as c from"https://esm.sh/three@0.161.0";(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const n of i)if(n.type==="childList")for(const o of n.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function e(i){const n={};return i.integrity&&(n.integrity=i.integrity),i.referrerPolicy&&(n.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?n.credentials="include":i.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function s(i){if(i.ep)return;i.ep=!0;const n=e(i);fetch(i.href,n)}})();class tt{#s=null;#t=null;#e=null;#c=null;#r=.6;#a=.7;#i=!0;#n=118;#o=!1;#l=null;#h=0;#u=0;#d=null;get isReady(){return this.#s!==null}async ensureReady(){if(this.#s)return;const t=window.AudioContext||window.webkitAudioContext;this.#s=new t,this.#s.state==="suspended"&&await this.#s.resume(),this.#t=this.#s.createGain(),this.#t.gain.value=1,this.#t.connect(this.#s.destination),this.#e=this.#s.createGain(),this.#e.gain.value=this.#i?this.#r:0,this.#e.connect(this.#t),this.#c=this.#s.createGain(),this.#c.gain.value=this.#a,this.#c.connect(this.#t)}setVolumes(t){this.#r=L(t.music),this.#a=L(t.sfx),this.#e&&(this.#e.gain.value=this.#i?this.#r:0),this.#c&&(this.#c.gain.value=this.#a)}setMusicEnabled(t){this.#i=!!t,this.#e&&(this.#e.gain.value=this.#i?this.#r:0),this.#i||this.stopMusic()}setTempoBpm(t){const e=et(t,80,160);this.#n=e}playUiClick(){this.#m({freq:540,duration:.04,type:"triangle",gain:.25})}playUiHover(){this.#m({freq:980,duration:.02,type:"sine",gain:.12})}playCountdownTick(){this.#m({freq:220,duration:.06,type:"square",gain:.18})}playStartSting(){this.#m({freq:440,duration:.08,type:"sawtooth",gain:.22}),setTimeout(()=>this.#m({freq:660,duration:.09,type:"sawtooth",gain:.18}),70)}playSelect(){this.#m({freq:392,duration:.06,type:"triangle",gain:.22}),setTimeout(()=>this.#m({freq:587.33,duration:.06,type:"triangle",gain:.18}),55)}playDeselect(){this.#m({freq:240,duration:.05,type:"square",gain:.18}),setTimeout(()=>this.#m({freq:160,duration:.05,type:"square",gain:.14}),45)}startMusic(){if(!this.#s||!this.#e||this.#o||!this.#i)return;const t=this.#s;this.#d??=st(t,1),this.#o=!0,this.#u=0,this.#h=t.currentTime+.05;const e=25,s=.14,i=()=>{if(!this.#s||!this.#e||!this.#o)return;const n=60/this.#n/4;for(;this.#h<this.#s.currentTime+s;)this.#p(this.#h,this.#u),this.#h+=n,this.#u=(this.#u+1)%16};this.#l=window.setInterval(i,e),i()}stopMusic(){this.#o&&(this.#o=!1,this.#l!==null&&window.clearInterval(this.#l),this.#l=null)}#m(t){if(!this.#s||!this.#c)return;const e=this.#s,s=e.createOscillator(),i=e.createGain();s.type=t.type,s.frequency.value=t.freq;const n=e.currentTime,o=t.gain*this.#a;i.gain.setValueAtTime(1e-4,n),i.gain.exponentialRampToValueAtTime(Math.max(2e-4,o),n+.008),i.gain.exponentialRampToValueAtTime(1e-4,n+t.duration),s.connect(i),i.connect(this.#c),s.start(n),s.stop(n+t.duration+.02),s.onended=()=>{s.disconnect(),i.disconnect()}}#p(t,e){if(!this.#s||!this.#e||!this.#d)return;const s=this.#s,i=e===0||e===8||e===10&&Math.random()<.25,n=e===4||e===12,o=Math.floor(s.currentTime*this.#n/60/4),r=[N(52,"min"),N(48,"maj"),N(43,"maj"),N(50,"maj")],l=r[o%r.length];i&&this.#f(t,.9),n&&this.#g(t,.75);{const h=e%4===0?.7:e%2===0?.42:.28;this.#v(t,h)}if(e%2===0){const h=l[0],m=e===14&&Math.random()<.35?12:0;this.#y(t,F(h+m),.55)}(e===6||e===14)&&this.#w(t,l.map(F),.22),e===0&&this.#x(t,l.map(h=>F(h+12)),.08)}#f(t,e){if(!this.#s||!this.#e)return;const s=this.#s,i=s.createOscillator();i.type="sine";const n=s.createGain(),o=.9*e;n.gain.setValueAtTime(1e-4,t),n.gain.exponentialRampToValueAtTime(Math.max(2e-4,o),t+.003),n.gain.exponentialRampToValueAtTime(1e-4,t+.14),i.frequency.setValueAtTime(120,t),i.frequency.exponentialRampToValueAtTime(52,t+.06),i.connect(n),n.connect(this.#e),i.start(t),i.stop(t+.16),i.onended=()=>{i.disconnect(),n.disconnect()}}#g(t,e){if(!this.#s||!this.#e||!this.#d)return;const s=this.#s,i=s.createBufferSource();i.buffer=this.#d;const n=s.createBiquadFilter();n.type="highpass",n.frequency.value=1200;const o=s.createBiquadFilter();o.type="bandpass",o.frequency.value=1800,o.Q.value=.7;const r=s.createGain(),l=.42*e;r.gain.setValueAtTime(1e-4,t),r.gain.exponentialRampToValueAtTime(Math.max(2e-4,l),t+.004),r.gain.exponentialRampToValueAtTime(1e-4,t+.12),i.connect(n),n.connect(o),o.connect(r),r.connect(this.#e),i.start(t),i.stop(t+.14),i.onended=()=>{i.disconnect(),n.disconnect(),o.disconnect(),r.disconnect()}}#v(t,e){if(!this.#s||!this.#e||!this.#d)return;const s=this.#s,i=s.createBufferSource();i.buffer=this.#d;const n=s.createBiquadFilter();n.type="highpass",n.frequency.value=6500;const o=s.createGain(),r=.12*e;o.gain.setValueAtTime(1e-4,t),o.gain.exponentialRampToValueAtTime(Math.max(2e-4,r),t+.0015),o.gain.exponentialRampToValueAtTime(1e-4,t+.03),i.connect(n),n.connect(o),o.connect(this.#e),i.start(t),i.stop(t+.05),i.onended=()=>{i.disconnect(),n.disconnect(),o.disconnect()}}#y(t,e,s){if(!this.#s||!this.#e)return;const i=this.#s,n=i.createOscillator();n.type="sawtooth";const o=i.createBiquadFilter();o.type="lowpass",o.frequency.value=220,o.Q.value=.9;const r=i.createGain(),l=.22*s;r.gain.setValueAtTime(1e-4,t),r.gain.exponentialRampToValueAtTime(Math.max(2e-4,l),t+.01),r.gain.exponentialRampToValueAtTime(1e-4,t+.18),n.frequency.setValueAtTime(e*1.06,t),n.frequency.exponentialRampToValueAtTime(e,t+.03),n.connect(o),o.connect(r),r.connect(this.#e),n.start(t),n.stop(t+.22),n.onended=()=>{n.disconnect(),o.disconnect(),r.disconnect()}}#w(t,e,s){if(!this.#s||!this.#e)return;const i=this.#s,n=i.createWaveShaper();n.curve=it(.75);const o=i.createBiquadFilter();o.type="lowpass",o.frequency.value=900,o.Q.value=.6;const r=i.createGain(),l=.22*s;r.gain.setValueAtTime(1e-4,t),r.gain.exponentialRampToValueAtTime(Math.max(2e-4,l),t+.004),r.gain.exponentialRampToValueAtTime(1e-4,t+.1);const h=e.map(p=>{const u=i.createOscillator();return u.type="triangle",u.frequency.value=p,u.detune.value=Math.random()*10-5,u.connect(o),u});o.connect(n),n.connect(r),r.connect(this.#e);for(const p of h)p.start(t);for(const p of h)p.stop(t+.12);const m=h[h.length-1];m.onended=()=>{for(const p of h)p.disconnect();o.disconnect(),n.disconnect(),r.disconnect()}}#x(t,e,s){if(!this.#s||!this.#e)return;const i=this.#s,n=i.createBiquadFilter();n.type="lowpass",n.frequency.value=520,n.Q.value=.65;const o=i.createGain(),r=.1*s;o.gain.setValueAtTime(1e-4,t),o.gain.exponentialRampToValueAtTime(Math.max(2e-4,r),t+.25),o.gain.exponentialRampToValueAtTime(1e-4,t+1.1);const l=e.map(m=>{const p=i.createOscillator();return p.type="sine",p.frequency.value=m,p.connect(n),p});n.connect(o),o.connect(this.#e);for(const m of l)m.start(t);for(const m of l)m.stop(t+1.2);const h=l[l.length-1];h.onended=()=>{for(const m of l)m.disconnect();n.disconnect(),o.disconnect()}}}function L(a){return Number.isFinite(a)?Math.min(1,Math.max(0,a)):0}function et(a,t,e){return Number.isFinite(a)?Math.min(e,Math.max(t,a)):t}function F(a){return 440*Math.pow(2,(a-69)/12)}function N(a,t){return t==="maj"?[a,a+4,a+7]:[a,a+3,a+7]}function st(a,t){const e=Math.max(1,Math.floor(a.sampleRate*t)),s=a.createBuffer(1,e,a.sampleRate),i=s.getChannelData(0);for(let n=0;n<e;n++)i[n]=(Math.random()*2-1)*.7;return s}function it(a){const t=L(a)*50+1,e=1024,s=new Float32Array(e);for(let i=0;i<e;i++){const n=i*2/(e-1)-1;s[i]=(1+t)*n/(1+t*Math.abs(n))}return s}const W="darkestlight.settings.v1";class nt{constructor(){this.settings={musicEnabled:!0,musicVolume:.6,sfxVolume:.7,musicTempoBpm:118,graphicsQuality:"high"}}load(){try{const t=localStorage.getItem(W);if(!t)return;const e=JSON.parse(t);this.settings={...this.settings,...e,musicEnabled:typeof e.musicEnabled=="boolean"?e.musicEnabled:this.settings.musicEnabled,musicVolume:A(e.musicVolume??this.settings.musicVolume),sfxVolume:A(e.sfxVolume??this.settings.sfxVolume),musicTempoBpm:Y(e.musicTempoBpm??this.settings.musicTempoBpm,80,160),graphicsQuality:e.graphicsQuality??this.settings.graphicsQuality}}catch{}}save(){localStorage.setItem(W,JSON.stringify(this.settings))}get(){return{...this.settings}}set(t){const e={...this.settings,...t};e.musicEnabled=!!e.musicEnabled,e.musicVolume=A(e.musicVolume),e.sfxVolume=A(e.sfxVolume),e.musicTempoBpm=Y(e.musicTempoBpm,80,160),this.settings=e,this.save()}}function A(a){return Number.isFinite(a)?Math.min(1,Math.max(0,a)):0}function Y(a,t,e){return Number.isFinite(a)?Math.min(e,Math.max(t,a)):t}async function $(){try{const a=await fetch("/data/version.json",{cache:"no-store"});if(!a.ok)return"0.01";const t=await a.json();return typeof t.version=="string"?t.version:"0.01"}catch{return"0.01"}}const ot=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,at=`
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;

// Hash / noise helpers
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float starfield(vec2 uv) {
  vec2 p = uv * 600.0;
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float h = hash21(ip);
  float d = length(fp - 0.5);
  float s = smoothstep(0.06, 0.0, d);
  return step(0.995, h) * s;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);

  // Slow moving nebula-ish gradients
  float t = uTime * 0.04;
  float a = sin(p.x * 2.2 + t) * 0.5 + 0.5;
  float b = cos(p.y * 2.6 - t * 1.3) * 0.5 + 0.5;
  float c = sin((p.x + p.y) * 1.8 + t * 0.7) * 0.5 + 0.5;

  vec3 base = vec3(0.02, 0.03, 0.08);
  vec3 nebA = vec3(0.10, 0.20, 0.40) * a;
  vec3 nebB = vec3(0.06, 0.40, 0.26) * b * 0.6;
  vec3 nebC = vec3(0.35, 0.16, 0.42) * c * 0.35;

  float vign = smoothstep(1.15, 0.25, length(p));
  float stars = starfield(uv + vec2(t * 0.6, -t * 0.3)) + starfield(uv * 0.93 + vec2(-t * 0.2, t * 0.45));

  vec3 col = base + nebA + nebB + nebC;
  col *= vign;
  col += vec3(0.9) * stars * 0.8;

  gl_FragColor = vec4(col, 1.0);
}
`,rt=`
precision highp float;
varying vec3 vPos;
varying vec3 vN;
uniform float uTime;

mat3 rotY(float a) {
  float s = sin(a), c = cos(a);
  return mat3(
    c, 0.0, -s,
    0.0, 1.0, 0.0,
    s, 0.0, c
  );
}

mat3 rotZ(float a) {
  float s = sin(a), c = cos(a);
  return mat3(
    c, s, 0.0,
    -s, c, 0.0,
    0.0, 0.0, 1.0
  );
}

void main() {
  // Slightly off-center axis (tilt + subtle wobble)
  float tilt = 0.35;
  float wob = sin(uTime * 0.12) * 0.04;
  mat3 R = rotZ(tilt) * rotY(uTime * 0.08 + wob);
  vec3 p = R * position;
  vec3 n = normalize(R * normal);

  vPos = p;
  vN = n;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`,ct=`
precision highp float;
varying vec3 vPos;
varying vec3 vN;
uniform float uTime;

// Black-hole core: mostly absorptive, with a tight photon ring.

void main() {
  vec3 n = normalize(vN);
  vec3 vdir = normalize(vec3(0.0, 0.0, 1.0));
  float ndv = clamp(dot(n, vdir), 0.0, 1.0);

  // Deep absorptive body (almost pure black).
  vec3 core = vec3(0.002, 0.002, 0.004);

  // Photon ring concentrated near the silhouette (high rim).
  float rim = pow(1.0 - ndv, 2.4);
  float ring = smoothstep(0.42, 0.98, rim) * smoothstep(1.12, 0.62, rim);

  // Slight chromatic separation in the ring for "lensing" flavor.
  vec3 ringCol = vec3(0.65, 0.85, 1.0) * 0.55 + vec3(1.0, 0.55, 0.25) * 0.35;
  float flick = 0.85 + 0.15 * sin(uTime * 1.2 + rim * 18.0);

  vec3 col = core;
  col += ringCol * ring * flick;

  // Very faint internal gradient to keep volume readable.
  col += vec3(0.02, 0.03, 0.05) * pow(ndv, 2.2) * 0.25;

  gl_FragColor = vec4(col, 1.0);
}
`,lt=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,ht=`
precision highp float;
varying vec2 vUv;
uniform float uTime;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = R * p * 2.02 + 7.3;
    a *= 0.52;
  }
  return v;
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  // "Event horizon" mask: keep center dark and sharp.
  float horizon = smoothstep(0.32, 0.28, r);

  // Accretion disk: thin band with swirl + turbulent brightness.
  float diskR = 0.70;
  float diskW = 0.10;
  float disk = smoothstep(diskW, 0.0, abs(r - diskR));

  float swirl = ang + uTime * 0.9 + fbm(vec2(r * 6.0, ang * 2.0)) * 1.2;
  float bands = 0.5 + 0.5 * sin(swirl * 10.0 + r * 14.0);
  float hot = pow(bands, 2.2);
  float turb = fbm(vec2(uv.x * 5.0 + uTime * 0.15, uv.y * 5.0 - uTime * 0.11));

  vec3 cool = vec3(0.20, 0.55, 1.00);
  vec3 warm = vec3(1.00, 0.55, 0.18);
  vec3 diskCol = mix(cool, warm, clamp(0.15 + hot * 0.85, 0.0, 1.0));
  diskCol *= (0.55 + 0.75 * turb) * (0.55 + 0.45 * hot);

  // Gravitational lensing-style glow closer to the horizon.
  float lens = smoothstep(0.9, 0.2, r) * smoothstep(0.22, 0.38, r);
  float pulse = 0.75 + 0.25 * sin(uTime * 0.8);
  vec3 glowCol = vec3(0.55, 0.85, 1.0) * lens * 0.35 * pulse;

  vec3 col = diskCol * disk + glowCol;
  col *= (1.0 - horizon * 0.98);

  float a = clamp(disk * 0.55 + lens * 0.35, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
`;class ut{#s;#t;#e;#c=new c.Clock;#r=0;#a;#i;#n;#o;#l;constructor(t){this.canvas=document.createElement("canvas"),this.canvas.className="dl-layer",this.#s=new c.WebGLRenderer({canvas:this.canvas,antialias:t.quality==="high",alpha:!0,powerPreference:"high-performance"}),this.#s.setPixelRatio(Math.min(window.devicePixelRatio,t.quality==="high"?2:1.25)),this.#t=new c.Scene,this.#e=new c.PerspectiveCamera(50,1,.1,100),this.#e.position.set(0,0,5.2);const e=new c.PlaneGeometry(2,2);this.#a=new c.ShaderMaterial({vertexShader:ot,fragmentShader:at,uniforms:{uTime:{value:0},uRes:{value:new c.Vector2(1,1)}},depthTest:!1,depthWrite:!1});const s=new c.Mesh(e,this.#a);s.position.z=-2,this.#t.add(s);const i=new c.SphereGeometry(1,t.quality==="high"?128:64,t.quality==="high"?128:64);this.#i=new c.ShaderMaterial({vertexShader:rt,fragmentShader:ct,uniforms:{uTime:{value:0}}});const n=new c.Mesh(i,this.#i);n.position.set(0,0,0),this.#t.add(n),this.#o=n;const o=new c.PlaneGeometry(3,3);this.#n=new c.ShaderMaterial({vertexShader:lt,fragmentShader:ht,transparent:!0,blending:c.AdditiveBlending,uniforms:{uTime:{value:0}},depthWrite:!1});const r=new c.Mesh(o,this.#n);r.position.set(0,0,.8),this.#t.add(r),this.#l=r,this.resize()}start(){const t=()=>{const e=this.#c.getElapsedTime();this.#a.uniforms.uTime.value=e,this.#i.uniforms.uTime.value=e,this.#n.uniforms.uTime.value=e,this.#s.render(this.#t,this.#e),this.#r=requestAnimationFrame(t)};this.#r=requestAnimationFrame(t)}resize(){const t=Math.max(1,window.innerWidth),e=Math.max(1,window.innerHeight);this.#s.setSize(t,e,!1),this.#e.aspect=t/e,this.#e.updateProjectionMatrix(),this.#a.uniforms.uRes.value.set(t,e);const s=t/e,i=this.#e.position.z-this.#o.position.z,n=this.#e.fov*Math.PI/180,o=2*i*Math.tan(n/2),r=s<1?.46:.38,l=o*r,m=Math.max(.4,Math.min(1.2,l/(2*1)));this.#o.scale.setScalar(m),this.#l.scale.setScalar(m*1.05)}destroy(){cancelAnimationFrame(this.#r),this.#s.dispose()}}function v(a,t={}){const e=document.createElement(a);return t.className&&(e.className=t.className),t.text!==void 0&&(e.textContent=t.text),e}function w(a,t,e,s){return a.addEventListener(t,e,s),()=>a.removeEventListener(t,e,s)}class Z{#s;#t;#e=[];constructor(t){this.#s=v("div",{className:"dl-modal-backdrop dl-fade-in"}),this.#t=v("div",{className:"dl-modal dl-pop"});const e=v("div",{className:"dl-modal-header"}),s=v("h2",{className:"dl-modal-title",text:t.title}),i=v("button",{className:"dl-icon-btn"});i.innerHTML=`<svg class="dl-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>`,e.append(s,i),this.#t.append(e,t.content),this.#s.append(this.#t);const n=()=>{this.destroy(),t.onClose?.()};this.#e.push(w(i,"click",()=>n())),this.#e.push(w(this.#s,"click",o=>{o.target===this.#s&&n()})),this.#e.push(w(window,"keydown",o=>{o.key==="Escape"&&n()}))}mount(t){t.append(this.#s)}destroy(){for(const t of this.#e)t();this.#e=[],this.#s.remove()}}function K(){return`
  <svg class="dl-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19.4 15a8.2 8.2 0 0 0 .06-1l2-1.55-2-3.46-2.48.6a7.9 7.9 0 0 0-1.73-1l-.38-2.5H9.12l-.38 2.5a7.9 7.9 0 0 0-1.73 1l-2.48-.6-2 3.46 2 1.55a8.2 8.2 0 0 0 .06 1 8.2 8.2 0 0 0-.06 1l-2 1.55 2 3.46 2.48-.6c.53.4 1.11.73 1.73 1l.38 2.5h5.76l.38-2.5c.62-.27 1.2-.6 1.73-1l2.48.6 2-3.46-2-1.55a8.2 8.2 0 0 0-.06-1Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  </svg>`}function dt(){return`
  <svg class="dl-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M10 7H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 16l4-4-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 12H10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`}class mt{#s;#t;#e;#c;#r=v("div",{className:"dl-layer"});#a=v("div",{className:"dl-ui"});#i=[];#n=null;#o=null;constructor(t){this.#s=t.root,this.#t=t.audio,this.#e=t.settings,this.#c=t.onStart}mount(){const{graphicsQuality:t,musicVolume:e,sfxVolume:s,musicEnabled:i,musicTempoBpm:n}=this.#e.get();this.#t.setVolumes({music:e,sfx:s}),this.#t.setMusicEnabled(i),this.#t.setTempoBpm(n),this.#n=new ut({quality:t}),this.#r.append(this.#n.canvas);const o=v("div",{className:"dl-top-right"}),r=v("button",{className:"dl-icon-btn"});r.innerHTML=K();const l=v("button",{className:"dl-icon-btn"});l.innerHTML=dt(),o.append(r,l);const h=v("div",{className:"dl-card dl-fade-in"}),m=v("h1",{className:"dl-title",text:"Deus Ex Planetum"}),p=v("p",{className:"dl-subtitle",text:"A god-game RTS prototype. Shaders, sound, and procedural worlds."}),u=v("div",{className:"dl-actions"}),d=v("button",{className:"dl-primary",text:"Start"});u.append(d),h.append(m,p,u),this.#a.append(o,h),this.#r.append(this.#a),this.#s.append(this.#r),this.#n.start(),this.#i.push(w(window,"resize",()=>this.#n?.resize())),this.#i.push(w(d,"pointerenter",()=>this.#t.playUiHover())),this.#i.push(w(d,"click",async()=>{await this.#t.ensureReady();const f=this.#e.get();this.#t.setVolumes({music:f.musicVolume,sfx:f.sfxVolume}),this.#t.setMusicEnabled(f.musicEnabled),this.#t.setTempoBpm(f.musicTempoBpm),this.#t.startMusic(),this.#t.playUiClick(),d.animate([{transform:"translateY(0) scale(1)"},{transform:"translateY(0) scale(0.98)"},{transform:"translateY(-1px) scale(1.02)"}],{duration:260,easing:"cubic-bezier(0.2, 1.2, 0.2, 1)"}),setTimeout(()=>this.#c(),160)})),this.#i.push(w(r,"pointerenter",()=>this.#t.playUiHover())),this.#i.push(w(r,"click",async()=>{this.#t.playUiClick(),await this.#l({showExitToTitle:!1})})),this.#i.push(w(l,"pointerenter",()=>this.#t.playUiHover())),this.#i.push(w(l,"click",()=>{this.#t.playUiClick(),window.close()||alert("Close this tab/window to exit.")}))}destroy(){this.#o?.destroy(),this.#o=null;for(const t of this.#i)t();this.#i=[],this.#n?.destroy(),this.#n=null,this.#r.remove()}async#l(t){this.#o?.destroy(),this.#o=null;const e=await $(),s=this.#e.get(),i=v("div",{className:"dl-modal-content"}),n=(d,f)=>{const y=v("div",{className:"dl-row"}),g=v("div",{text:d});return y.append(g,f),y},o=document.createElement("input");o.type="range",o.min="0",o.max="1",o.step="0.01",o.value=String(s.musicVolume),o.className="dl-slider";const r=document.createElement("input");r.type="checkbox",r.checked=s.musicEnabled;const l=document.createElement("input");l.type="range",l.min="0",l.max="1",l.step="0.01",l.value=String(s.sfxVolume),l.className="dl-slider";const h=document.createElement("input");h.type="range",h.min="80",h.max="160",h.step="1",h.value=String(s.musicTempoBpm),h.className="dl-slider";const m=document.createElement("select");m.innerHTML='<option value="high">Graphics: High</option><option value="low">Graphics: Low</option>',m.value=s.graphicsQuality,i.append(n("Version",v("div",{text:e})),n("Music enabled",r),n("Music volume",o),n("Tempo (BPM)",h),n("SFX volume",l),n("Graphics",m));const p=()=>{this.#e.set({musicEnabled:r.checked,musicVolume:Number(o.value),sfxVolume:Number(l.value),musicTempoBpm:Number(h.value),graphicsQuality:m.value==="low"?"low":"high"});const d=this.#e.get();this.#t.setVolumes({music:d.musicVolume,sfx:d.sfxVolume}),this.#t.setTempoBpm(d.musicTempoBpm),this.#t.setMusicEnabled(d.musicEnabled),d.musicEnabled&&this.#t.startMusic()},u=[w(r,"change",()=>p()),w(o,"input",()=>p()),w(h,"input",()=>p()),w(l,"input",()=>p()),w(m,"change",()=>{p()})];t.showExitToTitle,this.#o=new Z({title:"Settings",content:i,onClose:()=>{for(const d of u)d()}}),this.#o.mount(this.#r)}}class pt{constructor(t=123456789){this.s=t>>>0}nextU32(){let t=this.s;return t^=t<<13,t^=t>>>17,t^=t<<5,this.s=t>>>0,this.s}next(){return this.nextU32()/4294967295}range(t,e){return t+(e-t)*this.next()}int(t,e){return Math.floor(this.range(t,e+1))}}function G(a,t,e){let s=a*374761393+t*668265263+e*1442695041>>>0;return s^=s>>>13,s=Math.imul(s,1274126177)>>>0,s^=s>>>16,s>>>0}function D(a){return a*a*a*(a*(a*6-15)+10)}function ft(a,t,e){const s=Math.floor(a),i=Math.floor(t),n=a-s,o=t-i,r=G(s,i,e)/4294967295,l=G(s+1,i,e)/4294967295,h=G(s,i+1,e)/4294967295,m=G(s+1,i+1,e)/4294967295,p=D(n),u=D(o),d=I(r,l,p),f=I(h,m,p);return I(d,f,u)}function z(a,t,e,s=5){let i=0,n=.55,o=1,r=0;for(let l=0;l<s;l++)i+=n*(ft(a*o,t*o,e+l*1013)*2-1),r+=n,n*=.52,o*=2.02;return i/r}function I(a,t,e){return a+(t-a)*e}function T(a,t,e){return e*a+t}class gt{static generate(t){const e=(t.seed??Math.random()*2147483648|0)>>>0,s=new pt(e),i=t.width,n=t.height,o=new Array(i*n),r=.46+s.range(-.03,.03);for(let u=0;u<n;u++)for(let d=0;d<i;d++){const f=d/i-.5,y=u/n-.5,g=Math.sqrt(f*f+y*y),x=vt(.75,.2,g),M=z(d/110,u/110,e,6)*.55+z(d/35,u/35,e^2654435769,4)*.45,b=C(.5+M*.6),R=C(b*.75+x*.45),k=C(.55+z(d/90,u/90,e^2246822507,5)*.35);o[T(i,d,u)]={h:R,m:k,tile:"grass",deco:null}}const l=yt(o,i,n,s),h=wt(o,i,n,l.x,l.y,r,s),m=xt(o,i,n);for(let u=0;u<n;u++)for(let d=0;d<i;d++){const f=T(i,d,u),y=m[f],g=Math.exp(-y*.07)*.55;o[f].m=C(o[f].m*.65+g)}for(let u=0;u<n;u++)for(let d=0;d<i;d++){const f=T(i,d,u),y=o[f],g=y.h,x=y.m;let M;y.tile==="river"?M="river":g<r?M="sea":g<r+.035?M="sand":g>.86?M="snow":g>.74?M="mountain":g>.64?M="rock":M=x>.58?"grass":"sand",y.tile=M}for(let u=0;u<n;u++)for(let d=0;d<i;d++){const f=T(i,d,u),y=o[f];if(y.tile!=="grass")continue;const g=m[f],x=C(.22*Math.exp(-Math.max(0,g-2)*.12));s.next()<x&&(y.deco="tree")}const p=Mt(o,i,n,r,h,s);return{width:i,height:n,seed:e,seaLevel:r,cells:o,spawn:p}}}function vt(a,t,e){const s=C((e-a)/(t-a));return s*s*(3-2*s)}function C(a){return Math.min(1,Math.max(0,a))}function yt(a,t,e,s){let i={x:t/2|0,y:e/2|0,score:-1};for(let n=0;n<1200;n++){const o=s.int(t*.2|0,t*.8|0),r=s.int(e*.2|0,e*.8|0),h=a[T(t,o,r)].h+s.next()*.03;h>i.score&&(i={x:o,y:r,score:h})}return{x:i.x,y:i.y}}function wt(a,t,e,s,i,n,o){const r=[];let l=s,h=i,m=0;for(;m++<t*e;){r.push({x:l,y:h});const p=T(t,l,h);if(a[p].tile="river",a[p].h<n+.01)break;let u=l,d=h,f=a[p].h+1;for(let y=-1;y<=1;y++)for(let g=-1;g<=1;g++){if(g===0&&y===0)continue;const x=l+g,M=h+y;if(x<1||M<1||x>=t-1||M>=e-1)continue;const b=a[T(t,x,M)].h+o.range(-.004,.004);b<f&&(f=b,u=x,d=M)}if(u===l&&d===h)break;l=u,h=d}return r}function xt(a,t,e){const s=new Float32Array(t*e),i=new Int32Array(t*e),n=new Int32Array(t*e);let o=0,r=0;for(let h=0;h<e;h++)for(let m=0;m<t;m++){const p=T(t,m,h),u=a[p].tile==="river"||a[p].h<.47;s[p]=u?0:1e9,u&&(i[r]=m,n[r]=h,r++)}const l=[[1,0],[-1,0],[0,1],[0,-1]];for(;o<r;){const h=i[o],m=n[o];o++;const p=T(t,h,m),u=s[p];for(const[d,f]of l){const y=h+d,g=m+f;if(y<0||g<0||y>=t||g>=e)continue;const x=T(t,y,g);s[x]>u+1&&(s[x]=u+1,i[r]=y,n[r]=g,r++)}}return s}function Mt(a,t,e,s,i,n){const o=i[i.length*.55|0]??{x:t/2|0,y:e/2|0};let r={x:o.x,y:o.y,score:-1};for(let l=0;l<1e3;l++){const h=_(o.x+n.int(-40,40),2,t-3),m=_(o.y+n.int(-40,40),2,e-3),p=a[T(t,h,m)];if(p.h<s+.05||p.tile!=="grass")continue;const d=1-Math.hypot(h-o.x,m-o.y)/60+p.m*.3+n.next()*.05;d>r.score&&(r={x:h,y:m,score:d})}return{x:r.x,y:r.y}}function _(a,t,e){return Math.min(e,Math.max(t,a|0))}function bt(){const a=new c.Group;a.name="PlayerCharacter";const t=new c.MeshStandardMaterial({color:new c.Color(14266508),roughness:.9,metalness:0,flatShading:!0}),e=new c.MeshStandardMaterial({color:new c.Color(2833259),roughness:.95,metalness:0,flatShading:!0}),s=new c.MeshStandardMaterial({color:new c.Color(1448483),roughness:.95,metalness:0,flatShading:!0}),i=new c.Mesh(new c.BoxGeometry(.42,.52,.22),e);i.position.set(0,.52,0),i.castShadow=!0;const n=new c.Mesh(new c.IcosahedronGeometry(.18,0),t);n.position.set(0,.88,0),n.castShadow=!0;const o=new c.Group;o.position.set(0,.32,0);const r=new c.CylinderGeometry(.07,.08,.42,5),l=new c.CylinderGeometry(.05,.06,.36,5),h=new c.BoxGeometry(.07,.06,.09),m=new c.BoxGeometry(.11,.06,.16),p=new c.Mesh(r,s);p.position.set(-.12,.1,0),p.castShadow=!0;const u=new c.Mesh(r,s);u.position.set(.12,.1,0),u.castShadow=!0;const d=new c.Mesh(m,s);d.position.set(-.12,-.12,.05),d.castShadow=!0;const f=new c.Mesh(m,s);f.position.set(.12,-.12,.05),f.castShadow=!0;const y=new c.Group;y.position.set(0,.72,0);const g=new c.Mesh(l,e);g.position.set(-.3,0,0),g.rotation.z=Math.PI*.12,g.castShadow=!0;const x=new c.Mesh(l,e);x.position.set(.3,0,0),x.rotation.z=-Math.PI*.12,x.castShadow=!0;const M=new c.Mesh(h,t);M.position.set(-.38,-.18,0),M.castShadow=!0;const b=new c.Mesh(h,t);b.position.set(.38,-.18,0),b.castShadow=!0,a.add(i,n,o,y),o.add(p,u,d,f),y.add(g,x,M,b);const R=new c.TorusGeometry(.32,.03,10,48),k=new c.MeshStandardMaterial({color:new c.Color(7856895),emissive:new c.Color(2795464),emissiveIntensity:.6,roughness:.35,metalness:.15,transparent:!0,opacity:0}),S=new c.Mesh(R,k);S.rotation.x=Math.PI/2,S.position.y=.04,S.visible=!0;const q=new c.Mesh(new c.SphereGeometry(.55,10,10),new c.MeshBasicMaterial({visible:!1}));q.position.set(0,.55,0),a.add(S,q);let U=!1,B=0;return{root:a,hit:q,ring:S,setSelected:V=>{U=V,B=0;const E=S.material;E.opacity=V?1:0},update:V=>{const E=.02*Math.sin(V*2.1);if(i.scale.setScalar(1+E),n.position.y=.88+E*1.6,y.rotation.y=.08*Math.sin(V*.8),U){B=Math.min(1,B+.06);const j=.5+.5*Math.sin(V*4);S.scale.setScalar(1+j*.08),S.material.opacity=.65+j*.25;const O=Tt(B);g.rotation.z=Math.PI*(.12+.28*O),x.rotation.z=-Math.PI*(.12+.28*O)}else g.rotation.z=H(g.rotation.z,Math.PI*.12,.08),x.rotation.z=H(x.rotation.z,-Math.PI*.12,.08),S.scale.setScalar(H(S.scale.x,1,.08))}}}function H(a,t,e){return a+(t-a)*e}function Tt(a){return 1+2.70158*Math.pow(a-1,3)+1.70158*Math.pow(a-1,2)}function St(a,t){const e=a.width,s=a.height,i=a.cells,n=new c.PlaneGeometry(e-1,s-1,e-1,s-1);n.rotateX(-Math.PI/2);const o=n.attributes.position,r=new c.BufferAttribute(new Float32Array(o.count*3),3);for(let f=0;f<o.count;f++){const y=o.getX(f)+(e-1)/2,g=o.getZ(f)+(s-1)/2,x=Q(Math.round(y),0,e-1),M=Q(Math.round(g),0,s-1),b=i[T(e,x,M)],R=(b.h-a.seaLevel)*t.verticalScale;o.setY(f,R);const k=kt(b.tile,b.h,b.m);r.setXYZ(f,k.r,k.g,k.b)}n.setAttribute("color",r),n.computeVertexNormals();const l=n.toNonIndexed();l.computeVertexNormals();const h=new c.MeshStandardMaterial({vertexColors:!0,flatShading:!0,roughness:.95,metalness:0}),m=new c.Mesh(l,h);m.receiveShadow=!0;const p=new c.PlaneGeometry(e-1,s-1,1,1);p.rotateX(-Math.PI/2);const u=new c.MeshStandardMaterial({color:new c.Color(731708),roughness:.15,metalness:.05,transparent:!0,opacity:.78}),d=new c.Mesh(p,u);return d.position.y=0,d.receiveShadow=!0,{terrain:m,water:d}}function Q(a,t,e){return Math.min(e,Math.max(t,a|0))}function kt(a,t,e){switch(a){case"sea":return new c.Color().setRGB(.03,.1,.22);case"river":return new c.Color().setRGB(.1,.45,.55);case"sand":{const s=P(.25+e*.25);return new c.Color().setRGB(.58+s*.12,.52+s*.12,.32+s*.08)}case"grass":{const s=P(.15+e*.65);return new c.Color().setRGB(.14+s*.1,.32+s*.28,.18+s*.1)}case"rock":{const s=P((t-.62)/.2);return new c.Color().setRGB(.25+s*.22,.26+s*.22,.29+s*.22)}case"mountain":{const s=P((t-.74)/.12);return new c.Color().setRGB(.32+s*.25,.3+s*.25,.28+s*.25)}case"snow":return new c.Color().setRGB(.88,.91,.95);default:return new c.Color(16711935)}}function P(a){return Math.min(1,Math.max(0,a))}class Vt{constructor(t){this.#t=new c.Scene,this.#c=new c.Clock,this.#r=0,this.#a=null,this.#i=null,this.#n=null,this.#o=new c.Vector3(0,0,0),this.#l=-.65,this.#h=.78,this.#u=85,this.raycaster=new c.Raycaster,this.pointerNdc=new c.Vector2,this.canvas=document.createElement("canvas"),this.canvas.className="dl-layer",this.#s=new c.WebGLRenderer({canvas:this.canvas,antialias:t.quality==="high",alpha:!1,powerPreference:"high-performance"}),this.#s.setPixelRatio(Math.min(window.devicePixelRatio,t.quality==="high"?2:1.25)),this.#s.shadowMap.enabled=t.quality==="high",this.#s.shadowMap.type=c.PCFSoftShadowMap,this.#e=new c.PerspectiveCamera(55,1,.1,2e3),this.#t.background=new c.Color(461076);const e=new c.HemisphereLight(12572415,1381924,.85);this.#t.add(e);const s=new c.DirectionalLight(16777215,1.25);s.position.set(90,140,60),s.castShadow=t.quality==="high",s.shadow.mapSize.set(t.quality==="high"?2048:1024,t.quality==="high"?2048:1024),s.shadow.camera.near=10,s.shadow.camera.far=420,s.shadow.camera.left=-160,s.shadow.camera.right=160,s.shadow.camera.top=160,s.shadow.camera.bottom=-160,this.#t.add(s),this.#t.fog=new c.FogExp2(461076,.006),this.resize()}#s;#t;#e;#c;#r;#a;#i;#n;#o;#l;#h;#u;setWorld(t){this.#a?.removeFromParent(),this.#i?.removeFromParent(),this.#a?.geometry.dispose(),this.#a?.material?.dispose?.();const{terrain:e,water:s}=St(t,{verticalScale:24});e.castShadow=!1,e.receiveShadow=!0,s.receiveShadow=!0,this.#t.add(e),this.#t.add(s),this.#a=e,this.#i=s,this.#n?.root.removeFromParent(),this.#n=bt(),this.#t.add(this.#n.root);const i=t.spawn.x-(t.width-1)/2,n=t.spawn.y-(t.height-1)/2,o=Rt(e,t,t.spawn.x,t.spawn.y,24);this.#n.root.position.set(i,o,n),this.#o.set(i,o,n),this.#u=85,this.#l=-.65,this.#h=.78,this.#d()}getCharacter(){return this.#n}setSelected(t){this.#n?.setSelected(t)}panBy(t,e){const s=new c.Vector3().setFromMatrixColumn(this.#e.matrix,0).normalize(),i=new c.Vector3().setFromMatrixColumn(this.#e.matrix,2).normalize();i.y=0,i.normalize();const n=this.#u*.0016;this.#o.addScaledVector(s,-t*n),this.#o.addScaledVector(i,e*n),this.#d()}zoom(t){const e=t>0?1.08:.92;this.#u=Ct(this.#u*e,35,220),this.#d()}setPointerFromClient(t,e){const s=this.canvas.getBoundingClientRect(),i=(t-s.left)/s.width,n=(e-s.top)/s.height;this.pointerNdc.set(i*2-1,-(n*2-1))}hitTestCharacter(){return this.#n?(this.raycaster.setFromCamera(this.pointerNdc,this.#e),this.raycaster.intersectObject(this.#n.hit,!1).length>0):!1}start(){const t=()=>{const e=this.#c.getElapsedTime();this.#n?.update(e),this.#s.render(this.#t,this.#e),this.#r=requestAnimationFrame(t)};this.#r=requestAnimationFrame(t)}resize(){const t=Math.max(1,window.innerWidth),e=Math.max(1,window.innerHeight);this.#s.setSize(t,e,!1),this.#e.aspect=t/e,this.#e.updateProjectionMatrix()}destroy(){cancelAnimationFrame(this.#r),this.#s.dispose()}#d(){const t=Math.cos(this.#l),e=Math.sin(this.#l),s=Math.cos(this.#h),i=Math.sin(this.#h),n=new c.Vector3(e*s,i,t*s).multiplyScalar(this.#u);this.#e.position.copy(this.#o).add(n),this.#e.lookAt(this.#o)}}function Ct(a,t,e){return Math.min(e,Math.max(t,a))}function Rt(a,t,e,s,i){return(t.cells[T(t.width,e,s)].h-t.seaLevel)*i}class Bt{#s;#t;#e;#c;#r=v("div",{className:"dl-layer"});#a=[];#i=null;#n=!1;#o=null;#l=null;#h=null;constructor(t){this.#s=t.root,this.#t=t.audio,this.#e=t.settings,this.#c=t.onExitToTitle}async mount(){await this.#t.ensureReady();const t=this.#e.get();this.#t.setVolumes({music:t.musicVolume,sfx:t.sfxVolume}),this.#t.setMusicEnabled(t.musicEnabled),this.#t.setTempoBpm(t.musicTempoBpm),this.#t.startMusic(),this.#i=new Vt({quality:t.graphicsQuality}),this.#r.append(this.#i.canvas);const e=v("div",{className:"dl-top-right"}),s=v("button",{className:"dl-icon-btn"});s.innerHTML=K(),e.append(s),this.#r.append(e);const i=v("div",{className:"dl-countdown"});this.#r.append(i),this.#s.append(this.#r),this.#i.resize(),this.#a.push(w(window,"resize",()=>this.#i?.resize())),this.#a.push(w(s,"pointerenter",()=>this.#t.playUiHover())),this.#a.push(w(s,"click",async()=>{this.#t.playUiClick(),await this.#f()})),this.#l=gt.generate({width:140,height:96}),this.#i.setWorld(this.#l),await this.#u(i),i.remove(),this.#m(),this.#d(),this.#i.start()}destroy(){this.#o?.destroy(),this.#o=null,this.#h?.remove(),this.#h=null,this.#i?.destroy(),this.#i=null;for(const t of this.#a)t();this.#a=[],this.#r.remove()}async#u(t){const e=["3","2","1","Start!"];for(const s of e)t.textContent=s,t.animate([{opacity:0,transform:"scale(0.85)"},{opacity:1,transform:"scale(1)"}],{duration:260,easing:"cubic-bezier(0.2, 1.3, 0.2, 1)"}),s==="Start!"?this.#t.playStartSting():this.#t.playCountdownTick(),await Et(650)}#d(){const t=this.#i;if(!t)return;this.#a.push(w(t.canvas,"contextmenu",o=>{o.preventDefault()}));let e=!1,s=0,i=0;this.#a.push(w(t.canvas,"pointerdown",o=>{if(o.button===2){this.#n?(this.#n=!1,t.setSelected(!1),this.#t.playDeselect(),this.#p()):this.#t.playDeselect();return}e=!0,s=o.clientX,i=o.clientY,o.target.setPointerCapture?.(o.pointerId),t.setPointerFromClient(o.clientX,o.clientY),t.hitTestCharacter()&&(this.#n=!0,t.setSelected(!0),this.#t.playSelect(),this.#p(),this.#h?.animate([{transform:"translateY(0)"},{transform:"translateY(-2px)"},{transform:"translateY(0)"}],{duration:220,easing:"ease-out"}))}));const n=()=>e=!1;this.#a.push(w(t.canvas,"pointerup",()=>n())),this.#a.push(w(t.canvas,"pointercancel",()=>n())),this.#a.push(w(t.canvas,"pointermove",o=>{if(!e)return;const r=o.clientX-s,l=o.clientY-i;s=o.clientX,i=o.clientY,t.panBy(r,l)})),this.#a.push(w(t.canvas,"wheel",o=>{o.preventDefault(),t.zoom(Math.sign(o.deltaY))},{passive:!1}))}#m(){const t=v("div",{className:"dl-ui"});t.style.pointerEvents="none";const e=v("div",{className:"dl-card dl-fade-in"});e.style.width="min(420px, calc(100vw - 40px))",e.style.position="absolute",e.style.left="18px",e.style.bottom="18px",e.style.padding="14px 14px",e.style.display="grid",e.style.gridTemplateColumns="72px 1fr",e.style.gap="12px",e.style.alignItems="center",e.style.pointerEvents="auto";const s=document.createElement("canvas");s.width=72,s.height=72,s.style.borderRadius="14px",s.style.border="1px solid rgba(255,255,255,0.12)",s.style.background="rgba(10,12,24,0.5)",X(s,{selected:this.#n});const i=v("div"),n=v("div",{text:"Wanderer Unit"});n.style.fontWeight="700",n.style.letterSpacing="0.04em";const o=v("div",{text:"Click the character to select."});o.style.color="rgba(248,250,252,0.68)",o.style.fontSize="13px",o.dataset.stats="1",i.append(n,o),e.append(s,i),t.append(e),this.#r.append(t),this.#h=t,this.#p()}#p(){if(!this.#h)return;const t=this.#h.querySelector("canvas"),e=this.#h.querySelector('[data-stats="1"]');t&&X(t,{selected:this.#n}),e&&(e.textContent=this.#n?"Selected • HP 100 • ATK 10 • DEF 6":"Click the character to select. Right click to deselect.")}async#f(){this.#o?.destroy(),this.#o=null;const t=await $(),e=this.#e.get(),s=v("div",{className:"dl-modal-content"}),i=(u,d)=>{const f=v("div",{className:"dl-row"});return f.append(v("div",{text:u}),d),f},n=document.createElement("input");n.type="range",n.min="0",n.max="1",n.step="0.01",n.value=String(e.musicVolume),n.className="dl-slider";const o=document.createElement("input");o.type="checkbox",o.checked=e.musicEnabled;const r=document.createElement("input");r.type="range",r.min="0",r.max="1",r.step="0.01",r.value=String(e.sfxVolume),r.className="dl-slider";const l=document.createElement("input");l.type="range",l.min="80",l.max="160",l.step="1",l.value=String(e.musicTempoBpm),l.className="dl-slider";const h=v("button",{className:"dl-danger",text:"Exit to title"});s.append(i("Version",v("div",{text:t})),i("Music enabled",o),i("Music volume",n),i("Tempo (BPM)",l),i("SFX volume",r),i("",h));const m=()=>{this.#e.set({musicEnabled:o.checked,musicVolume:Number(n.value),sfxVolume:Number(r.value),musicTempoBpm:Number(l.value)});const u=this.#e.get();this.#t.setVolumes({music:u.musicVolume,sfx:u.sfxVolume}),this.#t.setTempoBpm(u.musicTempoBpm),this.#t.setMusicEnabled(u.musicEnabled),u.musicEnabled&&this.#t.startMusic()},p=[w(o,"change",()=>m()),w(n,"input",()=>m()),w(l,"input",()=>m()),w(r,"input",()=>m()),w(h,"pointerenter",()=>this.#t.playUiHover()),w(h,"click",()=>{this.#t.playUiClick(),h.animate([{transform:"scale(1)"},{transform:"scale(0.98)"},{transform:"scale(1)"}],{duration:220,easing:"ease-out"}),this.#o?.destroy(),this.#o=null,this.#c()})];this.#o=new Z({title:"Menu",content:s,onClose:()=>{for(const u of p)u()}}),this.#o.mount(this.#r)}}function Et(a){return new Promise(t=>setTimeout(t,a))}function X(a,t){const e=a.getContext("2d");e&&(e.clearRect(0,0,a.width,a.height),e.fillStyle=t.selected?"rgba(119,226,255,0.12)":"rgba(10,12,24,0.35)",e.fillRect(0,0,a.width,a.height),e.save(),e.translate(36,38),e.fillStyle="rgba(217,176,140,0.95)",e.beginPath(),e.arc(0,-6,18,0,Math.PI*2),e.fill(),e.fillStyle="rgba(22,26,35,0.85)",e.beginPath(),e.arc(-6,-10,2.2,0,Math.PI*2),e.arc(6,-10,2.2,0,Math.PI*2),e.fill(),e.strokeStyle="rgba(22,26,35,0.65)",e.lineWidth=2,e.beginPath(),e.moveTo(-6,2),e.quadraticCurveTo(0,7,6,2),e.stroke(),t.selected&&(e.strokeStyle="rgba(119,226,255,0.85)",e.lineWidth=2,e.beginPath(),e.arc(0,-6,23,0,Math.PI*2),e.stroke()),e.restore())}class Nt{constructor(t){this.#t=null,this.audio=new tt,this.settings=new nt,this.#s=t}#s;#t;start(){this.settings.load(),this.gotoTitle()}gotoTitle(){this.#e(new mt({root:this.#s,audio:this.audio,settings:this.settings,onStart:()=>this.gotoGame()}))}gotoGame(){this.#e(new Bt({root:this.#s,audio:this.audio,settings:this.settings,onExitToTitle:()=>this.gotoTitle()}))}#e(t){this.#t?.destroy(),this.#t=t,this.#t.mount()}}const J=document.getElementById("app");if(!J)throw new Error("Missing #app root");const At=new Nt(J);At.start();
