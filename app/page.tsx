"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Company, QualifyingRole, AgentSSEEvent } from "@/lib/types";
import type { UserProfile } from "@/lib/candidate-profile";
import { buildProfileString } from "@/lib/candidate-profile";
import CompanyConfig from "@/components/CompanyConfig";
import RunButton from "@/components/RunButton";
import StreamLog, { type LogEntry } from "@/components/StreamLog";
import ResultCard from "@/components/ResultCard";
import ProfileForm from "@/components/ProfileForm";

// ── localStorage keys ──────────────────────────────────────────────────────────
const LS_PROFILE = "job-agent-profile";
const LS_COMPANIES = "job-agent-companies";
const LS_KEYWORDS = "job-agent-keywords";

// ── Defaults ───────────────────────────────────────────────────────────────────
const DEFAULT_COMPANIES: Company[] = [
  { id: "1", name: "Salesforce", domain: "salesforce.com" },
  { id: "2", name: "Microsoft", domain: "microsoft.com" },
  { id: "3", name: "Adobe", domain: "adobe.com" },
  { id: "4", name: "Intuit", domain: "intuit.com" },
];

const DEFAULT_KEYWORDS = [
  "Product Manager",
  "GTM Manager",
  "Pre-Sales",
  "Partnerships Manager",
  "Growth Manager",
];

// ── Log helpers ────────────────────────────────────────────────────────────────
function toLogEntry(event: AgentSSEEvent): LogEntry | null {
  const id = crypto.randomUUID();

  switch (event.type) {
    case "agent:start":
      return { id, level: "info", company: event.company, message: "Starting search..." };
    case "agent:search":
      return { id, level: "info", company: event.company, message: `Searching: "${event.query}"` };
    case "agent:roles_found":
      return {
        id,
        level: event.count > 0 ? "success" : "skip",
        company: event.company,
        message: `Found ${event.count} relevant role${event.count !== 1 ? "s" : ""}`,
      };
    case "agent:roles_capped":
      return {
        id,
        level: "warn",
        company: event.company,
        message: `Found ${event.total} roles — scoring top ${event.scoring} by title relevance`,
      };
    case "agent:enriching":
      return { id, level: "info", company: event.company, message: `Enriching JD: ${event.role_title}` };
    case "agent:scoring":
      return { id, level: "info", company: event.company, message: `Scoring: ${event.role_title}` };
    case "agent:score_result":
      return {
        id,
        level: event.skipped ? "skip" : "success",
        company: event.company,
        message: `— ${event.role_title}: S:${event.score.skills_match} Sen:${event.score.seniority_fit} C:${event.score.context_overlap} Overall:${event.score.overall}/10 — ${event.score.rationale} → ${event.skipped ? "SKIPPED" : "QUALIFYING"}`,
      };
    case "agent:done":
      return { id, level: "success", company: event.company, message: "Done." };
    case "agent:debug":
      return { id, level: "info", company: event.company, message: event.message };
    default:
      return null;
  }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function HomePage() {
  // Hydration: wait until we've read localStorage before rendering
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);

  const [companies, setCompanies] = useState<Company[]>(DEFAULT_COMPANIES);
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [keywordInput, setKeywordInput] = useState("");

  const [isRunning, setIsRunning] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [qualifyingRoles, setQualifyingRoles] = useState<QualifyingRole[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // ── Load from localStorage on mount ────────────────────────────────────────
  useEffect(() => {
    try {
      const sp = localStorage.getItem(LS_PROFILE);
      if (sp) setProfile(JSON.parse(sp));
    } catch {}
    try {
      const sc = localStorage.getItem(LS_COMPANIES);
      if (sc) setCompanies(JSON.parse(sc));
    } catch {}
    try {
      const sk = localStorage.getItem(LS_KEYWORDS);
      if (sk) setKeywords(JSON.parse(sk));
    } catch {}
    setInitialized(true);
  }, []);

  // ── Persist companies ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem(LS_COMPANIES, JSON.stringify(companies));
  }, [companies, initialized]);

  // ── Persist keywords ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem(LS_KEYWORDS, JSON.stringify(keywords));
  }, [keywords, initialized]);

  // ── Profile save ────────────────────────────────────────────────────────────
  const handleSaveProfile = (p: UserProfile) => {
    setProfile(p);
    setShowEditProfile(false);
    localStorage.setItem(LS_PROFILE, JSON.stringify(p));
  };

  // ── Keyword helpers ─────────────────────────────────────────────────────────
  const addKeyword = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords((prev) => [...prev, trimmed]);
    }
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(keywordInput);
    }
  };

  // ── Agent run ───────────────────────────────────────────────────────────────
  const profileString = profile ? buildProfileString(profile) : "";

  const startRun = useCallback(() => {
    if (isRunning) return;

    setIsRunning(true);
    setLogEntries([]);
    setQualifyingRoles([]);
    setHasRun(true);

    const params = new URLSearchParams({
      companies: JSON.stringify(companies),
      keywords: JSON.stringify(keywords),
      profile: profileString,
    });

    const es = new EventSource(`/api/agent?${params.toString()}`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as AgentSSEEvent;

      if (event.type === "run:complete") {
        setQualifyingRoles(event.qualifying_roles);
        setIsRunning(false);
        es.close();
        return;
      }

      if (event.type === "run:error") {
        setLogEntries((prev) => [
          ...prev,
          { id: crypto.randomUUID(), level: "warn" as const, message: `Error: ${event.message}` },
        ]);
        setIsRunning(false);
        es.close();
        return;
      }

      const entry = toLogEntry(event);
      if (entry) setLogEntries((prev) => [...prev, entry]);
    };

    es.onerror = () => {
      setIsRunning(false);
      setLogEntries((prev) => [
        ...prev,
        { id: crypto.randomUUID(), level: "warn" as const, message: "Connection closed." },
      ]);
      es.close();
    };
  }, [isRunning, companies, keywords, profileString]);

  const stopRun = () => {
    esRef.current?.close();
    setIsRunning(false);
    setLogEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), level: "warn" as const, message: "Run stopped by user." },
    ]);
  };

  const validCompanies = companies.filter((c) => c.name.trim() && c.domain.trim());

  // ── Render guard — wait for localStorage ───────────────────────────────────
  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-4 h-4 bg-slate-600 rounded-full animate-pulse" />
      </div>
    );
  }

  // ── Onboarding screen ──────────────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Job Search Agent</h1>
            <p className="text-sm text-slate-500">
              Set up your profile to get started.{" "}
              <span className="text-slate-600">Stored locally on your device — never shared.</span>
            </p>
          </div>
          <ProfileForm onSave={handleSaveProfile} isOnboarding />
        </div>
      </div>
    );
  }

  // ── Edit profile overlay ───────────────────────────────────────────────────
  if (showEditProfile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg space-y-8">
          <div className="space-y-2">
            <h1 className="text-lg font-bold tracking-tight">Edit Profile</h1>
            <p className="text-xs text-slate-600">Changes apply to future scoring and drafting runs.</p>
          </div>
          <ProfileForm
            initial={profile}
            onSave={handleSaveProfile}
            onCancel={() => setShowEditProfile(false)}
          />
        </div>
      </div>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  const targetRolesDisplay = profile.targetRoles || "—";
  const domainDisplay = profile.domain || "—";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/60 px-6 py-4 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Job Search Agent</h1>
          </div>
          {isRunning && (
            <div className="flex items-center gap-2 text-xs text-blue-400">
              <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              Running
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Left panel: config + controls ── */}
          <div className="lg:col-span-1 space-y-5">

            {/* Keywords config */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Search keywords
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300"
                  >
                    {kw}
                    {!isRunning && (
                      <button
                        onClick={() => removeKeyword(kw)}
                        className="text-slate-500 hover:text-slate-300 transition-colors leading-none"
                        aria-label={`Remove ${kw}`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {!isRunning && (
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeywordKeyDown}
                  onBlur={() => keywordInput.trim() && addKeyword(keywordInput)}
                  placeholder="Add keyword, press Enter"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-500"
                />
              )}
            </div>

            {/* Company config */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <CompanyConfig
                companies={companies}
                onChange={setCompanies}
                disabled={isRunning}
              />
            </div>

            {/* Run button */}
            <div className="space-y-2">
              <RunButton
                onClick={startRun}
                isRunning={isRunning}
                disabled={validCompanies.length === 0}
              />
              {isRunning && (
                <button
                  onClick={stopRun}
                  className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Stop run
                </button>
              )}
            </div>

            {/* Candidate profile panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Candidate Profile
                </h3>
                <button
                  onClick={() => setShowEditProfile(true)}
                  className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
                >
                  Edit
                </button>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-200">{profile.name}</p>
                <p className="text-xs text-slate-500">{profile.currentRole}</p>
                {profile.experience && (
                  <p className="text-xs text-slate-600">{profile.experience}</p>
                )}
              </div>
              {targetRolesDisplay !== "—" && (
                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                  <p className="text-xs text-slate-600 font-medium uppercase tracking-wide">
                    Target roles
                  </p>
                  <p className="text-xs text-slate-400">{targetRolesDisplay}</p>
                </div>
              )}
              {domainDisplay !== "—" && (
                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                  <p className="text-xs text-slate-600 font-medium uppercase tracking-wide">
                    Domain
                  </p>
                  <p className="text-xs text-slate-400">{domainDisplay}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Right panel: log + results ── */}
          <div className="lg:col-span-2 space-y-8">

            {/* Agent log */}
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Agent Log
              </h2>
              <StreamLog entries={logEntries} isRunning={isRunning} />
            </div>

            {/* Results */}
            {qualifyingRoles.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Fit Assessment
                  </h2>
                  <span className="text-xs px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-400">
                    {qualifyingRoles.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {qualifyingRoles.map((role, i) => (
                    <ResultCard
                      key={`${role.company}-${role.role_title}-${i}`}
                      role={role}
                      profile={profileString}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state after a completed run */}
            {hasRun && !isRunning && qualifyingRoles.length === 0 && logEntries.length > 0 && (
              <div className="text-center py-12 text-slate-600 text-sm">
                No qualifying roles found — all roles scored below 5/10.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
