import { useEffect, useState } from "react";
import client from "./api/client.js";
import Hero from "./components/Hero.jsx";
import SearchFilters from "./components/SearchFilters.jsx";
import RecommendedSection from "./components/RecommendedSection.jsx";
import TrendingSection from "./components/TrendingSection.jsx";
import ProfileForm from "./components/ProfileForm.jsx";

export default function App() {
  const [isAuthed, setIsAuthed] = useState(!!localStorage.getItem("hackhub_token"));
  const [authMode, setAuthMode] = useState(null); // "login" | "register" | null
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    setIsAuthed(!!localStorage.getItem("hackhub_token"));
  }, []);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError(null);
    try {
      const path = authMode === "register" ? "/auth/register" : "/auth/login";
      const { data } = await client.post(path, authForm);
      localStorage.setItem("hackhub_token", data.token);
      setIsAuthed(true);
      setAuthMode(null);
    } catch (err) {
      setAuthError(err.response?.data?.error || "Something went wrong");
    }
  }

  function logout() {
    localStorage.removeItem("hackhub_token");
    setIsAuthed(false);
  }

  function scrollToRecommended() {
    document.getElementById("recommended")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-20 backdrop-blur bg-ink/80 border-b border-line">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-display font-semibold text-lg text-text">
            Hack<span className="text-scan">Hub</span>
          </span>
          <nav className="flex items-center gap-4">
            {isAuthed ? (
              <button onClick={logout} className="text-sm text-muted hover:text-text">
                Log out
              </button>
            ) : (
              <>
                <button
                  onClick={() => setAuthMode("login")}
                  className="text-sm text-muted hover:text-text"
                >
                  Log in
                </button>
                <button
                  onClick={() => setAuthMode("register")}
                  className="text-sm bg-scan text-ink font-semibold px-4 py-2 rounded-lg hover:bg-scan/90"
                >
                  Get matched
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <Hero onExplore={scrollToRecommended} />
      <SearchFilters onSearch={() => {}} />
      <RecommendedSection isAuthed={isAuthed} />
      <TrendingSection />
      {isAuthed && <ProfileForm />}

      {authMode && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-30 px-6"
          onClick={() => setAuthMode(null)}
        >
          <div
            className="bg-panel border border-line rounded-xl p-8 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-semibold text-text mb-5 capitalize">
              {authMode}
            </h3>
            <form onSubmit={handleAuthSubmit} className="grid gap-4">
              {authMode === "register" && (
                <input
                  placeholder="Name"
                  value={authForm.name}
                  onChange={(e) => setAuthForm((f) => ({ ...f, name: e.target.value }))}
                  className="bg-panel2 border border-line rounded-lg px-4 py-3 text-text placeholder:text-muted"
                  required
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={authForm.email}
                onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))}
                className="bg-panel2 border border-line rounded-lg px-4 py-3 text-text placeholder:text-muted"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={authForm.password}
                onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))}
                className="bg-panel2 border border-line rounded-lg px-4 py-3 text-text placeholder:text-muted"
                required
                minLength={8}
              />
              {authError && <p className="text-signal text-sm">{authError}</p>}
              <button
                type="submit"
                className="bg-scan text-ink font-semibold px-4 py-3 rounded-lg hover:bg-scan/90"
              >
                {authMode === "register" ? "Create account" : "Log in"}
              </button>
            </form>
          </div>
        </div>
      )}

      <footer className="border-t border-line py-10 text-center text-muted text-sm">
        Built for hackers who don't want to miss the one no one's talking about yet.
      </footer>
    </div>
  );
}
