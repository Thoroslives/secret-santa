"use client";

import { useEffect, useState } from "react";
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

// A note is rendered as a link when it looks like one; otherwise it's shown as plain text.
const isLinkNote = (note: string) => /^https?:\/\//.test(note.trim());

export default function Wishlist() {
  const [personId, setPersonId] = useState("");
  const [personName, setPersonName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [items, setItems] = useState<WishlistItem[]>([
    { title: "", note: "" },
  ]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [budget, setBudget] = useState<{ amount?: number; currency?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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
      const newItems = items.filter((_, i) => i !== index);
      setItems(newItems);
    }
  };

  const handleSaveWishlist = async () => {
    setError("");
    setSuccessMessage("");
    setSaving(true);

    // Filter out empty items (title is required; note is optional)
    const validItems = items.filter((item) => item.title.trim());

    if (validItems.length < 1) {
      setError("You must add at least 1 item to your wishlist");
      setSaving(false);
      return;
    }

    if (validItems.length > 5) {
      setError("You can only have up to 5 items in your wishlist");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          items: validItems,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save wishlist");
        setSaving(false);
        return;
      }

      setSuccessMessage("Wishlist saved successfully!");
      setSaving(false);

      // Reload person data
      if (groupId) {
        loadPersonData(groupId);
      }

      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("An error occurred while saving");
      setSaving(false);
    }
  };

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
      <div className="min-h-screen flex items-center justify-center bg-santa-dark">
        <div className="text-xl text-santa-gold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-santa-dark p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-4xl font-bold text-santa-gold font-display truncate">Welcome, {personName}!</h1>
            {groupName && <p className="text-gray-300 mt-1 text-sm sm:text-base truncate">{groupName}</p>}
            <p className="text-gray-400 mt-1 text-sm">Manage your wishlist and Secret Santa assignment</p>
            {budget && (
              <div className="mt-2 inline-flex items-center bg-santa-gold/10 border border-santa-gold/30 text-santa-gold px-3 py-1 rounded-lg text-sm font-medium">
                💰 Budget: {budget.currency} {budget.amount}
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="self-start sm:self-auto bg-white/10 text-santa-snow px-4 py-2 rounded-lg hover:bg-white/20 transition border border-white/10 min-h-[44px]"
          >
            Logout
          </button>
        </div>

        {error && (
          <div className="bg-santa-red/10 border border-santa-red/30 text-santa-red px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-santa-green/10 border border-santa-green/30 text-santa-green px-4 py-3 rounded-lg mb-4">
            {successMessage}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* My Wishlist */}
          <div className="bg-[#151528] p-6 rounded-2xl border border-white/10 card-glow">
            <h2 className="text-2xl font-bold text-santa-snow mb-4">My Wishlist</h2>
            <p className="text-sm text-gray-400 mb-4">Add 1-5 items you&apos;d like to receive</p>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="border border-white/10 p-4 rounded-lg bg-santa-dark/50">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-santa-gold">Item {index + 1}</span>
                    {items.length > 1 && (
                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="text-santa-red text-sm hover:text-santa-red-dark"
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
                      className="w-full px-3 py-2 bg-santa-dark border border-white/10 rounded focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow placeholder-gray-500"
                    />
                    <input
                      type="text"
                      value={item.note ?? ""}
                      onChange={(e) => handleItemChange(index, "note", e.target.value)}
                      placeholder="Note (a description or a link)"
                      className="w-full px-3 py-2 bg-santa-dark border border-white/10 rounded focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow placeholder-gray-500"
                    />
                  </div>
                </div>
              ))}

              {items.length < 5 && (
                <button
                  onClick={handleAddItem}
                  className="w-full py-2 border-2 border-dashed border-white/10 rounded-lg text-gray-400 hover:border-santa-gold hover:text-santa-gold transition"
                >
                  + Add Item
                </button>
              )}

              <button
                onClick={handleSaveWishlist}
                disabled={saving}
                className="w-full bg-santa-green text-white py-3 rounded-xl font-semibold hover:bg-santa-green-dark transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transform"
              >
                {saving ? "Saving..." : "Save Wishlist"}
              </button>
            </div>
          </div>

          {/* Secret Santa Assignment */}
          <div className="bg-[#151528] p-6 rounded-2xl border border-white/10 card-glow">
            <h2 className="text-2xl font-bold text-santa-snow mb-4">Your Secret Santa</h2>

            {assignment ? (
              <div>
                <p className="text-lg mb-4 text-santa-snow">
                  You are Secret Santa for:{" "}
                  <span className="font-bold text-santa-red">{assignment.receiver.name}</span>
                </p>

                <div className="bg-santa-red/10 border border-santa-red/20 p-4 rounded-lg">
                  <h3 className="font-semibold text-santa-snow mb-3">
                    {assignment.receiver.name}&apos;s Wishlist:
                  </h3>

                  {assignment.receiver.wishlistItems.length > 0 ? (
                    <ul className="space-y-3">
                      {assignment.receiver.wishlistItems.map((item, index) => (
                        <li key={index} className="border-b border-white/5 pb-2 last:border-0">
                          <div className="font-medium text-santa-snow">{item.title}</div>
                          {item.note && (
                            isLinkNote(item.note) ? (
                              <a
                                href={item.note}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-santa-gold hover:underline break-all"
                              >
                                {item.note}
                              </a>
                            ) : (
                              <p className="text-sm text-gray-300 break-words">{item.note}</p>
                            )
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-400 italic">
                      {assignment.receiver.name} hasn&apos;t added their wishlist yet. Check back later!
                    </p>
                  )}
                </div>

                {matchSuggestions.length > 0 && (
                  <div className="bg-santa-gold/10 border border-santa-gold/20 p-4 rounded-lg mt-4">
                    <h3 className="font-semibold text-santa-snow mb-3">
                      Gift ideas others suggested for {assignment.receiver.name}:
                    </h3>
                    <ul className="space-y-3">
                      {matchSuggestions.map((s) => (
                        <li key={s.id} className="border-b border-white/5 pb-2 last:border-0">
                          <div className="font-medium text-santa-snow">{s.name}</div>
                          {s.note && (
                            <p className="text-sm text-gray-300 break-words">{s.note}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">From: {s.from}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🎁</div>
                <p className="text-santa-snow">
                  Secret Santa assignments haven&apos;t been generated yet.
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Check back later or contact the admin!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Suggest gifts for others */}
        <div className="bg-[#151528] p-6 rounded-2xl border border-white/10 card-glow mt-8">
          <h2 className="text-2xl font-bold text-santa-snow mb-4">Suggest Gifts for Others</h2>
          <p className="text-sm text-gray-400 mb-4">
            Leave gift ideas for someone else in the group. Their Secret Santa will see these suggestions once assignments are sent.
          </p>

          {suggestionError && (
            <div className="bg-santa-red/10 border border-santa-red/30 text-santa-red px-4 py-3 rounded-lg mb-4">
              {suggestionError}
            </div>
          )}

          {roster.length === 0 ? (
            <p className="text-gray-400 italic">No one else to suggest for yet.</p>
          ) : (
            <div className="border border-white/10 p-4 rounded-lg bg-santa-dark/50 space-y-3">
              <div>
                <label htmlFor="suggestForPerson" className="block text-sm font-medium text-gray-300 mb-2">
                  Suggest a gift for
                </label>
                <select
                  id="suggestForPerson"
                  value={suggestForPersonId}
                  onChange={(e) => setSuggestForPersonId(e.target.value)}
                  className="w-full px-3 py-2 bg-santa-dark border border-white/10 rounded focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow"
                >
                  <option value="">-- Select a person --</option>
                  {roster.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="suggestName" className="block text-sm font-medium text-gray-300 mb-2">
                  Gift idea
                </label>
                <input
                  id="suggestName"
                  type="text"
                  value={suggestName}
                  onChange={(e) => setSuggestName(e.target.value)}
                  placeholder="Item name"
                  className="w-full px-3 py-2 bg-santa-dark border border-white/10 rounded focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow placeholder-gray-500"
                />
              </div>

              <div>
                <label htmlFor="suggestNote" className="block text-sm font-medium text-gray-300 mb-2">
                  Note (optional)
                </label>
                <input
                  id="suggestNote"
                  type="text"
                  value={suggestNote}
                  onChange={(e) => setSuggestNote(e.target.value)}
                  placeholder="A description or a link"
                  className="w-full px-3 py-2 bg-santa-dark border border-white/10 rounded focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow placeholder-gray-500"
                />
              </div>

              <label htmlFor="suggestNamed" className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  id="suggestNamed"
                  type="checkbox"
                  checked={suggestNamed}
                  onChange={(e) => setSuggestNamed(e.target.checked)}
                  className="w-4 h-4 accent-santa-gold"
                />
                Show my name (uncheck to suggest anonymously)
              </label>

              {suggestForPersonId && suggestionCapReached && (
                <p className="text-sm text-santa-red">
                  You&apos;ve reached the limit of {suggestionCap} suggestions for this person.
                </p>
              )}

              <button
                onClick={handleAddSuggestion}
                disabled={suggestionSaving || !suggestForPersonId || !suggestName.trim() || suggestionCapReached}
                className="w-full bg-santa-green text-white py-3 rounded-xl font-semibold hover:bg-santa-green-dark transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transform"
              >
                {suggestionSaving ? "Adding..." : "Add Suggestion"}
              </button>
            </div>
          )}

          <div className="mt-6">
            <h3 className="font-semibold text-santa-snow mb-3">Your suggestions</h3>
            {mySuggestions.length === 0 ? (
              <p className="text-gray-400 italic">You haven&apos;t suggested anything yet.</p>
            ) : (
              <ul className="space-y-3">
                {mySuggestions.map((s) => (
                  <li key={s.id} className="border border-white/10 p-4 rounded-lg bg-santa-dark/50 flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-santa-gold">For {s.forPerson.name}</div>
                      <div className="font-medium text-santa-snow break-words">{s.name}</div>
                      {s.note && <p className="text-sm text-gray-300 break-words">{s.note}</p>}
                    </div>
                    <button
                      onClick={() => handleRemoveSuggestion(s.id)}
                      className="text-santa-red text-sm hover:text-santa-red-dark shrink-0"
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
