import type { IslandType, EnemyType } from './Types';
import type { WeatherState } from './Weather';
import type { EditorTool } from './ScenarioEditor';
import type { Scenario, ScenarioWave, WinCondition, WinConditionType } from './Scenario';
import { createDefaultWave, scenarioToJSON, scenarioFromJSON, scenarioToURLHash, saveScenarioLocal, loadScenarioLocal, listScenariosLocal, deleteScenarioLocal } from './Scenario';

// ===================================================================
//  Styling Constants
// ===================================================================

const GOLD = '#FFD700';
const DARK_BG = 'rgba(10,10,15,0.92)';
const PANEL_BORDER = 'rgba(255,215,0,0.3)';
const FONT = "'Pirata One', cursive, monospace";
const MONO = 'monospace';

const BTN_CSS = `background:${DARK_BG};color:${GOLD};border:1px solid ${PANEL_BORDER};padding:6px 12px;cursor:pointer;font-family:${MONO};font-size:12px;border-radius:3px;`;
const BTN_ACTIVE_CSS = `background:${GOLD};color:#000;border:1px solid ${GOLD};padding:6px 12px;cursor:pointer;font-family:${MONO};font-size:12px;border-radius:3px;font-weight:bold;`;
const INPUT_CSS = `background:#111;color:${GOLD};border:1px solid ${PANEL_BORDER};padding:4px 6px;font-family:${MONO};font-size:12px;border-radius:2px;width:60px;`;
const SELECT_CSS = `background:#111;color:${GOLD};border:1px solid ${PANEL_BORDER};padding:4px;font-family:${MONO};font-size:12px;border-radius:2px;width:100%;`;

const ISLAND_TYPES: IslandType[] = ['rocky', 'sandy', 'jungle', 'fortress'];
const WEATHER_STATES: WeatherState[] = ['clear', 'foggy', 'stormy', 'night'];
const ENEMY_TYPES: EnemyType[] = ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship', 'ghost_ship', 'navy_warship'];

// ===================================================================
//  Callbacks
// ===================================================================

export interface EditorUICallbacks {
  onToolChange: (tool: EditorTool) => void;
  onIslandTypeSelect: (type: IslandType) => void;
  onIslandPropertyChange: (index: number, key: string, value: unknown) => void;
  onWaveAdd: () => void;
  onWaveEdit: (index: number, wave: ScenarioWave) => void;
  onWaveDelete: (index: number) => void;
  onWaveReorder: (from: number, to: number) => void;
  onWinConditionChange: (conditions: WinCondition[]) => void;
  onSave: () => void;
  onLoad: (scenario: Scenario) => void;
  onPlayTest: () => void;
  onExitEditor: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onStartWeatherChange: (weather: WeatherState) => void;
}

// ===================================================================
//  EditorUI
// ===================================================================

export class EditorUI {
  private container: HTMLDivElement;
  private callbacks: EditorUICallbacks;
  private scenario: Scenario | null = null;
  private visible = false;

  // Sub-panels
  private toolbarEl!: HTMLDivElement;
  private paletteEl!: HTMLDivElement;
  private propsEl!: HTMLDivElement;
  private waveListEl!: HTMLDivElement;
  private winCondEl!: HTMLDivElement;
  private bottomBar!: HTMLDivElement;

  // Modal
  private modalOverlay: HTMLDivElement | null = null;

  // Tool buttons for active state tracking
  private toolBtns = new Map<EditorTool, HTMLButtonElement>();
  private activeTool: EditorTool = 'select';

  // Palette buttons
  private paletteBtns = new Map<IslandType, HTMLButtonElement>();
  private activeIslandType: IslandType = 'rocky';

  // Hints bar
  private hintsBar!: HTMLDivElement;
  private isMobile: boolean;
  private hasSelection = false;
  private isShiftHeld = false;
  private boundShiftDown: (e: KeyboardEvent) => void;
  private boundShiftUp: (e: KeyboardEvent) => void;
  private boundBlur: () => void;

  constructor(callbacks: EditorUICallbacks) {
    this.callbacks = callbacks;
    this.isMobile = navigator.maxTouchPoints > 0 || 'ontouchstart' in globalThis;
    this.boundShiftDown = (e) => { if (e.key === 'Shift') { this.isShiftHeld = true; this.updateHints(); } };
    this.boundShiftUp = (e) => { if (e.key === 'Shift') { this.isShiftHeld = false; this.updateHints(); } };
    this.boundBlur = () => { this.isShiftHeld = false; this.updateHints(); };
    this.container = document.createElement('div');
    this.container.className = 'editor-ui';
    this.container.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:9000;font-family:${MONO};`;
    this.buildDOM();
    document.body.appendChild(this.container);
  }

  show(scenario: Scenario): void {
    this.scenario = scenario;
    this.visible = true;
    this.container.style.display = 'block';
    document.addEventListener('keydown', this.boundShiftDown);
    document.addEventListener('keyup', this.boundShiftUp);
    window.addEventListener('blur', this.boundBlur);
    this.refresh();
    this.updateHints();
  }

  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';
    this.closeModal();
    document.removeEventListener('keydown', this.boundShiftDown);
    document.removeEventListener('keyup', this.boundShiftUp);
    window.removeEventListener('blur', this.boundBlur);
  }

  getScenario(): Scenario | null { return this.scenario; }

  // ---------------------------------------------------------------
  //  Refresh (re-render dynamic sections)
  // ---------------------------------------------------------------

  refresh(): void {
    if (!this.visible || !this.scenario) return;
    this.renderWaveList();
    this.renderWinConditions();
    this.updateHints();
  }

  refreshProperties(index: number, island: { type: IslandType; radius: number; hasTreasure: boolean; x: number; z: number } | null): void {
    this.hasSelection = island !== null;
    this.updateHints();
    this.propsEl.innerHTML = '';
    if (!island) {
      this.propsEl.innerHTML = `<div style="color:rgba(255,215,0,0.4);padding:8px;font-size:11px;">No island selected</div>`;
      return;
    }

    const header = document.createElement('div');
    header.textContent = 'PROPERTIES';
    header.style.cssText = `color:${GOLD};font-family:${FONT};font-size:14px;padding:6px 8px;border-bottom:1px solid ${PANEL_BORDER};`;
    this.propsEl.appendChild(header);

    // Type selector
    this.addPropRow('Type', () => {
      const sel = document.createElement('select');
      sel.style.cssText = SELECT_CSS + 'width:100px;';
      for (const t of ISLAND_TYPES) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
        if (t === island.type) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.onchange = () => this.callbacks.onIslandPropertyChange(index, 'type', sel.value);
      this.stopKeyPropagation(sel);
      return sel;
    });

    // Radius
    this.addPropRow('Radius', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = String(Math.round(island.radius * 10) / 10);
      input.step = '0.5';
      input.style.cssText = INPUT_CSS;
      input.onchange = () => this.callbacks.onIslandPropertyChange(index, 'radius', Number(input.value));
      this.stopKeyPropagation(input);
      return input;
    });

    // Position X
    this.addPropRow('X', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = String(Math.round(island.x));
      input.style.cssText = INPUT_CSS;
      input.onchange = () => this.callbacks.onIslandPropertyChange(index, 'x', Number(input.value));
      this.stopKeyPropagation(input);
      return input;
    });

    // Position Z
    this.addPropRow('Z', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = String(Math.round(island.z));
      input.style.cssText = INPUT_CSS;
      input.onchange = () => this.callbacks.onIslandPropertyChange(index, 'z', Number(input.value));
      this.stopKeyPropagation(input);
      return input;
    });

    // Treasure
    this.addPropRow('Treasure', () => {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = island.hasTreasure;
      cb.style.cssText = `accent-color:${GOLD};`;
      cb.onchange = () => this.callbacks.onIslandPropertyChange(index, 'hasTreasure', cb.checked);
      return cb;
    });
  }

  private addPropRow(label: string, createInput: () => HTMLElement): void {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;padding:4px 8px;`;
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = `width:60px;flex-shrink:0;font-size:11px;color:${GOLD};opacity:0.8;`;
    row.append(lbl, createInput());
    this.propsEl.appendChild(row);
  }

  // ---------------------------------------------------------------
  //  DOM Construction
  // ---------------------------------------------------------------

  private buildDOM(): void {
    // Top toolbar
    this.toolbarEl = this.createPanel('top', `
      display:flex;align-items:center;gap:6px;
      padding:6px 12px;
      border-bottom:1px solid ${PANEL_BORDER};
    `);

    const tools: { tool: EditorTool; label: string }[] = [
      { tool: 'select', label: 'Select' },
      { tool: 'place', label: 'Place' },
      { tool: 'move', label: 'Move' },
      { tool: 'resize', label: 'Resize' },
      { tool: 'delete', label: 'Delete' },
    ];

    for (const { tool, label } of tools) {
      const btn = this.createBtn(label, tool === 'select' ? BTN_ACTIVE_CSS : BTN_CSS);
      btn.onclick = () => {
        this.setActiveTool(tool);
        this.callbacks.onToolChange(tool);
      };
      this.toolBtns.set(tool, btn);
      this.toolbarEl.appendChild(btn);
    }

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.toolbarEl.appendChild(spacer);

    // Undo/Redo
    const undoBtn = this.createBtn('Undo', BTN_CSS);
    undoBtn.onclick = () => this.callbacks.onUndo();
    const redoBtn = this.createBtn('Redo', BTN_CSS);
    redoBtn.onclick = () => this.callbacks.onRedo();
    this.toolbarEl.append(undoBtn, redoBtn);

    // Spacer 2
    const spacer2 = document.createElement('div');
    spacer2.style.width = '12px';
    this.toolbarEl.appendChild(spacer2);

    // Play Test
    const playBtn = this.createBtn('Play Test', `${BTN_CSS}background:#1a4a1a;color:#4f4;border-color:#4f4;`);
    playBtn.onclick = () => this.callbacks.onPlayTest();
    this.toolbarEl.appendChild(playBtn);

    // Save menu
    const saveBtn = this.createBtn('Save', BTN_CSS);
    saveBtn.onclick = () => this.showSaveMenu();
    this.toolbarEl.appendChild(saveBtn);

    // Load menu
    const loadBtn = this.createBtn('Load', BTN_CSS);
    loadBtn.onclick = () => this.showLoadMenu();
    this.toolbarEl.appendChild(loadBtn);

    // Exit
    const exitBtn = this.createBtn('Exit', `${BTN_CSS}background:#4a1a1a;color:#f44;border-color:#f44;`);
    exitBtn.onclick = () => this.callbacks.onExitEditor();
    this.toolbarEl.appendChild(exitBtn);

    this.container.appendChild(this.toolbarEl);

    // Left panel: Island palette
    this.paletteEl = this.createPanel('left', `
      width:120px;
      top:46px;bottom:180px;left:0;
      border-right:1px solid ${PANEL_BORDER};
      padding:8px;
    `);

    const palHeader = document.createElement('div');
    palHeader.textContent = 'ISLANDS';
    palHeader.style.cssText = `color:${GOLD};font-family:${FONT};font-size:14px;margin-bottom:8px;text-align:center;`;
    this.paletteEl.appendChild(palHeader);

    for (const type of ISLAND_TYPES) {
      const btn = this.createBtn(type.charAt(0).toUpperCase() + type.slice(1),
        type === this.activeIslandType ? BTN_ACTIVE_CSS : BTN_CSS);
      btn.style.cssText += 'width:100%;margin-bottom:4px;padding:8px;';
      btn.onclick = () => {
        this.activeIslandType = type;
        this.updatePaletteActive();
        this.callbacks.onIslandTypeSelect(type);
      };
      this.paletteBtns.set(type, btn);
      this.paletteEl.appendChild(btn);
    }

    this.container.appendChild(this.paletteEl);

    // Right panel: Properties
    this.propsEl = this.createPanel('right', `
      width:180px;
      top:46px;bottom:180px;right:0;
      border-left:1px solid ${PANEL_BORDER};
      overflow-y:auto;
    `);
    this.propsEl.innerHTML = `<div style="color:rgba(255,215,0,0.4);padding:8px;font-size:11px;">No island selected</div>`;
    this.container.appendChild(this.propsEl);

    // Bottom bar: Wave list + Win conditions
    this.bottomBar = this.createPanel('bottom', `
      height:170px;
      bottom:0;left:0;right:0;
      border-top:1px solid ${PANEL_BORDER};
      display:flex;flex-direction:column;
      overflow:hidden;
    `);

    // Wave list header row
    const waveHeader = document.createElement('div');
    waveHeader.style.cssText = `display:flex;align-items:center;gap:8px;padding:4px 8px;border-bottom:1px solid ${PANEL_BORDER};flex-shrink:0;`;
    const waveTitle = document.createElement('span');
    waveTitle.textContent = 'WAVES';
    waveTitle.style.cssText = `color:${GOLD};font-family:${FONT};font-size:14px;`;
    const addWaveBtn = this.createBtn('+ Add Wave', BTN_CSS + 'font-size:11px;padding:3px 8px;');
    addWaveBtn.onclick = () => this.callbacks.onWaveAdd();

    // Start weather
    const weatherLabel = document.createElement('span');
    weatherLabel.textContent = 'Start:';
    weatherLabel.style.cssText = `color:${GOLD};opacity:0.7;font-size:11px;margin-left:auto;`;
    const weatherSel = document.createElement('select');
    weatherSel.style.cssText = SELECT_CSS + 'width:80px;';
    for (const ws of WEATHER_STATES) {
      const opt = document.createElement('option');
      opt.value = ws;
      opt.textContent = ws.charAt(0).toUpperCase() + ws.slice(1);
      weatherSel.appendChild(opt);
    }
    weatherSel.onchange = () => this.callbacks.onStartWeatherChange(weatherSel.value as WeatherState);
    this.stopKeyPropagation(weatherSel);

    waveHeader.append(waveTitle, addWaveBtn, weatherLabel, weatherSel);
    this.bottomBar.appendChild(waveHeader);

    // Wave list scrollable area
    this.waveListEl = document.createElement('div');
    this.waveListEl.style.cssText = `display:flex;gap:6px;padding:6px 8px;overflow-x:auto;flex:1;align-items:stretch;`;
    this.bottomBar.appendChild(this.waveListEl);

    // Win conditions
    this.winCondEl = document.createElement('div');
    this.winCondEl.style.cssText = `padding:4px 8px;border-top:1px solid ${PANEL_BORDER};flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;`;
    this.bottomBar.appendChild(this.winCondEl);

    this.container.appendChild(this.bottomBar);

    // Hints bar (above bottom panel)
    this.hintsBar = document.createElement('div');
    this.hintsBar.style.cssText = `
      position:absolute;bottom:174px;left:50%;transform:translateX(-50%);
      background:${DARK_BG};border:1px solid ${PANEL_BORDER};border-bottom:none;
      border-radius:6px 6px 0 0;padding:5px 16px;pointer-events:none;
      font-family:${FONT};font-size:12px;color:rgba(255,215,0,0.55);
      display:flex;gap:6px;align-items:center;white-space:nowrap;max-width:90vw;
      overflow:hidden;text-overflow:ellipsis;
    `;
    this.container.appendChild(this.hintsBar);
  }

  // ---------------------------------------------------------------
  //  Hints Bar
  // ---------------------------------------------------------------

  private updateHints(): void {
    if (!this.visible) return;
    this.hintsBar.innerHTML = '';

    if (this.isMobile) {
      this.hintsBar.innerHTML = `<span style="color:rgba(255,215,0,0.5);">Editor requires keyboard & mouse</span>`;
      return;
    }

    const dim = 'rgba(255,215,0,0.45)';
    const bright = 'rgba(255,215,0,0.85)';
    const keyCss = `display:inline-block;padding:1px 5px;border:1px solid rgba(255,215,0,0.35);border-radius:2px;font-family:${MONO};font-size:10px;color:${bright};background:rgba(255,215,0,0.08);margin-right:2px;`;
    const sepCss = `color:rgba(255,215,0,0.15);margin:0 2px;`;

    const key = (k: string, highlight = false) =>
      `<span style="${keyCss}${highlight ? `color:#fff;border-color:${GOLD};background:rgba(255,215,0,0.2);` : ''}">${k}</span>`;
    const desc = (d: string) => `<span style="color:${dim};margin-right:4px;">${d}</span>`;
    const sep = () => `<span style="${sepCss}">|</span>`;

    // Camera controls
    const shiftHi = this.isShiftHeld;
    let html = '';
    html += key('WASD') + desc('Move') + ' ';
    html += key('Shift+W/S', shiftHi) + desc('Vertical') + ' ';
    html += key('RMB+Drag') + desc('Look') + ' ';
    html += key('Scroll') + desc('Zoom') + ' ';
    html += key('F') + desc('Focus');
    html += sep();

    // Tool-specific hint
    const islandCount = this.scenario?.islands.length ?? 0;
    if (islandCount === 0 && this.activeTool !== 'place') {
      html += `<span style="color:rgba(255,215,0,0.6);">Use </span>${key('Place')}<span style="color:rgba(255,215,0,0.6);"> tool to add islands</span>`;
    } else {
      const typeName = this.activeIslandType.charAt(0).toUpperCase() + this.activeIslandType.slice(1);
      const toolHints: Record<EditorTool, string> = {
        select: this.hasSelection ? 'Island selected — edit in Properties panel' : 'Click an island to select',
        place: `Click to place ${typeName} island`,
        move: this.hasSelection ? 'Drag island to reposition' : 'Click an island, then drag to move',
        resize: this.hasSelection ? 'Drag orange handles to resize' : 'Select an island to resize',
        delete: 'Click an island to remove it',
      };
      html += `<span style="color:rgba(255,215,0,0.65);">${toolHints[this.activeTool]}</span>`;
    }
    html += sep();

    // Keyboard shortcuts
    html += key('Ctrl+Z') + desc('Undo') + ' ';
    html += key('Ctrl+Y') + desc('Redo') + ' ';
    html += key('Del') + desc('Delete') + ' ';
    html += key('Esc') + desc('Exit');

    this.hintsBar.innerHTML = html;
  }

  // ---------------------------------------------------------------
  //  Wave List Rendering
  // ---------------------------------------------------------------

  private renderWaveList(): void {
    if (!this.scenario) return;
    this.waveListEl.innerHTML = '';

    this.scenario.waves.forEach((wave, i) => {
      const card = document.createElement('div');
      card.style.cssText = `
        min-width:140px;max-width:160px;
        background:rgba(20,20,30,0.95);
        border:1px solid ${PANEL_BORDER};
        border-radius:4px;padding:6px 8px;
        cursor:pointer;flex-shrink:0;
        font-size:11px;color:${GOLD};
      `;

      const title = document.createElement('div');
      title.textContent = `W${i + 1}: ${wave.totalShips} ships`;
      title.style.cssText = `font-weight:bold;margin-bottom:4px;font-size:12px;`;
      card.appendChild(title);

      const info = document.createElement('div');
      info.style.cssText = 'opacity:0.7;line-height:1.4;';
      info.innerHTML = `${wave.weather} | ${Math.round(wave.armedPercent * 100)}% armed`;
      if (wave.bossName) info.innerHTML += `<br>Boss: ${wave.bossName}`;
      if (wave.isPortWave) info.innerHTML += `<br>Port wave`;
      card.appendChild(info);

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:4px;margin-top:4px;';
      const editBtn = this.createBtn('Edit', BTN_CSS + 'font-size:10px;padding:2px 6px;');
      editBtn.onclick = (ev) => { ev.stopPropagation(); this.showWaveModal(i); };
      const delBtn = this.createBtn('X', BTN_CSS + 'font-size:10px;padding:2px 6px;color:#f44;border-color:#f44;');
      delBtn.onclick = (ev) => { ev.stopPropagation(); this.callbacks.onWaveDelete(i); };

      // Move arrows
      if (i > 0) {
        const leftBtn = this.createBtn('<', BTN_CSS + 'font-size:10px;padding:2px 4px;');
        leftBtn.onclick = (ev) => { ev.stopPropagation(); this.callbacks.onWaveReorder(i, i - 1); };
        actions.appendChild(leftBtn);
      }
      if (this.scenario && i < this.scenario.waves.length - 1) {
        const rightBtn = this.createBtn('>', BTN_CSS + 'font-size:10px;padding:2px 4px;');
        rightBtn.onclick = (ev) => { ev.stopPropagation(); this.callbacks.onWaveReorder(i, i + 1); };
        actions.appendChild(rightBtn);
      }

      actions.append(editBtn, delBtn);
      card.appendChild(actions);

      card.onclick = () => this.showWaveModal(i);
      this.waveListEl.appendChild(card);
    });
  }

  // ---------------------------------------------------------------
  //  Win Conditions Rendering
  // ---------------------------------------------------------------

  private renderWinConditions(): void {
    if (!this.scenario) return;
    this.winCondEl.innerHTML = '';

    const label = document.createElement('span');
    label.textContent = 'Win:';
    label.style.cssText = `color:${GOLD};font-size:11px;font-weight:bold;`;
    this.winCondEl.appendChild(label);

    const condTypes: { type: WinConditionType; label: string; needsValue: boolean; valueLabel: string }[] = [
      { type: 'all_waves_cleared', label: 'All waves', needsValue: false, valueLabel: '' },
      { type: 'gold_target', label: 'Gold >=', needsValue: true, valueLabel: 'gold' },
      { type: 'survive_duration', label: 'Survive', needsValue: true, valueLabel: 'sec' },
      { type: 'defeat_boss', label: 'Kill boss', needsValue: false, valueLabel: '' },
    ];

    for (const ct of condTypes) {
      const existing = this.scenario.winConditions.find(c => c.type === ct.type);
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `display:flex;align-items:center;gap:4px;`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!existing;
      cb.style.cssText = `accent-color:${GOLD};`;

      const lbl = document.createElement('span');
      lbl.textContent = ct.label;
      lbl.style.cssText = `color:${GOLD};font-size:11px;opacity:0.8;`;

      wrapper.append(cb, lbl);

      if (ct.needsValue) {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = existing ? String(existing.value) : '500';
        input.style.cssText = INPUT_CSS + 'width:50px;font-size:10px;';
        this.stopKeyPropagation(input);

        const valLbl = document.createElement('span');
        valLbl.textContent = ct.valueLabel;
        valLbl.style.cssText = `color:${GOLD};font-size:10px;opacity:0.5;`;

        input.onchange = () => {
          this.updateWinConditions();
        };
        wrapper.append(input, valLbl);
      }

      cb.onchange = () => {
        this.updateWinConditions();
      };

      this.winCondEl.appendChild(wrapper);
    }
  }

  private updateWinConditions(): void {
    const conditions: WinCondition[] = [];
    const wrappers = this.winCondEl.querySelectorAll('div');

    const types: WinConditionType[] = ['all_waves_cleared', 'gold_target', 'survive_duration', 'defeat_boss'];
    let i = 0;
    wrappers.forEach(wrapper => {
      const cb = wrapper.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (!cb || i >= types.length) return;

      if (cb.checked) {
        const numInput = wrapper.querySelector('input[type="number"]') as HTMLInputElement | null;
        conditions.push({
          type: types[i],
          value: numInput ? Number(numInput.value) : 0,
        });
      }
      i++;
    });

    this.callbacks.onWinConditionChange(conditions);
  }

  // ---------------------------------------------------------------
  //  Wave Edit Modal
  // ---------------------------------------------------------------

  private showWaveModal(index: number): void {
    if (!this.scenario || index < 0 || index >= this.scenario.waves.length) return;
    const wave = { ...this.scenario.waves[index], enemyTypes: [...this.scenario.waves[index].enemyTypes] };

    this.closeModal();
    this.modalOverlay = document.createElement('div');
    this.modalOverlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);
      z-index:10000;display:flex;align-items:center;justify-content:center;
      pointer-events:auto;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background:rgba(15,15,20,0.98);border:2px solid ${GOLD};
      border-radius:8px;padding:20px;width:420px;max-height:80vh;
      overflow-y:auto;color:${GOLD};font-family:${MONO};
    `;

    const title = document.createElement('div');
    title.textContent = `Edit Wave ${index + 1}`;
    title.style.cssText = `font-family:${FONT};font-size:20px;margin-bottom:12px;text-align:center;`;
    modal.appendChild(title);

    // Total ships
    const shipsInput = this.modalNumberRow(modal, 'Total Ships', wave.totalShips, 1, 20);

    // Armed %
    const armedInput = this.modalNumberRow(modal, 'Armed %', Math.round(wave.armedPercent * 100), 0, 100);

    // Speed mult
    const speedInput = this.modalNumberRow(modal, 'Speed Mult', wave.speedMultiplier, 0.1, 5, 0.1);

    // Health mult
    const healthInput = this.modalNumberRow(modal, 'Health Mult', wave.healthMultiplier, 0.1, 5, 0.1);

    // Weather
    const weatherSel = document.createElement('select');
    weatherSel.style.cssText = SELECT_CSS + 'width:120px;';
    for (const ws of WEATHER_STATES) {
      const opt = document.createElement('option');
      opt.value = ws;
      opt.textContent = ws.charAt(0).toUpperCase() + ws.slice(1);
      if (ws === wave.weather) opt.selected = true;
      weatherSel.appendChild(opt);
    }
    this.stopKeyPropagation(weatherSel);
    this.modalRow(modal, 'Weather', weatherSel);

    // Enemy types (checkboxes)
    const enemySection = document.createElement('div');
    enemySection.style.cssText = 'margin:8px 0;';
    const enemyLabel = document.createElement('div');
    enemyLabel.textContent = 'Enemy Types:';
    enemyLabel.style.cssText = `font-size:12px;margin-bottom:4px;opacity:0.8;`;
    enemySection.appendChild(enemyLabel);

    const enemyCbs: { type: EnemyType; cb: HTMLInputElement }[] = [];
    for (const et of ENEMY_TYPES) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = wave.enemyTypes.includes(et);
      cb.style.cssText = `accent-color:${GOLD};`;
      const lbl = document.createElement('span');
      lbl.textContent = et.replace(/_/g, ' ');
      lbl.style.fontSize = '11px';
      row.append(cb, lbl);
      enemySection.appendChild(row);
      enemyCbs.push({ type: et, cb });
    }
    modal.appendChild(enemySection);

    // Boss
    const bossRow = document.createElement('div');
    bossRow.style.cssText = 'margin:8px 0;';
    const bossCb = document.createElement('input');
    bossCb.type = 'checkbox';
    bossCb.checked = wave.bossName !== null;
    bossCb.style.cssText = `accent-color:${GOLD};`;
    const bossLbl = document.createElement('span');
    bossLbl.textContent = ' Boss Wave';
    bossLbl.style.fontSize = '12px';
    bossRow.append(bossCb, bossLbl);
    modal.appendChild(bossRow);

    const bossNameInput = document.createElement('input');
    bossNameInput.type = 'text';
    bossNameInput.value = wave.bossName ?? 'Captain Dread';
    bossNameInput.style.cssText = INPUT_CSS + 'width:140px;';
    this.stopKeyPropagation(bossNameInput);
    this.modalRow(modal, 'Boss Name', bossNameInput);

    const bossHpInput = this.modalNumberRow(modal, 'Boss HP', wave.bossHp || 300, 50, 5000, 50);

    // Port wave
    const portCb = document.createElement('input');
    portCb.type = 'checkbox';
    portCb.checked = wave.isPortWave;
    portCb.style.cssText = `accent-color:${GOLD};`;
    const portWrapper = document.createElement('div');
    portWrapper.style.cssText = 'display:flex;align-items:center;gap:6px;margin:4px 0;';
    const portLbl = document.createElement('span');
    portLbl.textContent = 'Port Wave';
    portLbl.style.fontSize = '12px';
    portWrapper.append(portCb, portLbl);
    modal.appendChild(portWrapper);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;justify-content:center;';

    const saveBtn = this.createBtn('Save', BTN_ACTIVE_CSS + 'padding:8px 24px;font-size:13px;');
    saveBtn.onclick = () => {
      const edited: ScenarioWave = {
        totalShips: Number(shipsInput.value),
        armedPercent: Number(armedInput.value) / 100,
        speedMultiplier: Number(speedInput.value),
        healthMultiplier: Number(healthInput.value),
        weather: weatherSel.value as WeatherState,
        enemyTypes: enemyCbs.filter(e => e.cb.checked).map(e => e.type),
        bossName: bossCb.checked ? (bossNameInput.value || 'Boss') : null,
        bossHp: bossCb.checked ? Number(bossHpInput.value) : 0,
        isPortWave: portCb.checked,
        specialEvent: null,
      };
      this.callbacks.onWaveEdit(index, edited);
      this.closeModal();
      this.refresh();
    };

    const cancelBtn = this.createBtn('Cancel', BTN_CSS + 'padding:8px 24px;font-size:13px;');
    cancelBtn.onclick = () => this.closeModal();

    btnRow.append(saveBtn, cancelBtn);
    modal.appendChild(btnRow);

    // Stop keyboard propagation on the whole modal
    modal.addEventListener('keydown', (e) => e.stopPropagation());
    modal.addEventListener('keyup', (e) => e.stopPropagation());

    this.modalOverlay.appendChild(modal);
    this.modalOverlay.onclick = (e) => { if (e.target === this.modalOverlay) this.closeModal(); };
    document.body.appendChild(this.modalOverlay);
  }

  private modalRow(parent: HTMLElement, label: string, input: HTMLElement): void {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;margin:4px 0;`;
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = `width:90px;flex-shrink:0;font-size:12px;opacity:0.8;`;
    row.append(lbl, input);
    parent.appendChild(row);
  }

  private modalNumberRow(parent: HTMLElement, label: string, value: number, min: number, max: number, step: number = 1): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.style.cssText = INPUT_CSS;
    this.stopKeyPropagation(input);
    this.modalRow(parent, label, input);
    return input;
  }

  private closeModal(): void {
    if (this.modalOverlay) {
      document.body.removeChild(this.modalOverlay);
      this.modalOverlay = null;
    }
  }

  // ---------------------------------------------------------------
  //  Save / Load Menus
  // ---------------------------------------------------------------

  private showSaveMenu(): void {
    if (!this.scenario) return;
    this.closeModal();
    this.modalOverlay = document.createElement('div');
    this.modalOverlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);
      z-index:10000;display:flex;align-items:center;justify-content:center;
      pointer-events:auto;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background:rgba(15,15,20,0.98);border:2px solid ${GOLD};
      border-radius:8px;padding:20px;width:320px;color:${GOLD};font-family:${MONO};
    `;

    const title = document.createElement('div');
    title.textContent = 'Save Scenario';
    title.style.cssText = `font-family:${FONT};font-size:18px;margin-bottom:12px;text-align:center;`;
    modal.appendChild(title);

    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = this.scenario.name;
    nameInput.style.cssText = INPUT_CSS + 'width:100%;box-sizing:border-box;margin-bottom:8px;';
    this.stopKeyPropagation(nameInput);
    modal.appendChild(nameInput);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    // Save to localStorage
    const localBtn = this.createBtn('Save to Browser', BTN_ACTIVE_CSS + 'width:100%;');
    localBtn.onclick = () => {
      if (this.scenario) {
        this.scenario.name = nameInput.value || 'Untitled';
        saveScenarioLocal(this.scenario);
        this.closeModal();
      }
    };

    // Export JSON
    const exportBtn = this.createBtn('Export JSON', BTN_CSS + 'width:100%;');
    exportBtn.onclick = () => {
      if (this.scenario) {
        this.scenario.name = nameInput.value || 'Untitled';
        const json = scenarioToJSON(this.scenario);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.scenario.name.replace(/[^a-z0-9]/gi, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.closeModal();
      }
    };

    // Share URL
    const shareBtn = this.createBtn('Copy Share URL', BTN_CSS + 'width:100%;');
    shareBtn.onclick = async () => {
      if (this.scenario) {
        this.scenario.name = nameInput.value || 'Untitled';
        const hash = await scenarioToURLHash(this.scenario);
        const url = window.location.origin + window.location.pathname + hash;
        await navigator.clipboard.writeText(url);
        shareBtn.textContent = 'Copied!';
        setTimeout(() => { shareBtn.textContent = 'Copy Share URL'; }, 1500);
      }
    };

    const cancelBtn = this.createBtn('Cancel', BTN_CSS + 'width:100%;');
    cancelBtn.onclick = () => this.closeModal();

    btnRow.append(localBtn, exportBtn, shareBtn, cancelBtn);
    modal.appendChild(btnRow);

    modal.addEventListener('keydown', (e) => e.stopPropagation());
    modal.addEventListener('keyup', (e) => e.stopPropagation());

    this.modalOverlay.appendChild(modal);
    this.modalOverlay.onclick = (e) => { if (e.target === this.modalOverlay) this.closeModal(); };
    document.body.appendChild(this.modalOverlay);
  }

  private showLoadMenu(): void {
    this.closeModal();
    this.modalOverlay = document.createElement('div');
    this.modalOverlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);
      z-index:10000;display:flex;align-items:center;justify-content:center;
      pointer-events:auto;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background:rgba(15,15,20,0.98);border:2px solid ${GOLD};
      border-radius:8px;padding:20px;width:360px;color:${GOLD};font-family:${MONO};
      max-height:70vh;overflow-y:auto;
    `;

    const title = document.createElement('div');
    title.textContent = 'Load Scenario';
    title.style.cssText = `font-family:${FONT};font-size:18px;margin-bottom:12px;text-align:center;`;
    modal.appendChild(title);

    // Saved scenarios list
    const saved = listScenariosLocal();
    if (saved.length > 0) {
      const listHeader = document.createElement('div');
      listHeader.textContent = 'Browser Saves:';
      listHeader.style.cssText = 'font-size:12px;opacity:0.7;margin-bottom:4px;';
      modal.appendChild(listHeader);

      for (const name of saved) {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:6px;margin:4px 0;padding:4px;border:1px solid ${PANEL_BORDER};border-radius:3px;`;

        const lbl = document.createElement('span');
        lbl.textContent = name;
        lbl.style.cssText = 'flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

        const loadBtn = this.createBtn('Load', BTN_CSS + 'font-size:10px;padding:3px 8px;');
        loadBtn.onclick = () => {
          const s = loadScenarioLocal(name);
          if (s) { this.callbacks.onLoad(s); this.closeModal(); }
        };

        const delBtn = this.createBtn('Del', BTN_CSS + 'font-size:10px;padding:3px 6px;color:#f44;border-color:#f44;');
        delBtn.onclick = () => {
          deleteScenarioLocal(name);
          row.remove();
        };

        row.append(lbl, loadBtn, delBtn);
        modal.appendChild(row);
      }
    } else {
      const empty = document.createElement('div');
      empty.textContent = 'No saved scenarios';
      empty.style.cssText = 'font-size:12px;opacity:0.5;margin:8px 0;text-align:center;';
      modal.appendChild(empty);
    }

    // Import JSON
    const importBtn = this.createBtn('Import JSON File', BTN_CSS + 'width:100%;margin-top:12px;');
    importBtn.onclick = () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.onchange = () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const json = reader.result as string;
          const s = scenarioFromJSON(json);
          if (s) { this.callbacks.onLoad(s); this.closeModal(); }
        };
        reader.readAsText(file);
      };
      fileInput.click();
    };
    modal.appendChild(importBtn);

    const cancelBtn = this.createBtn('Cancel', BTN_CSS + 'width:100%;margin-top:6px;');
    cancelBtn.onclick = () => this.closeModal();
    modal.appendChild(cancelBtn);

    modal.addEventListener('keydown', (e) => e.stopPropagation());
    modal.addEventListener('keyup', (e) => e.stopPropagation());

    this.modalOverlay.appendChild(modal);
    this.modalOverlay.onclick = (e) => { if (e.target === this.modalOverlay) this.closeModal(); };
    document.body.appendChild(this.modalOverlay);
  }

  // ---------------------------------------------------------------
  //  Helpers
  // ---------------------------------------------------------------

  private setActiveTool(tool: EditorTool): void {
    this.activeTool = tool;
    for (const [t, btn] of this.toolBtns) {
      btn.style.cssText = (t === tool ? BTN_ACTIVE_CSS : BTN_CSS);
    }
    this.updateHints();
  }

  private updatePaletteActive(): void {
    for (const [t, btn] of this.paletteBtns) {
      btn.style.cssText = (t === this.activeIslandType ? BTN_ACTIVE_CSS : BTN_CSS) + 'width:100%;margin-bottom:4px;padding:8px;';
    }
  }

  private createPanel(position: string, extraCSS: string): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute;background:${DARK_BG};
      pointer-events:auto;
      ${extraCSS}
    `;
    return el;
  }

  private createBtn(label: string, css: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = css;
    return btn;
  }

  private stopKeyPropagation(el: HTMLElement): void {
    el.addEventListener('keydown', (e) => e.stopPropagation());
    el.addEventListener('keyup', (e) => e.stopPropagation());
  }

  dispose(): void {
    this.closeModal();
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
