"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Person {
  id: string;
  name: string;
  email?: string;
  loginCode: string;
  _count: { wishlistItems: number };
}

interface Assignment {
  id: string;
  giver: { name: string };
  receiver: { name: string; wishlistItems: Array<{ title: string; link: string }> };
}

interface GroupBudget {
  budgetAmount?: number;
  budgetCurrency?: string;
}

export default function AdminDashboard() {
  const [people, setPeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonEmail, setNewPersonEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [groupInfo, setGroupInfo] = useState({ id: "", name: "", inviteCode: "" });
  const [budget, setBudget] = useState<GroupBudget>({ budgetAmount: undefined, budgetCurrency: "USD" });
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("USD");
  const router = useRouter();

  useEffect(() => {
    // Check admin session from server
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((session) => {
        if (!session.authenticated || !session.isAdmin) {
          router.push("/admin");
          return;
        }

        setGroupInfo({
          id: session.adminGroupId,
          name: session.adminGroupName || "",
          inviteCode: session.adminInviteCode || "",
        });
        loadData(session.adminGroupId);
      })
      .catch(() => {
        router.push("/admin");
      });
  }, [router]);

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
          groupId: groupInfo.id
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add person");
        return;
      }

      const emailMsg = data.person.email ? ` and email: ${data.person.email}` : "";
      setSuccessMessage(`Added ${data.person.name} with code: ${data.person.loginCode}${emailMsg}`);
      setNewPersonName("");
      setNewPersonEmail("");
      loadData(groupInfo.id);
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
      loadData(groupInfo.id);
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
      const res = await fetch("/api/assignments/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: groupInfo.id, year: new Date().getFullYear() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate assignments");
        return;
      }

      setSuccessMessage(`Generated ${data.count} Secret Santa assignments!`);
      loadData(groupInfo.id);
    } catch (err) {
      setError("An error occurred");
    }
  };

  const handleDeleteAssignments = async () => {
    if (!confirm("Are you sure you want to delete all assignments for this year?")) {
      return;
    }

    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch(`/api/assignments?groupId=${groupInfo.id}&year=${new Date().getFullYear()}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setError("Failed to delete assignments");
        return;
      }

      setSuccessMessage("Deleted all assignments");
      loadData(groupInfo.id);
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
      const res = await fetch(`/api/groups/${groupInfo.id}`, {
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
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-4xl font-bold text-santa-red font-display">Admin Dashboard</h1>
            <p className="text-gray-300 mt-1 text-sm sm:text-base truncate">{groupInfo.name}</p>
            <p className="text-sm text-gray-400">
              Invite Code: <code className="bg-santa-dark border border-white/10 px-2 py-1 rounded font-mono text-santa-gold text-xs sm:text-sm">{groupInfo.inviteCode}</code>
            </p>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add Person Section */}
          <div className="bg-[#151528] p-6 rounded-2xl border border-white/10 card-glow">
            <h2 className="text-2xl font-bold text-santa-snow mb-4">Add Person</h2>
            <form onSubmit={handleAddPerson} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  Name <span className="text-santa-red">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  className="w-full px-4 py-2 bg-santa-dark border border-white/10 rounded-lg focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow placeholder-gray-500"
                  placeholder="Enter person's name"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="email"
                  id="email"
                  value={newPersonEmail}
                  onChange={(e) => setNewPersonEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-santa-dark border border-white/10 rounded-lg focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow placeholder-gray-500"
                  placeholder="person@example.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  If provided, they can log in via email magic link instead of using the login code
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-santa-green text-white py-2 rounded-xl font-semibold hover:bg-santa-green-dark transition-all duration-300 hover:scale-105 transform"
              >
                Add Person
              </button>
            </form>
          </div>

          {/* Budget Management */}
          <div className="bg-[#151528] p-6 rounded-2xl border border-white/10 card-glow">
            <h2 className="text-2xl font-bold text-santa-snow mb-4">Gift Budget</h2>
            <form onSubmit={handleUpdateBudget} className="space-y-4">
              <div>
                <label htmlFor="budgetAmount" className="block text-sm font-medium text-gray-300 mb-2">
                  Budget Amount <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="number"
                  id="budgetAmount"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  className="w-full px-4 py-2 bg-santa-dark border border-white/10 rounded-lg focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow placeholder-gray-500"
                  placeholder="50.00"
                  step="0.01"
                  min="0"
                />
              </div>

              <div>
                <label htmlFor="budgetCurrency" className="block text-sm font-medium text-gray-300 mb-2">
                  Currency
                </label>
                <select
                  id="budgetCurrency"
                  value={budgetCurrency}
                  onChange={(e) => setBudgetCurrency(e.target.value)}
                  className="w-full px-4 py-2 bg-santa-dark border border-white/10 rounded-lg focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow"
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

              <div className="text-sm text-gray-400">
                {budget.budgetAmount ? (
                  <p>Current budget: <span className="font-semibold text-santa-gold">{budget.budgetCurrency} {budget.budgetAmount}</span></p>
                ) : (
                  <p className="italic">No budget set</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-santa-gold text-santa-dark py-2 rounded-xl font-semibold hover:bg-santa-gold-dark transition-all duration-300 hover:scale-105 transform"
              >
                Update Budget
              </button>
            </form>
          </div>

          {/* Secret Santa Assignments */}
          <div className="bg-[#151528] p-6 rounded-2xl border border-white/10 card-glow">
            <h2 className="text-2xl font-bold text-santa-snow mb-4">Secret Santa</h2>
            <div className="space-y-4">
              <p className="text-gray-400">
                {people.length} people registered
                {assignments.length > 0 && ` \u2022 ${assignments.length} assignments created`}
              </p>
              {assignments.length === 0 ? (
                <button
                  onClick={handleGenerateAssignments}
                  disabled={people.length < 3}
                  className="w-full bg-santa-red text-white py-2 rounded-xl font-semibold hover:bg-santa-red-dark transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transform"
                >
                  Generate Assignments
                </button>
              ) : (
                <button
                  onClick={handleDeleteAssignments}
                  className="w-full bg-santa-gold text-santa-dark py-2 rounded-xl font-semibold hover:bg-santa-gold-dark transition-all duration-300 hover:scale-105 transform"
                >
                  Delete &amp; Regenerate
                </button>
              )}
              {people.length < 3 && (
                <p className="text-sm text-santa-red">Need at least 3 people to generate assignments</p>
              )}
            </div>
          </div>
        </div>

        {/* People List */}
        <div className="mt-8 bg-[#151528] p-6 rounded-2xl border border-white/10 card-glow">
          <h2 className="text-2xl font-bold text-santa-snow mb-4">People ({people.length})</h2>
          {people.length === 0 ? (
            <p className="text-gray-400">No people added yet. Add your first person above!</p>
          ) : (
            <>
            {/* Mobile card layout */}
            <div className="space-y-3 md:hidden">
              {people.map((person) => (
                <div key={person.id} className="bg-santa-dark/50 border border-white/5 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-santa-snow">{person.name}</span>
                    <button
                      onClick={() => handleDeletePerson(person.id, person.name)}
                      className="text-santa-red hover:text-santa-red-dark font-semibold text-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      Delete
                    </button>
                  </div>
                  {person.email && (
                    <p className="text-gray-400 text-sm truncate mb-1">{person.email}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <code className="bg-santa-dark border border-white/10 px-2 py-1 rounded font-mono text-santa-gold text-xs">
                      {person.loginCode}
                    </code>
                    <span className="text-gray-400">{person._count.wishlistItems}/5 items</span>
                    {person._count.wishlistItems > 0 ? (
                      <span className="bg-santa-green/10 text-santa-green text-xs px-2 py-0.5 rounded-full font-semibold border border-santa-green/20">
                        Saved
                      </span>
                    ) : (
                      <span className="bg-white/5 text-gray-500 text-xs px-2 py-0.5 rounded-full border border-white/10">
                        Not saved
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table layout */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-santa-gold text-sm">Name</th>
                    <th className="text-left py-3 px-4 text-santa-gold text-sm">Email</th>
                    <th className="text-left py-3 px-4 text-santa-gold text-sm">Login Code</th>
                    <th className="text-left py-3 px-4 text-santa-gold text-sm">Wishlist</th>
                    <th className="text-left py-3 px-4 text-santa-gold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-4 text-santa-snow">{person.name}</td>
                      <td className="py-3 px-4">
                        {person.email ? (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-300 text-sm">{person.email}</span>
                            <span className="bg-santa-gold/10 text-santa-gold text-xs px-2 py-1 rounded-full font-semibold border border-santa-gold/20">
                              Magic Link
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-sm italic">No email</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <code className="bg-santa-dark border border-white/10 px-2 py-1 rounded font-mono text-santa-gold text-sm">
                          {person.loginCode}
                        </code>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-santa-snow">{person._count.wishlistItems}/5</span>
                          {person._count.wishlistItems > 0 ? (
                            <span className="bg-santa-green/10 text-santa-green text-xs px-2 py-1 rounded-full font-semibold border border-santa-green/20">
                              Saved
                            </span>
                          ) : (
                            <span className="bg-white/5 text-gray-500 text-xs px-2 py-1 rounded-full border border-white/10">
                              Not saved
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleDeletePerson(person.id, person.name)}
                          className="text-santa-red hover:text-santa-red-dark font-semibold text-sm"
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
          <div className="mt-8 bg-[#151528] p-6 rounded-2xl border border-white/10 card-glow">
            <h2 className="text-2xl font-bold text-santa-snow mb-4">
              Assignments ({assignments.length})
            </h2>
            {/* Mobile card layout */}
            <div className="space-y-2 md:hidden">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="bg-santa-dark/50 border border-white/5 rounded-lg p-3 flex justify-between items-center">
                  <div className="text-sm">
                    <span className="text-santa-snow">{assignment.giver.name}</span>
                    <span className="text-gray-500 mx-2">&rarr;</span>
                    <span className="text-santa-snow">{assignment.receiver.name}</span>
                  </div>
                  <span className="text-gray-400 text-xs">{assignment.receiver.wishlistItems.length} items</span>
                </div>
              ))}
            </div>

            {/* Desktop table layout */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-santa-gold text-sm">Giver</th>
                    <th className="text-left py-3 px-4 text-santa-gold text-sm">Receiver</th>
                    <th className="text-left py-3 px-4 text-santa-gold text-sm">Wishlist Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr key={assignment.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-4 text-santa-snow">{assignment.giver.name}</td>
                      <td className="py-3 px-4 text-santa-snow">{assignment.receiver.name}</td>
                      <td className="py-3 px-4 text-gray-400">
                        {assignment.receiver.wishlistItems.length} items
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
