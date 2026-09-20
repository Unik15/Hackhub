function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function HackathonCard({ hackathon, onSave, saved }) {
  const {
    title,
    trendingScore,
    url,
    isOnline,
    endDate
  } = hackathon;

 const link =
  typeof url === "string" && /^https?:\/\/.+/i.test(url)
    ? url
    : null;

const mode = isOnline ? "online" : "offline"; 
  
  const days = daysUntil(endDate);
  const urgent = days !== null && days >= 0 && days <= 7;

  return (
    <div className="group relative bg-panel border border-line rounded-xl p-5 hover:border-scan/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display font-semibold text-text leading-snug">{title}</h3>

        {typeof trendingScore === "number" && (
          <div className="shrink-0 font-mono text-xs text-scan bg-scan/10 border border-scan/20 rounded-full px-2 py-1">
            {trendingScore}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-mono text-muted">
        <span className="px-2 py-1 rounded-md bg-panel2 border border-line capitalize">
          {mode}
        </span>

        {urgent && (
          <span className="px-2 py-1 rounded-md bg-signal/10 border border-signal/30 text-signal flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-blip" />
            {days === 0 ? "closes today" : `${days}d left`}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between">
       {link ? (
  <a
    href={link}
    target="_blank"
    rel="noopener noreferrer"
    className="text-sm font-semibold text-scan hover:underline"
  >
    View hackathon →
  </a>
) : (
  <span className="text-sm font-semibold text-muted">
    Link unavailable
  </span>
)}

        {onSave && (
          <button
            onClick={onSave}
            aria-label={saved ? "Remove from saved" : "Save hackathon"}
            className={`text-xs font-mono px-3 py-1.5 rounded-md border transition-colors ${
              saved
                ? "border-scan/40 text-scan bg-scan/10"
                : "border-line text-muted hover:border-scan/40 hover:text-scan"
            }`}
          >
            {saved ? "Saved" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}