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
 * Implemented as a complete bipartite perfect matching search (Kuhn's
 * augmenting-path algorithm): givers are the left side, receivers the right
 * side, and edges are each giver's eligible-receiver candidates. Giver
 * processing order and each giver's candidate list are Fisher-Yates
 * shuffled for fairness/variety, then augmenting paths are searched one
 * giver at a time. This is complete by construction (a perfect matching is
 * found whenever one exists) and polynomial (O(V*E)), so no arbitrary step
 * bound is needed - it always terminates on its own and never false-negatives
 * a feasible instance.
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
 * runs Kuhn's augmenting-path bipartite matching over shuffled candidates
 * to find a perfect matching.
 *
 * Never throws, never hangs: infeasible input always yields
 * `{ ok: false, reason }` - naming the offending person when a single
 * giver's candidate set is empty, or a generic message when infeasibility
 * can only be established by exhausting the search (Hall-type: every
 * candidate set is non-empty, but no perfect matching exists).
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

  // --- Complete bipartite perfect matching (shuffled for fairness) ---
  // Givers are the left side, receivers the right side, edges are the
  // candidate adjacency built above. Giver order and each giver's adjacency
  // are Fisher-Yates shuffled so repeated draws vary and no giver is
  // systematically favoured.
  const giverOrder = shuffleArray(people.map((p) => p.id));
  const shuffledCandidates = new Map<string, string[]>();
  for (const giverId of giverOrder) {
    shuffledCandidates.set(giverId, shuffleArray(candidates.get(giverId)!));
  }

  // Kuhn's augmenting-path algorithm: matchOfReceiver tracks the current
  // giver matched to each receiver. For a giver, try each candidate
  // receiver in turn; if it is unmatched, or its current giver can be
  // re-routed to a different receiver via an augmenting path, claim it.
  // The `visited` set is per top-level augmentation attempt, so each
  // receiver is considered at most once per call - this bounds the search
  // and guarantees termination. O(V*E) overall: polynomial, complete, no
  // step cap required.
  const matchOfReceiver = new Map<string, string>();

  function tryAugment(giverId: string, visited: Set<string>): boolean {
    for (const receiverId of shuffledCandidates.get(giverId)!) {
      if (visited.has(receiverId)) continue;
      visited.add(receiverId);
      const currentGiver = matchOfReceiver.get(receiverId);
      if (currentGiver === undefined || tryAugment(currentGiver, visited)) {
        matchOfReceiver.set(receiverId, giverId);
        return true;
      }
    }
    return false;
  }

  for (const giverId of giverOrder) {
    if (!tryAugment(giverId, new Set<string>())) {
      // Every giver's adjacency was confirmed non-empty above, yet no
      // perfect matching exists (Hall-type: the search itself establishes
      // infeasibility, not any single person). Report the same honest,
      // generic reason - we never promise per-person attribution the
      // search did not actually establish.
      return { ok: false, reason: GENERIC_INFEASIBLE_REASON };
    }
  }

  const assignment = new Map<string, string>();
  for (const [receiverId, giverId] of matchOfReceiver) {
    assignment.set(giverId, receiverId);
  }

  return {
    ok: true,
    assignments: people.map((person) => ({
      giverId: person.id,
      receiverId: assignment.get(person.id)!,
    })),
  };
}
