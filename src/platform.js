// Platform / locale / keyboard detection and remappable keybindings.
// On first launch we sniff language, hardware hints and layout (AZERTY vs QWERTY),
// then persist overrides in localStorage. Also builds a privacy-light user report.

const STORAGE_KEYS = 'dl-keybinds';
const STORAGE_REPORT = 'dl-report-id';

const QWERTY_DEFAULTS = {
  panForward: 'w', panBack: 's', panLeft: 'a', panRight: 'd',
  rotateMod: 'rightclick', zoomIn: 'wheelup', zoomOut: 'wheeldown',
  toolHand: '1', toolSpell: '2', toolPlant: '3', toolDig: '4', toolRaise: '5', toolBuild: '6',
  cancel: 'escape', tech: 't', log: 'l',
};

const AZERTY_DEFAULTS = {
  ...QWERTY_DEFAULTS,
  panForward: 'z', panBack: 's', panLeft: 'q', panRight: 'd',
};

export function detectPlatform() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const ua = nav.userAgent || '';
  const lang = (nav.language || nav.userLanguage || 'en').toLowerCase();
  const langs = nav.languages ? [...nav.languages] : [lang];

  const isMac = /Mac|iPhone|iPad|iPod/.test(nav.platform || ua) || /Macintosh/.test(ua);
  const isAppleSilicon = isMac && (
    // M1/M2/M3 often report as Intel in browsers; use maxTouchPoints + platform heuristics
    (nav.userAgentData?.architecture === 'arm') ||
    (nav.userAgentData?.platform === 'macOS' && /arm/i.test(nav.userAgentData?.architecture || '')) ||
    // Safari on Apple Silicon: hardwareConcurrency often 8+ and no "Intel" in UA
    (isMac && !/Intel/.test(ua) && (nav.hardwareConcurrency || 0) >= 8)
  );

  // Keyboard layout: French locales → AZERTY by default
  const isFrench = lang.startsWith('fr') || langs.some(l => String(l).toLowerCase().startsWith('fr'));
  const layout = isFrench ? 'azerty' : 'qwerty';

  const cores = nav.hardwareConcurrency || 0;
  const mem = nav.deviceMemory || null; // Chrome only, GiB
  const screenInfo = typeof screen !== 'undefined'
    ? { w: screen.width, h: screen.height, dpr: window.devicePixelRatio || 1 }
    : { w: 0, h: 0, dpr: 1 };

  return {
    language: lang,
    languages: langs,
    layout,
    isMac,
    isAppleSilicon,
    platform: nav.platform || 'unknown',
    userAgent: ua.slice(0, 180),
    cores,
    memoryGiB: mem,
    screen: screenInfo,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    detectedAt: new Date().toISOString(),
  };
}

export function defaultKeybinds(layout) {
  return { ...(layout === 'azerty' ? AZERTY_DEFAULTS : QWERTY_DEFAULTS) };
}

export function loadKeybinds(layout) {
  const base = defaultKeybinds(layout);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS) || '{}');
    return { ...base, ...saved };
  } catch { return base; }
}

export function saveKeybinds(binds) {
  localStorage.setItem(STORAGE_KEYS, JSON.stringify(binds));
}

export function resetKeybinds(layout) {
  localStorage.removeItem(STORAGE_KEYS);
  return defaultKeybinds(layout);
}

/** Lightweight anonymous report blob for support / telemetry opt-in. */
export function buildUserReport(extra = {}) {
  const platform = detectPlatform();
  let reportId = localStorage.getItem(STORAGE_REPORT);
  if (!reportId) {
    reportId = 'dl-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(STORAGE_REPORT, reportId);
  }
  return {
    reportId,
    game: 'Darkest Light',
    version: '1.0.0',
    platform,
    keybinds: loadKeybinds(platform.layout),
    settings: (() => { try { return JSON.parse(localStorage.getItem('dl-settings') || '{}'); } catch { return {}; } })(),
    ...extra,
    generatedAt: new Date().toISOString(),
  };
}

export function downloadReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `darkestlight-report-${report.reportId}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const KEYBIND_LABELS = {
  panForward: 'Pan forward',
  panBack: 'Pan back',
  panLeft: 'Pan left',
  panRight: 'Pan right',
  toolHand: 'Tool: Hand',
  toolSpell: 'Tool: Spell',
  toolPlant: 'Tool: Plant',
  toolDig: 'Tool: Dig',
  toolRaise: 'Tool: Raise',
  toolBuild: 'Tool: Build',
  cancel: 'Cancel / close',
  tech: 'Open tech tree',
  log: 'Toggle chronicle',
};
