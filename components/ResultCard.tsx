"use client";

import { useState } from "react";
import type { QualifyingRole, RoleScore } from "@/lib/types";

interface Props {
  role: QualifyingRole;
}

type Persona = "cold" | "warm" | "hot";

function ScorePill({ label, value }: { label: string; value: number }) {
  const colorClass =
    value >= 8
      ? "bg-emerald-950 text-emerald-300 border-emerald-800"
      : value >= 6
      ? "bg-amber-950 text-amber-300 border-amber-800"
      : "bg-red-950 text-red-300 border-red-800";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border ${colorClass}`}
    >
      <span className="text-slate-500">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

const PERSONA_PLACEHOLDERS: Record<Persona, string> = {
  cold: "Any specific hook? (optional — e.g. saw their AI post, admire their payments product)",
  warm: "How do you know this person? (e.g. met at SaaStr, commented on their post)",
  hot: "What's your relationship? (e.g. ex-ICICI colleague, IIM batchmate)",
};

export default function ResultCard({ role }: Props) {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [context, setContext] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [evalTag, setEvalTag] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePersonaSelect = (p: Persona) => {
    setPersona(p);
    setDraft(null);
    setEvalTag(null);
    setContext("");
  };

  const handleDraft = async () => {
    if (!persona) return;
    setIsDrafting(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: role.role_title,
          company: role.company,
          jd_summary: role.jd_summary,
          score: role.score,
          persona,
          context,
        }),
      });
      const data = await res.json();
      setDraft(data.draft ?? "");
      setEvalTag(data.eval_tag ?? null);
    } catch {
      setDraft("Error generating draft. Please try again.");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleCopy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const overallColor =
    role.score.overall >= 8
      ? "text-emerald-400"
      : role.score.overall >= 6
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">

      {/* ── SECTION 1: Role info ── */}
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-100 truncate">{role.role_title}</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {role.company}
              {role.location && role.location !== "Location TBD" && (
                <> · {role.location}</>
              )}
            </p>
            <p className="text-xs text-amber-500/70 mt-1">
              Verify role is still open before reaching out
            </p>
          </div>
          <div className={`text-4xl font-bold shrink-0 ${overallColor}`}>
            {role.score.overall}
          </div>
        </div>

        {/* Score pills */}
        <div className="flex flex-wrap gap-1.5">
          <ScorePill label="Skills" value={role.score.skills_match} />
          <ScorePill label="Seniority" value={role.score.seniority_fit} />
          <ScorePill label="Context" value={role.score.context_overlap} />
          <ScorePill label="Overall" value={role.score.overall} />
        </div>

        {/* Rationale */}
        <p className="text-xs text-slate-500 italic leading-relaxed">
          {role.score.rationale}
        </p>

        {/* View role link */}
        {role.role_url && role.role_url !== "#" && (
          <a
            href={role.role_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-blue-500 hover:text-blue-400 transition-colors"
          >
            View role →
          </a>
        )}
      </div>

      {/* ── SECTION 2: Outreach ── */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">
          Outreach
        </p>

        {/* Persona buttons */}
        <div className="flex gap-2">
          {(["cold", "warm", "hot"] as Persona[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePersonaSelect(p)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors capitalize ${
                persona === p
                  ? "bg-blue-900 border-blue-600 text-blue-200"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Context input — shown when persona selected */}
        {persona && (
          <input
            type="text"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={PERSONA_PLACEHOLDERS[persona]}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-500"
          />
        )}

        {/* Draft button */}
        <button
          onClick={handleDraft}
          disabled={!persona || isDrafting}
          className="w-full py-2 rounded-lg text-sm font-medium transition-colors
            disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed
            enabled:bg-blue-700 enabled:hover:bg-blue-600 enabled:text-white"
        >
          {isDrafting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Drafting…
            </span>
          ) : (
            "Draft message"
          )}
        </button>

        {/* Draft output */}
        {draft !== null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              {evalTag && (
                <span
                  className={`text-xs px-2 py-0.5 rounded border ${
                    evalTag === "passed"
                      ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                      : "bg-orange-950 text-orange-300 border-orange-800"
                  }`}
                >
                  {evalTag === "passed" ? "✓ passed eval" : evalTag}
                </span>
              )}
              <div className="ml-auto">
                <button
                  onClick={handleCopy}
                  className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="relative">
              <textarea
                readOnly
                value={draft}
                rows={4}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 resize-none focus:outline-none leading-relaxed"
              />
            </div>

            <p
              className={`text-xs ${
                draft.length > 280
                  ? "text-red-400"
                  : draft.length > 250
                  ? "text-amber-400"
                  : "text-slate-600"
              }`}
            >
              {draft.length}/300 chars
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
