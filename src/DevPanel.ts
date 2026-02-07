import type { EnemyType } from './Types';
import type { WeatherState } from './Weather';

export interface DevPanelCallbacks {
  onSetGold: (value: number) => void;
  onSetHealth: (value: number) => void;
  onSetMaxSpeed: (value: number) => void;
  onSetDamage: (value: number) => void;
  onSetWave: (value: number) => void;
  onToggleGodMode: (enabled: boolean) => void;
  onToggleInstakill: (enabled: boolean) => void;
  onSpawnEnemy: (type: EnemyType, isBoss: boolean) => void;
  onSetWeather: (state: WeatherState) => void;
  getState: () => DevPanelState;
}

export interface DevPanelState {
  gold: number;
  health: number;
  maxHealth: number;
  maxSpeed: number;
  damage: number;
  wave: number;
  weather: WeatherState;
  godMode: boolean;
  instakill: boolean;
}

const ENEMY_TYPES: EnemyType[] = [
  'merchant_sloop', 'merchant_galleon', 'escort_frigate',
  'fire_ship', 'ghost_ship', 'navy_warship',
];

const WEATHER_STATES: WeatherState[] = ['clear', 'foggy', 'stormy', 'night'];

const INPUT_CSS = 'width:60px;background:#111;color:#0f0;border:1px solid #0a0;padding:2px 4px;font-family:monospace;font-size:11px;border-radius:2px;';
const BTN_CSS = 'background:#0a0;color:#000;border:none;padding:2px 8px;cursor:pointer;font-family:monospace;font-size:11px;border-radius:2px;';
const BTN_WEATHER_CSS = 'background:#222;color:#0f0;border:1px solid #0a0;padding:4px 0;cursor:pointer;font-family:monospace;font-size:11px;flex:1;border-radius:2px;';

export class DevPanel {
  private container: HTMLDivElement;
  private visible = false;
  private callbacks: DevPanelCallbacks;

  // Input refs for refresh
  private goldInput!: HTMLInputElement;
  private healthInput!: HTMLInputElement;
  private speedInput!: HTMLInputElement;
  private damageInput!: HTMLInputElement;
  private waveInput!: HTMLInputElement;
  private godModeCheckbox!: HTMLInputElement;
  private instakillCheckbox!: HTMLInputElement;
  private waveLabel!: HTMLSpanElement;

  constructor(callbacks: DevPanelCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.applyContainerStyle();
    this.buildDOM();
    document.body.appendChild(this.container);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.style.transform = this.visible ? 'translateX(0)' : 'translateX(100%)';
    if (this.visible) this.refresh();
  }

  private refresh(): void {
    const s = this.callbacks.getState();
    this.goldInput.value = String(s.gold);
    this.healthInput.value = String(Math.round(s.health));
    this.speedInput.value = String(Math.round(s.maxSpeed));
    this.damageInput.value = String(Math.round(s.damage * 100) / 100);
    this.waveInput.value = String(s.wave);
    this.waveLabel.textContent = `Current: Wave ${s.wave}`;
    this.godModeCheckbox.checked = s.godMode;
    this.instakillCheckbox.checked = s.instakill;
  }

  private applyContainerStyle(): void {
    const s = this.container.style;
    s.position = 'fixed';
    s.top = '0';
    s.right = '0';
    s.width = '260px';
    s.height = '100vh';
    s.background = 'rgba(0, 0, 0, 0.9)';
    s.color = '#0f0';
    s.fontFamily = 'monospace';
    s.fontSize = '12px';
    s.padding = '10px';
    s.overflowY = 'auto';
    s.zIndex = '99999';
    s.pointerEvents = 'auto';
    s.borderLeft = '1px solid rgba(0, 255, 0, 0.3)';
    s.boxSizing = 'border-box';
    s.transform = 'translateX(100%)';
    s.transition = 'transform 0.2s ease';
  }

  private stopKeyPropagation(el: HTMLElement): void {
    el.addEventListener('keydown', (e) => e.stopPropagation());
    el.addEventListener('keyup', (e) => e.stopPropagation());
  }

  private createSection(title: string): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:10px;border-bottom:1px solid rgba(0,255,0,0.15);padding-bottom:8px;';

    const header = document.createElement('div');
    header.textContent = title;
    header.style.cssText = 'color:#0f0;font-weight:bold;margin-bottom:6px;text-transform:uppercase;font-size:10px;letter-spacing:1px;opacity:0.7;';
    section.appendChild(header);

    return section;
  }

  private createNumberRow(label: string, input: HTMLInputElement, onSet: (v: number) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px;';

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'width:60px;flex-shrink:0;font-size:11px;';

    input.type = 'number';
    input.style.cssText = INPUT_CSS;
    this.stopKeyPropagation(input);

    const btn = document.createElement('button');
    btn.textContent = 'Set';
    btn.style.cssText = BTN_CSS;
    btn.onclick = () => { onSet(Number(input.value)); this.refresh(); };

    row.append(lbl, input, btn);
    return row;
  }

  private createCheckboxRow(label: string, checkbox: HTMLInputElement, onChange: (v: boolean) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';

    checkbox.type = 'checkbox';
    checkbox.style.cssText = 'accent-color:#0f0;';
    checkbox.onchange = () => onChange(checkbox.checked);

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.fontSize = '11px';

    row.append(checkbox, lbl);
    return row;
  }

  private buildDOM(): void {
    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #0a0;padding-bottom:6px;';
    const title = document.createElement('span');
    title.textContent = 'DEV PANEL';
    title.style.cssText = 'font-weight:bold;font-size:13px;letter-spacing:2px;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'X';
    closeBtn.style.cssText = 'background:none;color:#0f0;border:1px solid #0a0;cursor:pointer;font-family:monospace;padding:1px 6px;font-size:11px;';
    closeBtn.onclick = () => this.toggle();
    header.append(title, closeBtn);
    this.container.appendChild(header);

    // Stats section
    const stats = this.createSection('Stats');
    this.goldInput = document.createElement('input');
    this.healthInput = document.createElement('input');
    this.speedInput = document.createElement('input');
    this.damageInput = document.createElement('input');

    stats.appendChild(this.createNumberRow('Gold', this.goldInput, (v) => this.callbacks.onSetGold(v)));
    stats.appendChild(this.createNumberRow('Health', this.healthInput, (v) => this.callbacks.onSetHealth(v)));
    stats.appendChild(this.createNumberRow('Speed', this.speedInput, (v) => this.callbacks.onSetMaxSpeed(v)));
    stats.appendChild(this.createNumberRow('Damage', this.damageInput, (v) => this.callbacks.onSetDamage(v)));
    this.container.appendChild(stats);

    // Toggles section
    const toggles = this.createSection('Toggles');
    this.godModeCheckbox = document.createElement('input');
    this.instakillCheckbox = document.createElement('input');
    toggles.appendChild(this.createCheckboxRow('God Mode (invincible)', this.godModeCheckbox, (v) => this.callbacks.onToggleGodMode(v)));
    toggles.appendChild(this.createCheckboxRow('Instakill (one-shot)', this.instakillCheckbox, (v) => this.callbacks.onToggleInstakill(v)));
    this.container.appendChild(toggles);

    // Wave section
    const wave = this.createSection('Wave');
    this.waveLabel = document.createElement('span');
    this.waveLabel.style.cssText = 'display:block;margin-bottom:4px;font-size:11px;opacity:0.7;';
    wave.appendChild(this.waveLabel);

    this.waveInput = document.createElement('input');
    wave.appendChild(this.createNumberRow('Wave #', this.waveInput, (v) => this.callbacks.onSetWave(v)));
    this.container.appendChild(wave);

    // Spawn section
    const spawn = this.createSection('Spawn');
    const select = document.createElement('select');
    select.style.cssText = 'background:#111;color:#0f0;border:1px solid #0a0;padding:3px;font-family:monospace;font-size:11px;width:100%;margin-bottom:6px;border-radius:2px;';
    this.stopKeyPropagation(select);
    for (const type of ENEMY_TYPES) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type.replace(/_/g, ' ');
      select.appendChild(opt);
    }
    spawn.appendChild(select);

    const spawnRow = document.createElement('div');
    spawnRow.style.cssText = 'display:flex;gap:4px;';
    const spawnBtn = document.createElement('button');
    spawnBtn.textContent = 'Spawn';
    spawnBtn.style.cssText = BTN_CSS + 'flex:1;padding:4px;';
    spawnBtn.onclick = () => this.callbacks.onSpawnEnemy(select.value as EnemyType, false);
    const bossBtn = document.createElement('button');
    bossBtn.textContent = 'Spawn Boss';
    bossBtn.style.cssText = 'background:#a00;color:#fff;border:none;padding:4px;cursor:pointer;font-family:monospace;font-size:11px;flex:1;border-radius:2px;';
    bossBtn.onclick = () => this.callbacks.onSpawnEnemy(select.value as EnemyType, true);
    spawnRow.append(spawnBtn, bossBtn);
    spawn.appendChild(spawnRow);
    this.container.appendChild(spawn);

    // Weather section
    const weatherSection = this.createSection('Weather');
    const weatherRow = document.createElement('div');
    weatherRow.style.cssText = 'display:flex;gap:4px;';
    for (const state of WEATHER_STATES) {
      const btn = document.createElement('button');
      btn.textContent = state.charAt(0).toUpperCase() + state.slice(1);
      btn.style.cssText = BTN_WEATHER_CSS;
      btn.onclick = () => this.callbacks.onSetWeather(state);
      weatherRow.appendChild(btn);
    }
    weatherSection.appendChild(weatherRow);
    this.container.appendChild(weatherSection);

    // Hint
    const hint = document.createElement('div');
    hint.textContent = 'Press ` to toggle';
    hint.style.cssText = 'color:rgba(0,255,0,0.3);font-size:10px;text-align:center;margin-top:8px;';
    this.container.appendChild(hint);
  }
}
