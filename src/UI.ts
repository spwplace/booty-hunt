import { WAVE_TABLE } from './Types';
import type { ShipClass, ShipClassConfig, RunStats, RunHistoryEntry } from './Types';
import type { MapNode, MapGraph } from './MapNodeSystem';

type CaptainLogTone = 'neutral' | 'warning' | 'reward' | 'mystic';

interface CaptainLogEntry {
  message: string;
  tone: CaptainLogTone;
}

export interface CodexEntryView {
  id: string;
  name: string;
  detail: string;
  unlocked: boolean;
}

export interface CodexSectionView {
  title: string;
  discovered: number;
  total: number;
  entries: CodexEntryView[];
}

export interface CodexViewModel {
  completionPct: number;
  discovered: number;
  total: number;
  sections: CodexSectionView[];
}

export interface DoctrineSetupOption {
  id: string;
  name: string;
  summary: string;
  bonusLabel: string;
}

export interface ChoicePromptOption {
  id: string;
  label: string;
  detail: string;
  costs?: Array<{ key: ChoiceResourceKey; amount: number }>;
  costHint?: string;
  benefitHint?: string;
  riskHint?: string;
}

export interface ChoicePromptResourceState {
  supplies: number;
  intel: number;
  reputationTokens: number;
}

type ChoiceResourceKey = keyof ChoicePromptResourceState;

interface ChoicePromptCost {
  key: ChoiceResourceKey;
  label: string;
  amount: number;
}

export class UI {
  private titleEl: HTMLElement;
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private compassEl: HTMLElement;
  private arrowEl: HTMLElement;
  private distanceEl: HTMLElement;
  private lastCompassAngle: number = -999;
  private lastDistance: number = -1;
  private captureEl: HTMLElement;
  private vignetteEl: HTMLElement;
  private controlsEl: HTMLElement;
  private captureTimeout: ReturnType<typeof setTimeout> | null = null;
  private comboTimeout: ReturnType<typeof setTimeout> | null = null;

  // Health bar elements
  private healthBar: HTMLElement | null = null;
  private healthFill: HTMLElement | null = null;
  private lastHealth: number = -1;
  private lastMaxHealth: number = -1;

  // Wave elements
  private waveAnnounce: HTMLElement | null = null;
  private waveCounter: HTMLElement | null = null;
  private waveAnnounceTimeout: ReturnType<typeof setTimeout> | null = null;

  // Upgrade screen elements
  private upgradeScreen: HTMLElement | null = null;
  private upgradeCards: HTMLElement | null = null;

  // Game over elements
  private gameOverEl: HTMLElement | null = null;
  private restartBtn: HTMLElement | null = null;

  // Mute indicator
  private muteIndicator: HTMLElement | null = null;

  // Cannon cooldown elements
  private cooldownPort: HTMLElement | null = null;
  private cooldownStarboard: HTMLElement | null = null;
  private lastPortReady: boolean = false;
  private lastStarboardReady: boolean = false;

  // Mobile cannon buttons
  private btnPort: HTMLElement | null = null;
  private btnStarboard: HTMLElement | null = null;
  private cannonButtonAC: AbortController | null = null;

  // Boss health bar elements
  private bossHealthBar: HTMLElement | null = null;
  private bossHealthFill: HTMLElement | null = null;
  private bossNameLabel: HTMLElement | null = null;
  private lastBossHp: number = -1;
  private lastBossMaxHp: number = -1;
  private bossPhaseLineAdded: boolean = false;

  // Wave preview
  private wavePreview: HTMLElement | null = null;

  // Minimap
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;

  // Synergy popup
  private synergyPopup: HTMLElement | null = null;

  // Port UI
  private portOverlay: HTMLElement | null = null;
  private portShopList: HTMLElement | null = null;
  private portRepairBtn: HTMLElement | null = null;
  private portFullRepairBtn: HTMLElement | null = null;
  private portGoldDisplay: HTMLElement | null = null;
  private portSetSailBtn: HTMLElement | null = null;
  private portRepairCostPer10 = 100;

  // Animated score
  private displayedScore: number = 0;
  private actualScore: number = 0;
  private lastRenderedScore: number = -1;
  private scoreValueEl: HTMLElement | null = null;
  private minimapFrame: number = 0;

  // --- New V1 elements ---
  private shipSelectEl: HTMLElement | null = null;
  private shipCardsEl: HTMLElement | null = null;
  private pauseMenuEl: HTMLElement | null = null;
  private settingsPanelEl: HTMLElement | null = null;
  private runSummaryEl: HTMLElement | null = null;
  private crewHudEl: HTMLElement | null = null;
  private eventWarningEl: HTMLElement | null = null;
  private eventWarningTimeout: ReturnType<typeof setTimeout> | null = null;
  private eventTimerEl: HTMLElement | null = null;
  private eventTimerNameEl: HTMLElement | null = null;
  private eventTimerFillEl: HTMLElement | null = null;
  private eventTimerCountdownEl: HTMLElement | null = null;
  private lastEventTimerSec: number = -1;
  private lastEventTimerPct: number = -1;
  private treasureMapEl: HTMLElement | null = null;
  private portCrewHireEl: HTMLElement | null = null;
  // Journal (persistent log)
  private captainsJournalEl: HTMLElement | null = null;
  private journalEntriesEl: HTMLElement | null = null;
  private journalEntries: { message: string; tone: CaptainLogTone; timestamp: string }[] = [];
  private maxJournalEntries = 20;
  private v2ResourcesEl: HTMLElement | null = null;
  private lastV2ResourcesText = '';
  private v2FactionEl: HTMLElement | null = null;
  private lastV2FactionText = '';
  private codexPanelEl: HTMLElement | null = null;
  private codexSummaryEl: HTMLElement | null = null;
  private codexSectionsEl: HTMLElement | null = null;
  private codexDiscoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  private choicePanelEl: HTMLElement | null = null;

  // Screensaver mode: when true, gameplay UI updates are no-ops
  screensaverMode = false;

  constructor() {
    this.titleEl = document.getElementById('title')!;
    this.scoreEl = document.getElementById('score')!;
    this.comboEl = document.getElementById('combo')!;
    this.compassEl = document.getElementById('compass-container')!;
    this.arrowEl = document.getElementById('compass-arrow')!;
    this.distanceEl = document.getElementById('distance')!;
    this.captureEl = document.getElementById('capture-text')!;
    this.vignetteEl = document.getElementById('spyglass-vignette')!;
    this.controlsEl = document.getElementById('controls')!;

    // New element lookups (nullable, may not exist yet)
    this.healthBar = document.getElementById('health-bar');
    this.healthFill = document.getElementById('health-fill');
    this.waveAnnounce = document.getElementById('wave-announce');
    this.waveCounter = document.getElementById('wave-counter');
    this.upgradeScreen = document.getElementById('upgrade-screen');
    this.upgradeCards = document.getElementById('upgrade-cards');
    this.gameOverEl = document.getElementById('game-over');
    this.restartBtn = document.getElementById('restart-btn');
    this.muteIndicator = document.getElementById('mute-indicator');
    this.cooldownPort = document.getElementById('cooldown-port');
    this.cooldownStarboard = document.getElementById('cooldown-starboard');
    this.btnPort = document.getElementById('btn-port');
    this.btnStarboard = document.getElementById('btn-starboard');

    // Boss health bar
    this.bossHealthBar = document.getElementById('boss-health-bar');
    this.bossHealthFill = document.getElementById('boss-health-fill');
    this.bossNameLabel = document.getElementById('boss-name-label');

    // Wave preview
    this.wavePreview = document.getElementById('wave-preview');

    // Minimap
    this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
      this.syncMinimapCanvasSize();
    }

    // Synergy popup
    this.synergyPopup = document.getElementById('synergy-popup');

    // Port overlay
    this.portOverlay = document.getElementById('port-overlay');

    // New V1 element lookups
    this.shipSelectEl = document.getElementById('ship-select');
    this.shipCardsEl = document.getElementById('ship-cards');
    this.pauseMenuEl = document.getElementById('pause-menu');
    this.settingsPanelEl = document.getElementById('settings-panel');
    this.runSummaryEl = document.getElementById('run-summary');
    this.crewHudEl = document.getElementById('crew-hud');
    this.eventWarningEl = document.getElementById('event-warning');
    this.eventTimerEl = document.getElementById('event-timer');
    this.treasureMapEl = document.getElementById('treasure-map-indicator');
    this.portCrewHireEl = document.getElementById('port-crew-hire');
    this.captainsJournalEl = document.getElementById('captains-journal');
    this.journalEntriesEl = document.getElementById('journal-entries');
    this.v2ResourcesEl = document.getElementById('v2-resources');
    this.v2FactionEl = document.getElementById('v2-faction');
    this.codexPanelEl = document.getElementById('codex-panel');
    this.codexSummaryEl = document.getElementById('codex-summary');
    this.codexSectionsEl = document.getElementById('codex-sections');
    this.choicePanelEl = document.getElementById('choice-panel');
  }

  /* ------------------------------------------------------------------ */
  /*  ORIGINAL METHODS - preserved with identical behavior               */
  /* ------------------------------------------------------------------ */

  private syncMinimapCanvasSize(): void {
    if (!this.minimapCanvas) return;
    const targetW = Math.max(1, Math.round(this.minimapCanvas.clientWidth || this.minimapCanvas.width || 130));
    const targetH = Math.max(1, Math.round(this.minimapCanvas.clientHeight || this.minimapCanvas.height || 130));
    if (this.minimapCanvas.width !== targetW || this.minimapCanvas.height !== targetH) {
      this.minimapCanvas.width = targetW;
      this.minimapCanvas.height = targetH;
    }
  }

  private ensureMinimapReady(): boolean {
    if (!this.minimapCanvas || !this.minimapCtx) {
      this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
      if (this.minimapCanvas) this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
    if (!this.minimapCanvas || !this.minimapCtx) return false;
    this.syncMinimapCanvasSize();
    return true;
  }

  hideTitle() {
    this.titleEl.style.opacity = '0';
    setTimeout(() => (this.titleEl.style.display = 'none'), 2200);
    setTimeout(() => {
      this.scoreEl.style.opacity = '1';
      this.compassEl.style.opacity = '1';
      this.distanceEl.style.opacity = '1';
      this.controlsEl.style.opacity = '1';
    }, 1500);
  }

  updateScore(score: number) {
    if (this.screensaverMode) return;
    if (score === this.lastRenderedScore) return;
    this.lastRenderedScore = score;
    if (!this.scoreValueEl) {
      // First call: set up the DOM structure once
      this.scoreEl.innerHTML = '<span class="label">Gold Plundered</span><span id="score-value">0</span>';
      this.scoreValueEl = document.getElementById('score-value');
    }
    if (this.scoreValueEl) {
      this.scoreValueEl.textContent = score.toLocaleString();
    }
  }

  updateCompass(angle: number) {
    if (this.screensaverMode) return;
    // Quantize to ~0.5 degree to avoid per-frame style writes
    const q = Math.round(angle * 100);
    if (q === this.lastCompassAngle) return;
    this.lastCompassAngle = q;
    this.arrowEl.style.transform = `translateX(-50%) rotate(${angle}rad)`;
  }

  updateDistance(dist: number) {
    if (this.screensaverMode) return;
    const rounded = Math.round(dist);
    if (rounded === this.lastDistance) return;
    this.lastDistance = rounded;
    this.distanceEl.textContent = `${rounded} leagues`;
  }

  showCapture(text: string, combo: number) {
    if (this.screensaverMode) return;
    if (this.captureTimeout) clearTimeout(this.captureTimeout);
    this.captureEl.textContent = text;
    this.captureEl.classList.add('show');
    this.captureTimeout = setTimeout(() => {
      this.captureEl.classList.remove('show');
    }, 3000);

    // Combo display
    if (combo > 1) {
      if (this.comboTimeout) clearTimeout(this.comboTimeout);
      this.comboEl.textContent = `${combo}x Combo!`;
      this.comboEl.classList.add('show');
      // Briefly pop the scale for juice
      this.comboEl.style.transform = 'scale(1.3)';
      setTimeout(() => { this.comboEl.style.transform = 'scale(1)'; }, 150);
      this.comboTimeout = setTimeout(() => {
        this.comboEl.classList.remove('show');
      }, 5000);
    }
  }

  hideCombo() {
    this.comboEl.classList.remove('show');
  }

  setSpyglass(active: boolean) {
    this.vignetteEl.classList.toggle('active', active);
  }

  /* ------------------------------------------------------------------ */
  /*  HEALTH BAR                                                         */
  /* ------------------------------------------------------------------ */

  updateHealth(current: number, max: number) {
    if (this.screensaverMode) return;
    if (!this.healthFill || !this.healthBar) return;
    if (current === this.lastHealth && max === this.lastMaxHealth) return;

    // Flash red on damage (health decreased)
    if (this.lastHealth >= 0 && current < this.lastHealth) {
      this.healthBar.classList.add('damage');
      setTimeout(() => {
        this.healthBar?.classList.remove('damage');
      }, 300);
    }

    this.lastHealth = current;
    this.lastMaxHealth = max;

    const pct = Math.max(0, Math.min(1, current / max)) * 100;
    const color = pct > 60 ? '#4caf50' : pct > 30 ? '#ffeb3b' : '#f44336';

    this.healthFill.style.width = `${pct}%`;
    this.healthFill.style.backgroundColor = color;
  }

  /* ------------------------------------------------------------------ */
  /*  WAVE DISPLAY                                                       */
  /* ------------------------------------------------------------------ */

  showWaveAnnouncement(wave: number, isBossWave = false) {
    if (!this.waveAnnounce) return;

    // Clear any previous announcement timer
    if (this.waveAnnounceTimeout) {
      clearTimeout(this.waveAnnounceTimeout);
      this.waveAnnounceTimeout = null;
    }

    const label = isBossWave ? `WAVE ${wave} - BOSS WAVE!` : `WAVE ${wave}`;

    this.waveAnnounce.textContent = label;
    this.waveAnnounce.style.color = isBossWave ? '#f44336' : '';

    // Fade in
    this.waveAnnounce.classList.add('show');

    // Hold 4s then fade out
    this.waveAnnounceTimeout = setTimeout(() => {
      this.waveAnnounce?.classList.remove('show');
      this.waveAnnounceTimeout = null;
    }, 4000);
  }

  updateWaveCounter(wave: number, shipsLeft: number, shipsTotal: number) {
    if (this.screensaverMode) return;
    if (!this.waveCounter) return;
    this.waveCounter.textContent = `W${wave} \u2502 ${shipsLeft}/${shipsTotal} Ships`;
  }

  /* ------------------------------------------------------------------ */
  /*  ROAM PHASE                                                         */
  /* ------------------------------------------------------------------ */

  private roamNextWave = 0;

  showRoamIndicator(nextWave: number, duration: number) {
    this.roamNextWave = nextWave;
    if (!this.waveCounter) return;
    this.waveCounter.textContent = `Open Waters \u2014 Wave ${nextWave} in ${Math.ceil(duration)}s`;
    // Show mobile skip button
    const btn = document.getElementById('btn-skip-roam');
    if (btn) btn.style.display = 'flex';
  }

  updateRoamTimer(secondsLeft: number) {
    if (!this.waveCounter) return;
    const s = Math.ceil(secondsLeft);
    this.waveCounter.textContent = s > 0
      ? `Open Waters \u2014 Wave ${this.roamNextWave} in ${s}s`
      : `Prepare for battle!`;
  }

  hideRoamIndicator() {
    const btn = document.getElementById('btn-skip-roam');
    if (btn) btn.style.display = 'none';
  }

  /* ------------------------------------------------------------------ */
  /*  UPGRADE SCREEN                                                     */
  /* ------------------------------------------------------------------ */

  showUpgradeScreen(
    upgrades: Array<{ name: string; description: string; icon: string; tier?: string; stat?: string }>,
    acquiredIds?: string[]
  ): Promise<number> {
    return new Promise<number>((resolve) => {
      if (!this.upgradeScreen || !this.upgradeCards) {
        // If elements don't exist, default to first option
        resolve(0);
        return;
      }

      // Clear previous cards
      this.upgradeCards.innerHTML = '';

      upgrades.forEach((upgrade, index) => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.style.pointerEvents = 'auto';
        card.style.cursor = 'pointer';

        // Tier styling via CSS classes
        const tier = upgrade.tier || 'common';
        card.classList.add(`tier-${tier}`);

        const statPreview = upgrade.stat
          ? `<div class="upgrade-stat" style="font-size:11px;color:rgba(232,213,163,0.6);margin-top:4px;">${upgrade.stat}</div>`
          : '';

        card.innerHTML = `
          <div class="tier-badge ${tier}" style="position:absolute;top:6px;right:22px;">${tier.charAt(0).toUpperCase() + tier.slice(1)}</div>
          <div class="upgrade-icon">${upgrade.icon}</div>
          <div class="upgrade-name">${upgrade.name}</div>
          <div class="upgrade-desc">${upgrade.description}</div>
          ${statPreview}
          <span class="upgrade-rivet-bl"></span>
          <span class="upgrade-rivet-br"></span>
        `;

        card.addEventListener('click', () => {
          // Add selection feedback
          card.classList.add('selected');
          // Short delay so the player sees the selection before hiding
          setTimeout(() => {
            this.upgradeScreen!.classList.remove('show');
            resolve(index);
          }, 200);
        });

        this.upgradeCards!.appendChild(card);
      });

      // Show the overlay
      this.upgradeScreen.classList.add('show');
    });
  }

  /* ------------------------------------------------------------------ */
  /*  GAME OVER SCREEN                                                   */
  /* ------------------------------------------------------------------ */

  showGameOver(
    stats: RunStats,
    highScore: number,
    highWave: number,
    seed?: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.gameOverEl) {
        resolve();
        return;
      }

      const minutes = Math.floor(stats.timePlayed / 60);
      const seconds = Math.floor(stats.timePlayed % 60);
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      const seedStr = seed != null ? seed.toString(16).toUpperCase() : null;

      // Build content
      this.gameOverEl.innerHTML = `
        <div class="game-over-content">
          <h1 class="game-over-title">YE BEEN SUNK!</h1>
          <div class="game-over-stats">
            <div class="stat-row">
              <span class="stat-label">Final Score</span>
              <span class="stat-value">${stats.gold.toLocaleString()}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Wave Reached</span>
              <span class="stat-value">${stats.wavesCompleted} of ${WAVE_TABLE.length}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Ships Destroyed</span>
              <span class="stat-value">${stats.shipsDestroyed}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Max Combo</span>
              <span class="stat-value">${stats.maxCombo}x</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Damage Dealt</span>
              <span class="stat-value">${stats.damageDealt.toLocaleString()}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Damage Taken</span>
              <span class="stat-value">${stats.damageTaken.toLocaleString()}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Time Played</span>
              <span class="stat-value">${timeStr}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Ship Class</span>
              <span class="stat-value">${stats.shipClass.charAt(0).toUpperCase() + stats.shipClass.slice(1)}</span>
            </div>
            ${stats.finalHeatLevel ? `<div class="stat-row"><span class="stat-label">Notoriety</span><span class="stat-value">${stats.finalHeatLevel}</span></div>` : ''}
            <div class="stat-row" style="border-top:1px solid rgba(255,215,0,0.25);margin-top:4px;padding-top:8px;">
              <span class="stat-label">High Score</span>
              <span class="stat-value">${highScore.toLocaleString()}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Best Wave</span>
              <span class="stat-value">${highWave}</span>
            </div>
            ${seedStr ? `<div class="stat-row"><span class="stat-label">Seed</span><span class="stat-value" style="font-size:0.9rem;letter-spacing:0.08em;">${seedStr}</span></div>` : ''}
          </div>
          <button id="restart-btn" class="restart-btn">Set Sail Again</button>
        </div>
      `;

      // Re-grab the restart button since we rebuilt inner HTML
      this.restartBtn = document.getElementById('restart-btn');

      // Show the overlay
      this.gameOverEl.classList.add('show');

      if (this.restartBtn) {
        this.restartBtn.addEventListener(
          'click',
          () => {
            this.gameOverEl?.classList.remove('show');
            resolve();
          },
          { once: true }
        );
      } else {
        resolve();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  MUTE INDICATOR                                                     */
  /* ------------------------------------------------------------------ */

  setMuted(muted: boolean) {
    if (!this.muteIndicator) return;
    this.muteIndicator.classList.toggle('show', muted);
  }

  /* ------------------------------------------------------------------ */
  /*  CANNON COOLDOWNS                                                   */
  /* ------------------------------------------------------------------ */

  updateCooldowns(portReady: boolean, starboardReady: boolean) {
    if (this.screensaverMode) return;
    if (portReady !== this.lastPortReady) {
      this.lastPortReady = portReady;
      if (this.cooldownPort) {
        this.cooldownPort.classList.toggle('ready', portReady);
        this.cooldownPort.classList.toggle('reloading', !portReady);
      }
    }
    if (starboardReady !== this.lastStarboardReady) {
      this.lastStarboardReady = starboardReady;
      if (this.cooldownStarboard) {
        this.cooldownStarboard.classList.toggle('ready', starboardReady);
        this.cooldownStarboard.classList.toggle('reloading', !starboardReady);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  MOBILE CANNON BUTTONS                                              */
  /* ------------------------------------------------------------------ */

  showMobileCannonButtons(
    onPort?: () => void,
    onStarboard?: () => void
  ) {
    this.cannonButtonAC?.abort();
    this.cannonButtonAC = new AbortController();
    const { signal } = this.cannonButtonAC;

    if (this.btnPort) {
      this.btnPort.classList.add('show');
      if (onPort) {
        this.btnPort.addEventListener('touchstart', (e) => {
          e.preventDefault();
          onPort();
        }, { passive: false, signal });
      }
    }
    if (this.btnStarboard) {
      this.btnStarboard.classList.add('show');
      if (onStarboard) {
        this.btnStarboard.addEventListener('touchstart', (e) => {
          e.preventDefault();
          onStarboard();
        }, { passive: false, signal });
      }
    }
  }

  hideMobileCannonButtons(): void {
    this.cannonButtonAC?.abort();
    this.cannonButtonAC = null;
    this.btnPort?.classList.remove('show');
    this.btnStarboard?.classList.remove('show');
  }

  /* ------------------------------------------------------------------ */
  /*  ANIMATED SCORE                                                     */
  /* ------------------------------------------------------------------ */

  updateScoreAnimated(score: number) {
    if (this.screensaverMode) return;
    this.actualScore = score;
  }

  updateScoreDisplay(dt: number) {
    if (this.screensaverMode) return;
    if (this.displayedScore === this.actualScore) return;

    const diff = this.actualScore - this.displayedScore;
    // easeOut: faster when far, slower when close
    const speed = 400 * dt;
    const absDiff = Math.abs(diff);

    if (absDiff < 1) {
      this.displayedScore = this.actualScore;
    } else {
      // easeOut factor: move more when difference is large
      const ease = Math.min(1, speed / absDiff + 0.05);
      this.displayedScore += diff * ease;
    }

    this.updateScore(Math.round(this.displayedScore));
  }

  /* ------------------------------------------------------------------ */
  /*  BOSS HEALTH BAR                                                    */
  /* ------------------------------------------------------------------ */

  showBossHealthBar(name: string) {
    if (!this.bossHealthBar) {
      this.bossHealthBar = document.getElementById('boss-health-bar');
      this.bossHealthFill = document.getElementById('boss-health-fill');
      this.bossNameLabel = document.getElementById('boss-name-label');
    }
    if (!this.bossHealthBar) return;

    this.lastBossHp = -1;
    this.lastBossMaxHp = -1;
    this.bossPhaseLineAdded = false;

    if (this.bossNameLabel) {
      this.bossNameLabel.textContent = name;
    }
    this.bossHealthBar.style.display = 'block';
    this.bossHealthBar.style.opacity = '1';
  }

  updateBossHealth(current: number, max: number) {
    if (!this.bossHealthFill) return;
    if (current === this.lastBossHp && max === this.lastBossMaxHp) return;
    this.lastBossHp = current;
    this.lastBossMaxHp = max;

    const pct = Math.max(0, Math.min(1, current / max)) * 100;
    this.bossHealthFill.style.width = `${pct}%`;
    this.bossHealthFill.style.backgroundColor = pct > 50 ? '#f44336' : pct > 25 ? '#ff9800' : '#ff5252';

    // Phase line at 50% — add once
    if (!this.bossPhaseLineAdded && this.bossHealthBar) {
      this.bossPhaseLineAdded = true;
      const phaseLine = document.createElement('div');
      phaseLine.className = 'boss-phase-line';
      phaseLine.style.cssText = `
        position:absolute; left:50%; top:0; bottom:0; width:2px;
        background:rgba(255,255,255,0.5); pointer-events:none; z-index:1;
      `;
      this.bossHealthBar.style.position = 'relative';
      this.bossHealthBar.appendChild(phaseLine);
    }
  }

  hideBossHealthBar() {
    if (!this.bossHealthBar) return;
    this.bossHealthBar.style.opacity = '0';
    setTimeout(() => {
      if (this.bossHealthBar) this.bossHealthBar.style.display = 'none';
    }, 500);
  }

  /* ------------------------------------------------------------------ */
  /*  WAVE PREVIEW                                                       */
  /* ------------------------------------------------------------------ */

  private static readonly HAZARD_LABELS: Record<string, string> = {
    fire_reef: 'Fire Reefs',
    ash_fog: 'Ashfall',
    phantom_current: 'Phantom Currents',
    grave_fog: 'Fog of the Dead',
    mine_chain: 'Minefields',
    patrol_net: 'Patrol Net',
    serpent_nest: 'Serpent Nest',
    storm_wall: 'Storm Wall',
    abyss_vent: 'Abyss Vents',
    mega_swell: 'Mega Swells',
  };

  private static readonly ENEMY_TYPE_LABELS: Record<string, string> = {
    merchant_sloop: 'Sloop',
    merchant_galleon: 'Galleon',
    escort_frigate: 'Frigate',
    fire_ship: 'Fire Ship',
    ghost_ship: 'Ghost Ship',
    navy_warship: 'Warship',
  };

  showWavePreview(
    wave: number,
    weather: string,
    totalShips: number,
    armedPercent: number,
    hazards?: string[],
    enemyTypes?: string[],
  ) {
    if (!this.wavePreview) {
      this.wavePreview = document.getElementById('wave-preview');
    }
    if (!this.wavePreview) return;

    const weatherEmoji: Record<string, string> = {
      clear: '\u2600\uFE0F',
      foggy: '\uD83C\uDF2B\uFE0F',
      stormy: '\u26C8\uFE0F',
      night: '\uD83C\uDF19',
    };

    const emoji = weatherEmoji[weather] || '';
    const weatherLabel = weather.charAt(0).toUpperCase() + weather.slice(1);
    const hazardStr = hazards && hazards.length > 0
      ? `<div style="font-size:13px;color:#ff9966;margin-top:2px;">${hazards.map(h => UI.HAZARD_LABELS[h] ?? h).join(' / ')}</div>`
      : '';
    const enemyStr = enemyTypes && enemyTypes.length > 0
      ? `<div style="font-size:13px;color:#4fc3f7;margin-top:2px;">${enemyTypes.map(t => UI.ENEMY_TYPE_LABELS[t] ?? t).join(', ')}</div>`
      : '';

    this.wavePreview.innerHTML = `
      <div style="font-size:16px;color:#ccc;">
        ${emoji} ${weatherLabel} &mdash; ${totalShips} Ships &mdash; ${Math.round(armedPercent * 100)}% Armed
      </div>
      ${hazardStr}
      ${enemyStr}
    `;

    this.wavePreview.style.display = 'flex';
    this.wavePreview.style.opacity = '1';

    setTimeout(() => {
      if (this.wavePreview) {
        this.wavePreview.style.opacity = '0';
        setTimeout(() => {
          if (this.wavePreview) this.wavePreview.style.display = 'none';
        }, 500);
      }
    }, 2000);
  }

  /* ------------------------------------------------------------------ */
  /*  MINIMAP                                                            */
  /* ------------------------------------------------------------------ */

  updateMinimap(
    playerPos: { x: number; z: number },
    playerAngle: number,
    entities: Array<{ x: number; z: number; type: 'merchant' | 'escort' | 'boss' | 'island' }>,
    cursedCompass = false,
  ) {
    if (this.screensaverMode) return;
    this.minimapFrame++;
    if (this.minimapFrame % 3 !== 0) return;

    if (!this.ensureMinimapReady() || !this.minimapCanvas || !this.minimapCtx) return;
    const mapScale = Math.min(this.minimapCanvas.width, this.minimapCanvas.height) / 130;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy);
    const scale = 0.5 * mapScale; // Keep world range consistent as minimap size changes

    // Clear with dark translucent background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 10, 20, 0.75)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Range circle
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.2)';
    ctx.lineWidth = Math.max(1, mapScale);
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 4 * mapScale, 0, Math.PI * 2);
    ctx.stroke();

    // Inner range circle (half)
    ctx.beginPath();
    ctx.arc(cx, cy, (radius - 4 * mapScale) / 2, 0, Math.PI * 2);
    ctx.stroke();

    // Entity dots
    for (const e of entities) {
      const dx = (e.x - playerPos.x) * scale;
      const dz = (e.z - playerPos.z) * scale;
      const ex = cx + dx;
      const ey = cy + dz;

      // Skip if outside minimap circle (unless cursed compass shows all)
      const distFromCenter = Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2);
      if (distFromCenter > radius - 4 * mapScale) {
        if (!cursedCompass) continue;
        // Clamp to edge for cursed compass
        const clampDist = radius - 6 * mapScale;
        const angle = Math.atan2(ey - cy, ex - cx);
        // Draw as small indicator at edge -- handled below with clamped coords
        if (e.type === 'boss') ctx.fillStyle = '#ff1744';
        else if (e.type === 'escort') ctx.fillStyle = '#ff6666';
        else if (e.type === 'island') ctx.fillStyle = '#c6ad7f';
        else ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * clampDist, cy + Math.sin(angle) * clampDist, 2 * mapScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }

      if (e.type === 'boss') {
        ctx.fillStyle = '#ff1744';
        ctx.beginPath();
        ctx.arc(ex, ey, 4 * mapScale, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'escort') {
        ctx.fillStyle = '#ff5252';
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5 * mapScale, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'island') {
        ctx.fillStyle = 'rgba(198, 173, 127, 0.9)';
        ctx.beginPath();
        ctx.arc(ex, ey, 2.2 * mapScale, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(ex, ey, 2 * mapScale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player triangle (gold, rotated to match ship heading)
    // Ship at angle=0 faces +Z. On minimap +Z→+Y (down). Triangle drawn pointing up needs 180° flip.
    // Then add playerAngle to rotate with ship heading.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-playerAngle + Math.PI);  // Negated angle to fix mirror effect
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(0, -6 * mapScale);  // Tip
    ctx.lineTo(-4 * mapScale, 4 * mapScale);  // Bottom left
    ctx.lineTo(4 * mapScale, 4 * mapScale);  // Bottom right
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  SYNERGY POPUP                                                      */
  /* ------------------------------------------------------------------ */

  showSynergyPopup(name: string) {
    if (!this.synergyPopup) {
      this.synergyPopup = document.getElementById('synergy-popup');
    }
    if (!this.synergyPopup) return;

    this.synergyPopup.textContent = `SYNERGY: ${name}!`;
    this.synergyPopup.style.cssText = `
      display: block;
      opacity: 1;
      color: #ffd700;
      font-size: 24px;
      font-weight: bold;
      text-align: center;
      text-shadow: 0 0 12px rgba(255,215,0,0.8), 0 0 24px rgba(255,215,0,0.4);
      letter-spacing: 2px;
      pointer-events: none;
    `;

    setTimeout(() => {
      if (this.synergyPopup) {
        this.synergyPopup.style.opacity = '0';
        setTimeout(() => {
          if (this.synergyPopup) this.synergyPopup.style.display = 'none';
        }, 500);
      }
    }, 5000);
  }

  /* ------------------------------------------------------------------ */
  /*  PORT UI                                                            */
  /* ------------------------------------------------------------------ */

  showPortUI(
    gold: number,
    currentHp: number,
    maxHp: number,
    upgrades: Array<{
      id: string;
      name: string;
      description: string;
      icon: string;
      tier: string;
      cost: number;
    }>,
    onBuy: (id: string) => void,
    onRepair: (amount: number) => void,
    onSetSail: () => void,
    options?: {
      repairCostPer10?: number;
      marketTitle?: string;
      marketNotes?: string[];
    },
  ) {
    if (!this.portOverlay) {
      this.portOverlay = document.getElementById('port-overlay');
    }
    if (!this.portOverlay) return;

    const hpPct = Math.max(0, Math.min(1, currentHp / maxHp)) * 100;
    const repairCost = Math.max(1, Math.round(options?.repairCostPer10 ?? 100));
    const fullRepairCost = Math.ceil((maxHp - currentHp) / 10) * repairCost;
    this.portRepairCostPer10 = repairCost;
    const marketTitle = options?.marketTitle?.trim() || 'Harbor Market';
    const marketNotes = options?.marketNotes ?? [];
    const marketNotesHtml = marketNotes.length > 0
      ? `<div class="port-market-notes">${marketNotes.map(note => `<div>${note}</div>`).join('')}</div>`
      : '';

    this.portOverlay.innerHTML = `
      <div class="port-container">
        <h1 class="port-title">PORT</h1>

        <div class="port-main-layout">
          <!-- Shop Panel (Left) -->
          <div class="port-panel port-shop-panel">
            <h2 class="port-panel-title">Shop</h2>
            <div style="color:rgba(255,235,180,0.92); font-size:12px; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:8px; text-align:center;">${marketTitle}</div>
            ${marketNotesHtml}
            <div id="port-shop-list"></div>
          </div>

          <!-- Repair Panel (Right) -->
          <div class="port-panel port-repair-panel">
            <h2 class="port-panel-title">Repair</h2>

            <!-- HP bar -->
            <div style="width:100%; height:18px; background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.2); border-radius:4px; overflow:hidden; margin-bottom:6px;">
              <div id="port-hp-fill" style="width:${hpPct}%; height:100%; background:${hpPct > 60 ? '#4caf50' : hpPct > 30 ? '#ffeb3b' : '#f44336'}; transition: width 0.3s ease;"></div>
            </div>
            <div id="port-hp-text" style="color:#ccc;font-size:13px;margin-bottom:14px;">
              ${currentHp} / ${maxHp} HP
            </div>

            <button id="port-repair-btn" style="width:100%; padding:10px; margin-bottom:8px; background:rgba(76,175,80,0.3); border:1px solid #4caf50; color:white; font-size:14px; border-radius:4px; cursor:pointer;">Repair 10 HP (${repairCost}g)</button>

            <button id="port-full-repair-btn" style="width:100%; padding:10px; background:rgba(33,150,243,0.3); border:1px solid #2196f3; color:white; font-size:14px; border-radius:4px; cursor:pointer;">Full Repair (${fullRepairCost}g)</button>
          </div>
        </div>

        <!-- Bottom bar -->
        <div class="port-bottom-bar">
          <div id="port-gold-display">${gold.toLocaleString()} Gold</div>
          <button id="port-set-sail-btn">Set Sail</button>
        </div>
      </div>
    `;

    // Cache element references
    this.portShopList = document.getElementById('port-shop-list');
    this.portRepairBtn = document.getElementById('port-repair-btn');
    this.portFullRepairBtn = document.getElementById('port-full-repair-btn');
    this.portGoldDisplay = document.getElementById('port-gold-display');
    this.portSetSailBtn = document.getElementById('port-set-sail-btn');

    // Populate shop items
    if (this.portShopList) {
      for (const upg of upgrades) {
        const item = document.createElement('div');

        let tierColor = 'rgba(255,255,255,0.3)';
        let tierGlow = '';
        if (upg.tier === 'rare') {
          tierColor = '#4fc3f7';
          tierGlow = 'box-shadow: 0 0 8px rgba(79,195,247,0.3);';
        } else if (upg.tier === 'legendary') {
          tierColor = '#ffd700';
          tierGlow = 'box-shadow: 0 0 10px rgba(255,215,0,0.3);';
        }

        item.className = 'port-shop-item';
        if (upg.tier === 'rare') item.classList.add('tier-rare');
        else if (upg.tier === 'legendary') item.classList.add('tier-legendary');

        item.innerHTML = `
          <div style="font-size:22px;flex-shrink:0;">${upg.icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="color:white;font-size:13px;font-weight:bold;">${upg.name}</div>
            <div style="color:#aaa;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${upg.description}</div>
          </div>
          <div style="color:#ffd700;font-size:14px;font-weight:bold;flex-shrink:0;">${upg.cost}g</div>
        `;

        item.addEventListener('click', () => {
          onBuy(upg.id);
        });

        this.portShopList.appendChild(item);
      }
    }

    // Repair buttons
    if (this.portRepairBtn) {
      this.portRepairBtn.addEventListener('click', () => onRepair(10));
    }
    if (this.portFullRepairBtn) {
      this.portFullRepairBtn.addEventListener('click', () => onRepair(-1));
    }

    // Set Sail
    if (this.portSetSailBtn) {
      this.portSetSailBtn.addEventListener('click', () => onSetSail());
    }

    // Show overlay
    this.portOverlay.style.display = 'flex';
    this.portOverlay.style.opacity = '1';
    this.portOverlay.style.pointerEvents = 'auto';
  }

  hidePortUI() {
    if (!this.portOverlay) return;
    this.portOverlay.style.opacity = '0';
    this.portOverlay.style.pointerEvents = 'none';
    setTimeout(() => {
      if (this.portOverlay) {
        this.portOverlay.style.display = 'none';
        this.portOverlay.innerHTML = '';
      }
    }, 500);
  }

  updatePortGold(gold: number) {
    if (!this.portGoldDisplay) return;
    this.portGoldDisplay.textContent = `${gold.toLocaleString()} Gold`;
  }

  updatePortHealth(current: number, max: number) {
    const fill = document.getElementById('port-hp-fill');
    const text = document.getElementById('port-hp-text');
    const repairBtn = document.getElementById('port-repair-btn');
    const fullRepairBtn = document.getElementById('port-full-repair-btn');
    if (!fill || !text) return;

    const pct = Math.max(0, Math.min(1, current / max)) * 100;
    fill.style.width = `${pct}%`;
    fill.style.backgroundColor = pct > 60 ? '#4caf50' : pct > 30 ? '#ffeb3b' : '#f44336';
    text.textContent = `${current} / ${max} HP`;
    if (repairBtn) {
      repairBtn.textContent = `Repair 10 HP (${this.portRepairCostPer10}g)`;
    }
    if (fullRepairBtn) {
      const needed = Math.max(0, max - current);
      const fullRepairCost = Math.ceil(needed / 10) * this.portRepairCostPer10;
      fullRepairBtn.textContent = `Full Repair (${fullRepairCost}g)`;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  HEAT METER                                                         */
  /* ------------------------------------------------------------------ */

  private heatMeterEl: HTMLElement | null = null;
  private heatFillEl: HTMLElement | null = null;
  private heatLevelNameEl: HTMLElement | null = null;
  private lastHeatValue = -1;

  updateHeatMeter(heat: number, level: number, levelName: string): void {
    if (this.screensaverMode) return;
    if (!this.heatMeterEl) this.heatMeterEl = document.getElementById('heat-meter');
    if (!this.heatFillEl) this.heatFillEl = document.getElementById('heat-fill');
    if (!this.heatLevelNameEl) this.heatLevelNameEl = document.getElementById('heat-level-name');
    if (!this.heatMeterEl || !this.heatFillEl) return;

    const rounded = Math.round(heat);
    if (rounded === this.lastHeatValue) return;
    this.lastHeatValue = rounded;

    this.heatMeterEl.style.opacity = '1';
    this.heatFillEl.style.width = `${rounded}%`;

    // Color gradient: blue → amber → orange → red
    const colors = ['#4a90b8', '#d4a54a', '#d47a2a', '#c44a2a', '#b01a1a', '#b01a1a'];
    this.heatFillEl.style.backgroundColor = colors[level] ?? '#4a90b8';

    if (this.heatLevelNameEl) {
      this.heatLevelNameEl.textContent = levelName;
      this.heatLevelNameEl.style.color = colors[level] ?? 'rgba(220,180,140,0.7)';
    }
  }

  updateV2Resources(supplies: number, intel: number, reputationTokens: number): void {
    if (this.screensaverMode) return;
    if (!this.v2ResourcesEl) {
      this.v2ResourcesEl = document.getElementById('v2-resources');
    }
    if (!this.v2ResourcesEl) return;

    const text = `Supplies ${supplies} · Intel ${intel} · Tokens ${reputationTokens}`;
    if (text === this.lastV2ResourcesText) return;
    this.lastV2ResourcesText = text;
    this.v2ResourcesEl.textContent = text;
    this.v2ResourcesEl.style.opacity = '1';
  }

  updateV2FactionStatus(factionName: string | null, reputation: number): void {
    if (this.screensaverMode) return;
    if (!this.v2FactionEl) {
      this.v2FactionEl = document.getElementById('v2-faction');
    }
    if (!this.v2FactionEl) return;

    const standing = reputation >= 40
      ? 'Friendly'
      : reputation >= 15
        ? 'Warm'
        : reputation > -15
          ? 'Wary'
          : reputation > -40
            ? 'Hostile'
            : 'Vendetta';
    const label = factionName ? `${factionName}: ${standing} (${Math.round(reputation)})` : 'Waters: Neutral';
    if (label === this.lastV2FactionText) return;
    this.lastV2FactionText = label;
    this.v2FactionEl.textContent = label;
    this.v2FactionEl.style.opacity = '1';
  }

  /* ------------------------------------------------------------------ */
  /*  RUN SETUP / SHIP SELECT                                            */
  /* ------------------------------------------------------------------ */

  showRunSetup(
    configs: ShipClassConfig[],
    doctrines: DoctrineSetupOption[],
    defaults: { shipClass: ShipClass; doctrineId: string },
    onStart: (shipClass: ShipClass, doctrineId: string, seed?: number) => void,
  ): void {
    if (!this.shipSelectEl) {
      this.shipSelectEl = document.getElementById('ship-select');
    }
    if (!this.shipSelectEl) return;

    let selectedShip: ShipClass = defaults.shipClass;
    let selectedDoctrine = defaults.doctrineId;
    if (!doctrines.some((d) => d.id === selectedDoctrine) && doctrines.length > 0) {
      selectedDoctrine = doctrines[0].id;
    }

    this.shipSelectEl.innerHTML = `
      <h2>Chart Yer Voyage</h2>
      <div style="color:rgba(255,255,255,0.7);font-size:0.95rem;margin:-0.9rem 0 1.4rem 0;">Select vessel and doctrine before casting off.</div>
      <div style="width:min(92vw,980px);display:flex;flex-direction:column;gap:12px;">
        <section>
          <div style="color:#ffd99a;font-size:1rem;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px;">Ship Frame</div>
          <div id="run-setup-ships" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;"></div>
        </section>
        <section>
          <div style="color:#9fd6ff;font-size:1rem;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px;">Starting Doctrine</div>
          <div id="run-setup-doctrines" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;"></div>
        </section>
        <section>
          <div style="color:rgba(255,255,255,0.5);font-size:0.85rem;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px;">Seed (optional)</div>
          <div style="display:flex;justify-content:center;">
            <input id="run-setup-seed" type="text" placeholder="Random" maxlength="8" spellcheck="false" autocomplete="off" style="
              font-family:monospace;
              font-size:1rem;
              color:#ffd700;
              background:rgba(255,215,0,0.08);
              border:1px solid rgba(255,215,0,0.3);
              border-radius:6px;
              padding:6px 12px;
              width:140px;
              text-align:center;
              letter-spacing:0.12em;
              text-transform:uppercase;
            " />
          </div>
        </section>
        <div style="display:flex;justify-content:center;margin-top:4px;">
          <button id="run-setup-start" type="button" style="
            font-family:'Pirata One', cursive;
            font-size:1.2rem;
            color:#ffd700;
            background:rgba(255,215,0,0.12);
            border:2px solid rgba(255,215,0,0.45);
            border-radius:8px;
            padding:10px 28px;
            letter-spacing:0.09em;
            cursor:pointer;
          ">Set Sail</button>
        </div>
      </div>
    `;

    const shipsHost = document.getElementById('run-setup-ships');
    const doctrinesHost = document.getElementById('run-setup-doctrines');
    const startBtn = document.getElementById('run-setup-start') as HTMLButtonElement | null;
    if (!shipsHost || !doctrinesHost || !startBtn) return;

    const renderShips = () => {
      shipsHost.innerHTML = '';
      for (const cfg of configs) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `ship-card${cfg.locked ? ' locked' : ''}`;
        const selected = cfg.id === selectedShip;
        card.style.borderColor = selected ? '#ffd700' : 'rgba(255,215,0,0.3)';
        card.style.boxShadow = selected ? '0 0 22px rgba(255, 205, 80, 0.32)' : '';

        if (cfg.locked) {
          card.innerHTML = `
            <div class="ship-lock-icon">\uD83D\uDD12</div>
            <div class="ship-icon">${cfg.icon}</div>
            <div class="ship-name">${cfg.name}</div>
            <div class="ship-stats">Locked</div>
            <div class="ship-desc">${cfg.description}</div>
          `;
        } else {
          card.innerHTML = `
            <div class="ship-icon">${cfg.icon}</div>
            <div class="ship-name">${cfg.name}</div>
            <div class="ship-stats">
              Speed: ${cfg.speed} &bull; HP: ${cfg.hp} &bull; Cannons: ${cfg.cannonsPerSide * 2}
            </div>
            <div class="ship-desc">${cfg.description}</div>
          `;
          card.addEventListener('click', () => {
            selectedShip = cfg.id;
            renderShips();
          });
        }
        shipsHost.appendChild(card);
      }
    };

    const renderDoctrines = () => {
      doctrinesHost.innerHTML = '';
      for (const doctrine of doctrines) {
        const selected = doctrine.id === selectedDoctrine;
        const card = document.createElement('button');
        card.type = 'button';
        card.style.cssText = `
          width: min(280px, 88vw);
          text-align: left;
          padding: 9px 11px;
          background: ${selected ? 'rgba(70, 115, 166, 0.34)' : 'rgba(18, 24, 36, 0.85)'};
          border: 1px solid ${selected ? '#8ac9ff' : 'rgba(110, 156, 202, 0.35)'};
          border-radius: 8px;
          color: #d9e8ff;
          cursor: pointer;
          font-family: 'Pirata One', cursive;
          font-size: 0.95rem;
        `;
        card.innerHTML = `
          <div style="font-size:1.08rem;color:#9fd6ff;letter-spacing:0.04em;">${doctrine.name}</div>
          <div style="font-size:0.78rem;color:rgba(217,232,255,0.74);line-height:1.35;margin-top:4px;">${doctrine.summary}</div>
          <div style="font-size:0.72rem;color:#d7f0ff;opacity:0.82;margin-top:6px;">${doctrine.bonusLabel}</div>
        `;
        card.addEventListener('click', () => {
          selectedDoctrine = doctrine.id;
          renderDoctrines();
        });
        doctrinesHost.appendChild(card);
      }
    };

    renderShips();
    renderDoctrines();
    startBtn.addEventListener('click', () => {
      const seedInput = document.getElementById('run-setup-seed') as HTMLInputElement | null;
      const seedText = seedInput?.value.trim() ?? '';
      const parsedSeed = seedText ? parseInt(seedText, 16) : undefined;
      const seed = parsedSeed && !isNaN(parsedSeed) ? parsedSeed : undefined;
      onStart(selectedShip, selectedDoctrine, seed);
    }, { once: true });
    this.shipSelectEl.style.display = 'flex';
  }

  showShipSelect(
    configs: ShipClassConfig[],
    onSelect: (cls: ShipClass) => void
  ): void {
    if (!this.shipSelectEl) {
      this.shipSelectEl = document.getElementById('ship-select');
    }
    if (!this.shipCardsEl) {
      this.shipCardsEl = document.getElementById('ship-cards');
    }
    if (!this.shipSelectEl || !this.shipCardsEl) return;

    this.shipCardsEl.innerHTML = '';

    for (const cfg of configs) {
      const card = document.createElement('div');
      card.className = 'ship-card' + (cfg.locked ? ' locked' : '');

      if (cfg.locked) {
        card.innerHTML = `
          <div class="ship-lock-icon">\uD83D\uDD12</div>
          <div class="ship-icon">${cfg.icon}</div>
          <div class="ship-name">${cfg.name}</div>
          <div class="ship-stats">Locked</div>
          <div class="ship-desc">${cfg.description}</div>
        `;
      } else {
        card.innerHTML = `
          <div class="ship-icon">${cfg.icon}</div>
          <div class="ship-name">${cfg.name}</div>
          <div class="ship-stats">
            Speed: ${cfg.speed} &bull; HP: ${cfg.hp} &bull; Cannons: ${cfg.cannonsPerSide * 2}
          </div>
          <div class="ship-desc">${cfg.description}</div>
          <button class="ship-select-btn">Select</button>
        `;

        card.addEventListener('click', () => {
          onSelect(cfg.id);
        });
      }

      this.shipCardsEl.appendChild(card);
    }

    this.shipSelectEl.style.display = 'flex';
  }

  hideShipSelect(): void {
    if (!this.shipSelectEl) {
      this.shipSelectEl = document.getElementById('ship-select');
    }
    if (this.shipSelectEl) {
      this.shipSelectEl.style.display = 'none';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  RUN HISTORY                                                        */
  /* ------------------------------------------------------------------ */

  showRunHistory(history: RunHistoryEntry[]): void {
    const panel = document.getElementById('run-history-panel');
    if (!panel) return;

    if (history.length === 0) {
      panel.innerHTML = `
        <div class="history-title">Past Voyages</div>
        <div style="color:rgba(255,255,255,0.5);font-size:1rem;margin-bottom:1.5rem;">No voyages yet. Set sail to make history!</div>
        <button class="history-close" id="history-close">Back</button>
      `;
    } else {
      const rows = history.map(r => {
        const d = new Date(r.date);
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
        const mins = Math.floor(r.timePlayed / 60);
        const secs = Math.floor(r.timePlayed % 60);
        const cls = r.shipClass.charAt(0).toUpperCase() + r.shipClass.slice(1);
        const outcomeClass = r.victory ? 'victory-cell' : 'defeat-cell';
        const outcome = r.victory ? 'Victory' : `W${r.wavesCompleted}`;
        const seedHex = r.seed.toString(16).toUpperCase();
        return `<tr>
          <td>${dateStr}</td>
          <td class="${outcomeClass}">${outcome}</td>
          <td>${cls}</td>
          <td>${r.gold.toLocaleString()}</td>
          <td>${r.shipsDestroyed}</td>
          <td>${r.maxCombo}x</td>
          <td>${mins}:${secs.toString().padStart(2, '0')}</td>
          <td style="font-family:monospace;font-size:0.75rem;letter-spacing:0.08em;">${seedHex}</td>
        </tr>`;
      }).join('');

      panel.innerHTML = `
        <div class="history-title">Past Voyages</div>
        <table class="history-table">
          <thead><tr>
            <th>Date</th><th>Result</th><th>Ship</th><th>Gold</th><th>Sunk</th><th>Combo</th><th>Time</th><th>Seed</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <button class="history-close" id="history-close">Back</button>
      `;
    }

    panel.style.display = 'flex';
    const closeBtn = document.getElementById('history-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
      }, { once: true });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  PAUSE MENU                                                         */
  /* ------------------------------------------------------------------ */

  showPauseMenu(
    onResume: () => void,
    onSettings: () => void,
    onQuit: () => void
  ): void {
    if (!this.pauseMenuEl) {
      this.pauseMenuEl = document.getElementById('pause-menu');
    }
    if (!this.pauseMenuEl) return;

    this.pauseMenuEl.style.display = 'flex';

    const resumeBtn = document.getElementById('pause-resume');
    const settingsBtn = document.getElementById('pause-settings');
    const quitBtn = document.getElementById('pause-quit');

    if (resumeBtn) {
      const newBtn = resumeBtn.cloneNode(true) as HTMLElement;
      resumeBtn.parentNode?.replaceChild(newBtn, resumeBtn);
      newBtn.addEventListener('click', onResume, { once: true });
    }
    if (settingsBtn) {
      const newBtn = settingsBtn.cloneNode(true) as HTMLElement;
      settingsBtn.parentNode?.replaceChild(newBtn, settingsBtn);
      newBtn.addEventListener('click', onSettings, { once: true });
    }
    if (quitBtn) {
      const newBtn = quitBtn.cloneNode(true) as HTMLElement;
      quitBtn.parentNode?.replaceChild(newBtn, quitBtn);
      newBtn.addEventListener('click', onQuit, { once: true });
    }
  }

  hidePauseMenu(): void {
    if (!this.pauseMenuEl) {
      this.pauseMenuEl = document.getElementById('pause-menu');
    }
    if (this.pauseMenuEl) {
      this.pauseMenuEl.style.display = 'none';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  SETTINGS PANEL                                                     */
  /* ------------------------------------------------------------------ */

  showSettings(
    currentSettings: {
      master: number;
      music: number;
      sfx: number;
      quality: string;
      uiScale: number;
      textScale: number;
      motionIntensity: number;
      flashIntensity: number;
      colorblindMode: string;
      keyBindings: Record<string, string>;
    },
    onChange: (key: string, value: any) => void
  ): void {
    if (!this.settingsPanelEl) {
      this.settingsPanelEl = document.getElementById('settings-panel');
    }
    if (!this.settingsPanelEl) return;

    this.settingsPanelEl.style.display = 'flex';

    const volMaster = document.getElementById('vol-master') as HTMLInputElement | null;
    const volMusic = document.getElementById('vol-music') as HTMLInputElement | null;
    const volSfx = document.getElementById('vol-sfx') as HTMLInputElement | null;
    const gfxQuality = document.getElementById('gfx-quality') as HTMLSelectElement | null;
    const uiScale = document.getElementById('acc-ui-scale') as HTMLInputElement | null;
    const textScale = document.getElementById('acc-text-scale') as HTMLInputElement | null;
    const motionIntensity = document.getElementById('acc-motion') as HTMLInputElement | null;
    const flashIntensity = document.getElementById('acc-flash') as HTMLInputElement | null;
    const colorblindMode = document.getElementById('acc-colorblind') as HTMLSelectElement | null;
    const backBtn = document.getElementById('settings-back');

    // Rebind buttons
    const rebindBtns = this.settingsPanelEl.querySelectorAll('.rebind-btn');
    rebindBtns.forEach((btn) => {
      const b = btn as HTMLButtonElement;
      const action = b.dataset.action;
      if (action && currentSettings.keyBindings[action]) {
        const key = currentSettings.keyBindings[action];
        b.textContent = key === ' ' ? 'Space' : key.toUpperCase();
        
        b.onclick = () => {
          b.textContent = '...';
          b.classList.add('waiting');
          
          const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const newKey = e.key === ' ' ? ' ' : e.key.toLowerCase();
            onChange('keyBinding', { action, key: newKey });
            b.classList.remove('waiting');
            window.removeEventListener('keydown', handler, true);
          };
          window.addEventListener('keydown', handler, true);
        };
      }
    });

    if (volMaster) {
      volMaster.value = String(currentSettings.master);
      volMaster.oninput = () => onChange('master', Number(volMaster.value));
    }
    if (volMusic) {
      volMusic.value = String(currentSettings.music);
      volMusic.oninput = () => onChange('music', Number(volMusic.value));
    }
    if (volSfx) {
      volSfx.value = String(currentSettings.sfx);
      volSfx.oninput = () => onChange('sfx', Number(volSfx.value));
    }
    if (gfxQuality) {
      gfxQuality.value = currentSettings.quality;
      gfxQuality.onchange = () => onChange('quality', gfxQuality.value);
    }
    if (uiScale) {
      uiScale.value = String(Math.round(currentSettings.uiScale * 100));
      uiScale.oninput = () => onChange('uiScale', Number(uiScale.value) / 100);
    }
    if (textScale) {
      textScale.value = String(Math.round(currentSettings.textScale * 100));
      textScale.oninput = () => onChange('textScale', Number(textScale.value) / 100);
    }
    if (motionIntensity) {
      motionIntensity.value = String(Math.round(currentSettings.motionIntensity * 100));
      motionIntensity.oninput = () => onChange('motionIntensity', Number(motionIntensity.value) / 100);
    }
    if (flashIntensity) {
      flashIntensity.value = String(Math.round(currentSettings.flashIntensity * 100));
      flashIntensity.oninput = () => onChange('flashIntensity', Number(flashIntensity.value) / 100);
    }
    if (colorblindMode) {
      colorblindMode.value = currentSettings.colorblindMode;
      colorblindMode.onchange = () => onChange('colorblindMode', colorblindMode.value);
    }
    if (backBtn) {
      const newBtn = backBtn.cloneNode(true) as HTMLElement;
      backBtn.parentNode?.replaceChild(newBtn, backBtn);
      newBtn.addEventListener('click', () => this.hideSettings(), { once: true });
    }
  }

  hideSettings(): void {
    if (!this.settingsPanelEl) {
      this.settingsPanelEl = document.getElementById('settings-panel');
    }
    if (this.settingsPanelEl) {
      this.settingsPanelEl.style.display = 'none';
    }
  }

  private static choiceResourceMeta: Record<ChoiceResourceKey, { label: string; className: string }> = {
    supplies: { label: 'Supplies', className: 'choice-resource-supplies' },
    intel: { label: 'Intel', className: 'choice-resource-intel' },
    reputationTokens: { label: 'Tokens', className: 'choice-resource-tokens' },
  };

  private static escapeChoiceHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private static normalizeChoiceText(value: string): string {
    return value.replace(/\s+/g, ' ').trim().replace(/[.;:,]$/, '');
  }

  private static parseChoiceResourceKey(raw: string): ChoiceResourceKey | null {
    const key = raw.toLowerCase();
    if (key.startsWith('supply') || key.startsWith('suppl')) return 'supplies';
    if (key.startsWith('intel')) return 'intel';
    if (key.startsWith('token')) return 'reputationTokens';
    return null;
  }

  private static parseChoiceCostsFromText(text: string): ChoicePromptCost[] {
    const parsed = new Map<ChoiceResourceKey, number>();
    const matches = text.matchAll(/\b(?:spend|costs?)\s+(\d+)\s+(supplies?|intel|tokens?)\b/gi);
    for (const match of matches) {
      const amount = Number(match[1]);
      const key = UI.parseChoiceResourceKey(match[2] ?? '');
      if (!key || Number.isNaN(amount) || amount <= 0) continue;
      parsed.set(key, Math.max(parsed.get(key) ?? 0, amount));
    }
    const costs: ChoicePromptCost[] = [];
    for (const key of ['supplies', 'intel', 'reputationTokens'] as ChoiceResourceKey[]) {
      const amount = parsed.get(key);
      if (!amount) continue;
      costs.push({
        key,
        label: UI.choiceResourceMeta[key].label,
        amount,
      });
    }
    return costs;
  }

  private static resolveChoiceCosts(option: ChoicePromptOption): ChoicePromptCost[] {
    const parsed = new Map<ChoiceResourceKey, number>();
    for (const cost of option.costs ?? []) {
      if (!cost || Number.isNaN(cost.amount) || cost.amount <= 0) continue;
      parsed.set(cost.key, Math.max(parsed.get(cost.key) ?? 0, Math.round(cost.amount)));
    }
    if (parsed.size === 0) {
      for (const cost of UI.parseChoiceCostsFromText(option.costHint?.trim() ?? '')) {
        parsed.set(cost.key, cost.amount);
      }
    }
    const costs: ChoicePromptCost[] = [];
    for (const key of ['supplies', 'intel', 'reputationTokens'] as ChoiceResourceKey[]) {
      const amount = parsed.get(key);
      if (!amount) continue;
      costs.push({
        key,
        label: UI.choiceResourceMeta[key].label,
        amount,
      });
    }
    return costs;
  }

  showChoicePrompt(
    title: string,
    detail: string,
    options: ChoicePromptOption[],
    resources?: ChoicePromptResourceState,
  ): Promise<string> {
    if (!this.choicePanelEl) {
      this.choicePanelEl = document.getElementById('choice-panel');
    }
    if (!this.choicePanelEl) {
      return Promise.resolve(options[0]?.id ?? '');
    }

    const resourcesHtml = resources
      ? `
        <div class="choice-resources" aria-label="Current resources">
          ${(['supplies', 'intel', 'reputationTokens'] as ChoiceResourceKey[])
            .map((key) => {
              const meta = UI.choiceResourceMeta[key];
              return `
                <div class="choice-resource ${meta.className}">
                  <b>${meta.label}</b>
                  <span>${Math.max(0, Math.round(resources[key]))}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      `
      : '';

    const optionHtml = options
      .map((option, idx) => {
        const costs = UI.resolveChoiceCosts(option);
        const costHintText = option.costHint?.trim() ?? '';
        const hasNoCostPhrase = /\bno\s+(?:upfront\s+|immediate\s+)?(?:supplies?|intel|tokens?)\s+cost\b/i.test(costHintText)
          || /\bno\s+cost\b/i.test(costHintText);
        const canCoverCosts = resources
          ? costs.every((cost) => resources[cost.key] >= cost.amount)
          : true;
        const affordabilityTag = costs.length > 0 && resources
          ? `<span class="choice-state ${canCoverCosts ? 'choice-state-ready' : 'choice-state-short'}">${canCoverCosts ? 'Can Pay' : 'Shortfall'}</span>`
          : '';

        const costBadges = costHintText
          ? hasNoCostPhrase
            ? `<span class="choice-chip choice-chip-free">${UI.escapeChoiceHtml(UI.normalizeChoiceText(costHintText))}</span>`
            : `<span class="choice-chip choice-chip-cost">Cost: ${UI.escapeChoiceHtml(UI.normalizeChoiceText(costHintText))}</span>`
          : costs.length > 0
            ? costs
              .map((cost) => {
                if (!resources) {
                  return `<span class="choice-chip choice-chip-cost">Cost ${cost.amount} ${cost.label}</span>`;
                }
                const available = resources[cost.key];
                if (available >= cost.amount) {
                  return `<span class="choice-chip choice-chip-cost">Cost ${cost.amount} ${cost.label} (have ${available})</span>`;
                }
                return `<span class="choice-chip choice-chip-risk">Need ${cost.amount} ${cost.label} (have ${available})</span>`;
              })
              .join('')
            : '';

        const benefitBadgeText = option.benefitHint?.trim() ?? '';
        const riskBadgeText = option.riskHint?.trim() ?? '';

        const benefitBadge = benefitBadgeText
          ? `<span class="choice-chip choice-chip-benefit">Upside: ${UI.escapeChoiceHtml(UI.normalizeChoiceText(benefitBadgeText))}</span>`
          : '';
        const riskBadge = riskBadgeText
          ? `<span class="choice-chip choice-chip-risk">Risk: ${UI.escapeChoiceHtml(UI.normalizeChoiceText(riskBadgeText))}</span>`
          : '';

        return `
          <button
            type="button"
            class="choice-option"
            data-choice-id="${UI.escapeChoiceHtml(option.id)}"
            data-affordability="${canCoverCosts ? 'ok' : 'short'}"
          >
            <span class="choice-index">${idx + 1}</span>
            <span class="choice-copy">
              <span class="choice-topline">
                <strong>${UI.escapeChoiceHtml(option.label)}</strong>
                ${affordabilityTag}
              </span>
              <em>${UI.escapeChoiceHtml(option.detail)}</em>
              <span class="choice-badges">
                ${costBadges}
                ${benefitBadge}
                ${riskBadge}
              </span>
            </span>
          </button>
        `;
      })
      .join('');

    this.choicePanelEl.innerHTML = `
      <div class="choice-shell">
        <h3>${UI.escapeChoiceHtml(title)}</h3>
        <p>${UI.escapeChoiceHtml(detail)}</p>
        ${resourcesHtml}
        <div class="choice-options">
          ${optionHtml}
        </div>
      </div>
    `;
    this.choicePanelEl.style.display = 'flex';

    return new Promise((resolve) => {
      const buttons = this.choicePanelEl?.querySelectorAll<HTMLElement>('.choice-option') ?? [];
      for (const btn of buttons) {
        btn.addEventListener('click', () => {
          const choiceId = btn.dataset.choiceId ?? options[0]?.id ?? '';
          this.hideChoicePrompt();
          resolve(choiceId);
        }, { once: true });
      }
    });
  }

  hideChoicePrompt(): void {
    if (!this.choicePanelEl) {
      this.choicePanelEl = document.getElementById('choice-panel');
    }
    if (!this.choicePanelEl) return;
    this.choicePanelEl.style.display = 'none';
    this.choicePanelEl.innerHTML = '';
  }

  /* ------------------------------------------------------------------ */
  /*  MAP CHOICE                                                         */
  /* ------------------------------------------------------------------ */

  private mapPanelEl: HTMLElement | null = null;

  private static ACT_TITLES = ['Open Waters', 'Contested Seas', 'The Gauntlet'];

  private static NODE_ICONS: Record<string, string> = {
    combat: '\u2694\uFE0F',    // crossed swords
    event: '\uD83D\uDCDC',     // scroll
    port: '\u2693',            // anchor
    contract: '\uD83E\uDD1D',  // handshake
    boss: '\uD83D\uDC80',      // skull
  };

  private static NODE_HINTS: Record<string, string> = {
    combat: 'Hostile waters ahead',
    event: 'Mysterious encounter',
    port: 'Safe harbor — repairs & crew',
    contract: 'Faction contract — risk & reward',
    boss: 'Flagship battle',
  };

  private static WEATHER_ICONS: Record<string, string> = {
    clear: '\u2600\uFE0F',
    foggy: '\uD83C\uDF2B\uFE0F',
    stormy: '\u26C8\uFE0F',
    night: '\uD83C\uDF19',
  };

  showMapChoice(
    available: MapNode[],
    currentWave: number,
    act: number,
    graph: MapGraph,
    regionLookup: (regionId: string) => { name: string; weatherBias: string[]; factionPressure: string[] } | null,
    factionName: (factionId: string) => string,
  ): Promise<string> {
    if (!this.mapPanelEl) {
      this.mapPanelEl = document.getElementById('map-panel');
    }
    if (!this.mapPanelEl) {
      return Promise.resolve(available[0]?.id ?? '');
    }

    const actTitle = UI.ACT_TITLES[act - 1] ?? `Act ${act}`;

    const cardsHtml = available.map((node) => {
      const icon = UI.NODE_ICONS[node.type] ?? '\u2753';
      const hint = UI.NODE_HINTS[node.type] ?? '';
      const region = regionLookup(node.regionId);
      const regionName = region?.name ?? node.regionId;
      const weather = region?.weatherBias?.[0] ?? '';
      const weatherIcon = UI.WEATHER_ICONS[weather] ?? '';
      const factionIds = region?.factionPressure ?? [];
      const factionLabel = factionIds.map(factionName).filter(Boolean).join(', ');
      const typeName = node.type.charAt(0).toUpperCase() + node.type.slice(1);

      return `
        <button type="button" class="map-card" data-node-id="${node.id}">
          <div class="map-card-icon">${icon}</div>
          <div class="map-card-type">${typeName}</div>
          <div class="map-card-region">${weatherIcon} ${regionName}</div>
          ${factionLabel ? `<div class="map-card-faction">${factionLabel}</div>` : ''}
          <div class="map-card-hint">${hint}</div>
        </button>
      `;
    }).join('');

    const minimapHtml = this.buildMinimap(graph, available);

    this.mapPanelEl.innerHTML = `
      <div class="map-act-banner">Act ${act} &mdash; ${actTitle}</div>
      <div class="map-act-subtitle">Wave ${currentWave} of ${WAVE_TABLE.length} &mdash; Choose yer heading</div>
      <div class="map-cards">${cardsHtml}</div>
      <button type="button" class="map-toggle-btn" id="map-toggle-btn">Show Map</button>
      <div id="run-map">${minimapHtml}</div>
    `;
    this.mapPanelEl.style.display = 'flex';

    // Wire toggle
    const toggleBtn = this.mapPanelEl.querySelector('#map-toggle-btn') as HTMLElement | null;
    const runMap = this.mapPanelEl.querySelector('#run-map') as HTMLElement | null;
    if (toggleBtn && runMap) {
      toggleBtn.addEventListener('click', () => {
        const isShown = runMap.classList.toggle('show');
        toggleBtn.textContent = isShown ? 'Hide Map' : 'Show Map';
      });
    }

    return new Promise((resolve) => {
      const buttons = this.mapPanelEl?.querySelectorAll<HTMLElement>('.map-card') ?? [];
      for (const btn of buttons) {
        btn.addEventListener('click', () => {
          const nodeId = btn.dataset.nodeId ?? available[0]?.id ?? '';
          this.hideMapChoice();
          resolve(nodeId);
        }, { once: true });
      }
    });
  }

  hideMapChoice(): void {
    if (!this.mapPanelEl) {
      this.mapPanelEl = document.getElementById('map-panel');
    }
    if (!this.mapPanelEl) return;
    this.mapPanelEl.style.display = 'none';
    this.mapPanelEl.innerHTML = '';
  }

  private buildMinimap(graph: MapGraph, available: MapNode[]): string {
    const availableIds = new Set(available.map((n) => n.id));
    let html = '<div class="minimap-acts">';

    for (let a = 0; a < graph.acts.length; a++) {
      const act = graph.acts[a];
      if (a > 0) html += '<div class="minimap-act-divider"></div>';

      html += '<div class="minimap-act">';
      html += `<div class="minimap-act-label">Act ${act.actNumber}</div>`;
      html += '<div class="minimap-layers">';

      for (let L = 0; L < act.layers.length; L++) {
        html += '<div class="minimap-layer">';
        for (const node of act.layers[L]) {
          const icon = UI.NODE_ICONS[node.type] ?? '?';
          let cls = 'minimap-node';
          if (node.id === graph.currentNodeId) cls += ' current';
          else if (node.visited) cls += ' visited';
          else if (availableIds.has(node.id)) cls += ' available';
          html += `<div class="${cls}" title="${node.label}">${icon}</div>`;
        }
        html += '</div>';
      }

      html += '</div></div>';
    }

    html += '</div>';
    return html;
  }

  /* ------------------------------------------------------------------ */
  /*  CODEX                                                              */
  /* ------------------------------------------------------------------ */

  showCodex(view: CodexViewModel): void {
    if (!this.codexPanelEl) {
      this.codexPanelEl = document.getElementById('codex-panel');
    }
    if (!this.codexSummaryEl) {
      this.codexSummaryEl = document.getElementById('codex-summary');
    }
    if (!this.codexSectionsEl) {
      this.codexSectionsEl = document.getElementById('codex-sections');
    }
    if (!this.codexPanelEl || !this.codexSummaryEl || !this.codexSectionsEl) return;

    const sectionOptions = view.sections
      .map((section) => `<option value="${section.title.toLowerCase()}">${section.title}</option>`)
      .join('');

    this.codexSummaryEl.innerHTML = `
      <div class="codex-progress">
        <div class="codex-progress-fill" style="width:${Math.max(0, Math.min(100, view.completionPct))}%;"></div>
      </div>
      <div class="codex-progress-label">${view.discovered} / ${view.total} entries discovered (${view.completionPct}%)</div>
      <div style="display:grid;grid-template-columns:minmax(140px,1fr) auto auto;gap:8px;margin-top:10px;">
        <input
          id="codex-filter-search"
          type="text"
          placeholder="Search codex..."
          style="background:rgba(10,16,24,0.9);color:#dfe8f8;border:1px solid rgba(95,126,170,0.55);border-radius:6px;padding:8px 10px;font-size:13px;"
        />
        <select id="codex-filter-visibility" style="background:rgba(10,16,24,0.9);color:#dfe8f8;border:1px solid rgba(95,126,170,0.55);border-radius:6px;padding:8px 10px;font-size:12px;">
          <option value="all">All</option>
          <option value="unlocked">Unlocked</option>
          <option value="locked">Locked</option>
        </select>
        <select id="codex-filter-section" style="background:rgba(10,16,24,0.9);color:#dfe8f8;border:1px solid rgba(95,126,170,0.55);border-radius:6px;padding:8px 10px;font-size:12px;">
          <option value="all">All Sections</option>
          ${sectionOptions}
        </select>
      </div>
      <div id="codex-filter-count" style="margin-top:8px;font-size:11px;color:rgba(199,214,236,0.85);"></div>
    `;

    this.codexSectionsEl.innerHTML = view.sections
      .map(section => `
        <section class="codex-section" data-section="${section.title.toLowerCase()}">
          <header>
            <h3>${section.title}</h3>
            <span>${section.discovered}/${section.total}</span>
          </header>
          <div class="codex-entry-list">
            ${section.entries
      .map(entry => `
                <article
                  class="codex-entry${entry.unlocked ? ' unlocked' : ' locked'}"
                  data-codex-id="${entry.id}"
                  data-codex-unlocked="${entry.unlocked ? '1' : '0'}"
                  data-codex-search="${encodeURIComponent(`${entry.name} ${entry.detail}`.toLowerCase())}"
                >
                  <div class="codex-entry-name">${entry.unlocked ? entry.name : 'Unknown Entry'}</div>
                  <div class="codex-entry-detail">${entry.unlocked ? entry.detail : 'Discover this by sailing further.'}</div>
                </article>
              `)
      .join('')}
          </div>
        </section>
      `)
      .join('');

    const searchInput = document.getElementById('codex-filter-search') as HTMLInputElement | null;
    const visibilityFilter = document.getElementById('codex-filter-visibility') as HTMLSelectElement | null;
    const sectionFilter = document.getElementById('codex-filter-section') as HTMLSelectElement | null;
    const countEl = document.getElementById('codex-filter-count');
    const applyFilters = () => {
      const query = (searchInput?.value ?? '').trim().toLowerCase();
      const visibility = visibilityFilter?.value ?? 'all';
      const activeSection = sectionFilter?.value ?? 'all';
      let visibleEntries = 0;

      const sections = this.codexSectionsEl?.querySelectorAll<HTMLElement>('.codex-section') ?? [];
      for (const section of sections) {
        const sectionId = section.dataset.section ?? '';
        const inSectionScope = activeSection === 'all' || sectionId === activeSection;
        let visibleInSection = 0;
        const entries = section.querySelectorAll<HTMLElement>('.codex-entry');
        for (const entry of entries) {
          const unlocked = entry.dataset.codexUnlocked === '1';
          const searchRaw = entry.dataset.codexSearch ?? '';
          const searchBlob = decodeURIComponent(searchRaw);
          const queryMatch = query.length === 0 || searchBlob.includes(query);
          const visibilityMatch = visibility === 'all'
            || (visibility === 'unlocked' && unlocked)
            || (visibility === 'locked' && !unlocked);
          const visible = inSectionScope && queryMatch && visibilityMatch;
          entry.style.display = visible ? '' : 'none';
          if (visible) {
            visibleInSection++;
            visibleEntries++;
          }
        }
        section.style.display = visibleInSection > 0 ? '' : 'none';
      }

      if (countEl) {
        countEl.textContent = `${visibleEntries} entries shown`;
      }
    };

    searchInput?.addEventListener('input', applyFilters);
    visibilityFilter?.addEventListener('change', applyFilters);
    sectionFilter?.addEventListener('change', applyFilters);
    applyFilters();

    this.codexPanelEl.style.display = 'flex';
  }

  showCodexDiscoverySpotlight(title: string): void {
    const host = document.getElementById('ui') ?? document.body;
    let toast = document.getElementById('codex-discovery-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'codex-discovery-toast';
      toast.style.cssText = `
        position:fixed;
        top:18%;
        left:50%;
        transform:translate(-50%, -8px);
        pointer-events:none;
        background:rgba(10, 18, 34, 0.95);
        border:1px solid rgba(126, 183, 242, 0.65);
        border-radius:10px;
        padding:10px 14px;
        min-width:min(86vw, 380px);
        text-align:center;
        z-index:145;
        opacity:0;
        transition:opacity 0.25s ease, transform 0.25s ease;
        box-shadow:0 14px 30px rgba(0,0,0,0.45);
      `;
      host.appendChild(toast);
    }

    toast.innerHTML = `
      <div style="font-size:0.7rem;letter-spacing:0.09em;text-transform:uppercase;color:rgba(158,206,255,0.78);">Codex Discovery</div>
      <div style="font-size:1rem;color:#d4e7ff;margin-top:4px;">${title}</div>
    `;

    if (this.codexDiscoveryTimeout) clearTimeout(this.codexDiscoveryTimeout);
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, 0)';
    this.codexDiscoveryTimeout = setTimeout(() => {
      toast!.style.opacity = '0';
      toast!.style.transform = 'translate(-50%, -8px)';
    }, 5000);
  }

  hideCodex(): void {
    if (!this.codexPanelEl) {
      this.codexPanelEl = document.getElementById('codex-panel');
    }
    if (this.codexPanelEl) {
      this.codexPanelEl.style.display = 'none';
    }
  }

  onCodexClose(callback: () => void): void {
    const closeBtn = document.getElementById('codex-close');
    if (!closeBtn) return;
    const newBtn = closeBtn.cloneNode(true) as HTMLElement;
    closeBtn.parentNode?.replaceChild(newBtn, closeBtn);
    newBtn.addEventListener('click', callback, { once: true });
  }

  /* ------------------------------------------------------------------ */
  /*  RUN SUMMARY / VICTORY                                              */
  /* ------------------------------------------------------------------ */

  showRunSummary(
    stats: RunStats,
    unlocks: string[],
    v2Meta?: {
      codexCount?: number;
      hostileFactionId?: string | null;
      hostileFactionScore?: number | null;
      alliedFactionId?: string | null;
      alliedFactionScore?: number | null;
      doctrineName?: string | null;
      seed?: number;
    },
  ): void {
    if (!this.runSummaryEl) {
      this.runSummaryEl = document.getElementById('run-summary');
    }
    if (!this.runSummaryEl) return;

    // Title
    const titleEl = document.getElementById('run-summary-title');
    if (titleEl) {
      if (stats.victory) {
        titleEl.textContent = 'Victory!';
        titleEl.className = 'victory';
      } else {
        titleEl.textContent = 'Ye Been Sunk!';
        titleEl.className = 'defeat';
      }
    }

    // Stats grid
    const statsEl = document.getElementById('run-stats');
    if (statsEl) {
      const minutes = Math.floor(stats.timePlayed / 60);
      const seconds = Math.floor(stats.timePlayed % 60);
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      const rows = [
        ['Gold Earned', stats.gold.toLocaleString()],
        ['Ships Destroyed', String(stats.shipsDestroyed)],
        ['Waves Completed', String(stats.wavesCompleted)],
        ['Max Combo', `${stats.maxCombo}x`],
        ['Damage Dealt', stats.damageDealt.toLocaleString()],
        ['Damage Taken', stats.damageTaken.toLocaleString()],
        ['Events Completed', String(stats.eventsCompleted)],
        ['Treasures Found', String(stats.treasuresFound)],
        ['Crew Hired', String(stats.crewHired)],
        ['Time Played', timeStr],
        ['Ship Class', stats.shipClass.charAt(0).toUpperCase() + stats.shipClass.slice(1)],
      ];

      if (stats.finalHeatLevel) {
        rows.push(['Notoriety', stats.finalHeatLevel]);
      }

      if (typeof v2Meta?.codexCount === 'number') {
        rows.push(['Codex Entries', String(v2Meta.codexCount)]);
      }
      if (v2Meta?.doctrineName) {
        rows.push(['Doctrine', v2Meta.doctrineName]);
      }
      if (v2Meta?.hostileFactionId) {
        const hostileName = v2Meta.hostileFactionId
          .split('_')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
        rows.push([
          'Most Hostile Faction',
          `${hostileName} (${Math.round(v2Meta.hostileFactionScore ?? 0)})`,
        ]);
      }
      if (v2Meta?.alliedFactionId) {
        const alliedName = v2Meta.alliedFactionId
          .split('_')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
        rows.push([
          'Most Allied Faction',
          `${alliedName} (${Math.round(v2Meta.alliedFactionScore ?? 0)})`,
        ]);
      }
      if (v2Meta?.seed != null) {
        rows.push(['Seed', v2Meta.seed.toString(16).toUpperCase()]);
      }

      statsEl.innerHTML = rows
        .map(
          ([label, value]) => `
          <div class="run-stat-row">
            <span class="run-stat-label">${label}</span>
            <span class="run-stat-value">${value}</span>
          </div>
        `
        )
        .join('');
    }

    // Unlock announcements
    const unlockEl = document.getElementById('unlock-announcements');
    if (unlockEl) {
      if (unlocks.length > 0) {
        unlockEl.innerHTML = unlocks
          .map((u) => `<div class="unlock-item">Unlocked: ${u}</div>`)
          .join('');
      } else {
        unlockEl.innerHTML = '';
      }
    }

    // Show/hide endless mode button
    const endlessBtn = document.getElementById('run-summary-endless');
    if (endlessBtn) {
      endlessBtn.style.display = stats.victory ? 'inline-block' : 'none';
    }

    this.runSummaryEl.style.display = 'flex';
  }

  hideRunSummary(): void {
    if (!this.runSummaryEl) {
      this.runSummaryEl = document.getElementById('run-summary');
    }
    if (this.runSummaryEl) {
      this.runSummaryEl.style.display = 'none';
    }
  }

  /** Wire up the "Play Again" button in the run summary. */
  onRunSummaryRestart(callback: () => void): void {
    const btn = document.getElementById('run-summary-restart');
    if (btn) {
      const newBtn = btn.cloneNode(true) as HTMLElement;
      btn.parentNode?.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', callback, { once: true });
    }
  }

  /** Wire up the "Endless Mode" button in the run summary. */
  onRunSummaryEndless(callback: () => void): void {
    const btn = document.getElementById('run-summary-endless');
    if (btn) {
      const newBtn = btn.cloneNode(true) as HTMLElement;
      btn.parentNode?.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', callback, { once: true });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  CREW HUD                                                           */
  /* ------------------------------------------------------------------ */

  updateCrewHUD(crew: { role: string; level: number; icon: string }[]): void {
    if (!this.crewHudEl) {
      this.crewHudEl = document.getElementById('crew-hud');
    }
    if (!this.crewHudEl) return;

    this.crewHudEl.innerHTML = '';

    for (const member of crew) {
      const el = document.createElement('div');
      el.className = 'crew-hud-icon';
      el.title = `${member.role} (Lv ${member.level})`;
      el.innerHTML = `
        <span class="crew-emoji">${member.icon}</span>
        <span class="crew-level">${member.level}</span>
      `;
      this.crewHudEl.appendChild(el);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  EVENT WARNING                                                      */
  /* ------------------------------------------------------------------ */

  showEventWarning(message: string): void {
    if (!this.eventWarningEl) {
      this.eventWarningEl = document.getElementById('event-warning');
    }
    if (!this.eventWarningEl) return;

    if (this.eventWarningTimeout) {
      clearTimeout(this.eventWarningTimeout);
    }

    this.eventWarningEl.textContent = message;
    this.eventWarningEl.style.display = 'block';

    this.eventWarningTimeout = setTimeout(() => {
      this.hideEventWarning();
    }, 6000);
  }

  hideEventWarning(): void {
    if (this.eventWarningTimeout) {
      clearTimeout(this.eventWarningTimeout);
      this.eventWarningTimeout = null;
    }
    if (!this.eventWarningEl) {
      this.eventWarningEl = document.getElementById('event-warning');
    }
    if (this.eventWarningEl) {
      this.eventWarningEl.style.display = 'none';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  EVENT TIMER                                                        */
  /* ------------------------------------------------------------------ */

  showEventTimer(eventName: string, remaining: number, total: number): void {
    if (!this.eventTimerEl) {
      this.eventTimerEl = document.getElementById('event-timer');
    }
    if (!this.eventTimerEl) return;

    // Build DOM structure once, then update values
    if (!this.eventTimerNameEl) {
      this.eventTimerEl.innerHTML = `
        <div class="event-timer-name"></div>
        <div class="event-timer-track">
          <div class="event-timer-fill"></div>
        </div>
        <div class="event-timer-countdown"></div>
      `;
      this.eventTimerNameEl = this.eventTimerEl.querySelector('.event-timer-name');
      this.eventTimerFillEl = this.eventTimerEl.querySelector('.event-timer-fill');
      this.eventTimerCountdownEl = this.eventTimerEl.querySelector('.event-timer-countdown');
      this.lastEventTimerSec = -1;
      this.lastEventTimerPct = -1;
    }

    this.eventTimerEl.style.display = 'block';
    const EVENT_LABELS: Record<string, string> = {
      kraken: 'Kraken Assault',
      whirlpool: 'Whirlpool',
      ghost_ship_event: 'Ghost Ship',
      sea_serpent: 'Sea Serpent',
      storm_surge: 'Storm Surge',
      treasure_map: 'Treasure Map',
    };
    this.eventTimerNameEl!.textContent = EVENT_LABELS[eventName] ?? eventName;

    const countdownSec = Math.ceil(remaining);
    if (countdownSec !== this.lastEventTimerSec) {
      this.lastEventTimerSec = countdownSec;
      this.eventTimerCountdownEl!.textContent = `${countdownSec}s`;
    }

    const pctRounded = Math.round(Math.max(0, Math.min(1, remaining / total)) * 100);
    if (pctRounded !== this.lastEventTimerPct) {
      this.lastEventTimerPct = pctRounded;
      this.eventTimerFillEl!.style.width = `${pctRounded}%`;
    }
  }

  hideEventTimer(): void {
    if (!this.eventTimerEl) {
      this.eventTimerEl = document.getElementById('event-timer');
    }
    if (this.eventTimerEl) {
      this.eventTimerEl.style.display = 'none';
    }
    this.eventTimerNameEl = null;
    this.eventTimerFillEl = null;
    this.eventTimerCountdownEl = null;
  }

  /* ------------------------------------------------------------------ */
  /*  TREASURE MAP INDICATOR                                             */
  /* ------------------------------------------------------------------ */

  showTreasureMapIndicator(): void {
    if (!this.treasureMapEl) {
      this.treasureMapEl = document.getElementById('treasure-map-indicator');
    }
    if (this.treasureMapEl) {
      this.treasureMapEl.style.display = 'block';
    }
  }

  hideTreasureMapIndicator(): void {
    if (!this.treasureMapEl) {
      this.treasureMapEl = document.getElementById('treasure-map-indicator');
    }
    if (this.treasureMapEl) {
      this.treasureMapEl.style.display = 'none';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  CAPTAIN'S JOURNAL (Persistent Log)                                 */
  /* ------------------------------------------------------------------ */

  addJournalEntry(message: string, tone: CaptainLogTone = 'neutral'): void {
    if (this.screensaverMode) return;
    const text = message.trim();
    if (!text) return;

    // Get current time for timestamp
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Add to entries array
    this.journalEntries.push({ message: text, tone, timestamp });

    // Trim to max entries
    if (this.journalEntries.length > this.maxJournalEntries) {
      this.journalEntries.shift();
    }

    this.renderJournal();
  }

  clearCaptainLog(): void {
    this.journalEntries = [];
    if (this.captainsJournalEl) {
      this.captainsJournalEl.classList.remove('show');
    }
    if (this.journalEntriesEl) {
      this.journalEntriesEl.innerHTML = '';
    }
  }

  private renderJournal(): void {
    if (!this.captainsJournalEl) {
      this.captainsJournalEl = document.getElementById('captains-journal');
    }
    if (!this.journalEntriesEl) {
      this.journalEntriesEl = document.getElementById('journal-entries');
    }
    if (!this.captainsJournalEl || !this.journalEntriesEl) return;

    // Show the journal container
    this.captainsJournalEl.classList.add('show');

    // Render entries
    this.journalEntriesEl.innerHTML = this.journalEntries
      .map((entry) => {
        const toneClass = entry.tone !== 'neutral' ? `tone-${entry.tone}` : 'tone-neutral';
        return `
          <div class="journal-entry ${toneClass}">
            <div class="journal-timestamp">${entry.timestamp}</div>
            <div>${this.escapeHtml(entry.message)}</div>
          </div>
        `;
      })
      .join('');

    // Auto-scroll to bottom
    this.journalEntriesEl.scrollTop = this.journalEntriesEl.scrollHeight;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ------------------------------------------------------------------ */
  /*  PORT CREW HIRING                                                   */
  /* ------------------------------------------------------------------ */

  showPortCrewHire(
    availableRoles: {
      role: string;
      name: string;
      icon: string;
      cost: number;
      bonusPerLevel: string;
    }[],
    gold: number,
    onHire: (role: string) => void
  ): void {
    if (!this.portCrewHireEl) {
      this.portCrewHireEl = document.getElementById('port-crew-hire');
    }
    if (!this.portCrewHireEl) return;

    this.portCrewHireEl.innerHTML = '';

    const heading = document.createElement('h3');
    heading.textContent = 'Tavern - Hire Crew';
    this.portCrewHireEl.appendChild(heading);

    const container = document.createElement('div');
    container.className = 'crew-hire-cards';

    for (const role of availableRoles) {
      const card = document.createElement('div');
      const canAfford = gold >= role.cost;
      card.className = 'crew-hire-card' + (canAfford ? '' : ' disabled');

      card.innerHTML = `
        <div class="hire-icon">${role.icon}</div>
        <div class="hire-name">${role.name}</div>
        <div class="hire-bonus">${role.bonusPerLevel}</div>
        <div class="hire-cost">${role.cost}g</div>
      `;

      if (canAfford) {
        card.addEventListener('click', () => onHire(role.role));
      }

      container.appendChild(card);
    }

    this.portCrewHireEl.appendChild(container);
  }

  hidePortCrewHire(): void {
    if (!this.portCrewHireEl) {
      this.portCrewHireEl = document.getElementById('port-crew-hire');
    }
    if (this.portCrewHireEl) {
      this.portCrewHireEl.innerHTML = '';
    }
  }

  // ---------------------------------------------------------------
  //  Editor mode: hide/show all game HUD elements
  // ---------------------------------------------------------------

  private savedDisplays = new Map<HTMLElement, string>();

  hideAll(): void {
    const els = [
      this.scoreEl,
      this.compassEl,
      this.controlsEl,
      this.healthBar,
      this.waveCounter,
      this.bossHealthBar,
      this.crewHudEl,
      this.captainsJournalEl,
      this.v2ResourcesEl,
      this.v2FactionEl,
      this.eventTimerEl,
      this.treasureMapEl,
      this.minimapCanvas?.parentElement ?? null,
      this.comboEl,
      this.captureEl,
      this.distanceEl,
      this.btnPort,
      this.btnStarboard,
    ];
    for (const el of els) {
      if (!el) continue;
      this.savedDisplays.set(el, el.style.display);
      el.style.display = 'none';
    }
  }

  showAll(): void {
    for (const [el, display] of this.savedDisplays) {
      el.style.display = display;
    }
    this.savedDisplays.clear();
  }
}
