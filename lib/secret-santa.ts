/**
 * Secret Santa constrained draw engine
 *
 * Pure function, zero DB access. Produces a valid derangement (everyone
 * gives to exactly one person, receives from exactly one person, never to
 * themselves) subject to optional constraints:
 *  - blocks: symmetric pairs who must never be matched in either direction
 *  - pins: a forced giver -> receiver assignment
 *  - exclusions: a directional giver -> receiver pair that must not occur
 *    (e.g. "don't repeat who you gave to last year")
 *
 * Implemented as a bounded backtracking search: giver order and each
 * giver's candidate list are Fisher-Yates shuffled for fairness, then a DFS
 * assigns one unused receiver per giver, backtracking on dead ends. Total
 * backtracking steps are capped so the function always returns - it never
 * hangs, even on a pathological/infeasible input.
 */

export interface DrawPerson {
  id: string;
  name: string;
}

export interface DrawConstraints {
  blocks?: Array<[string, string]>;
  pins?: Array<{ giverId: string; receiverId: string }>;
  exclusions?: Array<{ giverId: string; receiverId: string }>;
}

export type DrawResult =
  | { ok: true; assignments: Array<{ giverId: string; receiverId: string }> }
  | { ok: false; reason: string };

const GENERIC_INFEASIBLE_REASON =
  'No valid draw is possible under the current blocks / pins / previous-year rules.';

/**
 * Shuffles an array using Fisher-Yates. Does not mutate the input.
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generates a constrained Secret Santa draw.
 *
 * Requires at least 3 people. Validates pins first (self-pin, duplicate
 * receiver across pins, two pins on one giver, or a pin id not in `people`
 * all fail fast with a reason naming the offending pin). Then builds each
 * giver's eligible-receiver candidate list (self, block partners, and
 * exclusions removed; a pinned giver's candidate list is just the pin) and
 * runs a bounded backtracking search over shuffled candidates.
 *
 * Never throws, never hangs: infeasible input always yields
 * `{ ok: false, reason }` - naming the offending person when a single
 * giver's candidate set is empty, or a generic message when infeasibility
 * can only be established by exhausting the search (Hall-type) or the step
 * bound is hit.
 */
export function generateDraw(
  people: DrawPerson[],
  constraints: DrawConstraints = {}
): DrawResult {
  if (people.length < 3) {
    return { ok: false, reason: 'Need at least 3 people for a draw.' };
  }

  const peopleIds = new Set(people.map((p) => p.id));
  const pins = constraints.pins ?? [];
  const blocks = constraints.blocks ?? [];
  const exclusions = constraints.exclusions ?? [];

  // --- Validate pins first ---
  const pinnedGivers = new Set<string>();
  const pinnedReceivers = new Set<string>();
  const pinByGiver = new Map<string, string>();

  for (const pin of pins) {
    if (!peopleIds.has(pin.giverId)) {
      return {
        ok: false,
        reason: `Invalid pin: giver "${pin.giverId}" is not in the group.`,
      };
    }
    if (!peopleIds.has(pin.receiverId)) {
      return {
        ok: false,
        reason: `Invalid pin: receiver "${pin.receiverId}" is not in the group.`,
      };
    }
    if (pin.giverId === pin.receiverId) {
      return {
        ok: false,
        reason: `Invalid pin: ${pin.giverId} cannot be pinned to themselves.`,
      };
    }
    if (pinnedGivers.has(pin.giverId)) {
      return {
        ok: false,
        reason: `Invalid pin: ${pin.giverId} has more than one pinned receiver.`,
      };
    }
    if (pinnedReceivers.has(pin.receiverId)) {
      return {
        ok: false,
        reason: `Invalid pin: ${pin.receiverId} is pinned as receiver by more than one giver.`,
      };
    }
    pinnedGivers.add(pin.giverId);
    pinnedReceivers.add(pin.receiverId);
    pinByGiver.set(pin.giverId, pin.receiverId);
  }

  // --- Symmetric block partner sets ---
  const blockPartners = new Map<string, Set<string>>();
  for (const person of people) blockPartners.set(person.id, new Set());
  for (const [a, b] of blocks) {
    blockPartners.get(a)?.add(b);
    blockPartners.get(b)?.add(a);
  }

  // --- Directional exclusion sets (giver -> excluded receivers) ---
  const excludedReceivers = new Map<string, Set<string>>();
  for (const person of people) excludedReceivers.set(person.id, new Set());
  for (const ex of exclusions) {
    excludedReceivers.get(ex.giverId)?.add(ex.receiverId);
  }

  // --- Candidate receivers per giver ---
  const candidates = new Map<string, string[]>();
  for (const person of people) {
    const pinnedReceiver = pinByGiver.get(person.id);
    if (pinnedReceiver !== undefined) {
      candidates.set(person.id, [pinnedReceiver]);
      continue;
    }
    const blocked = blockPartners.get(person.id)!;
    const excluded = excludedReceivers.get(person.id)!;
    const eligible = people
      .filter(
        (other) =>
          other.id !== person.id &&
          !blocked.has(other.id) &&
          !excluded.has(other.id)
      )
      .map((other) => other.id);
    candidates.set(person.id, eligible);
  }

  // --- Named infeasibility: a single giver with zero eligible receivers ---
  for (const person of people) {
    if (candidates.get(person.id)!.length === 0) {
      return {
        ok: false,
        reason: `No valid draw: ${person.name} (${person.id}) has no eligible receiver under the current blocks / pins / previous-year rules.`,
      };
    }
  }

  // --- Bounded backtracking search (shuffled for fairness) ---
  const giverOrder = shuffleArray(people.map((p) => p.id));
  const shuffledCandidates = new Map<string, string[]>();
  for (const giverId of giverOrder) {
    shuffledCandidates.set(giverId, shuffleArray(candidates.get(giverId)!));
  }

  const maxSteps = people.length * people.length * 64;
  let steps = 0;
  const usedReceivers = new Set<string>();
  const assignment = new Map<string, string>();

  function backtrack(index: number): boolean {
    if (index === giverOrder.length) return true;
    const giverId = giverOrder[index];
    for (const receiverId of shuffledCandidates.get(giverId)!) {
      if (usedReceivers.has(receiverId)) continue;
      steps++;
      if (steps > maxSteps) return false;
      usedReceivers.add(receiverId);
      assignment.set(giverId, receiverId);
      if (backtrack(index + 1)) return true;
      usedReceivers.delete(receiverId);
      assignment.delete(giverId);
    }
    return false;
  }

  const solved = backtrack(0);
  if (!solved) {
    // Either genuinely infeasible in a way not attributable to one person
    // (Hall-type: every candidate set was non-empty, but no perfect
    // matching exists) or the step bound tripped. Both report the same
    // honest, generic reason - we never promise per-person attribution the
    // search did not actually establish.
    return { ok: false, reason: GENERIC_INFEASIBLE_REASON };
  }

  return {
    ok: true,
    assignments: people.map((person) => ({
      giverId: person.id,
      receiverId: assignment.get(person.id)!,
    })),
  };
}
