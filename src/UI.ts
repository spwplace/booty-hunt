import type { ShipClass, ShipClassConfig, RunStats } from './Types';

export class UI {
  private titleEl: HTMLElement;
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private compassEl: HTMLElement;
  private arrowEl: HTMLElement;
  private distanceEl: HTMLElement;
  private captureEl: HTMLElement;
  private vignetteEl: HTMLElement;
  private controlsEl: HTMLElement;
  private captureTimeout: ReturnType<typeof setTimeout> | null = null;
  private comboTimeout: ReturnType<typeof setTimeout> | null = null;

  // Health bar elements
  private healthBar: HTMLElement | null = null;
  private healthFill: HTMLElement | null = null;
  private lastHealth: number = -1;

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

  // Mobile cannon buttons
  private btnPort: HTMLElement | null = null;
  private btnStarboard: HTMLElement | null = null;

  // Boss health bar elements
  private bossHealthBar: HTMLElement | null = null;
  private bossHealthFill: HTMLElement | null = null;
  private bossNameLabel: HTMLElement | null = null;

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

  // Animated score
  private displayedScore: number = 0;
  private actualScore: number = 0;
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
  private treasureMapEl: HTMLElement | null = null;
  private portCrewHireEl: HTMLElement | null = null;

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
  }

  /* ------------------------------------------------------------------ */
  /*  ORIGINAL METHODS - preserved with identical behavior               */
  /* ------------------------------------------------------------------ */

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
    this.scoreEl.innerHTML = `<span class="label">Gold Plundered</span>${score.toLocaleString()}`;
  }

  updateCompass(angle: number) {
    this.arrowEl.style.transform = `translateX(-50%) rotate(${angle}rad)`;
  }

  updateDistance(dist: number) {
    this.distanceEl.textContent = `${Math.round(dist)} leagues`;
  }

  showCapture(text: string, combo: number) {
    if (this.captureTimeout) clearTimeout(this.captureTimeout);
    this.captureEl.textContent = text;
    this.captureEl.classList.add('show');
    this.captureTimeout = setTimeout(() => {
      this.captureEl.classList.remove('show');
    }, 1400);

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
    if (!this.healthFill || !this.healthBar) return;

    const pct = Math.max(0, Math.min(1, current / max)) * 100;

    // Determine color based on percentage
    let color: string;
    if (pct > 60) {
      color = '#4caf50'; // green
    } else if (pct > 30) {
      color = '#ffeb3b'; // yellow
    } else {
      color = '#f44336'; // red
    }

    this.healthFill.style.width = `${pct}%`;
    this.healthFill.style.backgroundColor = color;
    this.healthFill.style.transition = 'width 0.3s ease, background-color 0.3s ease';

    // Flash red on damage (health decreased)
    if (this.lastHealth >= 0 && current < this.lastHealth) {
      this.healthBar.classList.add('damage');
      setTimeout(() => {
        this.healthBar?.classList.remove('damage');
      }, 300);
    }

    this.lastHealth = current;
  }

  /* ------------------------------------------------------------------ */
  /*  WAVE DISPLAY                                                       */
  /* ------------------------------------------------------------------ */

  showWaveAnnouncement(wave: number) {
    if (!this.waveAnnounce) return;

    // Clear any previous announcement timer
    if (this.waveAnnounceTimeout) {
      clearTimeout(this.waveAnnounceTimeout);
      this.waveAnnounceTimeout = null;
    }

    const isBoss = wave % 5 === 0;
    const label = isBoss ? `WAVE ${wave} - BOSS WAVE!` : `WAVE ${wave}`;

    this.waveAnnounce.textContent = label;
    this.waveAnnounce.style.color = isBoss ? '#f44336' : '';

    // Fade in
    this.waveAnnounce.classList.add('show');

    // Hold 2s then fade out
    this.waveAnnounceTimeout = setTimeout(() => {
      this.waveAnnounce?.classList.remove('show');
      this.waveAnnounceTimeout = null;
    }, 2000);
  }

  updateWaveCounter(wave: number, shipsLeft: number, shipsTotal: number) {
    if (!this.waveCounter) return;
    this.waveCounter.textContent = `Wave ${wave} - Ships: ${shipsLeft}/${shipsTotal}`;
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

        // Tier styling
        const tier = upgrade.tier || 'common';
        let tierBadge = '';
        let borderColor = 'rgba(255,255,255,0.3)';
        let glowStyle = '';

        if (tier === 'rare') {
          borderColor = '#4fc3f7';
          glowStyle = 'box-shadow: 0 0 12px rgba(79,195,247,0.5), inset 0 0 8px rgba(79,195,247,0.15);';
          tierBadge = `<div style="
            position:absolute; top:6px; right:6px;
            font-size:10px; text-transform:uppercase; letter-spacing:1px;
            color:#4fc3f7; background:rgba(0,0,0,0.5);
            padding:2px 6px; border-radius:3px; border:1px solid #4fc3f7;
          ">Rare</div>`;
        } else if (tier === 'legendary') {
          borderColor = '#ffd700';
          glowStyle = 'box-shadow: 0 0 16px rgba(255,215,0,0.6), inset 0 0 10px rgba(255,215,0,0.15);';
          tierBadge = `<div style="
            position:absolute; top:6px; right:6px;
            font-size:10px; text-transform:uppercase; letter-spacing:1px;
            color:#ffd700; background:rgba(0,0,0,0.5);
            padding:2px 6px; border-radius:3px; border:1px solid #ffd700;
          ">Legendary</div>`;
        } else {
          tierBadge = `<div style="
            position:absolute; top:6px; right:6px;
            font-size:10px; text-transform:uppercase; letter-spacing:1px;
            color:rgba(255,255,255,0.6); background:rgba(0,0,0,0.4);
            padding:2px 6px; border-radius:3px; border:1px solid rgba(255,255,255,0.3);
          ">Common</div>`;
        }

        card.style.border = `2px solid ${borderColor}`;
        card.style.cssText += glowStyle;
        card.style.position = 'relative';

        const statPreview = upgrade.stat
          ? `<div class="upgrade-stat" style="font-size:11px;color:#aaa;margin-top:4px;">${upgrade.stat}</div>`
          : '';

        card.innerHTML = `
          ${tierBadge}
          <div class="upgrade-icon">${upgrade.icon}</div>
          <div class="upgrade-name">${upgrade.name}</div>
          <div class="upgrade-desc">${upgrade.description}</div>
          ${statPreview}
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
    score: number,
    wave: number,
    highScore: number,
    highWave: number
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.gameOverEl) {
        resolve();
        return;
      }

      // Build content
      this.gameOverEl.innerHTML = `
        <div class="game-over-content">
          <h1 class="game-over-title">YE BEEN SUNK!</h1>
          <div class="game-over-stats">
            <div class="stat-row">
              <span class="stat-label">Final Score</span>
              <span class="stat-value">${score.toLocaleString()}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Wave Reached</span>
              <span class="stat-value">${wave}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">High Score</span>
              <span class="stat-value">${highScore.toLocaleString()}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Best Wave</span>
              <span class="stat-value">${highWave}</span>
            </div>
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
        // Fallback if button somehow doesn't exist
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
    if (this.cooldownPort) {
      this.cooldownPort.classList.toggle('ready', portReady);
      this.cooldownPort.classList.toggle('reloading', !portReady);
    }
    if (this.cooldownStarboard) {
      this.cooldownStarboard.classList.toggle('ready', starboardReady);
      this.cooldownStarboard.classList.toggle('reloading', !starboardReady);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  MOBILE CANNON BUTTONS                                              */
  /* ------------------------------------------------------------------ */

  showMobileCannonButtons(
    onPort?: () => void,
    onStarboard?: () => void
  ) {
    if (this.btnPort) {
      this.btnPort.classList.add('show');
      if (onPort) {
        this.btnPort.addEventListener('touchstart', (e) => {
          e.preventDefault();
          onPort();
        }, { passive: false });
      }
    }
    if (this.btnStarboard) {
      this.btnStarboard.classList.add('show');
      if (onStarboard) {
        this.btnStarboard.addEventListener('touchstart', (e) => {
          e.preventDefault();
          onStarboard();
        }, { passive: false });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  ANIMATED SCORE                                                     */
  /* ------------------------------------------------------------------ */

  updateScoreAnimated(score: number) {
    this.actualScore = score;
  }

  updateScoreDisplay(dt: number) {
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

    if (this.bossNameLabel) {
      this.bossNameLabel.textContent = name;
    }
    this.bossHealthBar.style.display = 'block';
    this.bossHealthBar.style.opacity = '1';
  }

  updateBossHealth(current: number, max: number) {
    if (!this.bossHealthFill) return;

    const pct = Math.max(0, Math.min(1, current / max)) * 100;
    this.bossHealthFill.style.width = `${pct}%`;

    // Color shift based on health
    if (pct > 50) {
      this.bossHealthFill.style.backgroundColor = '#f44336';
    } else if (pct > 25) {
      this.bossHealthFill.style.backgroundColor = '#ff9800';
    } else {
      this.bossHealthFill.style.backgroundColor = '#ff5252';
    }

    this.bossHealthFill.style.transition = 'width 0.3s ease, background-color 0.3s ease';

    // Phase line at 50%
    if (this.bossHealthBar) {
      let phaseLine = this.bossHealthBar.querySelector('.boss-phase-line') as HTMLElement | null;
      if (!phaseLine) {
        phaseLine = document.createElement('div');
        phaseLine.className = 'boss-phase-line';
        phaseLine.style.cssText = `
          position:absolute; left:50%; top:0; bottom:0; width:2px;
          background:rgba(255,255,255,0.5); pointer-events:none; z-index:1;
        `;
        this.bossHealthBar.style.position = 'relative';
        this.bossHealthBar.appendChild(phaseLine);
      }
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

  showWavePreview(wave: number, weather: string, totalShips: number, armedPercent: number) {
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

    this.wavePreview.innerHTML = `
      <div style="font-size:28px;font-weight:bold;letter-spacing:2px;margin-bottom:6px;">
        Wave ${wave}
      </div>
      <div style="font-size:16px;color:#ccc;">
        ${emoji} ${weatherLabel} &mdash; ${totalShips} Ships &mdash; ${Math.round(armedPercent * 100)}% Armed
      </div>
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
    entities: Array<{ x: number; z: number; type: 'merchant' | 'escort' | 'boss' }>,
    cursedCompass = false,
  ) {
    this.minimapFrame++;
    if (this.minimapFrame % 3 !== 0) return;

    if (!this.minimapCanvas || !this.minimapCtx) {
      this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
      if (this.minimapCanvas) this.minimapCtx = this.minimapCanvas.getContext('2d');
      if (!this.minimapCanvas || !this.minimapCtx) return;
    }

    const ctx = this.minimapCtx;
    const w = 130;
    const h = 130;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.5; // 1 unit = ~0.5px

    // Clear with dark translucent background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 10, 20, 0.75)';
    ctx.beginPath();
    ctx.arc(cx, cy, cx, 0, Math.PI * 2);
    ctx.fill();

    // Range circle
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 4, 0, Math.PI * 2);
    ctx.stroke();

    // Inner range circle (half)
    ctx.beginPath();
    ctx.arc(cx, cy, (cx - 4) / 2, 0, Math.PI * 2);
    ctx.stroke();

    // Entity dots
    for (const e of entities) {
      const dx = (e.x - playerPos.x) * scale;
      const dz = (e.z - playerPos.z) * scale;
      const ex = cx + dx;
      const ey = cy + dz;

      // Skip if outside minimap circle (unless cursed compass shows all)
      const distFromCenter = Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2);
      if (distFromCenter > cx - 4) {
        if (!cursedCompass) continue;
        // Clamp to edge for cursed compass
        const clampDist = cx - 6;
        const angle = Math.atan2(ey - cy, ex - cx);
        // Draw as small indicator at edge -- handled below with clamped coords
        ctx.fillStyle = e.type === 'boss' ? '#ff1744' : e.type === 'escort' ? '#ff6666' : '#ffffff';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * clampDist, cy + Math.sin(angle) * clampDist, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }

      if (e.type === 'boss') {
        ctx.fillStyle = '#ff1744';
        ctx.beginPath();
        ctx.arc(ex, ey, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'escort') {
        ctx.fillStyle = '#ff5252';
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(ex, ey, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player triangle (gold, rotated)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(playerAngle);
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 4);
    ctx.lineTo(4, 4);
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
    }, 2000);
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
    onSetSail: () => void
  ) {
    if (!this.portOverlay) {
      this.portOverlay = document.getElementById('port-overlay');
    }
    if (!this.portOverlay) return;

    const hpPct = Math.max(0, Math.min(1, currentHp / maxHp)) * 100;
    const repairCost = 100;
    const fullRepairCost = Math.ceil((maxHp - currentHp) * 10);

    this.portOverlay.innerHTML = `
      <div style="
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        width:100%; height:100%; padding:20px; box-sizing:border-box;
      ">
        <h1 style="
          font-size:36px; color:#ffd700; text-shadow:0 0 12px rgba(255,215,0,0.5);
          margin-bottom:20px; letter-spacing:3px;
        ">PORT</h1>

        <div style="
          display:flex; gap:24px; width:100%; max-width:800px;
          flex:1; min-height:0; margin-bottom:16px;
        ">
          <!-- Shop Panel (Left) -->
          <div style="
            flex:1; background:rgba(0,0,0,0.6); border:1px solid rgba(255,215,0,0.3);
            border-radius:8px; padding:14px; display:flex; flex-direction:column;
          ">
            <h2 style="color:#ffd700;font-size:18px;margin:0 0 10px 0;text-align:center;">Shop</h2>
            <div id="port-shop-list" style="
              flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px;
            "></div>
          </div>

          <!-- Repair Panel (Right) -->
          <div style="
            width:260px; background:rgba(0,0,0,0.6); border:1px solid rgba(255,215,0,0.3);
            border-radius:8px; padding:14px; display:flex; flex-direction:column; align-items:center;
          ">
            <h2 style="color:#ffd700;font-size:18px;margin:0 0 12px 0;">Repair</h2>

            <!-- HP bar -->
            <div style="
              width:100%; height:18px; background:rgba(0,0,0,0.5);
              border:1px solid rgba(255,255,255,0.2); border-radius:4px;
              overflow:hidden; margin-bottom:6px;
            ">
              <div id="port-hp-fill" style="
                width:${hpPct}%; height:100%;
                background:${hpPct > 60 ? '#4caf50' : hpPct > 30 ? '#ffeb3b' : '#f44336'};
                transition: width 0.3s ease;
              "></div>
            </div>
            <div id="port-hp-text" style="color:#ccc;font-size:13px;margin-bottom:14px;">
              ${currentHp} / ${maxHp} HP
            </div>

            <button id="port-repair-btn" style="
              width:100%; padding:10px; margin-bottom:8px;
              background:rgba(76,175,80,0.3); border:1px solid #4caf50;
              color:white; font-size:14px; border-radius:4px; cursor:pointer;
            ">Repair 10 HP (${repairCost}g)</button>

            <button id="port-full-repair-btn" style="
              width:100%; padding:10px;
              background:rgba(33,150,243,0.3); border:1px solid #2196f3;
              color:white; font-size:14px; border-radius:4px; cursor:pointer;
            ">Full Repair (${fullRepairCost}g)</button>
          </div>
        </div>

        <!-- Bottom bar -->
        <div style="
          display:flex; align-items:center; justify-content:space-between;
          width:100%; max-width:800px;
        ">
          <div id="port-gold-display" style="
            color:#ffd700; font-size:20px; font-weight:bold;
            text-shadow:0 0 8px rgba(255,215,0,0.4);
          ">${gold.toLocaleString()} Gold</div>

          <button id="port-set-sail-btn" style="
            padding:12px 32px; background:rgba(255,215,0,0.2);
            border:2px solid #ffd700; color:#ffd700; font-size:18px;
            font-weight:bold; border-radius:6px; cursor:pointer;
            letter-spacing:2px; text-transform:uppercase;
          ">Set Sail</button>
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

        item.style.cssText = `
          display:flex; align-items:center; gap:10px;
          padding:8px 10px; background:rgba(0,0,0,0.4);
          border:1px solid ${tierColor}; border-radius:4px;
          cursor:pointer; transition: background 0.2s; ${tierGlow}
        `;

        item.innerHTML = `
          <div style="font-size:22px;flex-shrink:0;">${upg.icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="color:white;font-size:13px;font-weight:bold;">${upg.name}</div>
            <div style="color:#aaa;font-size:11px;">${upg.description}</div>
          </div>
          <div style="color:#ffd700;font-size:14px;font-weight:bold;flex-shrink:0;">${upg.cost}g</div>
        `;

        item.addEventListener('mouseenter', () => {
          item.style.background = 'rgba(255,215,0,0.1)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'rgba(0,0,0,0.4)';
        });
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
    if (!fill || !text) return;

    const pct = Math.max(0, Math.min(1, current / max)) * 100;
    fill.style.width = `${pct}%`;
    fill.style.backgroundColor = pct > 60 ? '#4caf50' : pct > 30 ? '#ffeb3b' : '#f44336';
    text.textContent = `${current} / ${max} HP`;
  }

  /* ------------------------------------------------------------------ */
  /*  SHIP SELECT SCREEN                                                 */
  /* ------------------------------------------------------------------ */

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
    currentSettings: { master: number; music: number; sfx: number; quality: string },
    onChange: (key: string, value: number | string) => void
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
    const backBtn = document.getElementById('settings-back');

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

  /* ------------------------------------------------------------------ */
  /*  RUN SUMMARY / VICTORY                                              */
  /* ------------------------------------------------------------------ */

  showRunSummary(stats: RunStats, unlocks: string[]): void {
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
    }, 3000);
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

    const pct = Math.max(0, Math.min(1, remaining / total)) * 100;
    const countdownSec = Math.ceil(remaining);

    this.eventTimerEl.style.display = 'block';
    this.eventTimerEl.innerHTML = `
      <div class="event-timer-name">${eventName}</div>
      <div class="event-timer-track">
        <div class="event-timer-fill" style="width:${pct}%"></div>
      </div>
      <div class="event-timer-countdown">${countdownSec}s</div>
    `;
  }

  hideEventTimer(): void {
    if (!this.eventTimerEl) {
      this.eventTimerEl = document.getElementById('event-timer');
    }
    if (this.eventTimerEl) {
      this.eventTimerEl.style.display = 'none';
    }
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
}
