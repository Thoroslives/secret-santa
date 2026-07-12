"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Person {
  id: string;
  name: string;
  email?: string;
  personalLinkToken: string;
  _count: { wishlistItems: number; suggestionsBy: number };
}

interface Assignment {
  id: string;
  giver: { name: string };
  receiver: { name: string; wishlistItems: Array<{ title: string; note?: string | null }> };
}

interface GroupBudget {
  budgetAmount?: number;
  budgetCurrency?: string;
}

interface GroupSummary {
  id: string;
  name: string;
  year: number;
  organiserName?: string | null;
  personalMessage?: string | null;
}

export default function AdminDashboard() {
  const [people, setPeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonEmail, setNewPersonEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [shareLinks, setShareLinks] = useState<{ name: string; link: string }[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Full shareable participant link. Uses NEXT_PUBLIC_APP_URL when set (e.g.
  // https://santa.north.cx), otherwise auto-detects the current site origin in
  // the browser - so the copied link always points where the admin is viewing.
  const personalLink = (token: string) =>
    `${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")}/p/${token}`;

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) - the full link stays visible to copy by hand.
    }
  };
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [budget, setBudget] = useState<GroupBudget>({ budgetAmount: undefined, budgetCurrency: "USD" });
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("USD");
  const [suggestionCap, setSuggestionCap] = useState(3);
  const [previousYearMemory, setPreviousYearMemory] = useState(1);
  const [organiserName, setOrganiserName] = useState("");
  const [personalMessage, setPersonalMessage] = useState("");
  const [seedYear, setSeedYear] = useState("");
  const [seedPairs, setSeedPairs] = useState<{ giverId: string; receiverId: string }[]>([
    { giverId: "", receiverId: "" },
  ]);
  // Read-back state for the seed section: how many pairs are recorded for the
  // year in the form, every past year that already has pairs, inline save
  // feedback next to the form, and whether the collapsible box is open.
  const [seedRecorded, setSeedRecorded] = useState(0);
  const [seededYears, setSeededYears] = useState<{ year: number; count: number }[]>([]);
  const [seedMessage, setSeedMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (activeYear !== null) {
      setSeedYear(String(activeYear - 1));
    }
  }, [activeYear]);

  useEffect(() => {
    // Check admin session from server. The super-admin owns every group now,
    // so there is no adminGroupId/adminInviteCode on the session response -
    // once we know the caller is an admin, fetch the list of groups they
    // administer instead.
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((session) => {
        if (!session.authenticated || !session.isAdmin) {
          router.push("/admin");
          return;
        }

        loadGroups();
      })
      .catch(() => {
        router.push("/admin");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Fetches every group the admin can administer. Used on mount and again
  // after creating a group from the empty state. Defaults the picker to the
  // first group (alphabetical, per the API's ordering) and loads its data;
  // an empty list just stops the loading spinner so the empty-state prompt
  // can render.
  const loadGroups = async () => {
    try {
      const res = await fetch("/api/groups");
      if (!res.ok) {
        setGroups([]);
        setActiveGroupId("");
        setError("Failed to load groups");
        setLoading(false);
        return;
      }

      const data: GroupSummary[] = await res.json();
      setGroups(data);

      if (data.length > 0) {
        setActiveGroupId(data[0].id);
        await loadData(data[0].id);
      } else {
        setActiveGroupId("");
        setLoading(false);
      }
    } catch (err) {
      setGroups([]);
      setActiveGroupId("");
      setError("Failed to load groups");
      setLoading(false);
    }
  };

  const handleSelectGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    setError("");
    setSuccessMessage("");
    setShareLinks([]);
    setSeedPairs([{ giverId: "", receiverId: "" }]);
    setSeedRecorded(0);
    setSeededYears([]);
    setSeedMessage(null);
    setSeedOpen(false);
    loadData(groupId);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!newGroupName.trim()) {
      setError("Group name is required");
      return;
    }

    try {
      const res = await fetch("/api/groups/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupName: newGroupName.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create group");
        return;
      }

      setNewGroupName("");
      setShowNewGroup(false);
      setSuccessMessage(`Created ${data.group.name}`);
      await loadGroups();
    } catch (err) {
      setError("An error occurred");
    }
  };

  const loadData = async (groupId: string) => {
    try {
      const [peopleRes, assignmentsRes, groupRes] = await Promise.all([
        fetch(`/api/people?groupId=${groupId}`),
        fetch(`/api/assignments?groupId=${groupId}`),
        fetch(`/api/groups/${groupId}`),
      ]);

      const peopleData = await peopleRes.json();
      const assignmentsData = await assignmentsRes.json();
      const groupData = await groupRes.json();

      setPeople(peopleData.people || []);
      setAssignments(assignmentsData.assignments || []);

      if (groupData.group) {
        setBudget({
          budgetAmount: groupData.group.budgetAmount,
          budgetCurrency: groupData.group.budgetCurrency || "USD"
        });
        setBudgetAmount(groupData.group.budgetAmount?.toString() || "");
        setBudgetCurrency(groupData.group.budgetCurrency || "USD");
        setActiveYear(groupData.group.year);
        if (typeof groupData.group.suggestionCap === "number") {
          setSuggestionCap(groupData.group.suggestionCap);
        }
        if (typeof groupData.group.previousYearMemory === "number") {
          setPreviousYearMemory(groupData.group.previousYearMemory);
        }
        setOrganiserName(groupData.group.organiserName || "");
        setPersonalMessage(groupData.group.personalMessage || "");
      }

      setLoading(false);
    } catch (err) {
      setError("Failed to load data");
      setLoading(false);
    }
  };

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!newPersonName.trim()) {
      setError("Name is required");
      return;
    }

    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPersonName,
          email: newPersonEmail.trim() || undefined,
          groupId: activeGroupId
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add person");
        return;
      }

      const emailMsg = data.person.email ? ` and email: ${data.person.email}` : "";
      setSuccessMessage(`Added ${data.person.name}${emailMsg}`);
      setNewPersonName("");
      setNewPersonEmail("");
      loadData(activeGroupId);
    } catch (err) {
      setError("An error occurred");
    }
  };

  const handleDeletePerson = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) {
      return;
    }

    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch(`/api/people/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setError("Failed to delete person");
        return;
      }

      setSuccessMessage(`Deleted ${name}`);
      loadData(activeGroupId);
    } catch (err) {
      setError("An error occurred");
    }
  };

  const handleGenerateAssignments = async () => {
    if (
      !confirm(
        "This will generate Secret Santa assignments for everyone. Make sure all people have been added. Continue?"
      )
    ) {
      return;
    }

    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch("/api/rounds/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: activeGroupId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate assignments");
        return;
      }

      setSuccessMessage(`Generated ${data.count} Secret Santa assignments!`);
      loadData(activeGroupId);
    } catch (err) {
      setError("An error occurred");
    }
  };

  const handleSendMatches = async () => {
    if (!confirm("Send everyone their match? Participants will then be able to see who they drew.")) {
      return;
    }
    setError("");
    setSuccessMessage("");
    try {
      const res = await fetch("/api/rounds/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: activeGroupId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send matches");
        return;
      }
      setShareLinks(data.shareLinks || []);
      setSuccessMessage(
        `Matches sent (${data.sent} emailed, ${data.failed} could not be emailed). Share the personal links below with anyone who has no email.`
      );
    } catch (err) {
      setError("An error occurred");
    }
  };

  const handleRollover = async () => {
    const next = (activeYear ?? new Date().getFullYear()) + 1;
    if (
      !confirm(
        `Start ${next}? This year's matches move to history and everyone's wishlists reset. Past pairs stay viewable. Continue?`
      )
    ) {
      return;
    }

    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch("/api/rounds/rollover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: activeGroupId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start next year");
        return;
      }

      setShareLinks([]);
      setSuccessMessage(`Started ${data.year}. Wishlists have been reset for the new year.`);
      loadData(activeGroupId);
    } catch (err) {
      setError("An error occurred");
    }
  };

  // Load whatever pairs are already recorded for the selected seed year, so the
  // table shows and edits real history instead of always starting blank.
  // Best-effort: a failed read just leaves the form usable. Re-runs whenever the
  // group or the year changes (see the effect below) and after a successful save.
  const loadSeed = async (groupId: string, year: string) => {
    if (!groupId || year.trim().length !== 4) return;
    const yearNum = parseInt(year, 10);
    if (!Number.isInteger(yearNum)) return;
    try {
      const res = await fetch(`/api/rounds/seed?groupId=${groupId}&year=${yearNum}`);
      if (!res.ok) return;
      const data = await res.json();
      const pairs: { giverId: string; receiverId: string }[] = data.pairs || [];
      setSeedPairs(pairs.length > 0 ? pairs : [{ giverId: "", receiverId: "" }]);
      setSeedRecorded(typeof data.count === "number" ? data.count : pairs.length);
      setSeededYears(data.seededYears || []);
      // Reveal the box on load when there is history, so a refresh visibly
      // shows what has been recorded instead of a collapsed, blank form.
      if ((data.count || 0) > 0) setSeedOpen(true);
    } catch {
      // best-effort read-back - leave the form as-is
    }
  };

  useEffect(() => {
    if (activeGroupId && seedYear) {
      // Clear any prior save feedback when the year/group changes so a "Saved
      // 2025" note doesn't linger over a different year. The post-save re-load
      // calls loadSeed directly (not this effect), so its success note survives.
      setSeedMessage(null);
      loadSeed(activeGroupId, seedYear);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId, seedYear]);

  const handleAddSeedRow = () => {
    setSeedPairs((rows) => [...rows, { giverId: "", receiverId: "" }]);
  };

  const handleSeedRowChange = (index: number, field: "giverId" | "receiverId", value: string) => {
    setSeedPairs((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleSeedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setSeedMessage(null);

    const yearNum = parseInt(seedYear, 10);
    if (!seedYear.trim() || isNaN(yearNum)) {
      setSeedMessage({ kind: "error", text: "Enter a valid year" });
      return;
    }

    const pairs = seedPairs
      .filter((p) => p.giverId && p.receiverId)
      .map((p) => ({ giverId: p.giverId, receiverId: p.receiverId }));

    if (pairs.length === 0) {
      setSeedMessage({ kind: "error", text: "Add at least one giver and receiver pair" });
      return;
    }

    try {
      const res = await fetch("/api/rounds/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: activeGroupId, year: yearNum, pairs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSeedMessage({ kind: "error", text: data.error || "Failed to save last year's pairs" });
        return;
      }
      setSeedMessage({ kind: "success", text: `Saved ${data.seeded} pair(s) for ${data.year}.` });
      // Re-load so the table reflects exactly what is now stored (instead of
      // wiping to a blank row) and the recorded count / summary refresh.
      await loadSeed(activeGroupId, String(yearNum));
    } catch (err) {
      setSeedMessage({ kind: "error", text: "An error occurred" });
    }
  };

  const handleDeleteAssignments = async () => {
    if (!confirm("Are you sure you want to delete all assignments for this year?")) {
      return;
    }

    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch(`/api/assignments?groupId=${activeGroupId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setError("Failed to delete assignments");
        return;
      }

      setSuccessMessage("Deleted all assignments");
      loadData(activeGroupId);
    } catch (err) {
      setError("An error occurred");
    }
  };

  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    const amount = budgetAmount.trim() ? parseFloat(budgetAmount) : undefined;

    if (budgetAmount.trim() && (isNaN(amount!) || amount! <= 0)) {
      setError("Please enter a valid budget amount");
      return;
    }

    try {
      const res = await fetch(`/api/groups/${activeGroupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgetAmount: amount,
          budgetCurrency: budgetCurrency,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update budget");
        return;
      }

      setSuccessMessage("Budget updated successfully!");
      setBudget({ budgetAmount: amount, budgetCurrency });
    } catch (err) {
      setError("An error occurred");
    }
  };

  const handleUpdateOrganiser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (organiserName.length > 100) {
      setError("Organiser name must be 100 characters or fewer");
      return;
    }
    if (personalMessage.length > 2000) {
      setError("Personal message must be 2000 characters or fewer");
      return;
    }

    try {
      const res = await fetch(`/api/groups/${activeGroupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organiserName, personalMessage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update organiser note");
        return;
      }
      setSuccessMessage("Organiser note updated successfully!");
    } catch (err) {
      setError("An error occurred");
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!Number.isInteger(suggestionCap) || suggestionCap < 0 || suggestionCap > 10) {
      setError("Suggestion cap must be a whole number between 0 and 10");
      return;
    }

    if (!Number.isInteger(previousYearMemory) || previousYearMemory < 0 || previousYearMemory > 10) {
      setError("Previous year memory must be a whole number between 0 and 10");
      return;
    }

    try {
      const res = await fetch(`/api/groups/${activeGroupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestionCap,
          previousYearMemory,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update settings");
        return;
      }

      setSuccessMessage("Settings updated successfully!");
    } catch (err) {
      setError("An error occurred");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-canvas">
        <div className="text-xl text-ink-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-canvas p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink-strong sm:text-4xl">Admin Dashboard</h1>
            {groups.length > 0 && (
              <div className="mt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="groupPicker" className="text-sm text-ink-muted">
                    Group
                  </label>

                  <select
                    id="groupPicker"
                    value={activeGroupId}
                    onChange={(e) => handleSelectGroup(e.target.value)}
                    className="max-w-full appearance-none rounded-sm border border-border-strong bg-raised py-2 pl-3 pr-8 text-sm text-ink sm:text-base"
                    style={{
                      backgroundImage:
                        "url(\"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2IiBmaWxsPSJub25lIiBzdHJva2U9IiNhMzlhOGYiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik00IDZsNCA0IDQtNCIvPjwvc3ZnPg==\")",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 0.6rem center",
                    }}
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.year})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowNewGroup((v) => !v)}
                    aria-expanded={showNewGroup}
                    className="min-h-[44px] rounded-sm border border-border px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                  >
                    + New group
                  </button>
                </div>

                {showNewGroup && (
                  <form onSubmit={handleCreateGroup} className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      aria-label="New group name"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="rounded-sm border border-border bg-raised px-3 py-2 text-sm text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                      placeholder="New group name"
                      required
                    />
                    <button
                      type="submit"
                      className="min-h-[44px] rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-on transition-colors hover:bg-primary-hover"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewGroup(false);
                        setNewGroupName("");
                      }}
                      className="min-h-[44px] rounded-sm border border-border px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="min-h-[44px] self-start rounded-sm border border-border px-4 py-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink sm:self-auto"
          >
            Logout
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-danger">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-success">
            {successMessage}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="max-w-lg rounded-md border border-border bg-surface p-6 shadow-elev-1">
            <h2 className="mb-2 text-xl font-semibold text-ink-strong">No groups yet</h2>
            <p className="mb-4 text-ink-muted">
              Create a group to start administering people, assignments, and settings.
            </p>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label htmlFor="newGroupName" className="mb-2 block text-sm font-medium text-ink-muted">
                  Group name
                </label>
                <input
                  type="text"
                  id="newGroupName"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full rounded-sm border border-border bg-raised px-4 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                  placeholder="Smith Family Secret Santa"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-sm bg-primary py-2 font-semibold text-primary-on transition-colors hover:bg-primary-hover"
              >
                Create group
              </button>
            </form>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Add Person Section */}
            <div className="rounded-md border border-border bg-surface p-6 shadow-elev-1">
              <h2 className="mb-4 text-xl font-semibold text-ink-strong">Add Person</h2>
              <form onSubmit={handleAddPerson} className="space-y-4">
                <div>
                  <label htmlFor="name" className="mb-2 block text-sm font-medium text-ink-muted">
                    Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={newPersonName}
                    onChange={(e) => setNewPersonName(e.target.value)}
                    className="w-full rounded-sm border border-border bg-raised px-4 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                    placeholder="Enter person's name"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-ink-muted">
                    Email <span className="text-ink-muted">(optional)</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={newPersonEmail}
                    onChange={(e) => setNewPersonEmail(e.target.value)}
                    className="w-full rounded-sm border border-border bg-raised px-4 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                    placeholder="person@example.com"
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    If provided, they can request their personal login link by email (self-service)
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-sm bg-primary py-2 font-semibold text-primary-on transition-colors hover:bg-primary-hover"
                >
                  Add Person
                </button>
              </form>
            </div>

            {/* Budget Management */}
            <div className="rounded-md border border-border bg-surface p-6 shadow-elev-1">
              <h2 className="mb-4 text-xl font-semibold text-ink-strong">Gift Budget</h2>
              <form onSubmit={handleUpdateBudget} className="space-y-4">
                <div>
                  <label htmlFor="budgetAmount" className="mb-2 block text-sm font-medium text-ink-muted">
                    Budget Amount <span className="text-ink-muted">(optional)</span>
                  </label>
                  <input
                    type="number"
                    id="budgetAmount"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    className="w-full rounded-sm border border-border bg-raised px-4 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                    placeholder="50.00"
                    step="0.01"
                    min="0"
                  />
                </div>

                <div>
                  <label htmlFor="budgetCurrency" className="mb-2 block text-sm font-medium text-ink-muted">
                    Currency
                  </label>
                  <select
                    id="budgetCurrency"
                    value={budgetCurrency}
                    onChange={(e) => setBudgetCurrency(e.target.value)}
                    className="w-full rounded-sm border border-border bg-raised px-4 py-2 text-ink focus:border-transparent focus:ring-2 focus:ring-accent"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="CAD">CAD - Canadian Dollar</option>
                    <option value="AUD">AUD - Australian Dollar</option>
                    <option value="ZAR">ZAR - South African Rand</option>
                    <option value="JPY">JPY - Japanese Yen</option>
                    <option value="CHF">CHF - Swiss Franc</option>
                    <option value="SEK">SEK - Swedish Krona</option>
                    <option value="NOK">NOK - Norwegian Krone</option>
                    <option value="DKK">DKK - Danish Krone</option>
                    <option value="NZD">NZD - New Zealand Dollar</option>
                    <option value="MXN">MXN - Mexican Peso</option>
                    <option value="BRL">BRL - Brazilian Real</option>
                    <option value="INR">INR - Indian Rupee</option>
                    <option value="CNY">CNY - Chinese Yuan</option>
                    <option value="KRW">KRW - South Korean Won</option>
                    <option value="SGD">SGD - Singapore Dollar</option>
                  </select>
                </div>

                <div className="text-sm text-ink-muted">
                  {budget.budgetAmount ? (
                    <p>Current budget: <span className="font-semibold text-accent-text">{budget.budgetCurrency} {budget.budgetAmount}</span></p>
                  ) : (
                    <p className="italic">No budget set</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full rounded-sm bg-primary py-2 font-semibold text-primary-on transition-colors hover:bg-primary-hover"
                >
                  Update Budget
                </button>
              </form>
            </div>

            {/* Organiser Note */}
            <div className="rounded-md border border-border bg-surface p-6 shadow-elev-1">
              <h2 className="mb-4 text-xl font-semibold text-ink-strong">Organiser note</h2>
              <form onSubmit={handleUpdateOrganiser} className="space-y-4">
                <div>
                  <label htmlFor="organiserName" className="mb-2 block text-sm font-medium text-ink-muted">
                    Organiser name <span className="text-ink-muted">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="organiserName"
                    value={organiserName}
                    onChange={(e) => setOrganiserName(e.target.value)}
                    maxLength={100}
                    className="w-full rounded-sm border border-border bg-raised px-4 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                    placeholder="e.g. Aunt Mabel"
                  />
                </div>

                <div>
                  <label htmlFor="personalMessage" className="mb-2 block text-sm font-medium text-ink-muted">
                    Personal message <span className="text-ink-muted">(optional)</span>
                  </label>
                  <textarea
                    id="personalMessage"
                    value={personalMessage}
                    onChange={(e) => setPersonalMessage(e.target.value)}
                    maxLength={2000}
                    rows={4}
                    className="w-full rounded-sm border border-border bg-raised px-4 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                    placeholder="A note shown in the emails participants receive."
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    Shown as a note in the sign-in and match-ready emails for this group. Independent per group.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-sm bg-primary py-2 font-semibold text-primary-on transition-colors hover:bg-primary-hover"
                >
                  Save organiser note
                </button>
              </form>
            </div>

            {/* Secret Santa Assignments */}
            <div className="rounded-md border border-border bg-surface p-6 shadow-elev-1">
              <h2 className="mb-4 text-xl font-semibold text-ink-strong">Secret Santa</h2>
              <div className="space-y-4">
                <p className="text-ink-muted">
                  {people.length} people registered
                  {assignments.length > 0 && ` • ${assignments.length} assignments created`}
                </p>
                {assignments.length === 0 ? (
                  <button
                    onClick={handleGenerateAssignments}
                    disabled={people.length < 3}
                    className="w-full rounded-sm bg-primary py-2 font-semibold text-primary-on transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Generate Assignments
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleSendMatches}
                      className="w-full rounded-sm bg-primary py-2 font-semibold text-primary-on transition-colors hover:bg-primary-hover"
                    >
                      Send matches
                    </button>
                    <button
                      onClick={handleDeleteAssignments}
                      className="w-full rounded-sm border border-danger/40 py-2 font-semibold text-danger transition-colors hover:bg-danger/10"
                    >
                      Delete &amp; Regenerate
                    </button>
                  </>
                )}
                {people.length < 3 && (
                  <p className="text-sm text-danger">Need at least 3 people to generate assignments</p>
                )}
                <div className="mt-4 border-t border-border pt-4">
                  <button
                    onClick={handleRollover}
                    className="w-full rounded-sm border border-border py-2 font-semibold text-ink transition-colors hover:bg-raised"
                  >
                    Start next year
                  </button>
                  <p className="mt-2 text-xs text-ink-muted">
                    Moves this year&apos;s matches to history and resets everyone&apos;s wishlist for the new year.
                  </p>
                </div>
                {shareLinks.length > 0 && (
                  <div className="mt-4 text-sm text-ink-muted">
                    <p className="mb-1 font-semibold text-ink-strong">Personal links (copy to share manually):</p>
                    <ul className="space-y-1">
                      {shareLinks.map((s) => (
                        <li key={s.link} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 break-all">
                            <span className="text-ink-strong">{s.name}:</span> {s.link}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(s.link, s.link)}
                            className="shrink-0 rounded-sm border border-border px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                          >
                            {copiedKey === s.link ? "Copied" : "Copy"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Group Settings */}
            <div className="rounded-md border border-border bg-surface p-6 shadow-elev-1">
              <h2 className="mb-4 text-xl font-semibold text-ink-strong">Settings</h2>
              <form onSubmit={handleUpdateSettings} className="space-y-4">
                <div>
                  <label htmlFor="suggestionCap" className="mb-2 block text-sm font-medium text-ink-muted">
                    Suggestion Cap
                  </label>
                  <input
                    type="number"
                    id="suggestionCap"
                    value={suggestionCap}
                    onChange={(e) => setSuggestionCap(Number(e.target.value))}
                    className="w-full rounded-sm border border-border bg-raised px-4 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                    min="0"
                    max="10"
                    step="1"
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    Max gift suggestions each person can add for their match (0-10).
                  </p>
                </div>

                <div>
                  <label htmlFor="previousYearMemory" className="mb-2 block text-sm font-medium text-ink-muted">
                    Previous Year Memory
                  </label>
                  <input
                    type="number"
                    id="previousYearMemory"
                    value={previousYearMemory}
                    onChange={(e) => setPreviousYearMemory(Number(e.target.value))}
                    className="w-full rounded-sm border border-border bg-raised px-4 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                    min="0"
                    max="10"
                    step="1"
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    How many previous years&apos; pairs to avoid repeating in the draw (0-10).
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-sm bg-primary py-2 font-semibold text-primary-on transition-colors hover:bg-primary-hover"
                >
                  Save Settings
                </button>
              </form>
            </div>
          </div>

          {/* Seed last year's pairs - hand-record past pairs so this year's draw
              avoids repeating them. Editable, iterative table: the form loads
              whatever is already recorded for the chosen year and replaces it on
              save, so what is stored is always visible (not a write-only form). */}
          <details
            open={seedOpen}
            onToggle={(e) => setSeedOpen(e.currentTarget.open)}
            className="mt-8 rounded-md border border-border bg-surface p-6 shadow-elev-1"
          >
            <summary className="cursor-pointer text-xl font-semibold text-ink-strong">
              Seed last year&apos;s pairs
              {seedRecorded > 0 && (
                <span className="ml-2 text-sm font-normal text-ink-muted">
                  {seedRecorded} recorded for {seedYear}
                </span>
              )}
            </summary>
            <p className="mb-4 mt-2 text-sm text-ink-muted">
              Record who gave to whom last year by hand, so this year&apos;s draw knows to avoid repeating those
              pairs. Only needed once, to backfill history from before this app was used.
            </p>
            {seededYears.length > 0 && (
              <p className="mb-4 text-sm text-ink-muted">
                Recorded so far: {seededYears.map((y) => `${y.year} (${y.count})`).join(", ")}
              </p>
            )}
            <form onSubmit={handleSeedSubmit} className="space-y-4">
              <div>
                <label htmlFor="seedYear" className="mb-2 block text-sm font-medium text-ink-muted">
                  Year
                </label>
                <input
                  type="number"
                  id="seedYear"
                  value={seedYear}
                  onChange={(e) => setSeedYear(e.target.value)}
                  className="w-full rounded-sm border border-border bg-raised px-4 py-2 text-ink focus:border-transparent focus:ring-2 focus:ring-accent sm:w-40"
                />
              </div>

              {seedRecorded > 0 && (
                <p className="text-sm text-ink-muted">
                  {seedRecorded} pair(s) already recorded for {seedYear}. Editing and saving replaces them.
                </p>
              )}

              <div className="space-y-3">
                {seedPairs.map((pair, index) => (
                  <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      aria-label={`Giver for row ${index + 1}`}
                      value={pair.giverId}
                      onChange={(e) => handleSeedRowChange(index, "giverId", e.target.value)}
                      className="w-full rounded-sm border border-border bg-raised px-3 py-2 text-ink"
                    >
                      <option value="">Giver...</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                    <span className="hidden text-ink-muted sm:inline">&rarr;</span>
                    <select
                      aria-label={`Receiver for row ${index + 1}`}
                      value={pair.receiverId}
                      onChange={(e) => handleSeedRowChange(index, "receiverId", e.target.value)}
                      className="w-full rounded-sm border border-border bg-raised px-3 py-2 text-ink"
                    >
                      <option value="">Receiver...</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddSeedRow}
                className="text-sm font-semibold text-accent-text hover:underline"
              >
                + Add row
              </button>

              {seedMessage && (
                <div
                  role="status"
                  className={`rounded-md border px-4 py-3 text-sm ${
                    seedMessage.kind === "success"
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-danger/30 bg-danger/10 text-danger"
                  }`}
                >
                  {seedMessage.text}
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-sm border border-border py-2 font-semibold text-ink transition-colors hover:bg-raised"
              >
                Save last year&apos;s pairs
              </button>
            </form>
          </details>

          {/* People List */}
          <div className="mt-8 rounded-md border border-border bg-surface p-6 shadow-elev-1">
            <h2 className="mb-4 text-xl font-semibold text-ink-strong">People ({people.length})</h2>
            {people.length === 0 ? (
              <p className="text-ink-muted">No people added yet. Add your first person above!</p>
            ) : (
              <>
              {/* Mobile card layout */}
              <div className="space-y-3 md:hidden">
                {people.map((person) => (
                  <div key={person.id} className="rounded-md border border-border/60 bg-raised p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <span className="font-semibold text-ink-strong">{person.name}</span>
                      <button
                        onClick={() => handleDeletePerson(person.id, person.name)}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center text-sm font-semibold text-danger hover:text-danger/80"
                      >
                        Delete
                      </button>
                    </div>
                    {person.email && (
                      <p className="mb-1 truncate text-sm text-ink-muted">{person.email}</p>
                    )}
                    <div className="mb-2 flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-surface px-2 py-1 font-mono text-xs text-ink-muted">
                        {personalLink(person.personalLinkToken)}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(personalLink(person.personalLinkToken), person.personalLinkToken)}
                        className="shrink-0 rounded-sm border border-border px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                      >
                        {copiedKey === person.personalLinkToken ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-ink-muted">{person._count.wishlistItems}/5 items</span>
                      {person._count.wishlistItems > 0 ? (
                        <span className="rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                          Saved
                        </span>
                      ) : (
                        <span className="rounded-full border border-border bg-raised px-2 py-0.5 text-xs text-ink-muted">
                          Not saved
                        </span>
                      )}
                      <span className="text-ink-muted">{person._count.suggestionsBy} suggestions</span>
                      {person._count.suggestionsBy > 0 ? (
                        <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-text">
                          Suggested
                        </span>
                      ) : (
                        <span className="rounded-full border border-border bg-raised px-2 py-0.5 text-xs text-ink-muted">
                          None
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table layout */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-sm text-ink-muted">Name</th>
                      <th className="px-4 py-3 text-left text-sm text-ink-muted">Email</th>
                      <th className="px-4 py-3 text-left text-sm text-ink-muted">Personal Link</th>
                      <th className="px-4 py-3 text-left text-sm text-ink-muted">Wishlist</th>
                      <th className="px-4 py-3 text-left text-sm text-ink-muted">Suggestions</th>
                      <th className="px-4 py-3 text-left text-sm text-ink-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((person) => (
                      <tr key={person.id} className="border-b border-border/60 hover:bg-raised">
                        <td className="px-4 py-3 text-ink-strong">{person.name}</td>
                        <td className="px-4 py-3">
                          {person.email ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-ink-muted">{person.email}</span>
                              <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent-text">
                                Email link
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm italic text-ink-muted">No email</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="max-w-[20rem] truncate rounded-sm border border-border bg-raised px-2 py-1 font-mono text-sm text-ink-muted">
                              {personalLink(person.personalLinkToken)}
                            </code>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(personalLink(person.personalLinkToken), person.personalLinkToken)}
                              className="shrink-0 rounded-sm border border-border px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                            >
                              {copiedKey === person.personalLinkToken ? "Copied" : "Copy"}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-ink-strong">{person._count.wishlistItems}/5</span>
                            {person._count.wishlistItems > 0 ? (
                              <span className="rounded-full border border-success/20 bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                                Saved
                              </span>
                            ) : (
                              <span className="rounded-full border border-border bg-raised px-2 py-1 text-xs text-ink-muted">
                                Not saved
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-ink-strong">{person._count.suggestionsBy}</span>
                            {person._count.suggestionsBy > 0 ? (
                              <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent-text">
                                Suggested
                              </span>
                            ) : (
                              <span className="rounded-full border border-border bg-raised px-2 py-1 text-xs text-ink-muted">
                                None
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDeletePerson(person.id, person.name)}
                            className="text-sm font-semibold text-danger hover:text-danger/80"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>

          {/* Assignments List */}
          {assignments.length > 0 && (
            <div className="mt-8 rounded-md border border-border bg-surface p-6 shadow-elev-1">
              <h2 className="mb-4 text-xl font-semibold text-ink-strong">
                Assignments ({assignments.length})
              </h2>
              {/* Mobile card layout */}
              <div className="space-y-2 md:hidden">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="flex items-center justify-between rounded-md border border-border/60 bg-raised p-3">
                    <div className="text-sm">
                      <span className="text-ink-strong">{assignment.giver.name}</span>
                      <span className="mx-2 text-ink-muted">&rarr;</span>
                      <span className="text-ink-strong">{assignment.receiver.name}</span>
                    </div>
                    <span className="text-xs text-ink-muted">{assignment.receiver.wishlistItems.length} items</span>
                  </div>
                ))}
              </div>

              {/* Desktop table layout */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-sm text-ink-muted">Giver</th>
                      <th className="px-4 py-3 text-left text-sm text-ink-muted">Receiver</th>
                      <th className="px-4 py-3 text-left text-sm text-ink-muted">Wishlist Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((assignment) => (
                      <tr key={assignment.id} className="border-b border-border/60 hover:bg-raised">
                        <td className="px-4 py-3 text-ink-strong">{assignment.giver.name}</td>
                        <td className="px-4 py-3 text-ink-strong">{assignment.receiver.name}</td>
                        <td className="px-4 py-3 text-ink-muted">
                          {assignment.receiver.wishlistItems.length} items
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
