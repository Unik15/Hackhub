import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { SearchX, Search, ChevronDown, AlertTriangle, RotateCcw } from "lucide-react";
import HackathonCard from "@/components/HackathonCard";
import HackathonCardSkeleton from "@/components/HackathonCardSkeleton";
import Seo from "@/components/Seo";
import { fetchHackathons } from "@/services/hackathons";
import { useDebounce } from "@/hooks/useDebounce";
import { getErrorMessage } from "@/utils/errors";

const ParticipateModal = lazy(() => import("@/modals/ParticipateModal"));

export default function HackathonList() {
  const [hackathons, setHackathons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 400);
  const [platform, setPlatform] = useState("all");

  // Modal only mounts (and its chunk only loads) after the first Participate click.
  const [participateHackathon, setParticipateHackathon] = useState(null);
  const [participateOpen, setParticipateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHackathons();
      setHackathons(data);
    } catch (err) {
      setError(getErrorMessage(err, "Something went wrong while loading hackathons."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Platform options derived from live data — no hardcoded/mock list.
  const platforms = useMemo(() => {
    const unique = new Set(hackathons.map((h) => h.platform).filter(Boolean));
    return ["all", ...unique];
  }, [hackathons]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return hackathons.filter((h) => {
      const matchesQuery =
        !q ||
        h.title?.toLowerCase().includes(q) ||
        h.location?.toLowerCase().includes(q) ||
        h.platform?.toLowerCase().includes(q);
      const matchesPlatform = platform === "all" || h.platform === platform;
      return matchesQuery && matchesPlatform;
    });
  }, [hackathons, debouncedQuery, platform]);

  const handleParticipate = (hackathon) => {
    setParticipateHackathon(hackathon);
    setParticipateOpen(true);
  };

  return (
    <div className="container py-12">
      <Seo
        title="Explore Hackathons"
        description="Search and filter hackathons by platform, location, and tech stack."
        path="/explore"
      />

      <div className="mb-8">
        <h1 className="font-heading text-3xl sm:text-4xl">Explore Hackathons</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          {loading ? "Loading…" : `${filtered.length} hackathon${filtered.length !== 1 ? "s" : ""} found`}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, location, platform…"
            className="w-full rounded-md border border-border bg-card py-2.5 pl-9 pr-3 text-sm font-body text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>

        <div className="relative">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            disabled={loading || hackathons.length === 0}
            className="appearance-none rounded-md border border-border bg-card py-2.5 pl-3 pr-9 text-sm font-body text-foreground outline-none transition-colors focus:border-primary disabled:opacity-50"
          >
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p === "all" ? "All platforms" : p}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <HackathonCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
          <AlertTriangle size={26} className="text-destructive" />
          <p className="font-ui text-sm text-foreground">{error}</p>
          <button
            onClick={load}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-ui text-foreground hover:bg-muted"
          >
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card py-16 text-center">
          <SearchX size={26} className="text-muted-foreground" />
          <p className="font-ui text-sm text-foreground">
            {hackathons.length === 0 ? "No hackathons available yet" : "No hackathons match your search"}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {hackathons.length === 0
              ? "Check back soon, or submit one of your own."
              : "Try a different keyword or clear the platform filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((h, i) => (
            <HackathonCard key={h.id} hackathon={h} index={i} onParticipate={handleParticipate} />
          ))}
        </div>
      )}

      {participateHackathon && (
        <Suspense fallback={null}>
          <ParticipateModal
            open={participateOpen}
            onClose={() => setParticipateOpen(false)}
            hackathonId={participateHackathon.id}
            hackathonTitle={participateHackathon.title}
          />
        </Suspense>
      )}
    </div>
  );
}
