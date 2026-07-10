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

  describe('phase-transition family-block fuzz (feasible-but-hard; 100 runs each)', () => {
    // Regression guard for the bounded-backtracking false-negative bug. The old
    // `maxSteps`-capped search returned false `{ ok: false }` ("No valid draw is
    // possible") on demonstrably FEASIBLE instances - it just ran out of steps
    // on an unlucky shuffle near the CSP phase transition. Complete bipartite
    // matching (Kuhn's) cannot false-negative: it finds a perfect matching
    // whenever one exists.
    //
    // These instances sit EXACTLY on the feasibility boundary, which is where
    // the bug lived - not just any feasible instance. A same-block-avoiding
    // permutation exists iff the largest block <= floor(n/2) (Hall's
    // condition), so we make the dominant family exactly floor(n/2): the
    // tightest still-feasible configuration, i.e. the phase transition. The
    // remaining people split into realistic 3-5 person families.
    //
    // Empirically (measured against the pre-fix code): the old bounded search
    // false-negatives these at 20-95% PER DRAW across n=12-24, so it fails with
    // certainty over 100 runs. The new complete-matching code is 0-failure over
    // thousands of runs - deterministically complete, so this test is a real
    // regression guard AND reliably green (no flakiness).
    function phaseTransitionFamilies(n: number): number[] {
      const families = [Math.floor(n / 2)];
      let remaining = n - families[0];
      while (remaining > 0) {
        if (remaining <= 5) {
          families.push(remaining);
          remaining = 0;
        } else if (remaining === 6) {
          // Split 6 into 3+3 rather than leaving a trailing family under 3.
          families.push(3);
          families.push(3);
          remaining = 0;
        } else {
          families.push(4);
          remaining -= 4;
        }
      }
      return families;
    }

    function buildFamilies(people: DrawPerson[], sizes: number[]) {
      const familyOf = new Map<string, number>();
      const blocks: Array<[string, string]> = [];
      let index = 0;
      sizes.forEach((size, familyIndex) => {
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

    it.each([12, 14, 15, 16, 18, 20, 24])(
      'always returns ok:true at the feasibility boundary for n=%i (100 runs)',
      (n) => {
        const sizes = phaseTransitionFamilies(n);

        // Self-check the instance really is on the feasible side of the
        // transition (largest block == floor(n/2)) and partitions all n people.
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.max(...sizes)).toBe(Math.floor(n / 2));

        const people = makePeople(n);
        const { familyOf, blocks } = buildFamilies(people, sizes);
        const constraints: DrawConstraints = { blocks };
        const validIds = new Set(people.map((p) => p.id));

        for (let run = 0; run < 100; run++) {
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
            // No blocked (same-family) pairing in either direction.
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
