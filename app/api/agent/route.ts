import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildScoringSystemPrompt, buildScoringUserPrompt } from "@/lib/scoring-prompts";
import { fetchGreenhouseJobs, fetchLeverJobs, fetchAshbyJobs } from "@/lib/ats-clients";
import { discoverFirecrawlJobs } from "@/lib/firecrawl-client";
import { filterByFreshness, filterByLocation, filterSeen, triageTitles, keywordRelevanceScore } from "@/lib/job-filters";
import type {
  Company,
  QualifyingRole,
  NormalizedJob,
  RoleScore,
  AgentSSEEvent,
  FunnelStats,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const COMPANY_TIMEOUT_MS = 45_000;
const TOP_N_TO_SCORE = 5;

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const SCORE_TOOL: Anthropic.Tool = {
  name: "score_role",
  description: "Score the job fit between a role and the candidate profile",
  input_schema: {
    type: "object",
    properties: {
      skills_match: {
        type: "number",
        description: "1-10: How well do the candidate's skills match the role requirements?",
      },
      seniority_fit: {
        type: "number",
        description: "1-10: Is the candidate's seniority level appropriate for the role?",
      },
      context_overlap: {
        type: "number",
        description: "1-10: How well does the candidate's domain/industry experience align?",
      },
      overall: {
        type: "number",
        description: "1-10: Overall holistic fit score (not just average — weight context and skills most)",
      },
      rationale: {
        type: "string",
        description: "2-3 sentences explaining the fit assessment",
      },
    },
    required: ["skills_match", "seniority_fit", "context_overlap", "overall", "rationale"],
    additionalProperties: false,
  },
};

const DEFAULT_COMPANIES: Company[] = [
  { id: "1", name: "Salesforce", domain: "salesforce.com", source: { type: "firecrawl", careersUrl: "" } },
  { id: "2", name: "Microsoft", domain: "microsoft.com", source: { type: "firecrawl", careersUrl: "" } },
  { id: "3", name: "Adobe", domain: "adobe.com", source: { type: "firecrawl", careersUrl: "" } },
  { id: "4", name: "Intuit", domain: "intuit.com", source: { type: "firecrawl", careersUrl: "" } },
];

const DEFAULT_KEYWORDS = [
  "Product Manager",
  "GTM Manager",
  "Pre-Sales",
  "Partnerships Manager",
  "Growth Manager",
];

interface UsageTotal {
  input: number;
  output: number;
}

async function scoreRole(
  job: NormalizedJob,
  profile: string,
  usage: UsageTotal
): Promise<RoleScore> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: buildScoringSystemPrompt(profile),
    tools: [SCORE_TOOL],
    tool_choice: { type: "tool", name: "score_role" },
    messages: [
      {
        role: "user",
        content: buildScoringUserPrompt(job.title, job.jdText, ""),
      },
    ],
  });

  usage.input += response.usage.input_tokens;
  usage.output += response.usage.output_tokens;

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUse) throw new Error("Scoring returned no tool use block");
  return toolUse.input as RoleScore;
}

async function fetchJobsForCompany(
  company: Company,
  keywords: string[],
  emit: (e: AgentSSEEvent) => void
): Promise<{ jobs: NormalizedJob[]; firecrawlCredits: number; haikuUsage: UsageTotal }> {
  const { type } = company.source;
  const haikuUsage: UsageTotal = { input: 0, output: 0 };

  if (type === "firecrawl") {
    const result = await discoverFirecrawlJobs(company, keywords, emit);
    haikuUsage.input += result.haikuUsage.input;
    haikuUsage.output += result.haikuUsage.output;
    return {
      jobs: result.jobs,
      firecrawlCredits: result.mapOrSearchCredits + result.scrapesUsed,
      haikuUsage,
    };
  }

  const slug = company.source.slug?.trim();
  if (!slug) {
    emit({
      type: "agent:debug",
      company: company.name,
      message: `Source type "${type}" configured with no slug — skipping fetch. Use "Detect source" or set a slug manually.`,
    });
    return { jobs: [], firecrawlCredits: 0, haikuUsage };
  }

  emit({ type: "agent:fetching", company: company.name, source: type, detail: `${type}:${slug}` });

  const fetcher = type === "greenhouse" ? fetchGreenhouseJobs : type === "lever" ? fetchLeverJobs : fetchAshbyJobs;
  const jobs = await fetcher(slug);

  if (jobs === null) {
    emit({
      type: "agent:debug",
      company: company.name,
      message: `${type} returned no jobs for slug "${slug}" — check the slug or try "Detect source" again.`,
    });
    return { jobs: [], firecrawlCredits: 0, haikuUsage };
  }

  const withCompanyName = jobs.map((job) => ({ ...job, company: company.name }));
  return { jobs: withCompanyName, firecrawlCredits: 0, haikuUsage };
}

async function runForCompany(
  company: Company,
  keywords: string[],
  profile: string,
  seenIds: Set<string>,
  emit: (e: AgentSSEEvent) => void
): Promise<{ roles: QualifyingRole[]; funnel: FunnelStats; firecrawlCredits: number; haikuUsage: UsageTotal; scoredJobIds: string[] }> {
  emit({ type: "agent:start", company: company.name });

  const haikuUsage: UsageTotal = { input: 0, output: 0 };
  const scoredJobIds: string[] = [];

  const { jobs: fetched, firecrawlCredits, haikuUsage: fetchUsage } = await fetchJobsForCompany(company, keywords, emit);
  haikuUsage.input += fetchUsage.input;
  haikuUsage.output += fetchUsage.output;

  emit({ type: "agent:fetched", company: company.name, count: fetched.length });

  const afterDate = filterByFreshness(fetched);
  emit({ type: "agent:filter_progress", company: company.name, stage: "date", before: fetched.length, after: afterDate.length });

  const afterLocation = filterByLocation(afterDate, profile);
  emit({ type: "agent:filter_progress", company: company.name, stage: "location", before: afterDate.length, after: afterLocation.length });

  const afterSeen = filterSeen(afterLocation, seenIds);
  emit({ type: "agent:filter_progress", company: company.name, stage: "seen", before: afterLocation.length, after: afterSeen.length });

  const afterTriage = await triageTitles(afterSeen, keywords, profile, emit, haikuUsage);
  emit({ type: "agent:filter_progress", company: company.name, stage: "triage", before: afterSeen.length, after: afterTriage.length });

  const sorted = [...afterTriage].sort(
    (a, b) => keywordRelevanceScore(b.title, keywords) - keywordRelevanceScore(a.title, keywords)
  );
  const toScore = sorted.slice(0, TOP_N_TO_SCORE);

  const qualifyingRoles: QualifyingRole[] = [];
  let scoredCount = 0;

  for (const job of toScore) {
    emit({ type: "agent:scoring", company: company.name, role_title: job.title });

    let score: RoleScore;
    try {
      score = await scoreRole(job, profile, haikuUsage);
    } catch (err) {
      console.error(`Scoring failed for ${job.title}:`, err);
      continue;
    }

    scoredCount += 1;
    scoredJobIds.push(job.id);

    const skipped = score.overall < 5;
    emit({
      type: "agent:score_result",
      company: company.name,
      role_title: job.title,
      score,
      skipped,
    });

    if (skipped) continue;

    qualifyingRoles.push({
      company: company.name,
      role_title: job.title,
      role_url: job.url,
      location: job.location || "See job posting",
      score,
      jd_summary: job.jdText,
      postedAt: job.postedAt,
      dateVerified: job.dateVerified,
      source: job.source,
    });
  }

  const funnel: FunnelStats = {
    fetched: fetched.length,
    afterDate: afterDate.length,
    afterLocation: afterLocation.length,
    afterSeen: afterSeen.length,
    afterTriage: afterTriage.length,
    scored: scoredCount,
    shown: qualifyingRoles.length,
  };

  emit({ type: "agent:company_stats", company: company.name, source: company.source.type, funnel });
  emit({ type: "agent:done", company: company.name });

  return { roles: qualifyingRoles, funnel, firecrawlCredits, haikuUsage, scoredJobIds };
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

function emptyFunnel(): FunnelStats {
  return { fetched: 0, afterDate: 0, afterLocation: 0, afterSeen: 0, afterTriage: 0, scored: 0, shown: 0 };
}

function sumFunnels(a: FunnelStats, b: FunnelStats): FunnelStats {
  return {
    fetched: a.fetched + b.fetched,
    afterDate: a.afterDate + b.afterDate,
    afterLocation: a.afterLocation + b.afterLocation,
    afterSeen: a.afterSeen + b.afterSeen,
    afterTriage: a.afterTriage + b.afterTriage,
    scored: a.scored + b.scored,
    shown: a.shown + b.shown,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: { companies?: unknown; keywords?: unknown; profile?: unknown; seenJobIds?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const companies: Company[] =
    Array.isArray(body.companies) && body.companies.length > 0 ? (body.companies as Company[]) : DEFAULT_COMPANIES;

  const keywords: string[] =
    Array.isArray(body.keywords) && body.keywords.length > 0 ? (body.keywords as string[]) : DEFAULT_KEYWORDS;

  const profile = typeof body.profile === "string" ? body.profile : "";

  const seenIds = new Set<string>(Array.isArray(body.seenJobIds) ? (body.seenJobIds as string[]) : []);

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const emit = (event: AgentSSEEvent) => {
    try {
      writer.write(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // writer already closed
    }
  };

  void (async () => {
    const heartbeat = setInterval(() => {
      try {
        writer.write(enc.encode(": ping\n\n"));
      } catch {
        clearInterval(heartbeat);
      }
    }, 20_000);

    try {
      const results = await Promise.all(
        companies.map(async (company) => {
          try {
            return await Promise.race([
              runForCompany(company, keywords, profile, seenIds, emit),
              timeout(COMPANY_TIMEOUT_MS),
            ]);
          } catch {
            emit({ type: "agent:company_timeout", company: company.name, message: `${company.name} timed out after ${COMPANY_TIMEOUT_MS / 1000}s` });
            return { roles: [] as QualifyingRole[], funnel: emptyFunnel(), firecrawlCredits: 0, haikuUsage: { input: 0, output: 0 }, scoredJobIds: [] as string[] };
          }
        })
      );

      const allRoles = results.flatMap((r) => r.roles);
      const totalFunnel = results.reduce((acc, r) => sumFunnels(acc, r.funnel), emptyFunnel());
      const estimatedFirecrawlCredits = results.reduce((acc, r) => acc + r.firecrawlCredits, 0);
      const haikuTokens = results.reduce(
        (acc, r) => ({ input: acc.input + r.haikuUsage.input, output: acc.output + r.haikuUsage.output }),
        { input: 0, output: 0 }
      );
      const scoredJobIds = results.flatMap((r) => r.scoredJobIds);

      emit({ type: "run:stats", totalFunnel, estimatedFirecrawlCredits, haikuTokens, scored_job_ids: scoredJobIds });
      emit({ type: "run:complete", qualifying_roles: allRoles });
    } catch (err) {
      emit({ type: "run:error", message: String(err) });
    } finally {
      clearInterval(heartbeat);
      try {
        await writer.close();
      } catch {
        // already closed
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
