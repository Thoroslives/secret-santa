/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import AdminDashboard from "@/app/admin/dashboard/page";

// The dashboard redirects via next/navigation on an unauthenticated session.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Mount fetches: session -> groups list -> per-group data. One group exists,
// so the dashboard renders its non-empty (loaded) state.
function installFetchWithOneGroup() {
  const group = {
    id: "g1",
    name: "The Family Draw",
    year: 2026,
    budgetCurrency: "USD",
    suggestionCap: 3,
    previousYearMemory: 1,
  };
  const ok = (body: unknown) =>
    Promise.resolve({ ok: true, json: async () => body } as Response);

  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/session")) return ok({ authenticated: true, isAdmin: true });
    if (url.endsWith("/api/groups")) return ok([group]);
    if (url.includes("/api/people")) return ok({ people: [] });
    if (url.includes("/api/assignments")) return ok({ assignments: [] });
    if (url.includes("/api/groups/g1")) return ok({ group });
    return ok({});
  }) as unknown as typeof fetch;
}

describe("AdminDashboard: creating another group", () => {
  beforeEach(() => {
    installFetchWithOneGroup();
  });

  it("offers a create-group control even when a group already exists", async () => {
    render(<AdminDashboard />);

    // Wait until groups have loaded and the picker is on screen.
    expect(await screen.findByLabelText("Group")).toBeInTheDocument();

    // Regression: the create-group form used to live ONLY in the
    // groups.length === 0 empty state, so a second group could never be made.
    expect(
      screen.getByRole("button", { name: /new group/i })
    ).toBeInTheDocument();
  });
});
