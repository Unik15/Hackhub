import { useState } from "react";

const MODES = ["all", "online", "offline"];

export default function SearchFilters({ onSearch }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("all");

  function submit(e) {
    e.preventDefault();
    onSearch?.({ query, mode: mode === "all" ? undefined : mode });
  }

  return (
    <form
      onSubmit={submit}
      className="max-w-6xl mx-auto px-6 -mt-6 relative z-10 flex flex-col md:flex-row gap-3"
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title, domain, or tech stack..."
        className="flex-1 bg-panel border border-line rounded-lg px-4 py-3 text-text placeholder:text-muted focus:border-scan/50"
      />
      <div className="flex gap-2">
        {MODES.map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-3 rounded-lg border text-sm font-mono capitalize transition-colors ${
              mode === m
                ? "border-scan/50 text-scan bg-scan/10"
                : "border-line text-muted hover:border-scan/30"
            }`}
          >
            {m}
          </button>
        ))}
        <button
          type="submit"
          className="px-5 py-3 rounded-lg bg-scan text-ink font-semibold hover:bg-scan/90"
        >
          Search
        </button>
      </div>
    </form>
  );
}
