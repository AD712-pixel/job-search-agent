"use client";

import { useState, useRef, useCallback } from "react";
import type { QualifyingRole, AgentSSEEvent } from "@/lib/types";
import RunButton from "@/components/RunButton";
import StreamLog, { type LogEntry } from "@/components/StreamLog";
import ResultCard from "@/components/ResultCard";

function toLogEntry(event: AgentSSEEvent): LogEntry | null {
  const id = crypto.randomUUID();

  switch (event.type) {
    case "agent:scoring":
      return {
        id,
        level: "info",
        company: event.company,
        message: `Scoring: ${event.role_title}`,
      };
    case "agent:score_result":
      return {
        id,
        level: event.skipped ? "skip" : "success",
        company: event.company,
        message: `${event.role_title}: S:${event.score.skills_match} Sen:${event.score.seniority_fit} C:${event.score.context_overlap} Overall:${event.score.overall}/10 — ${event.score.rationale} → ${event.skipped ? "SKIPPED" : "QUALIFYING"}`,
      };
    default:
      return null;
  }
}

export default function HomePage() {
  const [manualUrls, setManualUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [qualifyingRoles, setQualifyingRoles] = useState<QualifyingRole[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const addUrl = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed && trimmed.startsWith("http") && !manualUrls.includes(trimmed)) {
      setManualUrls((prev) => [...prev, trimmed]);
    }
    setUrlInput("");
  };

  const removeUrl = (u: string) =>
    setManualUrls((prev) => prev.filter((x) => x !== u));

  const urlLabel = (raw: string) => {
    try {
      const { hostname, pathname } = new URL(raw);
      const path = pathname.length > 22 ? pathname.slice(0, 22) + "…" : pathname;
      return `${hostname}${path}`;
    } catch {
      return raw.slice(0, 40);
    }
  };

  const startRun = useCallback(() => {
    if (isRunning) return;

    setIsRunning(true);
    setLogEntries([]);
    setQualifyingRoles([]);
    setHasRun(true);

    const params = new URLSearchParams({
      manualUrls: JSON.stringify(manualUrls),
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
          {
            id: crypto.randomUUID(),
            level: "warn" as const,
            message: `Error: ${event.message}`,
          },
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
        {
          id: crypto.randomUUID(),
          level: "warn" as const,
          message: "Connection closed.",
        },
      ]);
      es.close();
    };
  }, [isRunning, manualUrls]);

  const stopRun = () => {
    esRef.current?.close();
    setIsRunning(false);
    setLogEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        level: "warn" as const,
        message: "Run stopped by user.",
      },
    ]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/60 px-6 py-4 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Job Search Agent</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Paste job URLs to score fit and draft persona-based outreach
            </p>
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

          {/* ── Left panel ── */}
          <div className="lg:col-span-1 space-y-5">

            {/* Job URLs input */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Job URLs
              </h3>

              {manualUrls.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {manualUrls.map((u) => (
                    <span
                      key={u}
                      className="inline-flex items-center justify-between gap-2 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300"
                    >
                      <span className="truncate min-w-0">{urlLabel(u)}</span>
                      {!isRunning && (
                        <button
                          onClick={() => removeUrl(u)}
                          className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors leading-none"
                          aria-label="Remove URL"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {!isRunning && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addUrl(urlInput);
                      }
                    }}
                    placeholder="Paste a job posting URL, press Enter"
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-500"
                  />
                  <button
                    onClick={() => addUrl(urlInput)}
                    disabled={!urlInput.trim().startsWith("http")}
                    className="shrink-0 text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40 transition-colors"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Run button */}
            <div className="space-y-2">
              <RunButton
                onClick={startRun}
                isRunning={isRunning}
                disabled={manualUrls.length === 0}
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

            {/* Candidate profile */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Candidate Profile
              </h3>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-200">Amey Divekar</p>
                <p className="text-xs text-slate-500">Director · CreditNirvana (Perfios)</p>
                <p className="text-xs text-slate-500">MBA · IIM Bangalore</p>
              </div>
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <p className="text-xs text-slate-600 font-medium uppercase tracking-wide">
                  Target roles
                </p>
                <p className="text-xs text-slate-400">
                  Growth PM · Pre-Sales Lead · Partnerships Manager · Product Manager
                </p>
              </div>
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <p className="text-xs text-slate-600 font-medium uppercase tracking-wide">
                  Domain
                </p>
                <p className="text-xs text-slate-400">
                  BFSI · Lending SaaS · AI agents · B2B fintech · Enterprise
                </p>
              </div>
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="lg:col-span-2 space-y-8">

            {/* Pre-run hint */}
            {!hasRun && !isRunning && (
              <div className="text-center py-16 text-slate-600 text-sm">
                Paste at least one job URL above to get started
              </div>
            )}

            {/* Agent log */}
            {(hasRun || isRunning) && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Agent Log
                </h2>
                <StreamLog entries={logEntries} isRunning={isRunning} />
              </div>
            )}

            {/* Results */}
            {qualifyingRoles.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Fit Assessment
                </h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {qualifyingRoles.map((role, i) => (
                    <ResultCard
                      key={`${role.company}-${role.role_title}-${i}`}
                      role={role}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
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
