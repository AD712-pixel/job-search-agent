import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { EVAL_TOOL } from "@/lib/eval-tool";
import {
  buildPersonaDraftSystemPrompt,
  buildPersonaDraftUserPrompt,
  buildPersonaEvaluatorSystemPrompt,
  buildEvaluatorUserPrompt,
  buildPersonaRewriteUserPrompt,
} from "@/lib/outreach-prompts";
import type { RoleScore } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Persona = "cold" | "warm" | "hot";
type EvalTag = "passed" | "rewritten 1×" | "rewritten 2×";

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

interface DraftRequest {
  role: string;
  company: string;
  jd_summary: string;
  score: RoleScore;
  persona: Persona;
  context: string;
  profile: string;
}

async function generateDraft(
  role: string,
  company: string,
  jdSummary: string,
  score: RoleScore,
  persona: Persona,
  context: string,
  profile: string
): Promise<string> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    system: buildPersonaDraftSystemPrompt(persona, profile),
    messages: [
      {
        role: "user",
        content: buildPersonaDraftUserPrompt(role, company, jdSummary, score, persona, context),
      },
    ],
  });

  const text = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  return text?.text.trim() ?? "";
}

async function evaluateDraft(
  draft: string,
  persona: Persona
): Promise<{ verdict: "pass" | "fail"; reason: string }> {
  // Hard character count check — do not rely on LLM to count accurately
  if (persona === "cold" && draft.length > 300) {
    return {
      verdict: "fail",
      reason: `Draft is ${draft.length} characters — must be under 300. Rewrite in under 300 characters. Keep only the hook and the closing question.`,
    };
  }

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: buildPersonaEvaluatorSystemPrompt(persona),
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
  draft: string,
  reason: string,
  role: string,
  company: string,
  jdSummary: string,
  persona: Persona,
  context: string,
  profile: string
): Promise<string> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    system: buildPersonaDraftSystemPrompt(persona, profile),
    messages: [
      {
        role: "user",
        content: buildPersonaRewriteUserPrompt(draft, reason, role, company, jdSummary, persona, context),
      },
    ],
  });

  const text = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  return text?.text.trim() ?? draft;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: DraftRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { role, company, jd_summary, score, persona, context, profile } = body;

  if (!role || !company || !persona) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const jdSummary = jd_summary ?? "";
  const ctx = context ?? "";
  const profileStr = profile ?? "";

  // Warm persona requires a real prior connection — don't draft without context
  if (persona === "warm" && !ctx.trim()) {
    return NextResponse.json({
      draft: "Please provide how you know this person. Warm outreach requires a real prior connection.",
      eval_tag: "skipped",
    });
  }

  let draft = await generateDraft(role, company, jdSummary, score, persona, ctx, profileStr);
  const originalDraft = draft;
  let evalTag: EvalTag = "passed";

  // Iteration 1 — always pass originalDraft to rewrite, not previous rewrite
  const eval1 = await evaluateDraft(draft, persona);
  if (eval1.verdict === "fail") {
    draft = await rewriteDraft(originalDraft, eval1.reason, role, company, jdSummary, persona, ctx, profileStr);
    evalTag = "rewritten 1×";

    // Iteration 2 — pass originalDraft + latest critique only
    const eval2 = await evaluateDraft(draft, persona);
    if (eval2.verdict === "fail") {
      draft = await rewriteDraft(originalDraft, eval2.reason, role, company, jdSummary, persona, ctx, profileStr);
      evalTag = "rewritten 2×";
    }
  }

  return NextResponse.json({ draft, eval_tag: evalTag });
}
