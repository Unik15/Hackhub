import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  Trophy,
  CalendarClock,
  ClipboardList,
  ArrowUpRight,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import Table from "@/components/Table";
import Seo from "@/components/Seo";
import { fetchOrganizerHackathons, fetchOrganizerSubmissions } from "@/services/organizer";
import { getErrorMessage } from "@/utils/errors";
import { useAuth } from "@/context/AuthContext";
import { formatDateRange, safeFormatDate } from "@/utils/date";

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

const SUBMISSION_STATUS_STYLES = {
  pending: "bg-secondary/10 text-secondary",
  approved: "bg-primary/15 text-primary",
  rejected: "bg-destructive/10 text-destructive",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hackathons, setHackathons] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Both feeds are scoped to the session server-side; no email is sent.
      const [hackathonData, submissionData] = await Promise.all([
        fetchOrganizerHackathons(),
        fetchOrganizerSubmissions(),
      ]);
      setHackathons(hackathonData);
      setSubmissions(submissionData);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load your dashboard."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everything below is derived straight from the fetched rows — no invented
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

    const pending = submissions.filter((s) => s.status === "pending").length;

    return { total, participants, upcoming, live, ended, pending };
  }, [hackathons, submissions]);

  // Accounts that never submitted anything (and are not admins) get a friendly
  // empty state instead of an empty analytics shell.
  const hasAnyData =
    submissions.length > 0 ||
    hackathons.length > 0 ||
    user?.hasSubmissions === true ||
    user?.role === "admin";

  const hackathonColumns = [
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

  const submissionColumns = [
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
      header: "Status",
      accessor: "status",
      render: (row) => (
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-xs font-ui font-medium capitalize ${SUBMISSION_STATUS_STYLES[row.status] || "bg-muted text-muted-foreground"}`}
        >
          {row.status}
        </span>
      ),
    },
    {
      header: "Review note",
      accessor: "reviewNote",
      render: (row) => (
        <span className="font-body text-xs text-muted-foreground">{row.reviewNote || "—"}</span>
      ),
    },
    {
      header: "Submitted",
      accessor: "createdAt",
      render: (row) => (
        <span className="font-stub text-xs text-muted-foreground">{safeFormatDate(row.createdAt) || "—"}</span>
      ),
    },
    {
      header: "",
      accessor: "actions",
      render: (row) =>
        row.approvedHackathonId ? (
          <button
            onClick={() => navigate(`/hackathon/${row.approvedHackathonId}`)}
            aria-label="View public listing"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80"
          >
            <ArrowUpRight size={14} />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="container py-12">
      <Seo title="Organizer Dashboard" noindex />

      <div className="mb-8">
        <h1 className="font-heading text-3xl sm:text-4xl">Organizer Dashboard</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Track your submissions and manage the hackathons you've published.
        </p>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded border border-destructive/30 bg-destructive/5 py-16 text-center">
          <AlertTriangle size={26} className="text-destructive" />
          <p className="font-ui text-sm text-foreground">{error}</p>
          <button
            onClick={load}
            className="mt-2 inline-flex items-center gap-1.5 rounded border border-border px-4 py-2 text-sm font-ui text-foreground hover:bg-muted"
          >
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      ) : !hasAnyData ? (
        <div className="mx-auto max-w-lg rounded-lg border border-border bg-card px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ClipboardList size={20} />
          </div>
          <h2 className="font-heading text-2xl text-foreground">Nothing to manage yet</h2>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            The organizer dashboard unlocks after your first hackathon submission. Submit one and
            you'll be able to track its review status here.
          </p>
          <Link
            to="/explore"
            className="mt-6 inline-flex items-center gap-1.5 rounded bg-primary px-5 py-2.5 text-sm font-ui font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Explore hackathons <ArrowUpRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* KPI Summary */}
          <section>
            <h2 className="mb-3 font-heading text-sm tracking-tight text-foreground">Summary</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard icon={Trophy} label="Total Hackathons" value={stats.total} tone="secondary" caption="published by you" />
              <KpiCard icon={Users} label="Total Participants" value={stats.participants} tone="primary" caption="across all events" />
              <KpiCard icon={CalendarClock} label="Pending Review" value={stats.pending} tone="muted" caption="waiting for approval" />
              <KpiCard icon={CalendarClock} label="Upcoming" value={stats.upcoming} tone="signal" caption="not started yet" />
            </div>
          </section>

          {/* My Submissions — the manual review trail, shown first */}
          {submissions.length > 0 && (
            <section>
              <h2 className="mb-3 font-heading text-sm tracking-tight text-foreground">My Submissions</h2>
              <Table
                columns={submissionColumns}
                data={submissions}
                emptyMessage="You haven't submitted a hackathon yet."
              />
            </section>
          )}

          {/* Status breakdown of published listings */}
          <section>
            <h2 className="mb-3 font-heading text-sm tracking-tight text-foreground">Status Breakdown</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <InsightCard label="Upcoming" count={stats.upcoming} total={stats.total} tone="secondary" />
              <InsightCard label="Live" count={stats.live} total={stats.total} tone="primary" />
              <InsightCard label="Ended" count={stats.ended} total={stats.total} tone="muted" />
            </div>
          </section>

          {/* Published hackathons */}
          <section>
            <h2 className="mb-3 font-heading text-sm tracking-tight text-foreground">Your Hackathons</h2>
            <Table
              columns={hackathonColumns}
              data={hackathons}
              emptyMessage="Approved submissions appear here once they're published."
            />
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
