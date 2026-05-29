"use client";

import { useState } from "react";
import type { QualifyingRole } from "@/lib/types";

interface Props {
  role: QualifyingRole;
}

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

export default function ResultCard({ role }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(role.outreach_draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const overallColor =
    role.score.overall >= 8
      ? "text-emerald-400"
      : role.score.overall >= 6
      ? "text-amber-400"
      : "text-red-400";

  const charCount = role.outreach_draft.length;
  const charCountColor = charCount > 280 ? "text-red-400" : charCount > 250 ? "text-amber-400" : "text-slate-600";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
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
        {role.eval_tag === "rewritten" ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs border bg-orange-950 text-orange-300 border-orange-800">
            rewritten
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs border bg-emerald-950 text-emerald-400 border-emerald-800">
            ✓ passed eval
          </span>
        )}
      </div>

      {/* Rationale */}
      <p className="text-xs text-slate-500 italic leading-relaxed">
        {role.score.rationale}
      </p>

      {/* Outreach draft */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">
            LinkedIn Note
          </span>
          <div className="flex items-center gap-3">
            {role.role_url && role.role_url !== "#" && (
              <a
                href={role.role_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
              >
                View role →
              </a>
            )}
            {role.notion_url && (
              <a
                href={role.notion_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-purple-500 hover:text-purple-400 transition-colors"
              >
                Notion →
              </a>
            )}
          </div>
        </div>

        <div className="relative">
          <textarea
            readOnly
            value={role.outreach_draft}
            rows={4}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 resize-none focus:outline-none leading-relaxed"
          />
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <p className={`text-xs ${charCountColor}`}>
          {charCount}/300 chars
        </p>
      </div>
    </div>
  );
}
