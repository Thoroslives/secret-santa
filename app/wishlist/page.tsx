"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface WishlistItem {
  id?: string;
  title: string;
  note?: string;
}

interface Assignment {
  receiver: {
    name: string;
    wishlistItems: WishlistItem[];
  };
}

interface RosterPerson {
  id: string;
  name: string;
}

interface MySuggestion {
  id: string;
  forPersonId: string;
  name: string;
  note?: string | null;
  named: boolean;
  forPerson: { name: string };
}

interface MatchSuggestion {
  id: string;
  name: string;
  note?: string | null;
  from: string;
}

// One switchable draw for a participant whose email is in more than one group.
// Structural copy of lib/draws.ts's Draw - NOT imported, because lib/draws.ts
// pulls in prisma, which must never reach the client bundle.
interface Draw {
  personId: string;
  personName: string;
  groupId: string;
  groupName: string;
}

// A note is rendered as a link when it looks like one; otherwise it's shown as plain text.
const isLinkNote = (note: string) => /^https?:\/\//.test(note.trim());

export default function Wishlist() {
  const [personId, setPersonId] = useState("");
  const [personName, setPersonName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [draws, setDraws] = useState<Draw[]>([]);
  const [items, setItems] = useState<WishlistItem[]>([
    { title: "", note: "" },
  ]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [budget, setBudget] = useState<{ amount?: number; currency?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const dirtyRef = useRef(false);
  const [roster, setRoster] = useState<RosterPerson[]>([]);
  const [mySuggestions, setMySuggestions] = useState<MySuggestion[]>([]);
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);
  const [suggestionCap, setSuggestionCap] = useState(3);
  const [suggestForPersonId, setSuggestForPersonId] = useState("");
  const [suggestName, setSuggestName] = useState("");
  const [suggestNote, setSuggestNote] = useState("");
  const [suggestNamed, setSuggestNamed] = useState(true);
  const [suggestionSaving, setSuggestionSaving] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Check session from server
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((session) => {
        if (!session.authenticated || !session.isLoggedIn) {
          router.push("/");
          return;
        }

        setPersonId(session.personId);
        setPersonName(session.personName);
        setGroupName(session.groupName || "");
        setGroupId(session.groupId);
        setDraws(session.draws ?? []);

        loadPersonData(session.groupId);
      })
      .catch(() => {
        router.push("/");
      });
  }, [router]);

  const loadPersonData = async (gId: string) => {
    try {
      // Session is already established (via /p/<token> or a prior email-link
      // login); pull this person's data, the group's budget/suggestion cap,
      // the participant roster, and this person's own suggestions in parallel.
      const [personRes, groupRes, rosterRes, suggestionsRes] = await Promise.all([
        fetch(`/api/auth/person-data`),
        fetch(`/api/groups/${gId}`),
        fetch(`/api/roster`),
        fetch(`/api/suggestions?mine=1`),
      ]);

      if (personRes.ok) {
        const data = await personRes.json();

        if (data.wishlistItems && data.wishlistItems.length > 0) {
          setItems(data.wishlistItems.map((item: WishlistItem) => ({
            id: item.id,
            title: item.title,
            note: item.note ?? "",
          })));
        }

        if (data.assignment) {
          setAssignment(data.assignment);
        }

        setMatchSuggestions(data.matchSuggestions ?? []);
      }

      // Load group budget information and the suggestion cap
      if (groupRes.ok) {
        const groupData = await groupRes.json();
        if (groupData.group && groupData.group.budgetAmount) {
          setBudget({
            amount: groupData.group.budgetAmount,
            currency: groupData.group.budgetCurrency || "USD"
          });
        }
        if (groupData.group && typeof groupData.group.suggestionCap === "number") {
          setSuggestionCap(groupData.group.suggestionCap);
        }
      }

      if (rosterRes.ok) {
        const rosterData = await rosterRes.json();
        setRoster(rosterData.roster ?? []);
      }

      if (suggestionsRes.ok) {
        const suggestionsData = await suggestionsRes.json();
        setMySuggestions(suggestionsData.suggestions ?? []);
      }

      setLoading(false);
    } catch (err) {
      setError("Failed to load data");
      setLoading(false);
    }
  };

  // Switch the active draw: re-point the server session, then reload that draw's
  // data. Reset per-draw UI first so the previous draw never bleeds through, and
  // clear dirtyRef so the reset does not trigger an autosave into the new draw.
  const switchDraw = async (target: Draw) => {
    if (target.personId === personId) return;
    setLoading(true);
    setError("");
    dirtyRef.current = false;
    setItems([{ title: "", note: "" }]);
    setAssignment(null);
    setBudget(null);
    setRoster([]);
    setMySuggestions([]);
    setMatchSuggestions([]);
    setSuggestForPersonId("");
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: target.personId }),
      });
      if (!res.ok) {
        setError("Couldn't switch draw. Try again.");
        setLoading(false);
        return;
      }
      setPersonId(target.personId);
      setPersonName(target.personName);
      setGroupId(target.groupId);
      setGroupName(target.groupName);
      await loadPersonData(target.groupId);
    } catch {
      setError("Couldn't switch draw. Try again.");
      setLoading(false);
    }
  };

  const loadMySuggestions = async () => {
    try {
      const res = await fetch("/api/suggestions?mine=1");
      if (res.ok) {
        const data = await res.json();
        setMySuggestions(data.suggestions ?? []);
      }
    } catch (err) {
      // Best-effort refresh; leave the existing list as-is on failure.
    }
  };

  const handleItemChange = (index: number, field: "title" | "note", value: string) => {
    dirtyRef.current = true;
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleAddItem = () => {
    if (items.length < 5) {
      setItems([...items, { title: "", note: "" }]);
    }
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      dirtyRef.current = true;
      setItems(items.filter((_, i) => i !== index));
    }
  };

  // Autosave: persist the wishlist a short beat after the last edit, so there
  // is no Save button to hunt for and no "did that save?" ambiguity. An empty
  // list is a valid save (it clears the wishlist); items without a title are
  // ignored until they are filled in.
  const autosaveWishlist = async (current: WishlistItem[]) => {
    if (!personId) return;
    const validItems = current
      .filter((item) => item.title.trim())
      .map((item) => ({ title: item.title.trim(), note: item.note?.trim() || undefined }));
    if (validItems.length > 5) return; // the UI already caps at 5

    setSaveStatus("saving");
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, items: validItems }),
      });
      setSaveStatus(res.ok ? "saved" : "error");
    } catch {
      setSaveStatus("error");
    }
  };

  // Debounced autosave on every edit. dirtyRef skips the load-time setItems so
  // simply opening the page never fires a save.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = setTimeout(() => autosaveWishlist(items), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const suggestionCountForSelected = suggestForPersonId
    ? mySuggestions.filter((s) => s.forPersonId === suggestForPersonId).length
    : 0;
  const suggestionCapReached = suggestionCountForSelected >= suggestionCap;

  const handleAddSuggestion = async () => {
    setSuggestionError("");

    if (!suggestForPersonId) {
      setSuggestionError("Choose who this suggestion is for");
      return;
    }

    if (!suggestName.trim()) {
      setSuggestionError("Enter a gift idea");
      return;
    }

    if (suggestionCapReached) {
      setSuggestionError(`You can add at most ${suggestionCap} suggestions for one person.`);
      return;
    }

    setSuggestionSaving(true);

    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forPersonId: suggestForPersonId,
          name: suggestName.trim(),
          note: suggestNote.trim() || undefined,
          named: suggestNamed,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSuggestionError(data.error || "Failed to add suggestion");
        setSuggestionSaving(false);
        return;
      }

      setSuggestName("");
      setSuggestNote("");
      setSuggestionSaving(false);

      await loadMySuggestions();
    } catch (err) {
      setSuggestionError("An error occurred while adding the suggestion");
      setSuggestionSaving(false);
    }
  };

  const handleRemoveSuggestion = async (id: string) => {
    setSuggestionError("");

    try {
      const res = await fetch(`/api/suggestions?id=${id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSuggestionError(data.error || "Failed to remove suggestion");
        return;
      }

      await loadMySuggestions();
    } catch (err) {
      setSuggestionError("An error occurred while removing the suggestion");
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
      <div className="mx-auto max-w-6xl">
        {draws.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Your draws">
            {draws.map((d) => {
              const isActive = d.personId === personId;
              return (
                <button
                  key={d.personId}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => switchDraw(d)}
                  disabled={isActive}
                  className={
                    isActive
                      ? "min-h-[44px] rounded-sm bg-primary px-4 py-2 font-semibold text-primary-on"
                      : "min-h-[44px] rounded-sm border border-border px-4 py-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                  }
                >
                  {d.groupName}
                </button>
              );
            })}
          </div>
        )}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-medium tracking-[-0.02em] text-ink-strong sm:text-4xl">
              Welcome, {personName}!
            </h1>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            {budget && (
              <div className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm font-medium text-accent-text">
                Budget: {budget.currency} {budget.amount}
              </div>
            )}
            <button
              onClick={handleLogout}
              className="min-h-[44px] rounded-sm border border-border px-4 py-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-danger">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* My Wishlist */}
          <div className="order-2 rounded-md border border-border bg-surface p-6 shadow-elev-1 lg:order-1">
            <h2 className="mb-4 text-xl font-semibold text-ink-strong">My Wishlist</h2>
            <p className="mb-4 text-sm text-ink-muted">Add up to 5 items you&apos;d like to receive. They save automatically.</p>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="rounded-md border border-border bg-raised p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-accent-text">Item {index + 1}</span>
                    {items.length > 1 && (
                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="text-sm text-danger hover:text-danger/80"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => handleItemChange(index, "title", e.target.value)}
                      placeholder="Item name"
                      className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                    />
                    <input
                      type="text"
                      value={item.note ?? ""}
                      onChange={(e) => handleItemChange(index, "note", e.target.value)}
                      placeholder="Note (a description or a link)"
                      className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                    />
                  </div>
                </div>
              ))}

              {items.length < 5 && (
                <button
                  onClick={handleAddItem}
                  className="w-full rounded-md border-2 border-dashed border-border py-2 text-ink-muted transition-colors hover:border-accent-dim hover:text-accent-text"
                >
                  + Add Item
                </button>
              )}

              <div className="pt-1 text-sm text-ink-muted" role="status" aria-live="polite">
                {saveStatus === "saving" && "Saving..."}
                {saveStatus === "saved" && <span className="text-success">All changes saved</span>}
                {saveStatus === "error" && (
                  <span className="text-danger">
                    Couldn&apos;t save.{" "}
                    <button
                      onClick={() => autosaveWishlist(items)}
                      className="font-medium underline hover:no-underline"
                    >
                      Retry
                    </button>
                  </span>
                )}
                {saveStatus === "idle" && "Your list saves automatically as you type."}
              </div>
            </div>
          </div>

          {/* Secret Santa Assignment */}
          <div className="order-1 rounded-md border border-border bg-surface p-6 shadow-elev-1 lg:order-2">
            <h2 className="mb-4 text-xl font-semibold text-ink-strong">Your Secret Santa</h2>

            {assignment ? (
              <div>
                <div className="match-reveal py-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
                    You are Secret Santa for
                  </p>
                  <p className="font-display text-5xl leading-[1.05] tracking-[-0.02em] text-ink-strong sm:text-6xl">
                    <span className="match-reveal-name text-accent-text">
                      {assignment.receiver.name}
                    </span>
                  </p>
                </div>

                <div className="rounded-md border border-border bg-raised p-4">
                  <h3 className="mb-3 font-semibold text-ink-strong">
                    {assignment.receiver.name}&apos;s Wishlist:
                  </h3>

                  {assignment.receiver.wishlistItems.length > 0 ? (
                    <ul className="space-y-3">
                      {assignment.receiver.wishlistItems.map((item, index) => (
                        <li key={index} className="border-b border-border/60 pb-2 last:border-0">
                          <div className="font-medium text-ink-strong">{item.title}</div>
                          {item.note && (
                            isLinkNote(item.note) ? (
                              <a
                                href={item.note}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-sm text-accent-text hover:underline"
                              >
                                {item.note}
                              </a>
                            ) : (
                              <p className="break-words text-sm text-ink-muted">{item.note}</p>
                            )
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="italic text-ink-muted">
                      {assignment.receiver.name} hasn&apos;t added their wishlist yet. Check back later!
                    </p>
                  )}
                </div>

                {matchSuggestions.length > 0 && (
                  <div className="mt-4 rounded-md border border-accent/20 bg-accent/10 p-4">
                    <h3 className="mb-3 font-semibold text-ink-strong">
                      Gift ideas others suggested for {assignment.receiver.name}:
                    </h3>
                    <ul className="space-y-3">
                      {matchSuggestions.map((s) => (
                        <li key={s.id} className="border-b border-border/60 pb-2 last:border-0">
                          <div className="font-medium text-ink-strong">{s.name}</div>
                          {s.note && (
                            <p className="break-words text-sm text-ink-muted">{s.note}</p>
                          )}
                          <p className="mt-1 text-xs text-ink-muted">From: {s.from}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 h-px w-10 bg-accent-dim" />
                <p className="text-ink-strong">
                  Secret Santa assignments haven&apos;t been generated yet.
                </p>
                <p className="mt-2 text-sm text-ink-muted">
                  Check back later or contact the admin!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Suggest gifts for others */}
        <div className="mt-8 rounded-md border border-border bg-surface p-6 shadow-elev-1">
          <h2 className="mb-4 text-xl font-semibold text-ink-strong">Suggest Gifts for Others</h2>
          <p className="mb-4 text-sm text-ink-muted">
            Leave gift ideas for someone else in the group. Their Secret Santa will see these suggestions once assignments are sent.
          </p>

          {suggestionError && (
            <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-danger">
              {suggestionError}
            </div>
          )}

          {roster.length === 0 ? (
            <p className="italic text-ink-muted">No one else to suggest for yet.</p>
          ) : (
            <div className="space-y-3 rounded-md border border-border bg-raised p-4">
              <div>
                <label htmlFor="suggestForPerson" className="mb-2 block text-sm font-medium text-ink-muted">
                  Suggest a gift for
                </label>
                <select
                  id="suggestForPerson"
                  value={suggestForPersonId}
                  onChange={(e) => setSuggestForPersonId(e.target.value)}
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-ink focus:border-transparent focus:ring-2 focus:ring-accent"
                >
                  <option value="">-- Select a person --</option>
                  {roster.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="suggestName" className="mb-2 block text-sm font-medium text-ink-muted">
                  Gift idea
                </label>
                <input
                  id="suggestName"
                  type="text"
                  value={suggestName}
                  onChange={(e) => setSuggestName(e.target.value)}
                  placeholder="Item name"
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label htmlFor="suggestNote" className="mb-2 block text-sm font-medium text-ink-muted">
                  Note (optional)
                </label>
                <input
                  id="suggestNote"
                  type="text"
                  value={suggestNote}
                  onChange={(e) => setSuggestNote(e.target.value)}
                  placeholder="A description or a link"
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-ink placeholder-ink-muted focus:border-transparent focus:ring-2 focus:ring-accent"
                />
              </div>

              <label htmlFor="suggestNamed" className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  id="suggestNamed"
                  type="checkbox"
                  checked={suggestNamed}
                  onChange={(e) => setSuggestNamed(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Show my name (uncheck to suggest anonymously)
              </label>

              {suggestForPersonId && suggestionCapReached && (
                <p className="text-sm text-danger">
                  You&apos;ve reached the limit of {suggestionCap} suggestions for this person.
                </p>
              )}

              <button
                onClick={handleAddSuggestion}
                disabled={suggestionSaving || !suggestForPersonId || !suggestName.trim() || suggestionCapReached}
                className="w-full rounded-sm bg-primary py-3 font-semibold text-primary-on transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {suggestionSaving ? "Adding..." : "Add Suggestion"}
              </button>
            </div>
          )}

          <div className="mt-6">
            <h3 className="mb-3 font-semibold text-ink-strong">Your suggestions</h3>
            {mySuggestions.length === 0 ? (
              <p className="italic text-ink-muted">You haven&apos;t suggested anything yet.</p>
            ) : (
              <ul className="space-y-3">
                {mySuggestions.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3 rounded-md border border-border bg-raised p-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-accent-text">For {s.forPerson.name}</div>
                      <div className="break-words font-medium text-ink-strong">{s.name}</div>
                      {s.note && <p className="break-words text-sm text-ink-muted">{s.note}</p>}
                    </div>
                    <button
                      onClick={() => handleRemoveSuggestion(s.id)}
                      className="shrink-0 text-sm text-danger hover:text-danger/80"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
