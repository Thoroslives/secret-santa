/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import AdminDashboard from "@/app/admin/dashboard/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const group = { id: "g1", name: "The Family Draw", year: 2026, budgetCurrency: "USD" };
const alice = {
  id: "a",
  name: "Alice",
  email: "alice@old.com",
  personalLinkToken: "t-a",
  _count: { wishlistItems: 0, suggestionsBy: 0 },
};

const res = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

interface Recorded {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

// The people list is rendered TWICE (a mobile card layout and a desktop table), so
// every control has two DOM nodes. jsdom applies no CSS, so both are "present" -
// hence getAllBy* and [0] throughout. In a real browser one of the two is
// display:none and therefore out of the accessibility tree.
const first = (label: string) => screen.getAllByLabelText(label)[0];

function installFetch(opts: {
  patch?: () => Promise<Response>;
  resend?: () => Promise<Response>;
  assignments?: unknown[];
}) {
  const calls: Recorded[] = [];

  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method || "GET").toUpperCase();
    calls.push({
      url,
      method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });

    if (url.includes("/api/auth/session")) return res(200, { authenticated: true, isAdmin: true });
    if (url.includes("/api/rounds/seed")) {
      return res(200, { year: 2025, activeYear: 2026, pairs: [], count: 0, seededYears: [] });
    }
    if (url.endsWith("/api/groups")) return res(200, [group]);
    if (url.includes("/api/assignments")) return res(200, { assignments: opts.assignments ?? [] });
    if (url.includes("/api/groups/g1")) return res(200, { group });
    if (/\/api\/people\/[^/]+\/resend/.test(url)) {
      return opts.resend ? opts.resend() : res(200, { sent: true, email: alice.email });
    }
    if (method === "PATCH" && url.includes("/api/people/")) {
      return opts.patch ? opts.patch() : res(200, { person: alice });
    }
    if (url.includes("/api/people")) return res(200, { people: [alice] });
    return res(200, {});
  }) as unknown as typeof fetch;

  return calls;
}

describe("AdminDashboard: edit a person's email", () => {
  it("Cancel discards the draft without making a request", async () => {
    const calls = installFetch({});
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Edit email for Alice"))[0]);
    fireEvent.change(first("Email for Alice"), { target: { value: "new@example.com" } });
    fireEvent.click(first("Cancel editing email for Alice"));

    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    expect(screen.queryAllByLabelText("Email for Alice")).toHaveLength(0);
  });

  // The common case: a person in one draw. One request, no dialog, no friction.
  it("saves a single-draw person in one request, with no confirmation", async () => {
    const calls = installFetch({});
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Edit email for Alice"))[0]);
    fireEvent.change(first("Email for Alice"), { target: { value: "new@example.com" } });
    fireEvent.click(first("Save email for Alice"));

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));

    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toEqual({ email: "new@example.com" });
    // applyToAll is deliberately ABSENT: its absence is what tells the server the
    // admin has not been asked about scope yet.
    expect(patch.body).not.toHaveProperty("applyToAll");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an inline error when the address is rejected", async () => {
    installFetch({ patch: () => res(400, { error: "Please enter a valid email address" }) });
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Edit email for Alice"))[0]);
    fireEvent.change(first("Email for Alice"), { target: { value: "nope" } });
    fireEvent.click(first("Save email for Alice"));

    expect(await screen.findAllByText(/valid email address/i)).not.toHaveLength(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("AdminDashboard: the scope question", () => {
  const siblings409 = () =>
    res(409, {
      needsConfirmation: true,
      // `email` is the SERVER's canonical form. The dialog must render this, not the
      // client's own guess at what it normalises to.
      email: "new@example.com",
      siblings: [
        { id: "a2", name: "Alice", groupId: "g2", groupName: "Christmas 2027", active: true },
      ],
      linksTo: [],
    });

  const openScopeDialog = async () => {
    fireEvent.click((await screen.findAllByLabelText("Edit email for Alice"))[0]);
    fireEvent.change(first("Email for Alice"), { target: { value: "new@example.com" } });
    fireEvent.click(first("Save email for Alice"));
    return screen.findByRole("dialog");
  };

  it("names the other draw rather than just counting it", async () => {
    installFetch({ patch: siblings409 });
    render(<AdminDashboard />);

    const dialog = await openScopeDialog();

    // The name is the point: in the genuine case it matches, in the accident case
    // it plainly does not. A bare count would hide that.
    expect(dialog).toHaveTextContent("Alice - Christmas 2027");
    expect(dialog).toHaveTextContent(/all 2 of their draws/i);
  });

  it("confirming 'all their draws' retries with applyToAll true", async () => {
    const calls = installFetch({ patch: siblings409 });
    render(<AdminDashboard />);
    const dialog = await openScopeDialog();

    // Defaulted to all draws, because the dialog only appears for a genuinely
    // multi-draw person and the usual reason to change an address is that the
    // human changed theirs.
    fireEvent.click(within(dialog).getByRole("button", { name: /save email/i }));

    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2);
    });
    expect(calls.filter((c) => c.method === "PATCH")[1].body).toMatchObject({
      email: "new@example.com",
      applyToAll: true,
    });
  });

  it("choosing 'this draw only' retries with applyToAll false", async () => {
    const calls = installFetch({ patch: siblings409 });
    render(<AdminDashboard />);
    const dialog = await openScopeDialog();

    fireEvent.click(within(dialog).getByLabelText(/the family draw only/i));
    fireEvent.click(within(dialog).getByRole("button", { name: /save email/i }));

    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2);
    });
    expect(calls.filter((c) => c.method === "PATCH")[1].body).toMatchObject({
      applyToAll: false,
    });
  });
});

describe("AdminDashboard: the cross-draw link warning", () => {
  const links409 = () =>
    res(409, {
      needsConfirmation: true,
      email: "bob@example.com",
      siblings: [],
      linksTo: [
        { id: "z", name: "Bob", groupId: "g2", groupName: "Christmas 2027", active: true },
      ],
    });

  it("names who already holds the address and says plainly what saving does", async () => {
    installFetch({ patch: links409 });
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Edit email for Alice"))[0]);
    fireEvent.change(first("Email for Alice"), { target: { value: "bob@example.com" } });
    fireEvent.click(first("Save email for Alice"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("bob@example.com");
    expect(dialog).toHaveTextContent("Bob - Christmas 2027");
    expect(dialog).toHaveTextContent(/see both matches/i);
  });

  // Consent is bound to the exact people the admin was shown, not a bare boolean.
  it("confirming echoes back the specific ids it was shown", async () => {
    const calls = installFetch({ patch: links409 });
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Edit email for Alice"))[0]);
    fireEvent.change(first("Email for Alice"), { target: { value: "bob@example.com" } });
    fireEvent.click(first("Save email for Alice"));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: /save email/i }));

    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2);
    });
    expect(calls.filter((c) => c.method === "PATCH")[1].body).toMatchObject({
      acknowledgedLinkIds: ["z"],
    });
  });

  it("Cancel closes the dialog and writes nothing", async () => {
    const calls = installFetch({ patch: links409 });
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Edit email for Alice"))[0]);
    fireEvent.change(first("Email for Alice"), { target: { value: "bob@example.com" } });
    fireEvent.click(first("Save email for Alice"));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
  });
});

describe("AdminDashboard: resend one person's match email", () => {
  const sentDraw = {
    assignments: [
      {
        id: "x",
        giver: { name: "Alice" },
        receiver: { name: "Bob", wishlistItems: [] },
        round: { status: "sent" },
      },
    ],
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("states the exact address in the confirm before mailing a permanent sign-in link", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    installFetch(sentDraw);
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Resend match email to Alice"))[0]);

    // /p/<token> never expires, and a plausible typo passes any format check. The
    // address has to be visible at the moment it would do damage.
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("alice@old.com"),
    );
  });

  it("posts to the resend route and echoes the address it sent to", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const calls = installFetch(sentDraw);
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Resend match email to Alice"))[0]);

    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/resend") && c.method === "POST")).toBe(true);
    });
    expect(await screen.findAllByText(/sent to alice@old\.com/i)).not.toHaveLength(0);
  });

  it("sends nothing when the confirm is declined", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const calls = installFetch(sentDraw);
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Resend match email to Alice"))[0]);

    expect(calls.some((c) => c.url.includes("/resend"))).toBe(false);
  });

  it("surfaces a failed send instead of pretending it worked", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    installFetch({
      ...sentDraw,
      resend: () => res(502, { error: "Could not send to alice@old.com. Check the mail settings." }),
    });
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Resend match email to Alice"))[0]);

    expect(await screen.findAllByText(/could not send/i)).not.toHaveLength(0);
  });

  // No draw generated yet, so there is nothing to resend.
  it("offers no resend button before a draw exists", async () => {
    installFetch({});
    render(<AdminDashboard />);

    await screen.findAllByLabelText("Edit email for Alice");
    expect(screen.queryAllByLabelText("Resend match email to Alice")).toHaveLength(0);
  });

  // Between Generate and Send the assignments exist but nothing has been mailed, so
  // a Resend button here could only ever produce the server's "not been sent yet"
  // 400. A control that cannot succeed should not be on screen.
  it("offers no resend button while the draw is generated but not yet sent", async () => {
    installFetch({
      assignments: [
        {
          id: "x",
          giver: { name: "Alice" },
          receiver: { name: "Bob", wishlistItems: [] },
          round: { status: "generated" },
        },
      ],
    });
    render(<AdminDashboard />);

    await screen.findAllByLabelText("Edit email for Alice");
    expect(screen.queryAllByLabelText("Resend match email to Alice")).toHaveLength(0);
  });
});

describe("AdminDashboard: the dialog must not swallow errors", () => {
  // The dialog is a full-screen overlay, so an error painted into the row behind it
  // is invisible: the admin clicks Save, the server 400s, and nothing appears to
  // happen. The 400s reachable from inside the dialog are exactly the cross-draw
  // collision and a unique-constraint violation - i.e. the last message standing
  // between "same human" and "two different humans".
  const links409 = () =>
    res(409, {
      needsConfirmation: true,
      email: "bob@example.com",
      siblings: [],
      linksTo: [
        { id: "z", name: "Bob", groupId: "g2", groupName: "Christmas 2027", active: true },
      ],
    });

  it("shows a rejected confirmation inside the dialog, and keeps it open", async () => {
    let call = 0;
    installFetch({
      patch: () => {
        call += 1;
        // First save -> needs confirmation. The confirmed retry -> rejected.
        return call === 1
          ? links409()
          : res(400, { error: "Email is already used in Christmas 2027" });
      },
    });
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Edit email for Alice"))[0]);
    fireEvent.change(first("Email for Alice"), { target: { value: "bob@example.com" } });
    fireEvent.click(first("Save email for Alice"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /save email/i }));

    // The message lands where the admin is actually looking...
    expect(
      await within(dialog).findByText(/already used in christmas 2027/i),
    ).toBeInTheDocument();
    // ...and the dialog stays up so they can correct it or back out.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("AdminDashboard: multi-draw read-back", () => {
  it("says how many draws the address landed in", async () => {
    let call = 0;
    installFetch({
      patch: () => {
        call += 1;
        return call === 1
          ? res(409, {
              needsConfirmation: true,
              email: "new@example.com",
              siblings: [
                { id: "a2", name: "Alice", groupId: "g2", groupName: "Christmas 2027", active: true },
              ],
              linksTo: [],
            })
          : res(200, { person: alice, drawsUpdated: 2 });
      },
    });
    render(<AdminDashboard />);

    fireEvent.click((await screen.findAllByLabelText("Edit email for Alice"))[0]);
    fireEvent.change(first("Email for Alice"), { target: { value: "new@example.com" } });
    fireEvent.click(first("Save email for Alice"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /save email/i }));

    // The people list only ever shows ONE group, so without this the write into the
    // other draw leaves no visible evidence anywhere.
    expect(await screen.findAllByText(/updated in 2 draws/i)).not.toHaveLength(0);
  });
});
