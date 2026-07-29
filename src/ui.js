// All DOM UI: main menu, civ select, settings, Lexicon (filterable 3-per-row
// cards with rendered thumbnails), HUD with day/night clock & weather, side
// chronicle log, inspection panel, branching tech tree panel, build menu,
// messages and the end-of-game recap screen.
import * as THREE from 'three';
import { CIVS, CIV_KEYS, CLASSES, BUILDINGS, TECHS, FAVORS, TITLES, JOB_LABEL } from './civs.js';
import { buildCatalog } from './models.js';
import { Creature, Animal, Monster, Building, ResourceNode } from './entities.js';
import { dnaString, GENES } from './entities.js';
import { fmtTime } from './util.js';
import { WEATHER_META } from './world.js';
import {
  detectPlatform, loadKeybinds, saveKeybinds, resetKeybinds,
  buildUserReport, downloadReport, KEYBIND_LABELS,
} from './platform.js';

const $ = (id) => document.getElementById(id);
const CAT_ICON = { unit: '🧍', animal: '🐾', monster: '👹', building: '🏛', flora: '🌿', object: '💎', spell: '✨' };

export class UI {
  constructor({ onStartGame, onQuitGame, onSelectTool, onSelectBuild, onCenterCamera, onKeybindsChange }) {
    this.onStartGame = onStartGame;
    this.onQuitGame = onQuitGame;
    this.onSelectTool = onSelectTool;
    this.onSelectBuild = onSelectBuild;
    this.onCenterCamera = onCenterCamera || (() => {});
    this.onKeybindsChange = onKeybindsChange || (() => {});
    this.settings = this.loadSettings();
    this.platform = detectPlatform();
    this.keybinds = loadKeybinds(this.platform.layout);
    this._listeningBind = null;
    this._pendingMode = null;
    this._galleryBuilt = false;
    this._inspected = null;
    this._logEntries = [];

    // ------- menu -------
    $('btn-battle').onclick = () => this.showCivSelect('battle');
    $('btn-construction').onclick = () => this.showCivSelect('construction');
    $('btn-story').onclick = () => this.msg('Story mode — the chronicles are still being written…');
    $('btn-gallery').onclick = () => this.showGallery();
    $('btn-settings').onclick = () => { this.renderPlatformBanner(); this.renderKeybinds(); this.showScreen('settings'); };
    $('btn-settings-back').onclick = () => { this.saveSettings(); this.showScreen('menu'); };
    $('btn-gallery-back').onclick = () => this.showScreen('menu');
    $('btn-end-menu').onclick = () => { this.showScreen('menu'); };
    $('btn-menu-ingame').onclick = () => { this.onQuitGame(); this.showScreen('menu'); };
    $('btn-civ-cancel').onclick = () => this.hideCivSelect();
    $('inspect-close').onclick = () => this.closeInspect();
    $('tech-close').onclick = () => $('tech-panel').classList.add('hidden');
    $('btn-tech').onclick = () => this.toggleTechPanel();
    $('log-toggle').onclick = () => $('log-box').classList.toggle('hidden');
    $('btn-keybind-reset').onclick = () => {
      this.keybinds = resetKeybinds(this.platform.layout);
      this.onKeybindsChange(this.keybinds);
      this.renderKeybinds();
      this.msg(`Keybinds reset to ${this.platform.layout.toUpperCase()} defaults`);
    };
    $('btn-download-report').onclick = () => {
      const report = buildUserReport({ note: 'User-initiated support report' });
      downloadReport(report);
      this.msg('Report downloaded');
    };

    // civ select buttons
    const list = $('civ-list');
    for (const key of CIV_KEYS) {
      const civ = CIVS[key];
      const b = document.createElement('button');
      b.className = 'civ-btn';
      b.textContent = civ.name;
      b.style.setProperty('--civcolor', '#' + civ.color.toString(16).padStart(6, '0'));
      b.title = civ.desc;
      b.onclick = () => {
        this.hideCivSelect();
        this.onStartGame(this._pendingMode, key);
      };
      list.appendChild(b);
    }

    // civ filter options in Lexicon
    const fc = $('filter-civ');
    for (const key of CIV_KEYS) {
      const o = document.createElement('option');
      o.value = key; o.textContent = CIVS[key].name;
      fc.appendChild(o);
    }
    $('filter-category').onchange = () => this.filterGallery();
    $('filter-civ').onchange = () => this.filterGallery();
    $('filter-search').oninput = () => this.filterGallery();

    // settings inputs
    $('set-shadows').checked = this.settings.shadows;
    $('set-particles').checked = this.settings.particles;
    $('set-fog').checked = this.settings.fog;
    $('set-camspeed').value = this.settings.camspeed;
    $('set-matchlen').value = this.settings.matchlen;
    $('set-matchlen-val').textContent = this.settings.matchlen;
    $('set-matchlen').oninput = (e) => { $('set-matchlen-val').textContent = e.target.value; };

    // tools
    for (const btn of document.querySelectorAll('#hud-tools .tool')) {
      btn.onclick = () => {
        document.querySelectorAll('#hud-tools .tool').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const tool = btn.dataset.tool;
        $('build-menu').classList.toggle('hidden', tool !== 'build');
        if (tool === 'build') this.renderBuildMenu();
        this.onSelectTool(tool);
      };
    }

    // remappable key capture + in-game shortcuts
    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    this.renderPlatformBanner();
    this.renderKeybinds();
    this.onKeybindsChange(this.keybinds);

    // launch toast with detected platform
    const hw = this.platform.isAppleSilicon ? 'Apple Silicon' : (this.platform.isMac ? 'Mac' : this.platform.platform);
    setTimeout(() => this.msg(
      `Detected ${this.platform.language} · ${hw} · ${this.platform.layout.toUpperCase()} keys`), 400);
  }

  renderPlatformBanner() {
    const el = $('platform-banner');
    if (!el) return;
    const p = this.platform;
    const hw = p.isAppleSilicon ? 'Apple Silicon (M-series likely)' : (p.isMac ? 'macOS' : p.platform);
    el.innerHTML = `<strong>Detected</strong><br>
      Language: ${p.language}<br>
      Hardware: ${hw} · ${p.cores || '?'} cores${p.memoryGiB ? ` · ~${p.memoryGiB} GiB` : ''}<br>
      Keyboard layout: <strong>${p.layout.toUpperCase()}</strong> (defaults applied; remappable below)<br>
      Screen: ${p.screen.w}×${p.screen.h} @${p.screen.dpr}x · ${p.timezone}`;
  }

  renderKeybinds() {
    const box = $('keybind-list');
    if (!box) return;
    box.innerHTML = '';
    for (const [id, label] of Object.entries(KEYBIND_LABELS)) {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      const lab = document.createElement('span');
      lab.textContent = label;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = (this.keybinds[id] || '?').toUpperCase();
      btn.dataset.bind = id;
      if (this._listeningBind === id) {
        btn.classList.add('listening');
        btn.textContent = '…';
      }
      btn.onclick = () => {
        this._listeningBind = id;
        this.renderKeybinds();
      };
      row.appendChild(lab);
      row.appendChild(btn);
      box.appendChild(row);
    }
  }

  onKeyDown(e) {
    const key = e.key.toLowerCase();
    if (this._listeningBind) {
      e.preventDefault();
      if (key !== 'escape') {
        this.keybinds[this._listeningBind] = key;
        saveKeybinds(this.keybinds);
        this.onKeybindsChange(this.keybinds);
      }
      this._listeningBind = null;
      this.renderKeybinds();
      return;
    }
    // ignore when typing in inputs
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    const b = this.keybinds;
    const toolMap = {
      [b.toolHand]: 'hand', [b.toolSpell]: 'spell', [b.toolPlant]: 'plant',
      [b.toolDig]: 'dig', [b.toolRaise]: 'raise', [b.toolBuild]: 'build',
    };
    if (toolMap[key] && !$('hud').classList.contains('hidden')) {
      const tool = toolMap[key];
      document.querySelectorAll('#hud-tools .tool').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.tool === tool);
      });
      $('build-menu').classList.toggle('hidden', tool !== 'build');
      if (tool === 'build') this.renderBuildMenu();
      this.onSelectTool(tool);
    }
    if (key === b.tech && !$('hud').classList.contains('hidden')) this.toggleTechPanel();
    if (key === b.log && !$('hud').classList.contains('hidden')) $('log-box').classList.toggle('hidden');
    if (key === b.cancel) {
      $('tech-panel').classList.add('hidden');
      this.closeInspect?.();
    }
  }

  // ---------------- settings ----------------
  loadSettings() {
    try {
      return Object.assign(
        { shadows: true, particles: true, fog: true, camspeed: 1.4, matchlen: 20 },
        JSON.parse(localStorage.getItem('dl-settings') || '{}'));
    } catch { return { shadows: true, particles: true, fog: true, camspeed: 1.4, matchlen: 20 }; }
  }
  saveSettings() {
    this.settings = {
      shadows: $('set-shadows').checked,
      particles: $('set-particles').checked,
      fog: $('set-fog').checked,
      camspeed: parseFloat($('set-camspeed').value),
      matchlen: parseInt($('set-matchlen').value, 10),
    };
    localStorage.setItem('dl-settings', JSON.stringify(this.settings));
  }

  // ---------------- screens ----------------
  showScreen(name) {
    for (const s of ['menu', 'settings', 'gallery', 'end']) $('screen-' + s).classList.add('hidden');
    $('hud').classList.add('hidden');
    $('inspect').classList.add('hidden');
    $('tech-panel').classList.add('hidden');
    if (name) $('screen-' + name)?.classList.remove('hidden');
    if (name === 'menu') this.hideCivSelect();
  }
  showHUD() {
    this.showScreen(null);
    $('hud').classList.remove('hidden');
  }
  // choosing a mode swaps the menu buttons for the civ picker (with Cancel)
  showCivSelect(mode) {
    this._pendingMode = mode;
    $('menu-buttons').classList.add('hidden');
    $('civ-select').classList.remove('hidden');
  }
  hideCivSelect() {
    $('civ-select').classList.add('hidden');
    $('menu-buttons').classList.remove('hidden');
  }

  // ---------------- messages & chronicle ----------------
  msg(text, pos) {
    if (!text) return;
    // transient toast
    const box = $('hud-msg');
    const div = document.createElement('div');
    div.className = 'msg';
    div.textContent = text;
    box.appendChild(div);
    setTimeout(() => div.remove(), 4200);
    while (box.children.length > 4) box.firstChild.remove();
    // permanent chronicle entry (click → jump camera to the event)
    const g = this._game;
    this._logEntries.push({ text, pos: pos || null, t: g ? g.elapsed : 0 });
    if (this._logEntries.length > 60) this._logEntries.shift();
    this.renderLog();
  }
  renderLog() {
    const el = $('log-entries');
    if (!el) return;
    el.innerHTML = '';
    for (let i = this._logEntries.length - 1; i >= 0; i--) {
      const e = this._logEntries[i];
      const div = document.createElement('div');
      div.className = 'log-entry' + (e.pos ? ' locatable' : '');
      div.innerHTML = `<span class="lt">${fmtTime(e.t)}</span>${e.text}`;
      if (e.pos) div.onclick = () => this.onCenterCamera(e.pos);
      el.appendChild(div);
    }
  }
  clearLog() { this._logEntries = []; this.renderLog(); }

  // ---------------- HUD ----------------
  updateHUD(game) {
    if (!game) return;
    const st = game.state.player;
    $('hud-food').textContent = `🍖 ${Math.floor(st.food)}`;
    $('hud-wood').textContent = `🪵 ${Math.floor(st.wood)}`;
    const rockEl = $('hud-rock'), metalEl = $('hud-metal');
    if (rockEl) rockEl.textContent = `🪨 ${Math.floor(st.rock || 0)}`;
    if (metalEl) metalEl.textContent = `⚙️ ${Math.floor(st.metal || 0)}`;
    $('hud-pop').textContent = `👥 ${game.popOf('player')}/${game.popCap('player')}`;
    $('hud-dp').textContent = `✦ ${Math.floor(st.dp)}`;
    $('hud-timer').textContent = game.timeLeft === Infinity ? fmtTime(game.elapsed) : fmtTime(game.timeLeft);
    const cy = game.cycles;
    // warcraft-3-style clock: sun & moon ride opposite ends of a rotating dial
    $('clock-dial').style.transform = `rotate(${(cy.dayFrac - 0.25) * 360}deg)`;
    $('clock-sun').style.transform = `rotate(${-(cy.dayFrac - 0.25) * 360}deg)`;
    $('clock-moon').style.transform = `rotate(${-(cy.dayFrac - 0.25) * 360}deg)`;
    $('clock-moon').style.opacity = cy.moonOut ? 1 : 0.25;
    const wm = WEATHER_META[cy.weather] || WEATHER_META.sunny;
    $('hud-weather').textContent = wm.icon;
    const faith = game.faithLevel('player');
    $('hud-weather').title = wm.label + ` · Faith ${Math.round(faith * 100)}%` +
      (cy.isNight && cy.moonOut ? ' · moonlit night' : cy.isNight ? ' · moonless night' : '');
    $('hud-season').textContent = `${cy.season} · ${cy.isNight ? (cy.moonOut ? 'Moonlit night' : 'Dark night') : 'Day'} ${cy.day + 1} · ${wm.label} · Faith ${Math.round(faith * 100)}%`;
    $('hud-score').textContent = `Score ${game.scoreOf('player')}`;
    if (this._inspected) this.renderInspect(game, this._inspected);
  }

  // ---------------- inspection ----------------
  inspect(game, ent) {
    if (!ent) { this.closeInspect(); return; }
    if (ent instanceof Creature && ent.side !== 'player') {
      this.msg(`${ent.name} does not worship you… yet`);
      return;
    }
    this._inspected = ent;
    game.setSelected(ent); // gold ring
    $('inspect').classList.remove('hidden');
    this.renderInspect(game, ent);
  }
  closeInspect() {
    this._inspected = null;
    this._game?.setSelected(null);
    $('inspect').classList.add('hidden');
  }
  renderInspect(game, ent) {
    const el = $('inspect-body');
    const kv = (k, v) => `<div class="kv"><b>${k}</b><span>${v}</span></div>`;
    const bar = (v) => `<div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>`;

    if (ent instanceof Creature) {
      if (!game.creatures.includes(ent)) { this.closeInspect(); return; }
      const state = ent.task === 'sleep' ? '💤 sleeping' : ent.alert > 0 ? '⚠ alert' : ent.task;
      el.innerHTML = `
        <h3>${ent.name}</h3>
        <div class="titleline">${ent.displayTitle}</div>
        ${kv('Civilization', CIVS[ent.civKey].name)}
        ${kv('Job', JOB_LABEL[ent.cls] || CLASSES[ent.cls].name)}
        ${ent.titles.length ? kv('Titles', ent.titles.map(t => TITLES[t]?.name || t).join(', ')) : ''}
        ${kv('Sex / Age', `${ent.sex} · ${Math.floor(ent.age)}y (${ent.lifeStage})`)}
        ${kv('Lifespan', Math.floor(ent.lifespan) + 'y')}
        ${kv('Emotion', ent.emotion)}
        ${kv('State', state)}
        ${kv('Energy', `${Math.round(ent.energy)}/${ent.maxEnergy}${ent.sprinting ? ' 🏃' : ''}`)}
        ${kv('Night sight', Math.round(ent.nightSight * 100) + '%')}
        ${kv('Carrying', `🍖${Math.floor(ent.carrying.food||0)} 🪵${Math.floor(ent.carrying.wood||0)} 🪨${Math.floor(ent.carrying.rock||0)} ⚙️${Math.floor(ent.carrying.metal||0)}`)}
        <h4>Health</h4>${bar(ent.hp / ent.maxHp)}
        <h4>Stats (with age malus ×${ent.ageMul.toFixed(2)})</h4>
        ${kv('Speed', ent.speed.toFixed(2))}
        ${kv('Strength', ent.strength.toFixed(2))}
        ${kv('Intelligence', ent.intelligence.toFixed(2))}
        <h4>Faith</h4>
        ${kv('Toward you', ent.attitudeToward('player') + ` (${Math.round(ent.beliefs.player)})`)}
        ${kv('Toward enemy god', ent.attitudeToward('enemy') + ` (${Math.round(ent.beliefs.enemy)})`)}
        <h4>DNA</h4>
        <div class="dna">${dnaString(ent.dna)}</div>
        <div class="dna">${GENES.map(g => `${g}: ${(ent.dna[g] ?? 0.5).toFixed(2)}`).join(' · ')}</div>`;
    } else if (ent instanceof Building) {
      if (!game.buildings.includes(ent)) { this.closeInspect(); return; }
      const def = BUILDINGS[ent.type];
      if (ent.type === 'campfire') {
        const side = ent.side;
        const st = game.stateOf(side);
        const pop = game.popOf(side);
        const health = game.tribeHealth(side);
        const label = health > 0.7 ? '🔥 Thriving — the flame burns tall and golden'
          : health > 0.35 ? '🔥 Stable — a steady orange fire'
          : '🔥 Struggling — the embers are turning red';
        const jobs = {};
        const emotions = {};
        let belief = 0;
        for (const c of game.creatures) {
          if (c.side !== side) continue;
          const j = JOB_LABEL[c.cls] || c.cls;
          jobs[j] = (jobs[j] || 0) + 1;
          emotions[c.emotion] = (emotions[c.emotion] || 0) + 1;
          belief += c.beliefs[side];
        }
        el.innerHTML = `
          <h3>${def.name} — Tribe of the ${CIVS[game.civOf(side)].name}</h3>
          <div class="titleline">${label}</div>
          <h4>Tribe health</h4>${bar(health)}
          ${kv('Population', `${pop} / ${game.popCap(side)}`)}
          ${kv('Food', Math.floor(st.food))}
          ${kv('Wood', Math.floor(st.wood))}
          ${kv('Rock', Math.floor(st.rock || 0))}
          ${kv('Metal', Math.floor(st.metal || 0))}
          ${kv('Divine Points', Math.floor(st.dp))}
          ${kv('Faith', Math.round(game.faithLevel(side) * 100) + '%')}
          ${kv('Average devotion', pop ? Math.round(belief / pop) : 0)}
          ${kv('Technologies', Object.keys(st.techs).length)}
          <h4>Jobs</h4>
          ${Object.entries(jobs).map(([k, v]) => kv(k, v)).join('') || '<div class="ach">nobody left</div>'}
          <h4>Hearts &amp; minds</h4>
          ${Object.entries(emotions).map(([k, v]) => kv(k, v)).join('')}
          <h4>Condition</h4>${bar(ent.hp / ent.maxHp)}`;
        return;
      }
      const deps = game.creatures
        .filter(c => c.side === ent.side)
        .filter(c => ent.type === 'farm' ? c.cls === 'farmer' :
          ent.type === 'barracks' ? c.cls === 'knight' :
          ent.type === 'temple' ? c.cls === 'philosopher' : false)
        .slice(0, 8);
      el.innerHTML = `
        <h3>${def.name}${ent.constructing ? ' (building…)' : ''}</h3>
        ${kv('Role', def.role || '—')}
        ${kv('Allegiance', ent.side === 'player' ? 'Your civilization' : 'Enemy civilization')}
        ${ent.constructing ? kv('Progress', Math.round(ent.buildProgress / ent.buildNeeded * 100) + '%') + kv('Workers', ent.workers.size) : ''}
        <h4>Institutional intent</h4>
        <div style="font-size:13px;color:var(--dim)">“${def.intent}”</div>
        <h4>Condition</h4>${bar(ent.hp / ent.maxHp)}
        ${kv('HP', `${Math.ceil(ent.hp)}/${ent.maxHp}`)}
        <h4>Depends on it</h4>
        ${deps.length ? deps.map(c => `<div class="ach done">${c.name} — ${CLASSES[c.cls].name}, ${c.task}</div>`).join('') : '<div class="ach">no one right now</div>'}`;
    } else if (ent instanceof Monster) {
      el.innerHTML = `
        <h3>${ent.type[0].toUpperCase() + ent.type.slice(1)}</h3>
        ${kv('Nature', 'mythical — does not age')}
        ${kv('Behavior', 'territorial predator')}
        <h4>Health</h4>${bar(ent.hp / ent.maxHp)}`;
    } else if (ent instanceof Animal) {
      const behavior = ent.type === 'snake' ? 'slithers about, bites the careless'
        : ent.type === 'fish' ? 'schools in the waters, sometimes leaps'
        : 'roams, fears the divine hand';
      el.innerHTML = `
        <h3>${ent.type[0].toUpperCase() + ent.type.slice(1)}</h3>
        ${kv('Behavior', behavior)}
        ${kv('HP', Math.ceil(ent.hp))}`;
    } else if (ent instanceof ResourceNode) {
      el.innerHTML = `
        <h3>${ent.kind[0].toUpperCase() + ent.kind.slice(1)}</h3>
        ${kv('Yields', ent.yields)}
        ${ent.kind === 'tree' ? kv('Growth', Math.round(ent.growth / 1.35 * 100) + '%') + kv('Grains', ent.grains || '—') : ''}
        ${kv('Remaining', Math.ceil(ent.amount))}`;
    } else {
      el.innerHTML = `<h3>Ancient Relic</h3><div class="ach">Walk a follower close to claim +100 ✦</div>`;
    }
  }

  // ---------------- build menu ----------------
  renderBuildMenu() {
    const el = $('build-menu');
    el.innerHTML = '';
    const g = this._game;
    for (const [key, def] of Object.entries(BUILDINGS)) {
      if (key === 'campfire') continue;
      const b = document.createElement('button');
      const free = g && g.mode === 'construction';
      const cost = free ? '(free)' :
        `(🪵${def.wood || 0}${def.rock ? ` 🪨${def.rock}` : ''}${def.metal ? ` ⚙️${def.metal}` : ''}${def.dp ? ` ✦${def.dp}` : ''})`;
      b.textContent = `${def.name} ${cost}`;
      b.title = `${def.desc} · role: ${def.role || '—'}` + (def.tech ? ` — requires ${def.tech}` : '');
      b.disabled = g ? !g.canBuild('player', key) : false;
      b.onclick = () => this.onSelectBuild(key);
      el.appendChild(b);
    }
  }
  attachGame(game) { this._game = game; if (game) this.clearLog(); }

  // ---------------- tech tree panel ----------------
  toggleTechPanel() {
    const p = $('tech-panel');
    if (p.classList.contains('hidden')) { p.classList.remove('hidden'); this.renderTechPanel(); }
    else p.classList.add('hidden');
  }
  renderTechPanel() {
    const g = this._game;
    if (!g) return;
    const st = g.state.player;
    const el = $('tech-body');
    const techs = g.techsFor('player');
    const tiers = [...new Set(techs.map(t => t.tier))].sort((a, b) => a - b);
    const tierName = ['Stone Age', 'Settlement', 'Craft', 'Mastery', 'Legacy'];

    let html = '<div class="tech-tree">';
    for (const tier of tiers) {
      html += `<div class="tech-tier"><div class="tier-label">${tierName[tier] || 'Era ' + tier}</div>`;
      for (const t of techs.filter(x => x.tier === tier)) {
        const owned = !!st.techs[t.key];
        const lockedByChoice = t.excludes && st.techs[t.excludes];
        const reqsOk = t.req.every(r => st.techs[r]);
        const achOk = g.achievementDone('player', t);
        const canUnlock = !owned && !lockedByChoice && reqsOk && achOk && st.dp >= t.dp;
        const cls = owned ? 'owned' : lockedByChoice ? 'locked-choice' : !reqsOk ? 'locked' : '';
        html += `
          <div class="tech-item ${cls}">
            <div class="tname">${t.civ ? '★ ' : ''}${t.name} — ${t.dp} ✦</div>
            <div class="tdesc">${t.desc}</div>
            ${t.req.length ? `<div class="treq">requires: ${t.req.map(r => TECHS.find(x => x.key === r)?.name).join(', ')}</div>` : ''}
            ${t.excludes ? `<div class="treq choice">⚖ either/or with ${TECHS.find(x => x.key === t.excludes)?.name}</div>` : ''}
            ${t.civ ? `<div class="treq">exclusive to the ${CIVS[t.civ].name}</div>` : ''}
            <div class="ach ${achOk ? 'done' : ''}">${achOk ? '✓' : '○'} ${t.achDesc}</div>
            ${owned ? '<div class="ach done">✓ Unlocked</div>'
              : lockedByChoice ? '<div class="ach">✗ Path not taken</div>'
              : `<button data-tech="${t.key}" ${!canUnlock ? 'disabled' : ''}>Unlock</button>`}
          </div>`;
      }
      html += '</div>';
    }
    html += '</div>';

    html += '<h4 style="margin-top:18px">Divine favors</h4>';
    for (const f of FAVORS) {
      const active = g.favorActive('player', f.key);
      html += `
        <div class="tech-item ${active ? 'owned' : ''}">
          <div class="tname">${f.name} — ${f.dp} ✦</div>
          <div class="tdesc">${f.desc}</div>
          ${active ? `<div class="ach done">✓ Active (${Math.ceil(g.favors.player[f.key])}s)</div>`
            : `<button data-favor="${f.key}" ${st.dp < f.dp ? 'disabled' : ''}>Invoke</button>`}
        </div>`;
    }
    el.innerHTML = html;
    for (const b of el.querySelectorAll('button[data-tech]'))
      b.onclick = () => { g.unlockTech('player', b.dataset.tech); this.renderTechPanel(); };
    for (const b of el.querySelectorAll('button[data-favor]'))
      b.onclick = () => { g.buyFavor('player', b.dataset.favor); this.renderTechPanel(); };
  }

  // ---------------- Lexicon ----------------
  showGallery() {
    this.showScreen('gallery');
    if (!this._galleryBuilt) {
      this.buildGallery();
      this._galleryBuilt = true;
    }
  }
  buildGallery() {
    const catalog = buildCatalog();
    const W = 320, H = 200;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141824);
    const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xfff3d8, 2.2);
    dir.position.set(3, 5, 4);
    scene.add(dir);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3, 24).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x1d2333 }));
    scene.add(floor);

    const grid = $('gallery-grid');
    grid.innerHTML = '';
    for (const item of catalog) {
      const model = item.factory();
      scene.add(model);
      const bb = new THREE.Box3().setFromObject(model);
      const size = bb.getSize(new THREE.Vector3());
      const center = bb.getCenter(new THREE.Vector3());
      const r = Math.max(size.x, size.y, size.z);
      cam.position.set(center.x + r * 1.6, center.y + r * 1.1, center.z + r * 1.9);
      cam.lookAt(center);
      renderer.render(scene, cam);
      const src = renderer.domElement.toDataURL('image/png');
      scene.remove(model);

      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.category = item.category;
      card.dataset.civ = item.civ;
      card.dataset.name = item.name.toLowerCase();
      const civColor = item.civ !== 'all' ? '#' + CIVS[item.civ].color.toString(16).padStart(6, '0') : 'var(--gold)';
      card.style.setProperty('--accent', civColor);
      const stats = Object.entries(item.stats)
        .map(([k, v]) => `<div class="st"><b>${k}</b><span>${v}</span></div>`).join('');
      card.innerHTML = `
        <div class="card-img">
          <img src="${src}" alt="${item.name}">
          <span class="card-cat">${CAT_ICON[item.category] || '·'} ${item.category}</span>
        </div>
        <div class="card-body">
          <div class="card-name">${item.name}</div>
          <div class="card-tags">${item.civ !== 'all' ? CIVS[item.civ].name : 'All civilizations'}</div>
          <div class="card-stats">${stats}</div>
        </div>`;
      grid.appendChild(card);
    }
    renderer.dispose();
  }
  filterGallery() {
    const cat = $('filter-category').value;
    const civ = $('filter-civ').value;
    const q = $('filter-search').value.toLowerCase();
    for (const card of $('gallery-grid').children) {
      const okCat = cat === 'all' || card.dataset.category === cat;
      const okCiv = civ === 'all' || card.dataset.civ === civ || card.dataset.civ === 'all';
      const okQ = !q || card.dataset.name.includes(q);
      card.style.display = okCat && okCiv && okQ ? '' : 'none';
    }
  }

  // ---------------- end recap ----------------
  showEnd(result) {
    this.showScreen('end');
    $('end-title').textContent = result.won ? 'VICTORY' : 'DEFEAT';
    $('end-title').style.color = result.won ? 'var(--gold)' : '#c0504d';
    const st = result.state, es = result.enemyState;
    const row = (label, a, b) => `
      <div class="recap-row"><span class="rl">${label}</span><span class="rv you">${a}</span><span class="rv foe">${b}</span></div>`;
    $('end-body').innerHTML = `
      <p style="color:var(--dim);margin-bottom:14px">${result.how}</p>
      <div class="recap-row head"><span class="rl"></span><span class="rv you">You</span><span class="rv foe">Enemy</span></div>
      ${row('Score', result.score, result.enemyScore)}
      ${row('Population', result.pop, result.enemyPop)}
      ${row('Births', st.ach.births, es.ach.births)}
      ${row('Deaths', st.deaths, es.deaths)}
      ${row('Kills', st.kills, es.kills)}
      ${row('Conversions', st.conversions, es.conversions)}
      ${row('Technologies', Object.keys(st.techs).length, Object.keys(es.techs).length)}
      ${row('Food gathered', Math.floor(st.ach.food), Math.floor(es.ach.food))}
      ${row('Wood gathered', Math.floor(st.ach.wood), Math.floor(es.ach.wood))}
      ${row('Spells cast', st.ach.spells, es.ach.spells)}
      ${row('Relics found', st.ach.relics, es.ach.relics)}
      <div class="chart-label">Population over time</div>`;
    this.drawEndChart(result.samples || []);
  }
  drawEndChart(samples) {
    const cv = $('end-chart');
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (samples.length < 2) return;
    const maxPop = Math.max(4, ...samples.map(s => Math.max(s.p, s.e)));
    const maxT = samples[samples.length - 1].t || 1;
    const X = (t) => 30 + (t / maxT) * (cv.width - 40);
    const Y = (v) => cv.height - 18 - (v / maxPop) * (cv.height - 30);
    // axes
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.moveTo(30, 6); ctx.lineTo(30, cv.height - 18); ctx.lineTo(cv.width - 8, cv.height - 18); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px monospace';
    ctx.fillText(String(maxPop), 6, 12);
    ctx.fillText('0', 18, cv.height - 16);
    ctx.fillText(fmtTime(maxT), cv.width - 44, cv.height - 4);
    const line = (key, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      samples.forEach((s, i) => { const x = X(s.t), y = Y(s[key]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    };
    line('p', '#f5c518');
    line('e', '#c0504d');
    ctx.fillStyle = '#f5c518'; ctx.fillText('You', 40, 14);
    ctx.fillStyle = '#c0504d'; ctx.fillText('Enemy', 70, 14);
  }
}
