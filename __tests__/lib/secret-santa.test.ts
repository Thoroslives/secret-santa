import { generateDraw, DrawConstraints, DrawPerson } from '@/lib/secret-santa';

function makePeople(count: number): DrawPerson[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    name: `Person ${i}`,
  }));
}

describe('generateDraw', () => {
  describe('requires at least 3 people', () => {
    it('rejects 0 people', () => {
      expect(generateDraw([])).toEqual({
        ok: false,
        reason: 'Need at least 3 people for a draw.',
      });
    });

    it('rejects 1 person', () => {
      expect(generateDraw(makePeople(1))).toEqual({
        ok: false,
        reason: 'Need at least 3 people for a draw.',
      });
    });

    it('rejects 2 people', () => {
      expect(generateDraw(makePeople(2))).toEqual({
        ok: false,
        reason: 'Need at least 3 people for a draw.',
      });
    });
  });

  describe('unconstrained draw fuzz (n=8, 200 runs)', () => {
    it('never self-assigns and everyone gives/receives exactly once', () => {
      const people = makePeople(8);
      for (let run = 0; run < 200; run++) {
        const result = generateDraw(people);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.assignments).toHaveLength(8);

        for (const a of result.assignments) {
          expect(a.giverId).not.toBe(a.receiverId);
        }

        const giverIds = result.assignments.map((a) => a.giverId);
        const receiverIds = result.assignments.map((a) => a.receiverId);
        expect(new Set(giverIds).size).toBe(8);
        expect(new Set(receiverIds).size).toBe(8);

        const validIds = new Set(people.map((p) => p.id));
        for (const a of result.assignments) {
          expect(validIds.has(a.giverId)).toBe(true);
          expect(validIds.has(a.receiverId)).toBe(true);
        }
      }
    });
  });

  describe('symmetric blocks (fuzz)', () => {
    it('never assigns across a blocked pair in either direction', () => {
      const people = makePeople(6);
      const constraints: DrawConstraints = { blocks: [['id-0', 'id-1']] };

      for (let run = 0; run < 150; run++) {
        const result = generateDraw(people, constraints);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        for (const a of result.assignments) {
          const isForwardBlocked = a.giverId === 'id-0' && a.receiverId === 'id-1';
          const isReverseBlocked = a.giverId === 'id-1' && a.receiverId === 'id-0';
          expect(isForwardBlocked).toBe(false);
          expect(isReverseBlocked).toBe(false);
        }
      }
    });
  });

  describe('pins (fuzz)', () => {
    it('always honours a directional pin', () => {
      const people = makePeople(6);
      const constraints: DrawConstraints = {
        pins: [{ giverId: 'id-0', receiverId: 'id-1' }],
      };

      for (let run = 0; run < 150; run++) {
        const result = generateDraw(people, constraints);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const pinned = result.assignments.find((a) => a.giverId === 'id-0');
        expect(pinned?.receiverId).toBe('id-1');
      }
    });
  });

  describe('exclusions (fuzz)', () => {
    it('never assigns an excluded giver/receiver pair', () => {
      const people = makePeople(6);
      const constraints: DrawConstraints = {
        exclusions: [{ giverId: 'id-0', receiverId: 'id-1' }],
      };

      for (let run = 0; run < 150; run++) {
        const result = generateDraw(people, constraints);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const fromZero = result.assignments.find((a) => a.giverId === 'id-0');
        expect(fromZero?.receiverId).not.toBe('id-1');
      }
    });
  });

  describe('infeasibility messaging', () => {
    it('names the offending person when blocks leave them with zero candidates (n=3)', () => {
      const people = makePeople(3);
      const constraints: DrawConstraints = {
        blocks: [
          ['id-0', 'id-1'],
          ['id-0', 'id-2'],
        ],
      };

      const result = generateDraw(people, constraints);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toMatch(/id-0|P0|no eligible/i);
    });

    it('returns a generic reason (no per-person attribution) for a Hall-type infeasible instance', () => {
      // Triangle-block id-0/id-1/id-2 against each other: all three can only
      // give to id-3, but only one of them can actually receive id-3 as a
      // draw partner. Every individual candidate set is non-empty (each of
      // id-0/id-1/id-2 has {id-3}; id-3 has {id-0,id-1,id-2}) so this is a
      // Hall-violation discovered only by the search, not a named person.
      const people = makePeople(4);
      const constraints: DrawConstraints = {
        blocks: [
          ['id-0', 'id-1'],
          ['id-0', 'id-2'],
          ['id-1', 'id-2'],
        ],
      };

      const result = generateDraw(people, constraints);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toMatch(/no valid draw is possible/i);
      expect(result.reason).not.toMatch(/id-0|id-1|id-2|id-3/);
    });
  });

  describe('pin validation', () => {
    it('rejects a self-pin', () => {
      const people = makePeople(4);
      const constraints: DrawConstraints = {
        pins: [{ giverId: 'id-0', receiverId: 'id-0' }],
      };

      const result = generateDraw(people, constraints);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toMatch(/id-0/);
    });

    it('rejects two pins naming the same receiver', () => {
      const people = makePeople(4);
      const constraints: DrawConstraints = {
        pins: [
          { giverId: 'id-0', receiverId: 'id-2' },
          { giverId: 'id-1', receiverId: 'id-2' },
        ],
      };

      const result = generateDraw(people, constraints);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toMatch(/id-2/);
    });

    it('rejects two pins on the same giver', () => {
      const people = makePeople(4);
      const constraints: DrawConstraints = {
        pins: [
          { giverId: 'id-0', receiverId: 'id-1' },
          { giverId: 'id-0', receiverId: 'id-2' },
        ],
      };

      const result = generateDraw(people, constraints);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toMatch(/id-0/);
    });

    it('rejects a pin referencing an id not in the group', () => {
      const people = makePeople(4);
      const constraints: DrawConstraints = {
        pins: [{ giverId: 'ghost-id', receiverId: 'id-1' }],
      };

      const result = generateDraw(people, constraints);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toMatch(/ghost-id/);
    });
  });

  describe('combined constraints', () => {
    it('honours a block, a pin, and an exclusion simultaneously (fuzz)', () => {
      const people = makePeople(8);
      const constraints: DrawConstraints = {
        blocks: [['id-2', 'id-3']],
        pins: [{ giverId: 'id-0', receiverId: 'id-4' }],
        exclusions: [{ giverId: 'id-5', receiverId: 'id-6' }],
      };

      for (let run = 0; run < 100; run++) {
        const result = generateDraw(people, constraints);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        for (const a of result.assignments) {
          expect(a.giverId).not.toBe(a.receiverId);
        }

        const pinned = result.assignments.find((a) => a.giverId === 'id-0');
        expect(pinned?.receiverId).toBe('id-4');

        const fromTwo = result.assignments.find((a) => a.giverId === 'id-2');
        expect(fromTwo?.receiverId).not.toBe('id-3');
        const fromThree = result.assignments.find((a) => a.giverId === 'id-3');
        expect(fromThree?.receiverId).not.toBe('id-2');

        const fromFive = result.assignments.find((a) => a.giverId === 'id-5');
        expect(fromFive?.receiverId).not.toBe('id-6');
      }
    });
  });

  describe('performance', () => {
    it('returns quickly for n=50 with no constraints', () => {
      const people = makePeople(50);
      const start = Date.now();
      const result = generateDraw(people);
      const elapsed = Date.now() - start;

      expect(result.ok).toBe(true);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
