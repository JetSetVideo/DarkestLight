// Named relief / climate sculptors used by Terrain._generate.
import { clamp, lerp } from '../util.js';
import { RELIEF as R, CLIMATE_GEN as C } from '../data/generation.js';

const SEA = 0;

export function sculptAltitude({ plate, ridge, valley, d, pvp, x, z, fbm, clipN, volcanic, shaftN }) {
  let alt = plate * R.plateAmp + R.plateBias;
  alt += Math.pow(ridge, R.ridgePow) * R.ridgeAmp;
  alt -= Math.pow(valley, R.valleyPow) * R.valleyAmp * (1 - ridge * R.valleyRidgeDampen);
  alt -= Math.pow(Math.max(0, d - R.falloffStart) * R.falloffSpread, 2) * R.falloffAmp;

  let rd = 99;
  if (pvp) {
    const riverX = Math.sin(z * 0.055) * R.riverWiggle + (fbm(z * 0.02, 2.2) - 0.5) * R.riverNoise;
    rd = Math.abs(x - riverX);
    if (rd < R.riverWidth) alt = Math.min(alt, lerp(R.riverFloor, alt, Math.pow(rd / R.riverWidth, R.riverPow)));
  }
  if (clipN > R.clipThresh && alt > SEA + 0.2) {
    const step = R.clipStep + (clipN - R.clipThresh) * R.clipStepGain;
    alt = Math.floor(alt / step) * step + (clipN - R.clipThresh) * 0.15;
  }
  if (volcanic > R.volUpliftThresh) alt += volcanic * volcanic * R.volUplift;
  if (shaftN > R.shaftThresh && alt > SEA + 1 && rd > 10 && volcanic < 0.4)
    alt -= (shaftN - R.shaftThresh) * R.shaftCut;
  return { alt, rd };
}

export function sculptTemperature({ z, worldSize, alt, tNoise, volcanic }) {
  const lat = clamp(0.5 - z / worldSize, 0, 1);
  const lapse = clamp(alt / 14, 0, 1);
  return clamp(C.tempBase + lat * C.tempLat + tNoise * C.tempNoise - lapse * C.lapse + volcanic * C.volHeat, 0, 1);
}

export function sculptHumidity({ moistBase, dryFront, ridge, fbmRid, i, j, windX, windZ, rd, alt, volcanic, temp }) {
  const gx = (ridge - fbmRid((i - 1) * R.ridgeFreq, j * R.ridgeFreq));
  const gz = (ridge - fbmRid(i * R.ridgeFreq, (j - 1) * R.ridgeFreq));
  const orographic = clamp(-(gx * windX + gz * windZ) * C.oroGain, C.oroMin, C.oroMax);
  const riverBoost = rd < C.riverMoistR ? (1 - rd / C.riverMoistR) * C.riverMoist : 0;
  const shoreBoost = alt < 1.5 && alt > -0.5 ? C.shoreMoist : 0;
  let hum = moistBase * C.humBase + orographic + riverBoost + shoreBoost
    - dryFront * dryFront * C.dryFront * (1 - moistBase)
    + volcanic * -C.volDry;
  hum = clamp(hum, 0, 1);
  hum *= lerp(C.coldHold, 1, temp * 0.5 + 0.5);
  return hum;
}

export function volcanicField(x, z, volX, volZ, volN) {
  const vDist = Math.hypot(x - volX, z - volZ);
  const volCore = clamp(1 - vDist / R.volRadius, 0, 1);
  return Math.pow(volCore, R.volPow) * (R.volBase + volN * R.volNoise);
}
