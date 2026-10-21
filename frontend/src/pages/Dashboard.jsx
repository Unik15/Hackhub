import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Trophy,
  Radio,
  CalendarClock,
  ArrowUpRight,
  AlertTriangle,
  RotateCcw,
  Search,
} from "lucide-react";
import Table from "@/components/Table";
import Seo from "@/components/Seo";
import { fetchOrganizerHackathons } from "@/services/organizer";
import { getErrorMessage } from "@/utils/errors";
import { useAuth } from "@/context/AuthContext";
import { formatDateRange } from "@/utils/date";

const STORAGE_KEY = "hackhub_organizer_email";

/** Derives a status from dates we already have — nothing fabricated. */
function getStatus(h) {
  const start = h.startDate ? new Date(h.startDate).getTime() : null;
  const end = h.endDate ? new Date(h.endDate).getTime() : start;
  if (!start || Number.isNaN(start)) return "unknown";
  const now = Date.now();
  if (now < start) return "upcoming";
  if (end && now > end) return "ended";
  return "live";
}

const STATUS_STYLES = {
  upcoming: "bg-secondary/10 text-secondary",
  live: "bg-primary/15 text-primary",
  ended: "bg-muted text-muted-foreground",
  unknown: "bg-muted text-muted-foreground",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Prefer the logged-in account's email; fall back to whatever was typed
  // in last time, for backends where the organizer email can differ.
  const [email, setEmail] = useState(() => user?.email || localStorage.getItem(STORAGE_KEY) || "");
  const [hackathons, setHackathons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const load = async (organizerEmail) => {
    const trimmed = organizerEmail?.trim();
    if (!trimmed || loading) return; // guards duplicate submissions (e.g. Enter-key spam)
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const data = await fetchOrganizerHackathons(trimmed);
      setHackathons(data);
      localStorage.setItem(STORAGE_KEY, trimmed);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load your hackathons."));
    } finally {
      setLoading(false);
    }
  };

  // Auto-load if we remember an email from a previous visit.
  useEffect(() => {
    if (email) load(email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    load(email);
  };

  // Everything below is derived straight from `hackathons` — no invented
  // historical data, so there's no "+35% vs last month" chip anywhere.
  const stats = useMemo(() => {
    const total = hackathons.length;
    let participants = 0;
    let upcoming = 0;
    let live = 0;
    let ended = 0;
    for (const h of hackathons) {
      participants += h.participantsCount ?? h.participant_count ?? 0;
      const status = getStatus(h);
      if (status === "upcoming") upcoming++;
      else if (status === "live") live++;
      else if (status === "ended") ended++;
    }
    return { total, participants, upcoming, live, ended };
  }, [hackathons]);

  const columns = [
    {
      header: "Hackathon",
      accessor: "title",
      render: (row) => <span className="font-ui font-medium text-foreground">{row.title || "Untitled"}</span>,
    },
    {
      header: "Dates",
      accessor: "startDate",
      render: (row) => (
        <span className="font-stub text-xs text-muted-foreground">{formatDateRange(row.startDate, row.endDate)}</span>
      ),
    },
    {
      header: "Participants",
      accessor: "participantsCount",
      render: (row) => (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Users size={13} /> {row.participantsCount ?? row.participant_count ?? "—"}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: "status",
      render: (row) => {
        const status = getStatus(row);
        return (
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-ui font-medium capitalize ${STATUS_STYLES[status]}`}>
            {status}
          </span>
        );
      },
    },
    {
      header: "",
      accessor: "actions",
      render: (row) => (
        <button
          onClick={() => navigate(`/dashboard/hackathons/${row.id}/participants`)}
          aria-label="View participants"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80"
        >
          <ArrowUpRight size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className="container py-12">
      <Seo title="Organizer Dashboard" noindex />

      <div className="mb-8">
        <h1 className="font-heading text-3xl sm:text-4xl">Organizer Dashboard</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Manage the hackathons you've submitted and see who's joining.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@organization.com"
            disabled={loading}
            className="w-full rounded border border-border bg-card py-2.5 pl-9 pr-3 text-sm font-body text-foreground outline-none transition-colors focus:border-primary disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-primary px-4 py-2.5 text-sm font-ui font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load my hackathons"}
        </button>
      </form>

      {!searched ? (
        <div className="rounded border border-border bg-card py-16 text-center">
          <p className="font-ui text-sm text-foreground">Enter the email you used to submit hackathons.</p>
        </div>
      ) : loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded border border-destructive/30 bg-destructive/5 py-16 text-center">
          <AlertTriangle size={26} className="text-destructive" />
          <p className="font-ui text-sm text-foreground">{error}</p>
          <button
            onClick={() => load(email)}
            className="mt-2 inline-flex items-center gap-1.5 rounded border border-border px-4 py-2 text-sm font-ui text-foreground hover:bg-muted"
          >
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* KPI Summary */}
          <section>
            <h2 className="mb-3 font-heading text-sm tracking-tight text-foreground">Summary</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard icon={Trophy} label="Total Hackathons" value={stats.total} tone="secondary" caption="submitted by you" />
              <KpiCard icon={Users} label="Total Participants" value={stats.participants} tone="primary" caption="across all events" />
              <KpiCard icon={Radio} label="Live Now" value={stats.live} tone="signal" caption="currently running" />
              <KpiCard icon={CalendarClock} label="Upcoming" value={stats.upcoming} tone="muted" caption="not started yet" />
            </div>
          </section>

          {/* Insights & Performance — status breakdown as a share of total */}
          <section>
            <h2 className="mb-3 font-heading text-sm tracking-tight text-foreground">Status Breakdown</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <InsightCard label="Upcoming" count={stats.upcoming} total={stats.total} tone="secondary" />
              <InsightCard label="Live" count={stats.live} total={stats.total} tone="primary" />
              <InsightCard label="Ended" count={stats.ended} total={stats.total} tone="muted" />
            </div>
          </section>

          {/* Table */}
          <section>
            <h2 className="mb-3 font-heading text-sm tracking-tight text-foreground">Your Hackathons</h2>
            <Table columns={columns} data={hackathons} emptyMessage="No hackathons found for this email yet." />
          </section>
        </div>
      )}
    </div>
  );
}

const TONE_BADGE = {
  primary: "bg-primary/15 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  signal: "bg-signal/10 text-signal",
  muted: "bg-muted text-muted-foreground",
};

function KpiCard({ icon: Icon, label, value, caption, tone = "muted" }) {
  return (
    <div className="rounded border border-border bg-card p-5">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded ${TONE_BADGE[tone]}`}>
        <Icon size={16} />
      </div>
      <p className="font-ui text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-stub text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 font-body text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

const TONE_FILL = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  muted: "bg-muted-foreground/50",
};

function InsightCard({ label, count, total, tone }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="rounded border border-border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-ui text-sm font-medium text-foreground">{label}</p>
        <p className="font-stub text-lg font-semibold text-foreground">{count}</p>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${TONE_FILL[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 font-body text-xs text-muted-foreground">
        {count} of {total} hackathon{total === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded border border-border bg-muted" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
