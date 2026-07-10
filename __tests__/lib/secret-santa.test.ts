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

  describe('realistic-scale family-block fuzz (n=15,20,25,30; 50 runs each)', () => {
    // Regression coverage for the bounded-backtracking false-negative bug: at
    // this scale and block density the old maxSteps-capped search returned
    // false `{ ok: false }` on demonstrably feasible instances (re-running the
    // same instance succeeded most of the time - it just ran out of steps on
    // an unlucky shuffle). Partitioning into "families" and blocking every
    // within-family pair is a known-feasible pattern as long as no family
    // exceeds floor(n/2) people - true here since families are capped at 5
    // and every n is >= 15 (floor(n/2) >= 7).
    function partitionIntoFamilies(n: number): number[] {
      const sizes: number[] = [];
      let remaining = n;
      while (remaining > 0) {
        if (remaining <= 5) {
          sizes.push(remaining);
          remaining = 0;
        } else if (remaining === 6) {
          // Avoid leaving a trailing family smaller than 3.
          sizes.push(3);
          remaining -= 3;
        } else {
          sizes.push(4);
          remaining -= 4;
        }
      }
      return sizes;
    }

    function buildFamilies(people: DrawPerson[]) {
      const familySizes = partitionIntoFamilies(people.length);
      const familyOf = new Map<string, number>();
      const blocks: Array<[string, string]> = [];
      let index = 0;
      familySizes.forEach((size, familyIndex) => {
        const family = people.slice(index, index + size);
        index += size;
        for (const person of family) familyOf.set(person.id, familyIndex);
        for (let i = 0; i < family.length; i++) {
          for (let j = i + 1; j < family.length; j++) {
            blocks.push([family[i].id, family[j].id]);
          }
        }
      });
      return { familyOf, blocks };
    }

    it.each([15, 20, 25, 30])(
      'always returns ok:true for n=%i with symmetric within-family blocks (50 runs)',
      (n) => {
        const people = makePeople(n);
        const { familyOf, blocks } = buildFamilies(people);
        const constraints: DrawConstraints = { blocks };
        const validIds = new Set(people.map((p) => p.id));

        for (let run = 0; run < 50; run++) {
          const result = generateDraw(people, constraints);
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          expect(result.assignments).toHaveLength(n);

          const giverIds = new Set<string>();
          const receiverIds = new Set<string>();
          for (const a of result.assignments) {
            expect(validIds.has(a.giverId)).toBe(true);
            expect(validIds.has(a.receiverId)).toBe(true);
            // No self-assignment.
            expect(a.giverId).not.toBe(a.receiverId);
            // No blocked (same-family) pair in either direction.
            expect(familyOf.get(a.giverId)).not.toBe(familyOf.get(a.receiverId));
            giverIds.add(a.giverId);
            receiverIds.add(a.receiverId);
          }
          // Valid permutation: every giver and every receiver used exactly once.
          expect(giverIds.size).toBe(n);
          expect(receiverIds.size).toBe(n);
        }
      }
    );
  });
});
