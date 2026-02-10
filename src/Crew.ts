import type {
  CrewRole,
  CrewMember,
  CrewBonus,
  CrewRoleConfig,
  CrewPersonality,
  SaveDataV1,
} from './Types';
import { CREW_ROLE_CONFIGS } from './Types';

// ---------------------------------------------------------------------------
// Pirate name generator
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Jack', 'Anne', 'Calico', 'Red', 'Barnacle',
  'Peg-Leg', 'One-Eye', 'Salty', 'Iron', 'Black',
  'Bloody', 'Mad', 'Silver', 'Rusty', 'Grim',
  'Bonnie', 'Dagger', 'Scurvy', 'Thunder', 'Whiskey',
];

const LAST_NAMES = [
  'Flint', 'Sparrow', 'Teach', 'Bones', 'Hook',
  'Rackham', 'Drake', 'Morgan', 'Kidd', 'Vane',
  'Read', 'Bellamy', 'Tew', 'Avery', 'Blackwood',
  'Cutlass', 'Doubloon', 'Gunpowder', 'Sharkbait', 'Stormborn',
];

function generatePirateName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

// ---------------------------------------------------------------------------
// Personality trait pool
// ---------------------------------------------------------------------------

const PERSONALITY_POOL: CrewPersonality[] = [
  'bloodthirsty', 'cautious', 'greedy', 'loyal', 'superstitious', 'scholarly',
  'ambitious', 'stoic', 'reckless', 'merciful', 'paranoid', 'cunning',
];

function randomPersonality(): CrewPersonality {
  return PERSONALITY_POOL[Math.floor(Math.random() * PERSONALITY_POOL.length)];
}

const VALID_PERSONALITIES = new Set<string>(PERSONALITY_POOL);

function isValidPersonality(p: unknown): p is CrewPersonality {
  return typeof p === 'string' && VALID_PERSONALITIES.has(p);
}

// ---------------------------------------------------------------------------
// Choice opinion types
// ---------------------------------------------------------------------------

export type ChoiceContext =
  | 'attack_armed'      // attack an armed ship
  | 'retreat'           // skip a fight / retreat
  | 'take_risky_route'  // choose dangerous map node
  | 'take_safe_route'   // choose easy/safe node
  | 'spend_gold'        // big gold expenditure
  | 'hire_crew'         // hiring at port
  | 'port_visit'        // entering port
  | 'codex_entry'       // discovering lore
  | 'boss_fight'        // boss wave start
  | 'capture_merchant'; // capturing unarmed ship

export type CrewOpinion = 'approve' | 'neutral' | 'disapprove';

const PERSONALITY_OPINIONS: Record<CrewPersonality, Partial<Record<ChoiceContext, CrewOpinion>>> = {
  bloodthirsty:  { attack_armed: 'approve', retreat: 'disapprove', capture_merchant: 'approve', boss_fight: 'approve', take_safe_route: 'disapprove' },
  cautious:      { attack_armed: 'disapprove', retreat: 'approve', take_risky_route: 'disapprove', take_safe_route: 'approve', port_visit: 'approve' },
  greedy:        { capture_merchant: 'approve', spend_gold: 'disapprove', take_risky_route: 'approve', port_visit: 'disapprove' },
  loyal:         { retreat: 'neutral', boss_fight: 'approve', hire_crew: 'approve' },
  superstitious: { take_risky_route: 'disapprove', boss_fight: 'disapprove', codex_entry: 'approve' },
  scholarly:     { codex_entry: 'approve', take_safe_route: 'approve', retreat: 'neutral' },
  ambitious:     { boss_fight: 'approve', take_risky_route: 'approve', retreat: 'disapprove', attack_armed: 'approve' },
  stoic:         {},  // stoic crew rarely have strong opinions
  reckless:      { attack_armed: 'approve', take_risky_route: 'approve', retreat: 'disapprove', boss_fight: 'approve' },
  merciful:      { capture_merchant: 'disapprove', retreat: 'approve', attack_armed: 'disapprove' },
  paranoid:      { take_risky_route: 'disapprove', hire_crew: 'disapprove', port_visit: 'disapprove' },
  cunning:       { take_safe_route: 'approve', spend_gold: 'neutral', retreat: 'neutral', capture_merchant: 'approve' },
};

// ---------------------------------------------------------------------------
// Default crew bonus (neutral)
// ---------------------------------------------------------------------------

function createDefaultBonus(): CrewBonus {
  return {
    speedMult: 1,
    damageMult: 1,
    hpRegen: 0,
    visionMult: 1,
    maxHpBonus: 0,
    goldMult: 1,
  };
}

export interface CrewMemberSnapshot {
  role: CrewRole;
  level: number;
  maxLevel: number;
  name: string;
  personality?: CrewPersonality;
  loyalty?: number;
  morale?: number;
}

// ---------------------------------------------------------------------------
// CrewSystem
// ---------------------------------------------------------------------------

export class CrewSystem {
  private crew: CrewMember[];
  private maxSlots: number;

  constructor() {
    this.crew = [];
    this.maxSlots = 4;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  getCrew(): CrewMember[] {
    return [...this.crew];
  }

  getSnapshot(): CrewMemberSnapshot[] {
    return this.crew.map(member => ({
      role: member.role,
      level: member.level,
      maxLevel: member.maxLevel,
      name: member.name,
      personality: member.personality,
      loyalty: member.loyalty,
      morale: member.morale,
    }));
  }

  restoreSnapshot(snapshot: CrewMemberSnapshot[]): void {
    this.crew = [];
    for (const raw of snapshot) {
      if (!raw || typeof raw !== 'object') continue;
      if (!(raw.role in CREW_ROLE_CONFIGS)) continue;
      const role = raw.role as CrewRole;
      const config = CREW_ROLE_CONFIGS[role];
      const level = Number.isFinite(raw.level)
        ? Math.max(1, Math.min(config.maxLevel, Math.round(raw.level)))
        : 1;
      const name = typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.slice(0, 48)
        : generatePirateName();
      this.crew.push({
        role,
        level,
        maxLevel: config.maxLevel,
        name,
        personality: isValidPersonality(raw.personality) ? raw.personality : randomPersonality(),
        loyalty: Number.isFinite(raw.loyalty) ? Math.max(0, Math.min(100, raw.loyalty!)) : 60,
        morale: Number.isFinite(raw.morale) ? Math.max(0, Math.min(100, raw.morale!)) : 50,
      });
      if (this.crew.length >= this.maxSlots) break;
    }
  }

  /**
   * Compute aggregate bonuses from all crew members.
   *
   * Per-role formulas:
   *   navigator:     speedMult     += 0.03 * level
   *   gunner:        damageMult    += 0.05 * level
   *   surgeon:       hpRegen       += 1    * level
   *   lookout:       visionMult    += 0.08 * level
   *   bosun:         maxHpBonus    += 5    * level
   *   quartermaster: goldMult      += 0.08 * level
   *
   * Multiplier bonuses stack additively from a base of 1.0.
   * Flat bonuses sum from 0.
   */
  getCrewBonuses(): CrewBonus {
    const bonus = createDefaultBonus();

    for (const member of this.crew) {
      switch (member.role) {
        case 'navigator':
          bonus.speedMult += 0.03 * member.level;
          break;
        case 'gunner':
          bonus.damageMult += 0.05 * member.level;
          break;
        case 'surgeon':
          bonus.hpRegen += 1 * member.level;
          break;
        case 'lookout':
          bonus.visionMult += 0.08 * member.level;
          break;
        case 'bosun':
          bonus.maxHpBonus += 5 * member.level;
          break;
        case 'quartermaster':
          bonus.goldMult += 0.08 * member.level;
          break;
      }
    }

    return bonus;
  }

  // -----------------------------------------------------------------------
  // Hiring
  // -----------------------------------------------------------------------

  /**
   * Check whether the player can hire a crew member of the given role.
   * Returns `{ canHire: true }` or `{ canHire: false, reason: '...' }`.
   */
  canHire(
    role: CrewRole,
    gold: number,
    saveData: SaveDataV1,
    costOverride?: number,
  ): { canHire: boolean; reason?: string } {
    // Crew cap
    if (this.crew.length >= this.maxSlots) {
      return { canHire: false, reason: 'Crew is full (max 4)' };
    }

    // Duplicate role check
    if (this.crew.some((m) => m.role === role)) {
      return { canHire: false, reason: 'Already have this role' };
    }

    // Meta-lock check
    const config = CREW_ROLE_CONFIGS[role];
    if (role === 'bosun' && !saveData.bosunUnlocked) {
      return { canHire: false, reason: 'Bosun locked (win with 2 ship classes)' };
    }
    if (role === 'quartermaster' && !saveData.quartermasterUnlocked) {
      return { canHire: false, reason: 'Quartermaster locked (win with 2 ship classes)' };
    }

    // Gold check
    const hireCost = typeof costOverride === 'number' ? costOverride : config.cost;
    if (gold < hireCost) {
      return { canHire: false, reason: `Need ${hireCost} gold` };
    }

    return { canHire: true };
  }

  /**
   * Hire a crew member. Caller is responsible for checking `canHire` first
   * and deducting the gold cost.
   */
  hire(role: CrewRole): CrewMember {
    const config = CREW_ROLE_CONFIGS[role];
    const member: CrewMember = {
      role,
      level: 1,
      maxLevel: config.maxLevel,
      name: generatePirateName(),
      personality: randomPersonality(),
      loyalty: 60,
      morale: 50,
    };
    this.crew.push(member);
    return member;
  }

  // -----------------------------------------------------------------------
  // Leveling
  // -----------------------------------------------------------------------

  /** Auto-level all crew members by 1 (capped at maxLevel). */
  levelUpAll(): void {
    for (const member of this.crew) {
      if (member.level < member.maxLevel) {
        member.level++;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Available roles
  // -----------------------------------------------------------------------

  /**
   * Get the list of role configs the player can see in the hire menu.
   * Locked roles have their `locked` field set based on meta save data.
   * Roles already hired are excluded.
   */
  getAvailableRoles(saveData: SaveDataV1): CrewRoleConfig[] {
    const hiredRoles = new Set(this.crew.map((m) => m.role));
    const roles: CrewRoleConfig[] = [];

    for (const key of Object.keys(CREW_ROLE_CONFIGS) as CrewRole[]) {
      if (hiredRoles.has(key)) continue;

      const config = { ...CREW_ROLE_CONFIGS[key] };

      // Override lock status from meta-progression
      if (key === 'bosun') {
        config.locked = !saveData.bosunUnlocked;
      } else if (key === 'quartermaster') {
        config.locked = !saveData.quartermasterUnlocked;
      } else {
        config.locked = false;
      }

      roles.push(config);
    }

    return roles;
  }

  // -----------------------------------------------------------------------
  // Parliament of Knives — personality opinions
  // -----------------------------------------------------------------------

  /** Get each crew member's opinion on a choice context */
  getOpinions(context: ChoiceContext): { member: CrewMember; opinion: CrewOpinion }[] {
    return this.crew.map(member => {
      const personality = member.personality ?? 'stoic';
      const opinions = PERSONALITY_OPINIONS[personality];
      const opinion = opinions[context] ?? 'neutral';
      return { member, opinion };
    });
  }

  /** Apply choice outcome — approvals boost morale/loyalty, disapprovals reduce */
  applyChoiceOutcome(context: ChoiceContext): void {
    for (const member of this.crew) {
      const personality = member.personality ?? 'stoic';
      const opinions = PERSONALITY_OPINIONS[personality];
      const opinion = opinions[context] ?? 'neutral';

      const loyalty = member.loyalty ?? 60;
      const morale = member.morale ?? 50;

      if (opinion === 'approve') {
        member.loyalty = Math.min(100, loyalty + 3);
        member.morale = Math.min(100, morale + 5);
      } else if (opinion === 'disapprove') {
        member.loyalty = Math.max(0, loyalty - 4);
        member.morale = Math.max(0, morale - 6);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Morale & Loyalty management
  // -----------------------------------------------------------------------

  /** Boost all crew morale (e.g. after successful wave, boss defeat) */
  boostMorale(amount: number): void {
    for (const member of this.crew) {
      member.morale = Math.min(100, (member.morale ?? 50) + amount);
    }
  }

  /** Reduce all crew morale (e.g. after taking heavy damage, losing gold) */
  reduceMorale(amount: number): void {
    for (const member of this.crew) {
      member.morale = Math.max(0, (member.morale ?? 50) - amount);
    }
  }

  /** Boost loyalty for a specific crew member */
  boostLoyalty(role: CrewRole, amount: number): void {
    const member = this.crew.find(m => m.role === role);
    if (member) {
      member.loyalty = Math.min(100, (member.loyalty ?? 60) + amount);
    }
  }

  // -----------------------------------------------------------------------
  // Mutiny system
  // -----------------------------------------------------------------------

  /** Check for mutiny. Returns mutineer if loyalty<20 AND morale<10, or null. */
  checkMutiny(): { mutineer: CrewMember; goldStolen: number } | null {
    for (const member of this.crew) {
      const loyalty = member.loyalty ?? 60;
      const morale = member.morale ?? 50;
      if (loyalty < 20 && morale < 10) {
        // Mutineer leaves and steals gold proportional to their level
        const goldStolen = member.level * 50;
        this.crew = this.crew.filter(m => m !== member);
        return { mutineer: member, goldStolen };
      }
    }
    return null;
  }

  /** Get crew members at risk of mutiny (loyalty < 30 or morale < 20) */
  getMutinyRisks(): CrewMember[] {
    return this.crew.filter(m => {
      const loyalty = m.loyalty ?? 60;
      const morale = m.morale ?? 50;
      return loyalty < 30 || morale < 20;
    });
  }

  // -----------------------------------------------------------------------
  // Culture distribution (for ShantyEngine)
  // -----------------------------------------------------------------------

  /** Get crew culture distribution derived from personalities. */
  getCultureDistribution(): Record<'aggressive' | 'thoughtful' | 'cunning' | 'noble', number> {
    const dist = { aggressive: 0, thoughtful: 0, cunning: 0, noble: 0 };
    const PERSONALITY_CULTURE: Record<string, 'aggressive' | 'thoughtful' | 'cunning' | 'noble'> = {
      bloodthirsty: 'aggressive', reckless: 'aggressive', ambitious: 'aggressive',
      cautious: 'thoughtful', scholarly: 'thoughtful', stoic: 'thoughtful',
      greedy: 'cunning', cunning: 'cunning', paranoid: 'cunning',
      loyal: 'noble', merciful: 'noble', superstitious: 'noble',
    };
    for (const member of this.crew) {
      const p = member.personality ?? 'stoic';
      const culture = PERSONALITY_CULTURE[p] ?? 'noble';
      dist[culture]++;
    }
    return dist;
  }

  /** Get the dominant culture (most crew in that cluster). */
  getDominantCulture(): 'aggressive' | 'thoughtful' | 'cunning' | 'noble' {
    const dist = this.getCultureDistribution();
    let best: 'aggressive' | 'thoughtful' | 'cunning' | 'noble' = 'noble';
    let max = 0;
    for (const [culture, count] of Object.entries(dist)) {
      if (count > max) {
        max = count;
        best = culture as typeof best;
      }
    }
    return best;
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  /** Clear all crew for a new run. */
  reset(): void {
    this.crew = [];
  }
}
