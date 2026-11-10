import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Inbox,
  RotateCcw,
  X,
} from "lucide-react";
import Seo from "@/components/Seo";
import { fetchAdminSubmissions, approveSubmission, rejectSubmission } from "@/services/admin";
import { getErrorMessage } from "@/utils/errors";
import { formatDateRange, safeFormatDate } from "@/utils/date";
import { toast } from "@/hooks/use-toast";

const FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_STYLES = {
  pending: "bg-secondary/10 text-secondary",
  approved: "bg-primary/15 text-primary",
  rejected: "bg-destructive/10 text-destructive",
};

const EMPTY_MESSAGES = {
  pending: "The queue is clear — no submissions waiting for review.",
  approved: "No approved submissions yet.",
  rejected: "No rejected submissions yet.",
};

export default function AdminReviews() {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Approve is immediate; reject needs a note first.
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAdminSubmissions(status)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load the review queue."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, refreshKey]);

  const refresh = () => setRefreshKey((key) => key + 1);

  const changeFilter = (next) => {
    if (next === status) return;
    setStatus(next);
    setRejectingId(null);
    setNote("");
  };

  const handleApprove = async (item) => {
    setApprovingId(item.id);
    try {
      await approveSubmission(item.id);
      toast({
        title: "Submission approved",
        description: `${item.title} is now published.`,
      });
      refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't approve submission",
        description: getErrorMessage(err, "Please try again."),
      });
    } finally {
      setApprovingId(null);
    }
  };

  const startReject = (item) => {
    setRejectingId(item.id);
    setNote("");
  };

  const cancelReject = () => {
    setRejectingId(null);
    setNote("");
  };

  const confirmReject = async (item) => {
    const trimmed = note.trim();
    if (!trimmed || rejecting) return;

    setRejecting(true);
    try {
      await rejectSubmission(item.id, trimmed);
      toast({
        title: "Submission rejected",
        description: `${item.title} was not published. The organizer can see your note.`,
      });
      cancelReject();
      refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't reject submission",
        description: getErrorMessage(err, "Please try again."),
      });
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="container py-12">
      <Seo title="Submission Review" noindex />

      <div className="mb-8">
        <h1 className="font-heading text-3xl sm:text-4xl">Submission Review</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Approve organizer submissions to publish them, or reject them with a note the organizer will see.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => changeFilter(filter.value)}
            className={`rounded-full px-4 py-1.5 text-xs font-ui font-semibold uppercase tracking-wider transition-colors ${
              status === filter.value
                ? "bg-foreground text-background"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {filter.label}
          </button>
        ))}
        {!loading && !error && (
          <span className="ml-auto font-body text-xs text-muted-foreground">
            {items.length} submission{items.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading ? (
        <ReviewSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded border border-destructive/30 bg-destructive/5 py-16 text-center">
          <AlertTriangle size={26} className="text-destructive" />
          <p className="font-ui text-sm text-foreground">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-2 inline-flex items-center gap-1.5 rounded border border-border px-4 py-2 text-sm font-ui text-foreground hover:bg-muted"
          >
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card py-16 text-center">
          <Inbox size={22} className="text-muted-foreground" />
          <p className="font-ui text-sm text-foreground">{EMPTY_MESSAGES[status]}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <SubmissionCard
              key={item.id}
              item={item}
              approving={approvingId === item.id}
              rejectingThis={rejectingId === item.id}
              note={note}
              rejecting={rejecting}
              onApprove={() => handleApprove(item)}
              onStartReject={() => startReject(item)}
              onCancelReject={cancelReject}
              onNoteChange={setNote}
              onConfirmReject={() => confirmReject(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({
  item,
  approving,
  rejectingThis,
  note,
  rejecting,
  onApprove,
  onStartReject,
  onCancelReject,
  onNoteChange,
  onConfirmReject,
}) {
  const submitted = safeFormatDate(item.createdAt);
  const reviewed = safeFormatDate(item.reviewedAt);

  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-lg text-foreground">{item.title}</h2>
          <p className="mt-1 font-body text-xs text-muted-foreground">
            {item.organizerEmail}
            <span className="mx-1.5">·</span>
            {formatDateRange(item.startDate, item.endDate)}
            <span className="mx-1.5">·</span>
            <span className="capitalize">{item.mode}</span>
            {item.location ? (
              <>
                <span className="mx-1.5">·</span>
                {item.location}
              </>
            ) : null}
          </p>
        </div>
        <span
          className={`inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-ui font-medium capitalize ${STATUS_STYLES[item.status] || "bg-muted text-muted-foreground"}`}
        >
          {item.status}
        </span>
      </div>

      {item.description ? (
        <p className="mt-3 font-body text-sm text-muted-foreground">{item.description}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-body text-xs text-muted-foreground">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-ui font-medium text-foreground underline-offset-4 hover:underline"
        >
          Submission link <ArrowUpRight size={12} />
        </a>
        {item.approvedHackathonId ? (
          <Link
            to={`/hackathon/${item.approvedHackathonId}`}
            className="inline-flex items-center gap-1 font-ui font-medium text-primary underline-offset-4 hover:underline"
          >
            View public listing <ArrowUpRight size={12} />
          </Link>
        ) : null}
        {submitted ? <span>Submitted {submitted}</span> : null}
        {reviewed ? <span>Reviewed {reviewed}</span> : null}
      </div>

      {item.reviewNote ? (
        <div className="mt-3 rounded border border-border bg-muted/40 px-3 py-2 font-body text-xs text-muted-foreground">
          <span className="font-ui font-semibold text-foreground">Review note:</span> {item.reviewNote}
        </div>
      ) : null}

      {item.status === "pending" ? (
        <div className="mt-4 border-t border-border pt-4">
          {rejectingThis ? (
            <div>
              <label
                htmlFor={`reject-note-${item.id}`}
                className="mb-1.5 block font-ui text-xs font-medium text-foreground"
              >
                Why is this being rejected?
              </label>
              <textarea
                id={`reject-note-${item.id}`}
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="The organizer will see this note on their dashboard."
                className="w-full rounded border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none transition-colors focus:border-primary"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onConfirmReject}
                  disabled={!note.trim() || rejecting}
                  className="inline-flex items-center gap-1.5 rounded bg-destructive px-4 py-2 text-sm font-ui font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <X size={14} /> {rejecting ? "Rejecting…" : "Confirm rejection"}
                </button>
                <button
                  type="button"
                  onClick={onCancelReject}
                  disabled={rejecting}
                  className="rounded border border-border px-4 py-2 text-sm font-ui text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onApprove}
                disabled={approving}
                className="inline-flex items-center gap-1.5 rounded bg-primary px-4 py-2 text-sm font-ui font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check size={14} /> {approving ? "Approving…" : "Approve"}
              </button>
              <button
                type="button"
                onClick={onStartReject}
                disabled={approving}
                className="inline-flex items-center gap-1.5 rounded border border-border px-4 py-2 text-sm font-ui text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <X size={14} /> Reject
              </button>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-lg border border-border bg-muted" />
      ))}
    </div>
  );
}
