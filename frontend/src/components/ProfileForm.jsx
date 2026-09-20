import { useState } from "react";
import client from "../api/client.js";

const EXPERIENCE = ["beginner", "intermediate", "advanced"];
const MODES = ["online", "offline", "both"];

export default function ProfileForm({ onSaved }) {
  const [form, setForm] = useState({
    skills: "",
    interests: "",
    experience: "beginner",
    city: "",
    preferredMode: "both",
  });
  const [status, setStatus] = useState("idle");

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setStatus("saving");
    try {
      await client.put("/profile", {
        profile: {
          skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
          interests: form.interests.split(",").map((s) => s.trim()).filter(Boolean),
          experience: form.experience,
          city: form.city,
          preferredMode: form.preferredMode,
        },
      });
      setStatus("saved");
      onSaved?.();
    } catch {
      setStatus("error");
    }
  }

  return (
    <section id="profile" className="max-w-3xl mx-auto px-6 py-16 border-t border-line">
      <h2 className="font-display text-2xl font-semibold text-text mb-2">Tune your matches</h2>
      <p className="text-muted mb-8">
        This feeds directly into the ranking model — the more specific, the sharper your
        recommendations.
      </p>

      <form onSubmit={submit} className="grid gap-5">
        <label className="grid gap-2">
          <span className="text-sm font-mono text-muted">Skills (comma separated)</span>
          <input
            value={form.skills}
            onChange={(e) => update("skills", e.target.value)}
            placeholder="React, Python, Solidity"
            className="bg-panel border border-line rounded-lg px-4 py-3 text-text placeholder:text-muted focus:border-scan/50"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-mono text-muted">Interests</span>
          <input
            value={form.interests}
            onChange={(e) => update("interests", e.target.value)}
            placeholder="AI, Fintech, Climate tech"
            className="bg-panel border border-line rounded-lg px-4 py-3 text-text placeholder:text-muted focus:border-scan/50"
          />
        </label>

        <div className="grid md:grid-cols-2 gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-mono text-muted">Experience level</span>
            <select
              value={form.experience}
              onChange={(e) => update("experience", e.target.value)}
              className="bg-panel border border-line rounded-lg px-4 py-3 text-text capitalize"
            >
              {EXPERIENCE.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-mono text-muted">Preferred mode</span>
            <select
              value={form.preferredMode}
              onChange={(e) => update("preferredMode", e.target.value)}
              className="bg-panel border border-line rounded-lg px-4 py-3 text-text capitalize"
            >
              {MODES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-mono text-muted">City</span>
          <input
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Varanasi, India"
            className="bg-panel border border-line rounded-lg px-4 py-3 text-text placeholder:text-muted focus:border-scan/50"
          />
        </label>

        <button
          type="submit"
          disabled={status === "saving"}
          className="justify-self-start bg-scan text-ink font-semibold px-6 py-3 rounded-lg hover:bg-scan/90 disabled:opacity-60"
        >
          {status === "saving" ? "Saving..." : "Save profile"}
        </button>

        {status === "saved" && <p className="text-scan text-sm">Profile saved — recommendations updated.</p>}
        {status === "error" && <p className="text-signal text-sm">Something went wrong — try again.</p>}
      </form>
    </section>
  );
}
