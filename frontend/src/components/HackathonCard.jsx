import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateRange, daysUntil } from "@/utils/date";

export default function HackathonCard({ hackathon, onParticipate, index = 0 }) {
  const { id, title, platform, startDate, endDate, location } = hackathon;
  const daysLeft = daysUntil(startDate);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
      className="pass-lift flex h-full rounded border border-border bg-card"
    >
      {/* Main body — the part you'd read before an event */}
      <div className="flex flex-1 flex-col gap-4 p-5">
        <h3 className="font-heading text-xl leading-none text-foreground">{title || "Untitled hackathon"}</h3>

        <div className="flex flex-col gap-1.5 text-sm font-body text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar size={13} className="shrink-0" />
            {formatDateRange(startDate, endDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={13} className="shrink-0" />
            {location || "Location not specified"}
          </span>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Link to={`/hackathon/${id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              View Details
            </Button>
          </Link>
          <Button size="sm" className="flex-1" onClick={() => onParticipate?.(hackathon)}>
            Participate
          </Button>
        </div>
      </div>

      {/* The stub — torn off, the part you'd keep. Platform + countdown live here. */}
      <div className="ticket-perforation flex w-[92px] shrink-0 flex-col items-center justify-between gap-3 py-5">
        <span className="stub-label">{platform || "HACKHUB"}</span>
        <div className="flex flex-col items-center gap-0.5">
          {daysLeft ? (
            <>
              <span className="font-stub text-2xl font-semibold leading-none text-primary">{daysLeft}</span>
              <span className="font-stub text-[9px] uppercase tracking-widest text-muted-foreground">
                {daysLeft === 1 ? "day left" : "days left"}
              </span>
            </>
          ) : (
            <span className="font-stub text-[10px] uppercase tracking-widest text-muted-foreground">Live</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
