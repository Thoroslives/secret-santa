/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import Wishlist from "@/app/wishlist/page";

// useRouter must return a STABLE object: the wishlist mount effect depends on
// [router], so a fresh object each call would re-run it and re-fetch the session
// (resetting the active draw). The real Next router instance is stable.
jest.mock("next/navigation", () => {
  const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn() };
  return { useRouter: () => router };
});

function installFetch(draws: Array<{ personId: string; personName: string; groupId: string; groupName: string }>) {
  const ok = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response);
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/switch")) {
      const t = draws.find((d) => d.personId === JSON.parse(String(init?.body ?? "{}")).personId)!;
      return ok(t);
    }
    if (url.includes("/api/auth/session")) {
      return ok({ authenticated: true, isLoggedIn: true, personId: draws[0].personId, personName: draws[0].personName, groupId: draws[0].groupId, groupName: draws[0].groupName, draws });
    }
    if (url.includes("/api/auth/person-data")) return ok({ wishlistItems: [], assignment: null, matchSuggestions: [] });
    if (url.includes("/api/roster")) return ok({ roster: [] });
    if (url.includes("/api/suggestions")) return ok({ suggestions: [] });
    if (url.includes("/api/groups/")) return ok({ group: { id: draws[0].groupId } });
    return ok({});
  }) as unknown as typeof fetch;
}

const TWO = [
  { personId: "p-1", personName: "Chris", groupId: "g-1", groupName: "Family Draw" },
  { personId: "p-2", personName: "Chris", groupId: "g-2", groupName: "Partner Draw" },
];

describe("Wishlist draw switcher", () => {
  it("renders a tab per draw when in more than one", async () => {
    installFetch(TWO);
    render(<Wishlist />);
    expect(await screen.findByRole("tab", { name: "Family Draw" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Partner Draw" })).toBeInTheDocument();
  });

  it("switches the active draw when a tab is clicked", async () => {
    installFetch(TWO);
    render(<Wishlist />);
    fireEvent.click(await screen.findByRole("tab", { name: "Partner Draw" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Partner Draw" })).toHaveAttribute("aria-selected", "true"),
    );
    expect(global.fetch).toHaveBeenCalledWith("/api/auth/switch", expect.objectContaining({ method: "POST" }));
  });

  it("renders no tablist for a single-draw participant", async () => {
    installFetch([{ personId: "p-1", personName: "Nan", groupId: "g-1", groupName: "Family Draw" }]);
    render(<Wishlist />);
    await screen.findByText(/Welcome, Nan/i);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
