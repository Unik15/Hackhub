import { useEffect, useState } from "react";
import client from "../api/client.js";
import HackathonCard from "./HackathonCard.jsx";

export default function RecommendedSection({ isAuthed }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }
    client
      .get("/recommendations")
      .then((res) => setItems(res.data.recommendations || []))
      .catch(() => setError("Couldn't load recommendations right now."))
      .finally(() => setLoading(false));
  }, [isAuthed]);

  return (
    <section id="recommended" className="max-w-6xl mx-auto px-6 py-16">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-display text-2xl font-semibold text-text">Recommended for YOU</h2>
        <span className="font-mono text-xs text-muted">ranked by AI match score</span>
      </div>

      {!isAuthed && (
        <div className="border border-dashed border-line rounded-xl p-8 text-center text-muted">
          Complete your profile below to unlock personalized picks — skills, location, and
          deadlines all factor into your matches.
        </div>
      )}

      {isAuthed && loading && (
        <div className="grid md:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-panel border border-line animate-pulse" />
          ))}
        </div>
      )}

      {isAuthed && error && <p className="text-signal text-sm">{error}</p>}

      {isAuthed && !loading && !error && items.length === 0 && (
        <div className="border border-dashed border-line rounded-xl p-8 text-center text-muted">
          No matches yet — try widening your interests or preferred mode in your profile.
        </div>
      )}

      {isAuthed && !loading && items.length > 0 && (
        <div className="grid md:grid-cols-3 gap-5">
          {items.map((h) => (
            <HackathonCard key={h.id} hackathon={h} />
          ))}
        </div>
      )}
    </section>
  );
}
