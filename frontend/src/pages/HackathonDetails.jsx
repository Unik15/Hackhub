import React, { Suspense, lazy, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, Calendar, ArrowLeft, Rocket, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import Timeline from "@/components/Timeline";
import OrganizerCard from "@/components/OrganizerCard";
import Seo from "@/components/Seo";
import { fetchHackathonById } from "@/services/hackathons";
import { formatDateRange } from "@/utils/date";
import { getErrorMessage, isNotFound } from "@/utils/errors";

const ParticipateModal = lazy(() => import("@/modals/ParticipateModal"));

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.08, ease: "easeOut" },
  }),
};

export default function HackathonDetails() {
  const { id } = useParams();
  const [hackathon, setHackathon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal chunk only loads once the user actually clicks Participate.
  const [participateMounted, setParticipateMounted] = useState(false);
  const [participateOpen, setParticipateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHackathonById(id);
      setHackathon(data);
    } catch (err) {
      setError(
        isNotFound(err) ? "This hackathon couldn't be found." : getErrorMessage(err, "Something went wrong while loading this hackathon.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openParticipate = () => {
    setParticipateMounted(true);
    setParticipateOpen(true);
  };

  if (loading) return <DetailsSkeleton />;

  if (error) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center">
        <Seo title="Hackathon not found" noindex />
        <AlertTriangle size={28} className="text-destructive" />
        <p className="font-ui text-sm text-foreground">{error}</p>
        <button
          onClick={load}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-ui text-foreground hover:bg-muted"
        >
          <RotateCcw size={14} /> Retry
        </button>
        <Link to="/explore" className="mt-1 text-sm text-muted-foreground hover:text-foreground">
          Back to Explore
        </Link>
      </div>
    );
  }

  if (!hackathon) return null;

  const { title, description, location, platform } = hackathon;

  return (
    <div className="container py-10 pb-28 sm:pb-16">
      <Seo
        title={title || "Hackathon"}
        description={description ? description.slice(0, 155) : undefined}
        path={`/hackathon/${id}`}
      />

      <Link to="/explore" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={15} /> Back to Explore
      </Link>

      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0} className="mb-10">
        {platform && (
          <span className="mb-4 inline-block rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-ui font-medium text-muted-foreground">
            {platform}
          </span>
        )}
        <h1 className="font-heading text-4xl leading-tight text-foreground sm:text-5xl">
          {title || "Untitled hackathon"}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-body text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar size={14} /> {formatDateRange(hackathon.startDate, hackathon.endDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={14} /> {location || "Location not specified"}
          </span>
        </div>
      </motion.div>

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        {/* LEFT — content */}
        <div className="space-y-12">
          <motion.section variants={fadeUp} initial="hidden" animate="show" custom={1}>
            <h2 className="font-heading mb-3 text-xl text-foreground">About</h2>
            <p className="whitespace-pre-line font-body text-sm leading-relaxed text-muted-foreground">
              {description || "No description provided yet."}
            </p>
          </motion.section>

          <motion.section variants={fadeUp} initial="hidden" animate="show" custom={2}>
            <h2 className="font-heading mb-6 text-xl text-foreground">Timeline</h2>
            <Timeline hackathon={hackathon} />
          </motion.section>

          <motion.section variants={fadeUp} initial="hidden" animate="show" custom={3}>
            <h2 className="font-heading mb-4 text-xl text-foreground">Organizer</h2>
            <OrganizerCard hackathon={hackathon} />
          </motion.section>
        </div>

        {/* RIGHT — sticky CTA panel (desktop) */}
        <motion.aside
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={1}
          className="hidden lg:sticky lg:top-24 lg:block lg:h-fit"
        >
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-xs text-muted-foreground">Ready to build something?</p>
            <p className="mt-1 font-heading text-lg text-foreground">Join {title}</p>
            <Button onClick={openParticipate} className="mt-5 w-full">
              <Rocket size={16} /> Participate Now
            </Button>
          </div>
        </motion.aside>
      </div>

      {/* Sticky CTA — mobile only */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl lg:hidden">
        <Button onClick={openParticipate} className="w-full">
          <Rocket size={16} /> Participate Now
        </Button>
      </div>

      {participateMounted && (
        <Suspense fallback={null}>
          <ParticipateModal
            open={participateOpen}
            onClose={() => setParticipateOpen(false)}
            hackathonId={hackathon.id}
            hackathonTitle={title}
          />
        </Suspense>
      )}
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div className="container py-10">
      <div className="mb-8 h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-10 w-3/4 animate-pulse rounded bg-muted" />
      <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-muted" />
      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
