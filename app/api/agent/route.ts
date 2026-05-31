import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildScoringSystemPrompt, buildScoringUserPrompt } from "@/lib/scoring-prompts";
import { fetchAndParseUrl } from "@/lib/fetch-url";
import type { QualifyingRole, RawRole, RoleScore, AgentSSEEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

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

async function scoreRole(
  role: RawRole,
  jdText: string,
  companyContext: string
): Promise<RoleScore> {
  const response = await getClient().messages.create({
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

async function processManualUrl(
  rawUrl: string,
  emit: (e: AgentSSEEvent) => void
): Promise<QualifyingRole[]> {
  console.log(`[processManualUrl] START url=${rawUrl}`);

  // Fetch and parse the job page
  let parsed: Awaited<ReturnType<typeof fetchAndParseUrl>>;
  try {
    parsed = await fetchAndParseUrl(rawUrl);
    console.log(`[processManualUrl] PARSED title="${parsed.title}" company="${parsed.company}" location="${parsed.location}" jd_summary_len=${parsed.jd_summary.length}`);
  } catch (err) {
    console.error(`[processManualUrl] FETCH/PARSE ERROR url=${rawUrl}`, err);
    return [];
  }

  emit({ type: "agent:scoring", company: parsed.company, role_title: parsed.title });

  let score: RoleScore;
  try {
    score = await scoreRole(
      { title: parsed.title, url: rawUrl, snippet: parsed.jd_summary },
      parsed.jd_summary,
      ""
    );
    console.log(`[processManualUrl] SCORE skills=${score.skills_match} seniority=${score.seniority_fit} context=${score.context_overlap} overall=${score.overall}`);
  } catch (err) {
    console.error(`[processManualUrl] SCORE ERROR title="${parsed.title}"`, err);
    return [];
  }

  const skipped = score.overall < 5;
  console.log(`[processManualUrl] RESULT overall=${score.overall} skipped=${skipped}`);

  emit({
    type: "agent:score_result",
    company: parsed.company,
    role_title: parsed.title,
    score,
    skipped,
  });

  if (skipped) return [];

  return [
    {
      company: parsed.company,
      role_title: parsed.title,
      role_url: rawUrl,
      location: parsed.location,
      score,
      jd_summary: parsed.jd_summary,
      isDirectUrl: true,
    },
  ];
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const manualUrlsParam = url.searchParams.get("manualUrls");

  console.log(`[GET /api/agent] manualUrlsParam raw="${manualUrlsParam}"`);

  let manualUrls: string[];
  try {
    const parsed = manualUrlsParam ? JSON.parse(manualUrlsParam) : null;
    manualUrls = Array.isArray(parsed)
      ? parsed.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : [];
  } catch (err) {
    console.error(`[GET /api/agent] Failed to parse manualUrls`, err);
    manualUrls = [];
  }

  console.log(`[GET /api/agent] manualUrls parsed count=${manualUrls.length}`, manualUrls);

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
      if (manualUrls.length === 0) {
        console.log(`[GET /api/agent] No URLs — emitting run:error`);
        emit({ type: "run:error", message: "No URLs provided. Paste at least one job URL." });
        return;
      }

      console.log(`[GET /api/agent] Processing ${manualUrls.length} URL(s) in parallel`);
      const results = await Promise.all(
        manualUrls.map((u) => processManualUrl(u, emit))
      );
      const allRoles = results.flat();
      console.log(`[GET /api/agent] run:complete qualifying_roles=${allRoles.length}`);
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
