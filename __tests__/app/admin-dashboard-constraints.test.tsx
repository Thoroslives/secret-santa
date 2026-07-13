/**
 * @jest-environment jsdom
 *
 * The constraints panel. The APIs behind it (/api/pins, /api/blocks) have existed and
 * been tested since P2, but there was never a UI for them - so pins and blocks were
 * both unreachable AND unreadable. These tests are mostly about the READ side: that the
 * panel shows what is actually stored. A write-only constraint editor is the bug this
 * whole change exists to remove (it is the second one in this app - the seed panel was
 * the first).
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import AdminDashboard from "@/app/admin/dashboard/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const group = { id: "g1", name: "The Family Draw", year: 2026, budgetCurrency: "USD" };
const people = [
  { id: "a", name: "Alice", personalLinkToken: "t-a", _count: { wishlistItems: 0, suggestionsBy: 0 } },
  { id: "b", name: "Bob", personalLinkToken: "t-b", _count: { wishlistItems: 0, suggestionsBy: 0 } },
  { id: "c", name: "Cara", personalLinkToken: "t-c", _count: { wishlistItems: 0, suggestionsBy: 0 } },
];

const ok = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response);

/**
 * @param round      the round the dashboard loads (null = no draw yet)
 * @param postResult what a constraint POST returns - used to drive the 409 refusal path
 */
function installFetch(opts: {
  round?: { id: string; year: number; status: string } | null;
  postResult?: { ok: boolean; body: unknown };
} = {}) {
  const round = opts.round ?? null;
  const calls: { url: string; method?: string }[] = [];

  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, method: init?.method });

    if (init?.method === "POST" || init?.method === "DELETE") {
      if (url.includes("/api/pins") || url.includes("/api/blocks")) {
        const r = opts.postResult ?? { ok: true, body: {} };
        return Promise.resolve({ ok: r.ok, json: async () => r.body } as Response);
      }
    }

    if (url.includes("/api/auth/session")) return ok({ authenticated: true, isAdmin: true });
    if (url.includes("/api/rounds/seed")) return ok({ pairs: [], count: 0, seededYears: [] });
    if (url.endsWith("/api/groups")) return ok([group]);
    if (url.includes("/api/people")) return ok({ people });
    if (url.includes("/api/assignments")) return ok({ assignments: [], round });
    if (url.includes("/api/pins")) return ok({ pins: [{ id: "pin-1", giverId: "a", receiverId: "b" }], year: 2026 });
    if (url.includes("/api/blocks")) return ok({ blocks: [{ id: "blk-1", personAId: "b", personBId: "c" }] });
    if (url.includes("/api/groups/g1")) return ok({ group });
    return ok({});
  }) as unknown as typeof fetch;

  return calls;
}

describe("AdminDashboard: constraints panel", () => {
  it("reads back the stored pins and blocks, by name", async () => {
    installFetch();
    render(<AdminDashboard />);

    // The whole point: constraints that exist in the DB are visible. The API returns raw
    // ids; the panel names them from the `people` it already holds.
    //
    // Assert via the aria-labels, not the visible text: every one of these names also
    // appears in the People table, so a bare /Alice/ matcher is ambiguous and would pass
    // on the roster alone - i.e. it would pass even if the panel rendered nothing.
    expect(await screen.findByLabelText(/Remove pin Alice draws Bob/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Remove block between Bob and Cara/i)).toBeInTheDocument();
  });

  it("posts a new pin and reloads, so the panel shows what the server stored", async () => {
    const calls = installFetch();
    render(<AdminDashboard />);
    await screen.findByLabelText("Pin giver");

    fireEvent.change(screen.getByLabelText("Pin giver"), { target: { value: "c" } });
    fireEvent.change(screen.getByLabelText("Pin receiver"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: /Add pin/i }));

    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/api/pins") && c.method === "POST")).toBe(true);
    });
    // Re-read after the write, rather than trusting our own optimistic guess.
    await waitFor(() => {
      expect(calls.filter((c) => c.url.includes("/api/pins") && !c.method).length).toBeGreaterThan(1);
    });
  });

  it("removes a pin and reloads", async () => {
    const calls = installFetch();
    render(<AdminDashboard />);

    fireEvent.click(await screen.findByLabelText(/Remove pin Alice draws Bob/i));

    await waitFor(() => {
      expect(
        calls.some((c) => c.url.includes("/api/pins?id=pin-1") && c.method === "DELETE")
      ).toBe(true);
    });
  });

  it("adds a block and reloads", async () => {
    const calls = installFetch();
    render(<AdminDashboard />);
    await screen.findByLabelText("Block person one");

    fireEvent.change(screen.getByLabelText("Block person one"), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText("Block person two"), { target: { value: "c" } });
    fireEvent.click(screen.getByRole("button", { name: /Add block/i }));

    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/api/blocks") && c.method === "POST")).toBe(true);
    });
  });

  // The year must come from the pins GET (which resolves it server-side), NOT from the
  // `groups` list - `groups` is never refreshed by a rollover, so after one it would
  // title next year's pins with last year's number while writing new pins into next year.
  it("titles the pins with the year the API reports, not the stale group year", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/session")) return ok({ authenticated: true, isAdmin: true });
      if (url.includes("/api/rounds/seed")) return ok({ pairs: [], count: 0, seededYears: [] });
      // The group list still says 2026 (it is only reloaded on mount)...
      if (url.endsWith("/api/groups")) return ok([{ ...group, year: 2026 }]);
      if (url.includes("/api/people")) return ok({ people });
      if (url.includes("/api/assignments")) return ok({ assignments: [], round: null });
      // ...but the server has actually rolled over to 2027.
      if (url.includes("/api/pins")) return ok({ pins: [], year: 2027 });
      if (url.includes("/api/blocks")) return ok({ blocks: [] });
      if (url.includes("/api/groups/g1")) return ok({ group });
      return ok({});
    }) as unknown as typeof fetch;

    render(<AdminDashboard />);
    expect(await screen.findByText(/2027 only/)).toBeInTheDocument();
    expect(screen.queryByText(/2026 only/)).not.toBeInTheDocument();
  });

  // The stale-draw guard. A generated draw that contradicts a new pin makes the API
  // refuse (409) rather than silently accept a constraint the draw ignores - which,
  // before this, could be emailed to real people. The panel must surface the refusal.
  it("shows the API's refusal when the generated draw contradicts the new pin", async () => {
    installFetch({
      round: { id: "r1", year: 2026, status: "generated" },
      postResult: {
        ok: false,
        body: { error: "The current draw doesn't match this pin. Clear the draw and generate again to apply it." },
      },
    });
    render(<AdminDashboard />);
    await screen.findByLabelText("Pin giver");

    fireEvent.change(screen.getByLabelText("Pin giver"), { target: { value: "c" } });
    fireEvent.change(screen.getByLabelText("Pin receiver"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: /Add pin/i }));

    expect(await screen.findByText(/Clear the draw and generate again/i)).toBeInTheDocument();
  });

  // Boss's rule: a sent draw is history. Pins for it are locked, but a BLOCK is a
  // permanent fact about two people and stays editable - it simply applies from the
  // next draw. These two assertions are the whole asymmetry.
  describe("once the draw has been sent", () => {
    beforeEach(() => {
      installFetch({ round: { id: "r1", year: 2026, status: "sent" } });
    });

    it("locks the pin form", async () => {
      render(<AdminDashboard />);
      expect(await screen.findByText(/Locked — this draw has been sent/i)).toBeInTheDocument();
      expect(screen.queryByLabelText("Pin giver")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Add pin/i })).not.toBeInTheDocument();
    });

    it("leaves the block form usable, and says when the change takes effect", async () => {
      render(<AdminDashboard />);
      expect(await screen.findByLabelText("Block person one")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Add block/i })).toBeInTheDocument();
      expect(screen.getByText(/apply from the next draw/i)).toBeInTheDocument();
    });
  });
});
