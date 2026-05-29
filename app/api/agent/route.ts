import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { logRoleToNotion } from "@/lib/notion";
import { buildScoringSystemPrompt, buildScoringUserPrompt } from "@/lib/scoring-prompts";
import {
  buildDraftingSystemPrompt,
  buildDraftingUserPrompt,
  buildEvaluatorSystemPrompt,
  buildEvaluatorUserPrompt,
  buildRewriteUserPrompt,
} from "@/lib/outreach-prompts";
import { TARGET_ROLES } from "@/lib/candidate-profile";
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

const EVAL_TOOL: Anthropic.Tool = {
  name: "evaluate_draft",
  description: "Evaluate whether a LinkedIn outreach draft is personalized or generic",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["pass", "fail"],
        description: "pass = personalized and effective; fail = generic or templated",
      },
      reason: {
        type: "string",
        description: "One sentence explaining the verdict",
      },
    },
    required: ["verdict", "reason"],
    additionalProperties: false,
  },
};

const DEFAULT_COMPANIES: Company[] = [
  { id: "1", name: "Salesforce", domain: "salesforce.com" },
  { id: "2", name: "Microsoft", domain: "microsoft.com" },
  { id: "3", name: "Adobe", domain: "adobe.com" },
  { id: "4", name: "Intuit", domain: "intuit.com" },
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

function isVagueJD(snippet: string): boolean {
  const hasKeywords = /responsibilities|requirements|qualifications|experience|skills/i.test(snippet);
  return snippet.length < 300 || !hasKeywords;
}

async function searchRolesForCompany(
  company: Company,
  emit: (e: AgentSSEEvent) => void
): Promise<RawRole[]> {
  const queries = [
    `${company.name} jobs product manager India OR remote 2026`,
    `${company.name} careers site:linkedin.com OR site:naukri.com`,
  ];

  const allRoles: RawRole[] = [];
  const seenTitles = new Set<string>();

  for (const query of queries) {
    emit({ type: "agent:search", company: company.name, query });

    // Step 1: Web search
    const searchResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: "You are a job search assistant. Search the web and describe every job posting you find. Include the job title, URL, and any description text available.",
      tools: [WEB_SEARCH_TOOL],
      messages: [{ role: "user", content: `Search for: ${query}` }],
    });

    // Capture ALL content blocks — text + any tool result blocks
    const rawParts = searchResponse.content.map((block) => {
      if (block.type === "text") return block.text;
      // Serialize non-text blocks so we can see their structure in the log
      return `[${block.type}] ${JSON.stringify(block).slice(0, 400)}`;
    });
    const rawText = rawParts.join("\n---\n");

    // Log the FULL raw content of every block — no truncation
    emit({
      type: "agent:debug",
      company: company.name,
      message: `RAW[${query}]: ${rawText || "(empty — no content blocks returned)"}`,
    });

    if (!rawText.trim()) continue;

    // Step 2: Separate extraction call — no tools, just parse the raw text into roles
    // Even a title alone is enough; url and snippet can be empty strings
    const extractResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: `Extract every job listing mentioned in the text below.
Return ONLY a JSON array. Partial data is fine — a title alone qualifies.
Format: [{"title":"...","url":"...","snippet":"..."}]
Use "" for any missing fields. Return [] if nothing is found.
Only extract roles posted in the last 90 days. Ignore any listing older than 3 months.`,
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

    const roles = extractJsonArray(extractText);
    for (const role of roles) {
      const key = role.title.toLowerCase().trim();
      if (key && !seenTitles.has(key)) {
        seenTitles.add(key);
        allRoles.push(role);
      }
    }

    // Skip remaining queries if we already have enough roles
    if (allRoles.length >= 5) break;
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
    model: "claude-sonnet-4-6",
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

async function generateDraft(
  roleTitle: string,
  company: string,
  jdText: string,
  score: RoleScore
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: buildDraftingSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildDraftingUserPrompt(roleTitle, company, jdText, score),
      },
    ],
  });

  const text = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  return text?.text.trim() ?? "";
}

async function evaluateDraft(
  draft: string
): Promise<{ verdict: "pass" | "fail"; reason: string }> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    system: buildEvaluatorSystemPrompt(),
    tools: [EVAL_TOOL],
    tool_choice: { type: "tool", name: "evaluate_draft" },
    messages: [{ role: "user", content: buildEvaluatorUserPrompt(draft) }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUse) return { verdict: "pass", reason: "Evaluation unavailable" };
  return toolUse.input as { verdict: "pass" | "fail"; reason: string };
}

async function rewriteDraft(
  originalDraft: string,
  failReason: string,
  roleTitle: string,
  company: string,
  jdText: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: buildDraftingSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildRewriteUserPrompt(
          originalDraft,
          failReason,
          roleTitle,
          company,
          jdText
        ),
      },
    ],
  });

  const text = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  return text?.text.trim() ?? originalDraft;
}

async function runForCompany(
  company: Company,
  emit: (e: AgentSSEEvent) => void
): Promise<QualifyingRole[]> {
  emit({ type: "agent:start", company: company.name });

  let rawRoles: RawRole[] = [];
  try {
    rawRoles = await searchRolesForCompany(company, emit);
  } catch (err) {
    console.error(`Search failed for ${company.name}:`, err);
  }

  emit({
    type: "agent:roles_found",
    company: company.name,
    count: rawRoles.length,
  });

  const qualifyingRoles: QualifyingRole[] = [];

  for (const role of rawRoles.slice(0, 6)) {
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

    emit({ type: "agent:drafting", company: company.name, role_title: role.title });

    let draft = await generateDraft(role.title, company.name, jdText, score);
    let evalTag: "passed" | "rewritten" = "passed";

    for (let i = 0; i < 2; i++) {
      emit({
        type: "agent:evaluating",
        company: company.name,
        role_title: role.title,
        iteration: i + 1,
      });

      const verdict = await evaluateDraft(draft);

      if (verdict.verdict === "pass") break;

      draft = await rewriteDraft(
        draft,
        verdict.reason,
        role.title,
        company.name,
        jdText
      );
      evalTag = "rewritten";
    }

    emit({
      type: "agent:eval_result",
      company: company.name,
      role_title: role.title,
      eval_tag: evalTag,
    });

    const locationMatch = jdText.match(
      /(?:location|based in|office|remote|hybrid)[:\s]+([A-Za-z ,\-]+?)(?:\n|,|\.|;|$)/i
    );
    const location = locationMatch?.[1]?.trim() ?? "See job posting";

    const qualifyingRole: QualifyingRole = {
      company: company.name,
      role_title: role.title,
      role_url: role.url ?? "#",
      location,
      score,
      outreach_draft: draft,
      eval_tag: evalTag,
    };

    try {
      const notionUrl = await logRoleToNotion(qualifyingRole);
      qualifyingRole.notion_url = notionUrl;
      emit({
        type: "agent:notion_log",
        company: company.name,
        role_title: role.title,
        notion_url: notionUrl,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "agent:debug", company: company.name, message: `NOTION ERROR: ${msg}` });
    }

    qualifyingRoles.push(qualifyingRole);
  }

  emit({ type: "agent:done", company: company.name });
  return qualifyingRoles;
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const companiesParam = url.searchParams.get("companies");

  let companies: Company[];
  try {
    const parsed = companiesParam ? JSON.parse(companiesParam) : null;
    companies =
      Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_COMPANIES;
  } catch {
    companies = DEFAULT_COMPANIES;
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
      const results = await Promise.all(companies.map((c) => runForCompany(c, emit)));
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
