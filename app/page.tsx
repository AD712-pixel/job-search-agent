"use client";

import { useState, useRef, useCallback } from "react";
import type { Company, QualifyingRole, AgentSSEEvent } from "@/lib/types";
import CompanyConfig from "@/components/CompanyConfig";
import RunButton from "@/components/RunButton";
import StreamLog, { type LogEntry } from "@/components/StreamLog";
import ResultCard from "@/components/ResultCard";
import NotionBanner from "@/components/NotionBanner";

const DEFAULT_COMPANIES: Company[] = [
  { id: "1", name: "Salesforce", domain: "salesforce.com" },
  { id: "2", name: "Microsoft", domain: "microsoft.com" },
  { id: "3", name: "Adobe", domain: "adobe.com" },
  { id: "4", name: "Intuit", domain: "intuit.com" },
];

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
    case "agent:drafting":
      return { id, level: "info", company: event.company, message: `Drafting outreach: ${event.role_title}` };
    case "agent:evaluating":
      return {
        id,
        level: "info",
        company: event.company,
        message: `Evaluating draft (iter ${event.iteration}): ${event.role_title}`,
      };
    case "agent:eval_result":
      return {
        id,
        level: event.eval_tag === "passed" ? "success" : "warn",
        company: event.company,
        message:
          event.eval_tag === "passed"
            ? `Draft passed eval: ${event.role_title}`
            : `Draft rewritten: ${event.role_title}`,
      };
    case "agent:notion_log":
      return { id, level: "success", company: event.company, message: `Logged to Notion: ${event.role_title}` };
    case "agent:done":
      return { id, level: "success", company: event.company, message: "Done." };
    case "agent:debug":
      return { id, level: "info", company: event.company, message: event.message };
    default:
      return null;
  }
}

export default function HomePage() {
  const [companies, setCompanies] = useState<Company[]>(DEFAULT_COMPANIES);
  const [isRunning, setIsRunning] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [qualifyingRoles, setQualifyingRoles] = useState<QualifyingRole[]>([]);
  const [showNotionBanner, setShowNotionBanner] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const startRun = useCallback(() => {
    if (isRunning) return;

    setIsRunning(true);
    setLogEntries([]);
    setQualifyingRoles([]);
    setShowNotionBanner(false);
    setHasRun(true);

    const params = new URLSearchParams({
      companies: JSON.stringify(companies),
    });

    const es = new EventSource(`/api/agent?${params.toString()}`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as AgentSSEEvent;

      if (event.type === "run:complete") {
        setQualifyingRoles(event.qualifying_roles);
        setShowNotionBanner(event.qualifying_roles.length > 0);
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
        {
          id: crypto.randomUUID(),
          level: "warn" as const,
          message: "Connection closed.",
        },
      ]);
      es.close();
    };
  }, [isRunning, companies]);

  const stopRun = () => {
    esRef.current?.close();
    setIsRunning(false);
    setLogEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), level: "warn" as const, message: "Run stopped by user." },
    ]);
  };

  const validCompanies = companies.filter((c) => c.name.trim() && c.domain.trim());

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/60 px-6 py-4 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Job Search Agent</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Amey Divekar · Director, CreditNirvana · IIM Bangalore MBA · Bengaluru
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

          {/* ── Left panel: config + controls ── */}
          <div className="lg:col-span-1 space-y-5">

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

            {/* Candidate profile card */}
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
                    Qualifying Roles
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
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state after a completed run */}
            {hasRun && !isRunning && qualifyingRoles.length === 0 && logEntries.length > 0 && (
              <div className="text-center py-12 text-slate-600 text-sm">
                No qualifying roles found — all roles scored below 6/10.
              </div>
            )}
          </div>
        </div>
      </main>

      <NotionBanner
        show={showNotionBanner}
        roleCount={qualifyingRoles.length}
        onDismiss={() => setShowNotionBanner(false)}
      />
    </div>
  );
}
