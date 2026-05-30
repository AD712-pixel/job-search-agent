import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildScoringSystemPrompt, buildScoringUserPrompt } from "@/lib/scoring-prompts";
import type { Company, QualifyingRole, RawRole, RoleScore, AgentSSEEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    "anthropic-beta": "web-search-2025-03-05",
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WEB_SEARCH_TOOL: any = { type: "web_search_20250305", name: "web_search" };

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
  { id: "1", name: "Salesforce", domain: "salesforce.com" },
  { id: "2", name: "Microsoft", domain: "microsoft.com" },
  { id: "3", name: "Adobe", domain: "adobe.com" },
  { id: "4", name: "Intuit", domain: "intuit.com" },
];

const DEFAULT_KEYWORDS = [
  "Product Manager",
  "GTM Manager",
  "Pre-Sales",
  "Partnerships Manager",
  "Growth Manager",
];

function extractJsonArray(text: string): RawRole[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


const AGGREGATOR_TERMS = [
  "jobs page", "job listings", "careers page",
  "united states", "nationwide", "worldwide",
  "company page", "all levels",
];

function isAggregatorTitle(lowerTitle: string): boolean {
  return AGGREGATOR_TERMS.some((term) => lowerTitle.includes(term));
}

function isVagueJD(snippet: string): boolean {
  const hasKeywords = /responsibilities|requirements|qualifications|experience|skills/i.test(snippet);
  return snippet.length < 300 || !hasKeywords;
}

function keywordRelevanceScore(title: string, keywords: string[]): number {
  const lower = title.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
}

async function runSearchQuery(query: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Search for: ${query}` },
  ];
  const textParts: string[] = [];
  let webSearchCount = 0;

  for (;;) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "You are a job search assistant. Summarise search results briefly. Extract only: title, url, location, 2-sentence summary. Stop after finding 5 relevant roles. Do not reproduce full job descriptions.",
      tools: [WEB_SEARCH_TOOL],
      messages,
    });

    for (const block of response.content) {
      if (block.type === "text") textParts.push(block.text);
      else textParts.push(`[${block.type}] ${JSON.stringify(block).slice(0, 400)}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && (b as any).name === "web_search"
    );
    webSearchCount += searchUses.length;

    if (response.stop_reason !== "tool_use" || webSearchCount >= 2) break;

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: searchUses.map((tu) => ({
        type: "tool_result" as const,
        tool_use_id: tu.id,
        content: "",
      })),
    });
  }

  return textParts.join("\n---\n");
}

async function searchRolesForCompany(
  company: Company,
  keywords: string[],
  emit: (e: AgentSSEEvent) => void
): Promise<RawRole[]> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const dateFilter = ninetyDaysAgo.toISOString().split("T")[0];
  const query = `site:${company.domain} ${keywords.join(" OR ")} India OR remote after:${dateFilter}`;
  emit({ type: "agent:search", company: company.name, query });

  const rawText = await runSearchQuery(query);

  emit({
    type: "agent:debug",
    company: company.name,
    message: `RAW: ${rawText || "(empty — no content blocks returned)"}`,
  });

  if (!rawText.trim()) {
    emit({
      type: "agent:debug",
      company: company.name,
      message: "Search returned no content — company may be blocking scrapers",
    });
    return [];
  }

  let roles: RawRole[] = [];
  try {
    const extractResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      system: `Extract EVERY job listing mentioned in the text. Do not skip any.
Return ONLY a JSON array — no prose, no explanation.
Format: [{"title":"...","url":"...","snippet":"..."}]
Use "" for any missing fields. Return [] only if no job listings exist at all.
Include all roles found, even if you are unsure about the posting date.`,
      messages: [
        {
          role: "user",
          content: `Extract all job listings from this text:\n\n${rawText.slice(0, 4000)}`,
        },
      ],
    });

    const extractText = extractResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    roles = extractJsonArray(extractText);
  } catch (err) {
    emit({
      type: "agent:debug",
      company: company.name,
      message: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const allRoles: RawRole[] = [];
  const seenTitles = new Set<string>();
  for (const role of roles) {
    const key = role.title.toLowerCase().trim();
    if (!key || seenTitles.has(key)) continue;
    if (isAggregatorTitle(key)) continue;
    seenTitles.add(key);
    allRoles.push(role);
  }

  if (allRoles.length === 0) {
    emit({
      type: "agent:debug",
      company: company.name,
      message: "0 roles extracted — no matching roles found in search results",
    });
  }

  return allRoles;
}

async function enrichJD(company: Company, role: RawRole): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "You are a job research assistant. Search for detailed job description information. Return a thorough summary of the role's responsibilities, requirements, and team context.",
    tools: [WEB_SEARCH_TOOL],
    messages: [
      {
        role: "user",
        content: `Find the full job description for "${role.title}" at ${company.name} (${company.domain}).
Search specifically for responsibilities, requirements, and what the team works on.
Return a detailed summary (not JSON — just descriptive text).`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text || role.snippet;
}

async function scoreRole(
  role: RawRole,
  jdText: string,
  companyContext: string
): Promise<RoleScore> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: buildScoringSystemPrompt(),
    tools: [SCORE_TOOL],
    tool_choice: { type: "tool", name: "score_role" },
    messages: [
      {
        role: "user",
        content: buildScoringUserPrompt(role.title, jdText, companyContext),
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUse) throw new Error("Scoring returned no tool use block");
  return toolUse.input as RoleScore;
}

async function runForCompany(
  company: Company,
  keywords: string[],
  emit: (e: AgentSSEEvent) => void
): Promise<QualifyingRole[]> {
  emit({ type: "agent:start", company: company.name });

  let rawRoles: RawRole[] = [];
  try {
    rawRoles = await searchRolesForCompany(company, keywords, emit);
  } catch (err) {
    console.error(`Search failed for ${company.name}:`, err);
  }

  emit({
    type: "agent:roles_found",
    company: company.name,
    count: rawRoles.length,
  });

  // Sort by keyword relevance (stable sort preserves insertion order for ties)
  const sorted = [...rawRoles].sort(
    (a, b) => keywordRelevanceScore(b.title, keywords) - keywordRelevanceScore(a.title, keywords)
  );

  if (rawRoles.length > 5) {
    emit({ type: "agent:roles_capped", company: company.name, total: rawRoles.length, scoring: 5 });
  }

  const rolesToScore = sorted.slice(0, 5);
  const qualifyingRoles: QualifyingRole[] = [];

  for (const role of rolesToScore) {
    let jdText = role.snippet;

    if (isVagueJD(role.snippet)) {
      emit({ type: "agent:enriching", company: company.name, role_title: role.title });
      try {
        jdText = await enrichJD(company, role);
      } catch {
        // fall through with original snippet
      }
    }

    emit({ type: "agent:scoring", company: company.name, role_title: role.title });

    let score: RoleScore;
    try {
      score = await scoreRole(role, jdText, "");
    } catch (err) {
      console.error(`Scoring failed for ${role.title}:`, err);
      continue;
    }

    const skipped = score.overall < 5;
    emit({
      type: "agent:score_result",
      company: company.name,
      role_title: role.title,
      score,
      skipped,
    });

    if (skipped) continue;

    const locationMatch = jdText.match(
      /(?:location|based in|office|remote|hybrid)[:\s]+([A-Za-z ,\-]+?)(?:\n|,|\.|;|$)/i
    );
    const location = locationMatch?.[1]?.trim() ?? "See job posting";

    qualifyingRoles.push({
      company: company.name,
      role_title: role.title,
      role_url: role.url ?? "#",
      location,
      score,
      jd_summary: jdText,
    });
  }

  emit({ type: "agent:done", company: company.name });
  return qualifyingRoles;
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const companiesParam = url.searchParams.get("companies");
  const keywordsParam = url.searchParams.get("keywords");

  let companies: Company[];
  try {
    const parsed = companiesParam ? JSON.parse(companiesParam) : null;
    companies =
      Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_COMPANIES;
  } catch {
    companies = DEFAULT_COMPANIES;
  }

  let keywords: string[];
  try {
    const parsed = keywordsParam ? JSON.parse(keywordsParam) : null;
    keywords =
      Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_KEYWORDS;
  } catch {
    keywords = DEFAULT_KEYWORDS;
  }

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
        companies.map((c) => runForCompany(c, keywords, emit))
      );
      const allRoles = results.flat();
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
