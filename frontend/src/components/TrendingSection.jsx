import { useEffect, useState } from "react";
import client from "../api/client.js";
import HackathonCard from "./HackathonCard.jsx";

export default function TrendingSection() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  client
    .get("/hackathons/trending")
    .then((res) => {
      console.log("TRENDING:", res.data);   // 🔥 API response check
      setItems(res.data.items || []);
    })
    .finally(() => setLoading(false));
}, []);

console.log("STATE ITEMS:", items); // state data

  return (
    <section id="trending" className="max-w-6xl mx-auto px-6 py-16 border-t border-line">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-display text-2xl font-semibold text-text">Trending now</h2>
        <span className="font-mono text-xs text-muted">most saved this week</span>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-panel border border-line animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-5">
          {items?.map((h) => (
            <HackathonCard key={h.id} hackathon={h} />
          ))}
        </div>
      )}
    </section>
  );
}
