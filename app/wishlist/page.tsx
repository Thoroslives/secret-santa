"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface WishlistItem {
  id?: string;
  title: string;
  link: string;
}

interface Assignment {
  receiver: {
    name: string;
    wishlistItems: WishlistItem[];
  };
}

export default function Wishlist() {
  const [personId, setPersonId] = useState("");
  const [personName, setPersonName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [items, setItems] = useState<WishlistItem[]>([
    { title: "", link: "" },
  ]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [budget, setBudget] = useState<{ amount?: number; currency?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    const id = sessionStorage.getItem("personId");
    const name = sessionStorage.getItem("personName");
    const group = sessionStorage.getItem("groupName");
    const groupId = sessionStorage.getItem("groupId");
    const loginCode = sessionStorage.getItem("loginCode");

    if (!id || !name) {
      router.push("/login");
      return;
    }

    setPersonId(id);
    setPersonName(name);
    setGroupName(group || "");

    if (loginCode && groupId) {
      loadPersonData(loginCode, groupId);
    } else {
      setLoading(false);
    }
  }, [router]);

  const loadPersonData = async (loginCode: string, groupId: string) => {
    try {
      const [authRes, groupRes] = await Promise.all([
        fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loginCode, groupId }),
        }),
        fetch(`/api/groups/${groupId}`)
      ]);

      if (authRes.ok) {
        const data = await authRes.json();

        // Load existing wishlist items
        if (data.person.wishlistItems && data.person.wishlistItems.length > 0) {
          setItems(data.person.wishlistItems.map((item: WishlistItem) => ({
            id: item.id,
            title: item.title,
            link: item.link,
          })));
        }

        // Load assignment
        if (data.person.assignment) {
          setAssignment(data.person.assignment);
        }
      }

      // Load group budget information
      if (groupRes.ok) {
        const groupData = await groupRes.json();
        if (groupData.group && groupData.group.budgetAmount) {
          setBudget({
            amount: groupData.group.budgetAmount,
            currency: groupData.group.budgetCurrency || "USD"
          });
        }
      }

      setLoading(false);
    } catch (err) {
      setError("Failed to load data");
      setLoading(false);
    }
  };

  const handleItemChange = (index: number, field: "title" | "link", value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleAddItem = () => {
    if (items.length < 5) {
      setItems([...items, { title: "", link: "" }]);
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

    // Filter out empty items
    const validItems = items.filter((item) => item.title.trim() && item.link.trim());

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

      // Reload to get updated assignment if available
      const loginCode = sessionStorage.getItem("loginCode");
      const groupId = sessionStorage.getItem("groupId");
      if (loginCode && groupId) {
        loadPersonData(loginCode, groupId);
      }

      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("An error occurred while saving");
      setSaving(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.clear();
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
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-santa-gold font-display">Welcome, {personName}!</h1>
            {groupName && <p className="text-gray-300 mt-1">{groupName}</p>}
            <p className="text-gray-400 mt-1 text-sm">Manage your wishlist and Secret Santa assignment</p>
            {budget && (
              <div className="mt-2 inline-flex items-center bg-santa-gold/10 border border-santa-gold/30 text-santa-gold px-3 py-1 rounded-lg text-sm font-medium">
                💰 Gift Budget: {budget.currency} {budget.amount}
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="bg-white/10 text-santa-snow px-4 py-2 rounded-lg hover:bg-white/20 transition border border-white/10"
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
                      type="url"
                      value={item.link}
                      onChange={(e) => handleItemChange(index, "link", e.target.value)}
                      placeholder="https://example.com/product"
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
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-santa-gold hover:underline break-all"
                          >
                            {item.link}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-400 italic">
                      {assignment.receiver.name} hasn&apos;t added their wishlist yet. Check back later!
                    </p>
                  )}
                </div>
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
      </div>
    </div>
  );
}
