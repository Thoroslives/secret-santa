/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import AdminDashboard from "@/app/admin/dashboard/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const group = {
  id: "g1",
  name: "North Family",
  year: 2026,
  budgetCurrency: "USD",
  suggestionCap: 3,
  previousYearMemory: 1,
};

const people = [
  {
    id: "p1",
    name: "Chris",
    email: "chris@north.cx",
    active: true,
    personalLinkToken: "t1",
    _count: { wishlistItems: 0 },
  },
  {
    id: "p2",
    name: "Sam",
    email: "sam@north.cx",
    active: true,
    personalLinkToken: "t2",
    _count: { wishlistItems: 0 },
  },
];

// `round` is served independently of the assignment rows - that separation is the whole
// point, because a round can be `sent` while holding zero assignments.
function installFetch(assignments: unknown[], round: unknown) {
  const ok = (body: unknown) =>
    Promise.resolve({ ok: true, json: async () => body } as Response);

  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/session")) return ok({ authenticated: true, isAdmin: true });
    if (url.endsWith("/api/groups")) return ok([group]);
    if (url.includes("/api/people")) return ok({ people });
    if (url.includes("/api/assignments")) return ok({ assignments, round });
    if (url.includes("/api/groups/g1")) return ok({ group });
    return ok({});
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("AdminDashboard: deleting a draw", () => {
  afterEach(() => jest.restoreAllMocks());

  it("names the group and its people in the confirm, and deletes on OK", async () => {
    const fetchMock = installFetch([], { id: "r1", status: "draft", sentAt: null });
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

    render(<AdminDashboard />);
    const button = await screen.findByRole("button", { name: /delete this draw/i });
    fireEvent.click(button);

    // "Are you sure?" tells the admin nothing. The confirm must say what dies.
    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain("North Family");
    expect(message).toContain("2 people");
    expect(message).toMatch(/cannot be undone/i);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/groups/g1", { method: "DELETE" })
    );
  });

  it("does not call the API when the confirm is declined", async () => {
    const fetchMock = installFetch([], { id: "r1", status: "draft", sentAt: null });
    jest.spyOn(window, "confirm").mockReturnValue(false);

    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: /delete this draw/i }));

    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE"
      )
    ).toHaveLength(0);
  });
});

describe("AdminDashboard: a round marked sent with no matches in it", () => {
  afterEach(() => jest.restoreAllMocks());

  // The exact live state of 2026-07-13: the draw was sent, the rows were later destroyed
  // by a cascade, and the dashboard - branching on assignments.length - offered "Generate
  // Assignments", which the API refuses on a sent round. A dead end with no way out.
  it("offers Reset draw instead of a Generate button the API would refuse", async () => {
    installFetch([], { id: "r1", status: "sent", sentAt: "2026-07-12T20:40:16.000Z" });

    render(<AdminDashboard />);

    expect(await screen.findByRole("button", { name: /reset draw/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /generate assignments/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/has no matches in it/i)).toBeInTheDocument();
  });

  it("still offers Generate for an ordinary empty draft round", async () => {
    installFetch([], { id: "r1", status: "draft", sentAt: null });

    render(<AdminDashboard />);

    expect(
      await screen.findByRole("button", { name: /generate assignments/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset draw/i })).not.toBeInTheDocument();
  });

  // A control that cannot succeed should not be on screen. Resend is gated on "the round
  // was sent", which is TRUE in the stranded state - but there are no matches to resend, so
  // the button could only ever 400 ("this person is not in the current draw").
  it("does not offer Resend when the round is sent but holds no matches", async () => {
    installFetch([], { id: "r1", status: "sent", sentAt: "2026-07-12T20:40:16.000Z" });

    render(<AdminDashboard />);
    await screen.findByRole("button", { name: /reset draw/i });

    expect(screen.queryAllByLabelText(/resend/i)).toHaveLength(0);
  });
});

describe("AdminDashboard: clearing a draw that already went out", () => {
  afterEach(() => jest.restoreAllMocks());

  // "Are you sure you want to delete all assignments for this year?" reads like a routine
  // re-roll. On a SENT draw it silently un-reveals every match the family already opened
  // and re-pairs everyone. The confirm has to say that.
  it("warns that the matches were already sent and everyone will be re-paired", async () => {
    const assignments = [
      {
        id: "a1",
        giver: { id: "p1", name: "Chris" },
        receiver: { id: "p2", name: "Sam", wishlistItems: [] },
      },
    ];
    installFetch(assignments, { id: "r1", status: "sent", sentAt: "2026-07-12T20:40:16.000Z" });
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);

    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: /delete & regenerate/i }));

    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toMatch(/already SENT/i);
    expect(message).toMatch(/lose the match/i);
  });
});
