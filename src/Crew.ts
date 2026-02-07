import type {
  CrewRole,
  CrewMember,
  CrewBonus,
  CrewRoleConfig,
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
    return this.crew.map(member => ({ ...member }));
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
  // Reset
  // -----------------------------------------------------------------------

  /** Clear all crew for a new run. */
  reset(): void {
    this.crew = [];
  }
}
