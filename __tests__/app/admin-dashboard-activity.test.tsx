/**
 * @jest-environment jsdom
 *
 * The Activity section. Visits, last seen, and recent activity per person - but the two
 * DERIVED lines are the actual point of the feature:
 *
 *   "Never opened their link"  - they have no wishlist and will get a bad gift. The nudge list.
 *   "Not seen their match"     - the draw was sent and they have not been back since, so they
 *                                do not know who they got. That is the one that bites on
 *                                Christmas morning, and it was not knowable before this existed.
 *
 * Placement (between Assignments and the Danger zone) is deliberate and was confirmed by the
 * admin after being shown that the People table already lists everyone. Do not "tidy" this
 * into extra columns on that table.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import AdminDashboard from "@/app/admin/dashboard/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const group = { id: "g1", name: "The Family Draw", year: 2026, budgetCurrency: "USD" };
const ok = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

type Visits = {
  name: string;
  visitCount: number;
  lastVisitAt: string | null;
  recentVisits: number;
};

const person = (id: string, p: Visits) => ({
  id,
  personalLinkToken: `t-${id}`,
  _count: { wishlistItems: 0, suggestionsBy: 0 },
  ...p,
});

function installFetch(people: unknown[], round: unknown = null) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/api/auth/session")) return ok({ authenticated: true, isAdmin: true });
    if (url.includes("/api/rounds/seed")) return ok({ pairs: [], count: 0, seededYears: [] });
    if (url.endsWith("/api/groups")) return ok([group]);
    if (url.includes("/api/people")) return ok({ people });
    if (url.includes("/api/assignments")) return ok({ assignments: [], round });
    if (url.includes("/api/pins")) return ok({ pins: [], year: 2026 });
    if (url.includes("/api/blocks")) return ok({ blocks: [] });
    if (url.includes("/api/groups/g1")) return ok({ group });
    return ok({});
  }) as unknown as typeof fetch;
}

const sentRound = { id: "r1", year: 2026, status: "sent", sentAt: daysAgo(10) };

it("shows visits and last seen for someone who has been in", async () => {
  installFetch([
    person("a", { name: "Alice", visitCount: 9, recentVisits: 2, lastVisitAt: daysAgo(2) }),
  ]);
  render(<AdminDashboard />);

  expect(await screen.findByText("Activity")).toBeInTheDocument();
  expect(screen.getByText(/9 visits/i)).toBeInTheDocument();
  expect(screen.getByText(/2 days ago/i)).toBeInTheDocument();
  expect(screen.getByText(/2 in the last 7 days/i)).toBeInTheDocument();
});

it("calls out someone who has never opened their link", async () => {
  installFetch([
    person("b", { name: "Bob", visitCount: 0, recentVisits: 0, lastVisitAt: null }),
  ]);
  render(<AdminDashboard />);

  expect(await screen.findByText(/never opened their link/i)).toBeInTheDocument();
});

it("flags someone who has not been back since the draw was sent", async () => {
  installFetch(
    [person("c", { name: "Cara", visitCount: 3, recentVisits: 0, lastVisitAt: daysAgo(20) })],
    sentRound,
  );
  render(<AdminDashboard />);

  expect(await screen.findByText(/not seen their match/i)).toBeInTheDocument();
});

it("does not flag someone who came back after the draw was sent", async () => {
  installFetch(
    [person("d", { name: "Dan", visitCount: 4, recentVisits: 1, lastVisitAt: daysAgo(2) })],
    sentRound,
  );
  render(<AdminDashboard />);

  await screen.findByText("Activity");
  expect(screen.queryByText(/not seen their match/i)).not.toBeInTheDocument();
});

// Before the draw goes out there is nothing to have missed, so the flag must stay quiet
// even for someone who has not been in for weeks.
it("does not flag anyone before the draw has been sent", async () => {
  installFetch(
    [person("e", { name: "Eve", visitCount: 1, recentVisits: 0, lastVisitAt: daysAgo(30) })],
    { id: "r1", year: 2026, status: "generated", sentAt: null },
  );
  render(<AdminDashboard />);

  await screen.findByText("Activity");
  expect(screen.queryByText(/not seen their match/i)).not.toBeInTheDocument();
});
