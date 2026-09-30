import type { NormalizedJob } from "./types";

const FETCH_TIMEOUT_MS = 8_000;

async function timedFetch(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  first_published?: string;
  updated_at?: string;
}

export async function fetchGreenhouseJobs(slug: string): Promise<NormalizedJob[] | null> {
  const res = await timedFetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  if (!res) return null;

  let data: { jobs?: GreenhouseJob[] };
  try {
    data = await res.json();
  } catch {
    return null;
  }

  if (!Array.isArray(data.jobs) || data.jobs.length === 0) return null;

  return data.jobs.map((job) => {
    const postedAt = job.first_published ?? job.updated_at ?? null;
    return {
      id: `greenhouse:${job.id}`,
      company: "",
      title: job.title,
      location: job.location?.name ?? "",
      postedAt,
      dateVerified: postedAt !== null,
      url: job.absolute_url,
      jdText: stripHtml(job.content ?? ""),
      source: "greenhouse" as const,
    };
  });
}

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  publishedAt?: string;
  jobUrl: string;
  descriptionHtml?: string;
  isListed: boolean;
}

export async function fetchAshbyJobs(slug: string): Promise<NormalizedJob[] | null> {
  const res = await timedFetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!res) return null;

  let data: { jobs?: AshbyJob[] };
  try {
    data = await res.json();
  } catch {
    return null;
  }

  if (!Array.isArray(data.jobs)) return null;
  const listed = data.jobs.filter((job) => job.isListed);
  if (listed.length === 0) return null;

  return listed.map((job) => ({
    id: `ashby:${job.id}`,
    company: "",
    title: job.title,
    location: job.location ?? "",
    postedAt: job.publishedAt ?? null,
    dateVerified: true,
    url: job.jobUrl,
    jdText: stripHtml(job.descriptionHtml ?? ""),
    source: "ashby" as const,
  }));
}

interface LeverJob {
  id: string;
  text: string;
  createdAt: number;
  hostedUrl: string;
  categories?: { location?: string };
  descriptionPlain?: string;
}

export async function fetchLeverJobs(slug: string): Promise<NormalizedJob[] | null> {
  const res = await timedFetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res) return null;

  let data: LeverJob[];
  try {
    data = await res.json();
  } catch {
    return null;
  }

  if (!Array.isArray(data) || data.length === 0) return null;

  return data.map((job) => ({
    id: `lever:${job.id}`,
    company: "",
    title: job.text,
    location: job.categories?.location ?? "",
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    dateVerified: Boolean(job.createdAt),
    url: job.hostedUrl,
    jdText: job.descriptionPlain ?? "",
    source: "lever" as const,
  }));
}
