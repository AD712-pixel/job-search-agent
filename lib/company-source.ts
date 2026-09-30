import { fetchAshbyJobs, fetchGreenhouseJobs, fetchLeverJobs } from "./ats-clients";
import type { Company, CompanySource, SourceType } from "./types";

const NAME_SUFFIXES = ["inc", "llc", "ltd", "corp", "corporation", "co", "company", "group", "holdings"];

function slugify(text: string, separator: "" | "-"): string {
  const cleaned = text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => !NAME_SUFFIXES.includes(word.replace(/\.$/, "")))
    .join(separator)
    .replace(/[^a-z0-9-]/g, "");
  return cleaned;
}

export function guessSlugCandidates(name: string, domain: string): string[] {
  const domainLabel = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(".")[0]
    .toLowerCase();

  const nameNoSep = slugify(name, "");
  const nameHyphenated = slugify(name, "-");

  return Array.from(new Set([domainLabel, nameNoSep, nameHyphenated].filter(Boolean)));
}

async function probe(
  type: SourceType,
  fetcher: (slug: string) => Promise<unknown[] | null>,
  candidates: string[]
): Promise<string | null> {
  const results = await Promise.all(
    candidates.map(async (slug) => ({ slug, jobs: await fetcher(slug) }))
  );
  const hit = results.find((r) => r.jobs && r.jobs.length > 0);
  return hit ? hit.slug : null;
}

export async function detectCompanySource(name: string, domain: string): Promise<CompanySource> {
  const candidates = guessSlugCandidates(name, domain);

  const greenhouseSlug = await probe("greenhouse", fetchGreenhouseJobs, candidates);
  if (greenhouseSlug) return { type: "greenhouse", slug: greenhouseSlug };

  const leverSlug = await probe("lever", fetchLeverJobs, candidates);
  if (leverSlug) return { type: "lever", slug: leverSlug };

  const ashbySlug = await probe("ashby", fetchAshbyJobs, candidates);
  if (ashbySlug) return { type: "ashby", slug: ashbySlug };

  return { type: "firecrawl", careersUrl: "" };
}

export function migrateCompany(raw: unknown): Company {
  const r = raw as Partial<Company> & { id?: string; name?: string; domain?: string };
  const source: CompanySource =
    r.source && r.source.type ? r.source : { type: "firecrawl", careersUrl: "" };

  return {
    id: r.id ?? crypto.randomUUID(),
    name: r.name ?? "",
    domain: r.domain ?? "",
    source,
  };
}

export function migrateCompanies(raw: unknown): Company[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(migrateCompany);
}
