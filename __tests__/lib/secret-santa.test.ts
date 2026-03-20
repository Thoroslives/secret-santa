import { generateSecretSantaAssignments } from '@/lib/secret-santa';

function makePeople(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    name: `Person ${i}`,
  }));
}

describe('generateSecretSantaAssignments', () => {
  describe('returns null for fewer than 3 people', () => {
    it('returns null for 0 people', () => {
      expect(generateSecretSantaAssignments([])).toBeNull();
    });

    it('returns null for 1 person', () => {
      expect(generateSecretSantaAssignments(makePeople(1))).toBeNull();
    });

    it('returns null for 2 people', () => {
      expect(generateSecretSantaAssignments(makePeople(2))).toBeNull();
    });
  });

  describe('returns valid assignments for 3 people', () => {
    it('returns an array of 3 assignments', () => {
      const people = makePeople(3);
      const assignments = generateSecretSantaAssignments(people);
      expect(assignments).not.toBeNull();
      expect(assignments).toHaveLength(3);
    });

    it('has no self-assignments', () => {
      const people = makePeople(3);
      const assignments = generateSecretSantaAssignments(people)!;
      for (const a of assignments) {
        expect(a.giverId).not.toBe(a.receiverId);
      }
    });
  });

  describe('returns valid assignments for large groups', () => {
    it.each([10, 20, 50])('works with %i people', (count) => {
      const people = makePeople(count);
      const assignments = generateSecretSantaAssignments(people)!;
      expect(assignments).not.toBeNull();
      expect(assignments).toHaveLength(count);

      // No self-assignments
      for (const a of assignments) {
        expect(a.giverId).not.toBe(a.receiverId);
      }

      // Everyone gives exactly once
      const giverIds = assignments.map((a) => a.giverId);
      expect(new Set(giverIds).size).toBe(count);

      // Everyone receives exactly once
      const receiverIds = assignments.map((a) => a.receiverId);
      expect(new Set(receiverIds).size).toBe(count);
    });
  });

  describe('no self-assignments ever', () => {
    it('has no self-assignments across 100 runs with 5 people', () => {
      const people = makePeople(5);
      for (let run = 0; run < 100; run++) {
        const assignments = generateSecretSantaAssignments(people)!;
        expect(assignments).not.toBeNull();
        for (const a of assignments) {
          expect(a.giverId).not.toBe(a.receiverId);
        }
      }
    });
  });

  describe('everyone gives exactly once and receives exactly once', () => {
    it('validates give/receive uniqueness for 7 people', () => {
      const people = makePeople(7);
      const assignments = generateSecretSantaAssignments(people)!;

      const giverIds = assignments.map((a) => a.giverId);
      const receiverIds = assignments.map((a) => a.receiverId);
      const expectedIds = new Set(people.map((p) => p.id));

      expect(new Set(giverIds)).toEqual(expectedIds);
      expect(new Set(receiverIds)).toEqual(expectedIds);
    });
  });

  describe('works with odd numbers of people', () => {
    it.each([3, 5, 7])('works with %i people', (count) => {
      const people = makePeople(count);
      const assignments = generateSecretSantaAssignments(people)!;
      expect(assignments).not.toBeNull();
      expect(assignments).toHaveLength(count);
      for (const a of assignments) {
        expect(a.giverId).not.toBe(a.receiverId);
      }
    });
  });

  describe('works with even numbers of people', () => {
    it.each([4, 6, 8])('works with %i people', (count) => {
      const people = makePeople(count);
      const assignments = generateSecretSantaAssignments(people)!;
      expect(assignments).not.toBeNull();
      expect(assignments).toHaveLength(count);
      for (const a of assignments) {
        expect(a.giverId).not.toBe(a.receiverId);
      }
    });
  });

  describe('multiple runs produce valid results', () => {
    it('produces valid assignments over 100 runs with 8 people', () => {
      const people = makePeople(8);
      for (let run = 0; run < 100; run++) {
        const assignments = generateSecretSantaAssignments(people)!;
        expect(assignments).not.toBeNull();
        expect(assignments).toHaveLength(8);

        for (const a of assignments) {
          expect(a.giverId).not.toBe(a.receiverId);
        }

        const giverIds = assignments.map((a) => a.giverId);
        const receiverIds = assignments.map((a) => a.receiverId);
        expect(new Set(giverIds).size).toBe(8);
        expect(new Set(receiverIds).size).toBe(8);
      }
    });
  });

  describe('assignment structure', () => {
    it('each assignment has giverId and receiverId strings', () => {
      const people = makePeople(4);
      const assignments = generateSecretSantaAssignments(people)!;
      for (const a of assignments) {
        expect(typeof a.giverId).toBe('string');
        expect(typeof a.receiverId).toBe('string');
      }
    });

    it('all giver and receiver ids come from the input people', () => {
      const people = makePeople(6);
      const validIds = new Set(people.map((p) => p.id));
      const assignments = generateSecretSantaAssignments(people)!;
      for (const a of assignments) {
        expect(validIds.has(a.giverId)).toBe(true);
        expect(validIds.has(a.receiverId)).toBe(true);
      }
    });
  });
});
