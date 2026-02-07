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
