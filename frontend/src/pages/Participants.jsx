import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, AlertTriangle, RotateCcw } from "lucide-react";
import Table from "@/components/Table";
import Seo from "@/components/Seo";
import { fetchParticipants } from "@/services/organizer";
import { exportToCSV } from "@/utils/csv";
import { getErrorMessage } from "@/utils/errors";

export default function Participants() {
  const { hackathonId } = useParams();
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchParticipants(hackathonId);
      setParticipants(data);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load participants."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathonId]);

  const columns = [
    { header: "Name", accessor: "name" },
    { header: "Email", accessor: "email" },
    { header: "College", accessor: "college" },
  ];

  const handleExport = () => {
    exportToCSV(
      `participants-${hackathonId}.csv`,
      participants.map(({ name, email, college }) => ({ name, email, college }))
    );
  };

  return (
    <div className="container py-12">
      <Seo title="Participants" noindex />

      <Link to="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={15} /> Back to Dashboard
      </Link>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl">Participants</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            {loading ? "Loading…" : `${participants.length} participant${participants.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={loading || participants.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2.5 text-sm font-ui text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
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
      ) : (
        <Table columns={columns} data={participants} emptyMessage="No participants have registered yet." />
      )}
    </div>
  );
}
