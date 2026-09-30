import Anthropic from "@anthropic-ai/sdk";
import {
  buildFirecrawlExtractionSystemPrompt,
  buildFirecrawlExtractionUserPrompt,
} from "./triage-prompts";
import type { AgentSSEEvent, Company, NormalizedJob } from "./types";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const MAX_SCRAPES_PER_COMPANY = 10;

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function firecrawlHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
    "Content-Type": "application/json",
  };
}

interface MapResponse {
  success: boolean;
  links?: { url: string; title?: string }[];
}

async function firecrawlMap(url: string, search: string): Promise<string[]> {
  const res = await fetch(`${FIRECRAWL_BASE}/map`, {
    method: "POST",
    headers: firecrawlHeaders(),
    body: JSON.stringify({ url, search, limit: 100 }),
  });
  if (!res.ok) return [];
  const data: MapResponse = await res.json();
  return data.links?.map((l) => l.url) ?? [];
}

interface SearchResponse {
  success: boolean;
  data?: { web?: { url: string }[] };
}

async function firecrawlSearch(query: string): Promise<{ urls: string[]; resultCount: number }> {
  const res = await fetch(`${FIRECRAWL_BASE}/search`, {
    method: "POST",
    headers: firecrawlHeaders(),
    body: JSON.stringify({ query, limit: 20, tbs: "qdr:w" }),
  });
  if (!res.ok) return { urls: [], resultCount: 0 };
  const data: SearchResponse = await res.json();
  const results = data.data?.web ?? [];
  return { urls: results.map((r) => r.url), resultCount: results.length };
}

interface ScrapeResponse {
  success: boolean;
  data?: { markdown?: string };
}

async function firecrawlScrape(url: string): Promise<string | null> {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: firecrawlHeaders(),
    body: JSON.stringify({ url, formats: [{ type: "markdown" }] }),
  });
  if (!res.ok) return null;
  const data: ScrapeResponse = await res.json();
  return data.data?.markdown ?? null;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

interface ExtractedJob {
  title: string;
  location: string;
  postedAt: string | null;
  jdSummary: string;
}

async function extractFromMarkdown(markdown: string, usage: { input: number; output: number }): Promise<ExtractedJob | null> {
  const response = await getAnthropicClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: buildFirecrawlExtractionSystemPrompt(),
    messages: [{ role: "user", content: buildFirecrawlExtractionUserPrompt(markdown.slice(0, 8000)) }],
  });

  usage.input += response.usage.input_tokens;
  usage.output += response.usage.output_tokens;

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed.title) return null;
    return {
      title: parsed.title,
      location: parsed.location ?? "",
      postedAt: parsed.postedAt ?? null,
      jdSummary: parsed.jdSummary ?? "",
    };
  } catch {
    return null;
  }
}

export interface FirecrawlDiscoveryResult {
  jobs: NormalizedJob[];
  scrapesUsed: number;
  mapOrSearchCredits: number;
  haikuUsage: { input: number; output: number };
}

export async function discoverFirecrawlJobs(
  company: Company,
  keywords: string[],
  emit: (e: AgentSSEEvent) => void
): Promise<FirecrawlDiscoveryResult> {
  const haikuUsage = { input: 0, output: 0 };
  const searchTerm = keywords.join(" OR ");
  let candidateUrls: string[] = [];
  let mapOrSearchCredits = 0;

  const careersUrl = company.source.careersUrl?.trim();
  if (careersUrl) {
    emit({ type: "agent:fetching", company: company.name, source: "firecrawl", detail: `Mapping ${careersUrl}` });
    candidateUrls = await firecrawlMap(careersUrl, searchTerm);
    mapOrSearchCredits += 1;
  } else {
    const query = `${company.domain} ${searchTerm} India OR remote`;
    emit({ type: "agent:fetching", company: company.name, source: "firecrawl", detail: `Searching: ${query}` });
    const { urls, resultCount } = await firecrawlSearch(query);
    candidateUrls = urls;
    mapOrSearchCredits += Math.ceil(resultCount / 10) * 2;
  }

  const deduped = Array.from(new Set(candidateUrls.map(normalizeUrl)));
  const toScrape = deduped.slice(0, MAX_SCRAPES_PER_COMPANY);
  if (deduped.length > MAX_SCRAPES_PER_COMPANY) {
    emit({
      type: "agent:debug",
      company: company.name,
      message: `Firecrawl scrape cap (${MAX_SCRAPES_PER_COMPANY}) reached for ${company.name} — ${deduped.length - MAX_SCRAPES_PER_COMPANY} candidate URLs not scraped`,
    });
  }

  const scraped = await Promise.all(
    toScrape.map(async (url) => {
      const markdown = await firecrawlScrape(url);
      if (!markdown) return null;
      const extracted = await extractFromMarkdown(markdown, haikuUsage);
      if (!extracted) return null;
      return { url, extracted };
    })
  );

  const jobs: NormalizedJob[] = scraped
    .filter((r): r is { url: string; extracted: ExtractedJob } => r !== null)
    .map(({ url, extracted }) => ({
      id: `firecrawl:${normalizeUrl(url)}`,
      company: company.name,
      title: extracted.title,
      location: extracted.location,
      postedAt: extracted.postedAt,
      dateVerified: extracted.postedAt !== null,
      url,
      jdText: extracted.jdSummary,
      source: "firecrawl" as const,
    }));

  return { jobs, scrapesUsed: toScrape.length, mapOrSearchCredits, haikuUsage };
}
