"use client";

import { useEffect, useRef, useState } from "react";
import type { Company, CompanySource, SourceType } from "@/lib/types";

interface Props {
  companies: Company[];
  onChange: React.Dispatch<React.SetStateAction<Company[]>>;
  disabled: boolean;
}

const DETECTION_DEBOUNCE_MS = 800;

const SOURCE_LABELS: Record<SourceType, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  firecrawl: "Firecrawl",
};

function isProbeableDomain(domain: string): boolean {
  const d = domain.trim();
  return d.includes(".") && d.length >= 4;
}

function withAdded(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  next.add(id);
  return next;
}

function withRemoved(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

function statusText(company: Company, isDetecting: boolean): string {
  if (isDetecting) return "Detecting...";
  if (!isProbeableDomain(company.domain)) return "Not detected yet";
  const { type, slug, careersUrl } = company.source;
  if (type !== "firecrawl") return `${SOURCE_LABELS[type]} · slug: ${slug || "—"}`;
  return careersUrl?.trim() ? `Firecrawl · ${careersUrl}` : "Firecrawl · search mode";
}

export default function CompanyConfig({ companies, onChange, disabled }: Props) {
  const [detecting, setDetecting] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Set<string>>(new Set());

  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const overriddenRef = useRef(new Set<string>());
  const requestSeqRef = useRef(new Map<string, number>());
  const latestCompaniesRef = useRef(companies);
  latestCompaniesRef.current = companies;

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const clearTimer = (id: string): boolean => {
    const timer = timersRef.current.get(id);
    if (timer === undefined) return false;
    clearTimeout(timer);
    timersRef.current.delete(id);
    return true;
  };

  const runDetection = async (id: string) => {
    const company = latestCompaniesRef.current.find((c) => c.id === id);
    if (!company || !isProbeableDomain(company.domain) || overriddenRef.current.has(id)) return;

    const domainAtCall = company.domain.trim();
    const seq = (requestSeqRef.current.get(id) ?? 0) + 1;
    requestSeqRef.current.set(id, seq);
    setDetecting((prev) => withAdded(prev, id));

    try {
      const params = new URLSearchParams({ name: company.name || domainAtCall, domain: domainAtCall });
      const res = await fetch(`/api/detect-source?${params.toString()}`);
      const data: { source?: CompanySource } = await res.json();
      const source = data.source;
      if (!source) return;

      onChange((prev) =>
        prev.map((c) =>
          c.id === id && c.domain.trim() === domainAtCall && !overriddenRef.current.has(id)
            ? { ...c, source }
            : c
        )
      );
    } catch {
      // leave source unchanged on error
    } finally {
      if (requestSeqRef.current.get(id) === seq) {
        setDetecting((prev) => withRemoved(prev, id));
      }
    }
  };

  const addCompany = () => {
    onChange((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", domain: "", source: { type: "firecrawl", careersUrl: "" } },
    ]);
  };

  const removeCompany = (id: string) => {
    clearTimer(id);
    onChange((prev) => prev.filter((c) => c.id !== id));
  };

  const updateName = (id: string, name: string) => {
    onChange((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  };

  const updateDomain = (id: string, domain: string) => {
    onChange((prev) => prev.map((c) => (c.id === id ? { ...c, domain } : c)));
    overriddenRef.current.delete(id);
    clearTimer(id);
    if (isProbeableDomain(domain)) {
      timersRef.current.set(
        id,
        setTimeout(() => {
          timersRef.current.delete(id);
          runDetection(id);
        }, DETECTION_DEBOUNCE_MS)
      );
    }
  };

  const handleDomainBlur = (id: string) => {
    if (clearTimer(id)) runDetection(id);
  };

  const updateSource = (id: string, source: CompanySource) => {
    onChange((prev) => prev.map((c) => (c.id === id ? { ...c, source } : c)));
  };

  const finishEditing = (id: string) => {
    overriddenRef.current.add(id);
    clearTimer(id);
    setEditing((prev) => withRemoved(prev, id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Target Companies
        </h2>
        <button
          onClick={addCompany}
          disabled={disabled}
          className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 disabled:opacity-40 transition-colors"
        >
          + Add
        </button>
      </div>

      <div className="space-y-3">
        {companies.map((company) => {
          const isEditing = editing.has(company.id);
          return (
            <div key={company.id} className="space-y-1.5 pb-2 border-b border-slate-800 last:border-0">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={company.name}
                  onChange={(e) => updateName(company.id, e.target.value)}
                  placeholder="Company"
                  disabled={disabled}
                  className="flex-1 min-w-0 text-sm bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                />
                <input
                  type="text"
                  value={company.domain}
                  onChange={(e) => updateDomain(company.id, e.target.value)}
                  onBlur={() => handleDomainBlur(company.id)}
                  placeholder="domain.com"
                  disabled={disabled}
                  className="flex-1 min-w-0 text-sm bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                />
                <button
                  onClick={() => removeCompany(company.id)}
                  disabled={disabled}
                  aria-label="Remove company"
                  className="shrink-0 text-slate-600 hover:text-red-400 disabled:opacity-40 transition-colors text-xl leading-none pb-0.5"
                >
                  ×
                </button>
              </div>

              {!isEditing ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 truncate min-w-0">
                    {statusText(company, detecting.has(company.id))}
                  </span>
                  <button
                    onClick={() => setEditing((prev) => withAdded(prev, company.id))}
                    disabled={disabled}
                    className="shrink-0 text-slate-600 hover:text-slate-400 disabled:opacity-40 transition-colors"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <select
                    value={company.source.type}
                    onChange={(e) =>
                      updateSource(company.id, { type: e.target.value as SourceType, slug: "", careersUrl: "" })
                    }
                    disabled={disabled}
                    className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-300 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                  >
                    {(Object.keys(SOURCE_LABELS) as SourceType[]).map((type) => (
                      <option key={type} value={type}>
                        {SOURCE_LABELS[type]}
                      </option>
                    ))}
                  </select>

                  {company.source.type === "firecrawl" ? (
                    <input
                      type="text"
                      value={company.source.careersUrl ?? ""}
                      onChange={(e) =>
                        updateSource(company.id, { ...company.source, careersUrl: e.target.value })
                      }
                      placeholder="Careers page URL (optional)"
                      disabled={disabled}
                      className="flex-1 min-w-0 text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                    />
                  ) : (
                    <input
                      type="text"
                      value={company.source.slug ?? ""}
                      onChange={(e) => updateSource(company.id, { ...company.source, slug: e.target.value })}
                      placeholder="ATS slug"
                      disabled={disabled}
                      className="flex-1 min-w-0 text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                    />
                  )}

                  <button
                    onClick={() => finishEditing(company.id)}
                    disabled={disabled}
                    className="shrink-0 text-xs px-2 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 disabled:opacity-40 transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
