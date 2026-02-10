import { describe, expect, it } from 'vitest';
import { CrewSystem } from './Crew';

describe('CrewSystem snapshots', () => {
  it('restores crew members and levels from a snapshot', () => {
    const crew = new CrewSystem();
    crew.hire('navigator');
    crew.hire('gunner');
    crew.levelUpAll();
    const snapshot = crew.getSnapshot();

    const restored = new CrewSystem();
    restored.restoreSnapshot(snapshot);

    expect(restored.getCrew()).toEqual(snapshot);
  });

  it('ignores invalid snapshot entries', () => {
    const crew = new CrewSystem();
    crew.restoreSnapshot([
      {
        role: 'navigator',
        level: 3,
        maxLevel: 5,
        name: 'Salt Jack',
      },
      {
        role: 'invalid_role',
        level: 10,
        maxLevel: 10,
        name: 'Bad Entry',
      } as unknown as import('./Crew').CrewMemberSnapshot,
    ]);

    expect(crew.getCrew().length).toBe(1);
    expect(crew.getCrew()[0]?.role).toBe('navigator');
    expect(crew.getCrew()[0]?.level).toBe(3);
  });
});

describe('CrewSystem personalities', () => {
  it('assigns personality on hire', () => {
    const crew = new CrewSystem();
    const member = crew.hire('navigator');
    expect(member.personality).toBeDefined();
    expect(member.loyalty).toBe(60);
    expect(member.morale).toBe(50);
  });

  it('restores personality from snapshot', () => {
    const crew = new CrewSystem();
    crew.restoreSnapshot([
      { role: 'gunner', level: 2, maxLevel: 5, name: 'Test', personality: 'bloodthirsty', loyalty: 80, morale: 70 },
    ]);
    const member = crew.getCrew()[0];
    expect(member.personality).toBe('bloodthirsty');
    expect(member.loyalty).toBe(80);
    expect(member.morale).toBe(70);
  });

  it('defaults personality for old snapshots without one', () => {
    const crew = new CrewSystem();
    crew.restoreSnapshot([
      { role: 'surgeon', level: 1, maxLevel: 5, name: 'Old Save' },
    ]);
    const member = crew.getCrew()[0];
    expect(member.personality).toBeDefined();
    expect(member.loyalty).toBe(60);
    expect(member.morale).toBe(50);
  });

  it('returns opinions for choice contexts', () => {
    const crew = new CrewSystem();
    crew.restoreSnapshot([
      { role: 'gunner', level: 3, maxLevel: 5, name: 'Blood', personality: 'bloodthirsty', loyalty: 60, morale: 50 },
      { role: 'surgeon', level: 2, maxLevel: 5, name: 'Careful', personality: 'cautious', loyalty: 60, morale: 50 },
    ]);
    const opinions = crew.getOpinions('attack_armed');
    expect(opinions).toHaveLength(2);
    expect(opinions[0].opinion).toBe('approve');    // bloodthirsty approves attacks
    expect(opinions[1].opinion).toBe('disapprove'); // cautious disapproves
  });

  it('applyChoiceOutcome adjusts loyalty and morale', () => {
    const crew = new CrewSystem();
    crew.restoreSnapshot([
      { role: 'gunner', level: 1, maxLevel: 5, name: 'Blood', personality: 'bloodthirsty', loyalty: 60, morale: 50 },
    ]);
    crew.applyChoiceOutcome('attack_armed'); // bloodthirsty approves
    const member = crew.getCrew()[0];
    expect(member.loyalty).toBe(63);  // +3
    expect(member.morale).toBe(55);   // +5
  });

  it('disapproval reduces loyalty and morale', () => {
    const crew = new CrewSystem();
    crew.restoreSnapshot([
      { role: 'gunner', level: 1, maxLevel: 5, name: 'Blood', personality: 'bloodthirsty', loyalty: 60, morale: 50 },
    ]);
    crew.applyChoiceOutcome('retreat'); // bloodthirsty disapproves retreat
    const member = crew.getCrew()[0];
    expect(member.loyalty).toBe(56);  // -4
    expect(member.morale).toBe(44);   // -6
  });

  it('checkMutiny triggers when loyalty<20 and morale<10', () => {
    const crew = new CrewSystem();
    crew.restoreSnapshot([
      { role: 'gunner', level: 3, maxLevel: 5, name: 'Angry', personality: 'bloodthirsty', loyalty: 15, morale: 5 },
      { role: 'surgeon', level: 2, maxLevel: 5, name: 'Happy', personality: 'loyal', loyalty: 80, morale: 70 },
    ]);
    const result = crew.checkMutiny();
    expect(result).not.toBeNull();
    expect(result!.mutineer.name).toBe('Angry');
    expect(result!.goldStolen).toBe(150); // level 3 * 50
    expect(crew.getCrew()).toHaveLength(1); // mutineer removed
    expect(crew.getCrew()[0].name).toBe('Happy');
  });

  it('checkMutiny returns null when crew is content', () => {
    const crew = new CrewSystem();
    crew.restoreSnapshot([
      { role: 'gunner', level: 1, maxLevel: 5, name: 'OK', personality: 'stoic', loyalty: 60, morale: 50 },
    ]);
    expect(crew.checkMutiny()).toBeNull();
  });

  it('getMutinyRisks identifies at-risk crew', () => {
    const crew = new CrewSystem();
    crew.restoreSnapshot([
      { role: 'gunner', level: 1, maxLevel: 5, name: 'Risky', personality: 'greedy', loyalty: 25, morale: 15 },
      { role: 'surgeon', level: 1, maxLevel: 5, name: 'Safe', personality: 'loyal', loyalty: 80, morale: 70 },
    ]);
    const risks = crew.getMutinyRisks();
    expect(risks).toHaveLength(1);
    expect(risks[0].name).toBe('Risky');
  });

  it('boostMorale and reduceMorale affect all crew', () => {
    const crew = new CrewSystem();
    crew.hire('navigator');
    crew.hire('gunner');
    crew.boostMorale(20);
    for (const m of crew.getCrew()) {
      expect(m.morale).toBe(70);
    }
    crew.reduceMorale(30);
    for (const m of crew.getCrew()) {
      expect(m.morale).toBe(40);
    }
  });
});
