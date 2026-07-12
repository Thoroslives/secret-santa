/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import AdminDashboard from "@/app/admin/dashboard/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Mount fetches: session -> groups list -> per-group data, plus the seed
// read-back the dashboard now issues for the seed year. One group (year 2026),
// two people, and one already-recorded pair for 2025.
function installFetchWithSeededHistory() {
  const group = { id: "g1", name: "The Family Draw", year: 2026, budgetCurrency: "USD" };
  const people = [
    { id: "a", name: "Alice", personalLinkToken: "t-a", _count: { wishlistItems: 0, suggestionsBy: 0 } },
    { id: "b", name: "Bob", personalLinkToken: "t-b", _count: { wishlistItems: 0, suggestionsBy: 0 } },
  ];
  const ok = (body: unknown) =>
    Promise.resolve({ ok: true, json: async () => body } as Response);

  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/session")) return ok({ authenticated: true, isAdmin: true });
    if (url.includes("/api/rounds/seed")) {
      return ok({
        year: 2025,
        activeYear: 2026,
        pairs: [{ giverId: "a", receiverId: "b" }],
        count: 1,
        seededYears: [{ year: 2025, count: 1 }],
      });
    }
    if (url.endsWith("/api/groups")) return ok([group]);
    if (url.includes("/api/people")) return ok({ people });
    if (url.includes("/api/assignments")) return ok({ assignments: [] });
    if (url.includes("/api/groups/g1")) return ok({ group });
    return ok({});
  }) as unknown as typeof fetch;
}

describe("AdminDashboard: seed last year's pairs read-back", () => {
  beforeEach(() => {
    installFetchWithSeededHistory();
  });

  it("pre-fills the table from what is already recorded, instead of a blank form", async () => {
    render(<AdminDashboard />);

    // The giver/receiver selects load the stored pair (Alice -> Bob) rather
    // than the empty placeholder row the form used to always start with. Wait on
    // the loaded display value: the row element exists blank on first render, so
    // asserting by label alone would read "" before the async seed load lands.
    const giver = await screen.findByDisplayValue("Alice");
    expect(giver).toHaveAttribute("aria-label", "Giver for row 1");
    const receiver = screen.getByDisplayValue("Bob");
    expect(receiver).toHaveAttribute("aria-label", "Receiver for row 1");
  });

  it("shows what is recorded so a refresh reveals it (the write-only-form fix)", async () => {
    render(<AdminDashboard />);

    // Count in the section title, and the recorded-years summary - both are the
    // persistent "you can tell what's seeded" indication the form lacked before.
    expect(await screen.findByText(/1 recorded for 2025/i)).toBeInTheDocument();
    expect(screen.getByText(/Recorded so far: 2025 \(1\)/i)).toBeInTheDocument();
  });
});
