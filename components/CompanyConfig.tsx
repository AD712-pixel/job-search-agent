"use client";

import type { Company } from "@/lib/types";

interface Props {
  companies: Company[];
  onChange: (companies: Company[]) => void;
  disabled: boolean;
}

export default function CompanyConfig({ companies, onChange, disabled }: Props) {
  const addCompany = () => {
    onChange([
      ...companies,
      { id: crypto.randomUUID(), name: "", domain: "" },
    ]);
  };

  const removeCompany = (id: string) => {
    onChange(companies.filter((c) => c.id !== id));
  };

  const updateCompany = (
    id: string,
    field: "name" | "domain",
    value: string
  ) => {
    onChange(companies.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
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

      <div className="space-y-2">
        {companies.map((company) => (
          <div key={company.id} className="flex gap-2 items-center">
            <input
              type="text"
              value={company.name}
              onChange={(e) => updateCompany(company.id, "name", e.target.value)}
              placeholder="Company"
              disabled={disabled}
              className="flex-1 min-w-0 text-sm bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
            />
            <input
              type="text"
              value={company.domain}
              onChange={(e) =>
                updateCompany(company.id, "domain", e.target.value)
              }
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
        ))}
      </div>
    </div>
  );
}
