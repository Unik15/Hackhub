import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { SearchX, Search, ChevronDown, AlertTriangle, RotateCcw, MapPin } from "lucide-react";
import HackathonCard from "@/components/HackathonCard";
import HackathonCardSkeleton from "@/components/HackathonCardSkeleton";
import Seo from "@/components/Seo";
import { fetchHackathons, fetchNearbyHackathons } from "@/services/hackathons";
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
  const [city, setCity] = useState("");
  const [radiusKm, setRadiusKm] = useState("500");
  const [nearbyLocation, setNearbyLocation] = useState("");

  // Modal only mounts (and its chunk only loads) after the first Participate click.
  const [participateHackathon, setParticipateHackathon] = useState(null);
  const [participateOpen, setParticipateOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHackathons();
      setHackathons(data);
      setNearbyLocation("");
    } catch (err) {
      setError(getErrorMessage(err, "Something went wrong while loading hackathons."));
    } finally {
      setLoading(false);
    }
  };

  const loadNearby = async (event) => {
    event?.preventDefault();
    const trimmedCity = city.trim();
    if (!trimmedCity) {
      setError("Enter your city to find hackathons nearby.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await fetchNearbyHackathons({ city: trimmedCity, radiusKm: Number(radiusKm) });
      setHackathons(result.items || []);
      setNearbyLocation(result.location || trimmedCity);
      setPlatform("all");
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't find nearby hackathons. Please try another city."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
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
          {loading
            ? "Loading…"
            : `${filtered.length} hackathon${filtered.length !== 1 ? "s" : ""} found${nearbyLocation ? ` within ${radiusKm} km of ${nearbyLocation}` : ""}`}
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

      <form onSubmit={loadNearby} className="mb-8 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        <MapPin size={18} className="shrink-0 text-primary" aria-hidden="true" />
        <label className="sr-only" htmlFor="nearby-city">Your city</label>
        <input
          id="nearby-city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Enter your city, e.g. Delhi"
          disabled={loading}
          className="min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 py-2.5 text-sm font-body text-foreground outline-none transition-colors focus:border-primary disabled:opacity-50"
        />
        <label className="sr-only" htmlFor="nearby-radius">Search radius</label>
        <select
          id="nearby-radius"
          value={radiusKm}
          onChange={(event) => setRadiusKm(event.target.value)}
          disabled={loading}
          className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-body text-foreground outline-none focus:border-primary disabled:opacity-50"
        >
          <option value="100">Within 100 km</option>
          <option value="250">Within 250 km</option>
          <option value="500">Within 500 km</option>
          <option value="1000">Within 1,000 km</option>
          <option value="2000">Within 2,000 km</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-ui font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Find near me
        </button>
        {nearbyLocation && (
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="px-2 py-2 text-sm font-ui text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Show all
          </button>
        )}
      </form>

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
            onClick={nearbyLocation ? loadNearby : loadAll}
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
