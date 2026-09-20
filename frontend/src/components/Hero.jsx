const BLIPS = [
  { top: "20%", left: "65%", delay: "0s" },
  { top: "55%", left: "78%", delay: "0.8s" },
  { top: "72%", left: "38%", delay: "1.6s" },
  { top: "35%", left: "25%", delay: "2.4s" },
  { top: "48%", left: "50%", delay: "1.1s" },
];

export default function Hero({ onExplore }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-mono text-scan bg-scan/10 border border-scan/20 rounded-full px-3 py-1 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-scan animate-blip" />
            LIVE — scanning 40+ sources
          </div>

          <h1 className="font-display text-4xl md:text-5xl font-semibold leading-tight text-text">
            The hackathons your college group chat hasn't found yet.
          </h1>

          <p className="mt-5 text-muted text-lg max-w-md">
            HackHub crawls Devpost, Unstop, and college pages around the clock,
            then ranks every result against your skills, location, and deadlines —
            so the obscure ones surface right alongside the big names.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={onExplore}
              className="bg-scan text-ink font-semibold px-6 py-3 rounded-lg hover:bg-scan/90 transition-colors"
            >
              See what's matched for you
            </button>
            <a
              href="#trending"
              className="border border-line px-6 py-3 rounded-lg text-text hover:border-scan/50 transition-colors"
            >
              Browse trending
            </a>
          </div>

          <div className="mt-10 flex gap-8 font-mono text-sm text-muted">
            <div>
              <div className="text-2xl text-text font-semibold">6h</div>
              crawl interval
            </div>
            <div>
              <div className="text-2xl text-text font-semibold">500km</div>
              default match radius
            </div>
            <div>
              <div className="text-2xl text-text font-semibold">24/7</div>
              discovery
            </div>
          </div>
        </div>

        {/* Signature element: radar sweep revealing hidden hackathons as blips */}
        <div className="relative flex items-center justify-center">
          <div className="radar w-72 h-72 md:w-96 md:h-96 border border-line">
            {BLIPS.map((b, i) => (
              <span
                key={i}
                className="radar-blip"
                style={{ top: b.top, left: b.left, animationDelay: b.delay }}
              />
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-xs text-muted">SCANNING</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
