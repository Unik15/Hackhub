import React from "react";
import { Mail } from "lucide-react";

export default function OrganizerCard({ hackathon }) {
  const name = hackathon?.organizer?.name || hackathon?.organizerName || "Organizer";
  const email = hackathon?.organizer?.email || hackathon?.organizerEmail;

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary font-heading text-sm text-primary-foreground">
          {initials || "?"}
        </div>
        <div>
          <p className="font-ui text-sm font-medium text-foreground">{name}</p>
          {email && (
            <a href={`mailto:${email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Mail size={11} /> {email}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
