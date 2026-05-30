import { CANDIDATE_PROFILE } from "./candidate-profile";
import type { RoleScore } from "./types";

type Persona = "cold" | "warm" | "hot";

function truncateToWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}

const PROFILE_100W = truncateToWords(CANDIDATE_PROFILE, 100);

export function buildPersonaDraftSystemPrompt(persona: Persona): string {
  const base = `Candidate Profile:\n${PROFILE_100W}`;

  if (persona === "cold") {
    return `You are helping Amey Divekar write a cold LinkedIn connection request note. Rules:
- Write from Amey's perspective — he is reaching out
- Never mention the job posting directly
- Lead with something specific about the company or their recent work
- Use the ask without asking approach — open a conversation, do not ask for a job
- Frame as seeking advice or perspective
- Maximum 300 characters total. Count carefully. This is a LinkedIn connection request note, not a message — it must be extremely concise.
- Never say: I came across your opening, I'd love to connect, Do you have any openings, just checking in
- End with a low-friction question about their experience or perspective
- If the user provided a specific hook, use it as the opening anchor
- Never mention relocation, sponsorship, visa, location constraints, or any caveats — these are for later conversations

${base}`;
  }

  if (persona === "warm") {
    return `You are helping Amey Divekar write a LinkedIn message to someone he has had prior contact with. Rules:
- Write from Amey's perspective — he is reaching out, not a recruiter or third party
- Never use recruiter language: "your name surfaced", "flagged your work", "came across your profile", "I'd love to connect", "excited about this opportunity"
- Line 1: Reference the specific prior connection from the context field — be precise, not vague
- Line 2: One clear reason Amey is reaching out now — tie it to their work, company news, or the role
- Line 3: Simple low-friction ask — their perspective, advice, or a short call
- Maximum 4 sentences total
- The user's context field is the relationship anchor — use it exactly as provided, do not invent details
- Never mention relocation, sponsorship, visa, location constraints, or any caveats — these are for later conversations

${base}`;
  }

  // hot
  return `You are helping Amey Divekar write a message to a real connection — former colleague, mentor, or someone he knows well. Rules:
- Write from Amey's perspective — lead with the relationship naturally
- Be direct and honest about what Amey is exploring
- Keep it short — they know him, no need for a pitch
- Direct ask is fine: a call, an intro, or advice
- Maximum 3 sentences, conversational tone
- The user's context field is the relationship — reference it naturally
- Never mention relocation, sponsorship, visa, location constraints, or any caveats — these are for later conversations

${base}`;
}

export function buildPersonaDraftUserPrompt(
  role: string,
  company: string,
  jdSummary: string,
  score: RoleScore,
  persona: Persona,
  context: string
): string {
  const contextLine = context.trim()
    ? `User context: ${context.trim()}`
    : "No specific context provided.";

  return `Draft a LinkedIn outreach message for this opportunity.

Persona: ${persona}
Role: ${role} at ${company}
Why this is a fit: ${score.rationale}
${contextLine}

Job Description Summary:
${jdSummary}

Return ONLY the message text. No labels, no quotes, no explanation.`;
}

export function buildPersonaEvaluatorSystemPrompt(persona: Persona): string {
  const sharedFails = `FAIL if the message:
- Uses clichés: "I came across your posting", "I believe my background aligns", "excited about this opportunity", "contribute to your team", "I'd love to connect"
- Could be copy-pasted to any company or role without changing anything
- Has a vague or generic ask`;

  if (persona === "cold") {
    return `You are a harsh LinkedIn outreach critic evaluating a COLD outreach message.

AUTOMATIC FAIL — check this first:
- If the message exceeds 300 characters, it is an automatic fail. Set reason to: "Rewrite in under 300 characters. Cut everything except the hook and the question."

PASS if the message:
- Is 300 characters or fewer
- Avoids any direct mention of a job opening
- Leads with a specific company insight, news, or product detail
- Ends with a low-friction question (not a job ask)
- Sounds genuinely personal

${sharedFails}

Use the evaluate_draft tool to return your verdict.`;
  }

  if (persona === "warm") {
    return `You are a harsh LinkedIn outreach critic evaluating a WARM outreach message.

PASS if the message:
- Opens by referencing a specific prior touchpoint (event, post, meeting — not vague "we've spoken before")
- Makes the reason for reaching out now clear
- The ask is concrete (a call, their perspective)
- Sounds personal and contextual

${sharedFails}

Use the evaluate_draft tool to return your verdict.`;
  }

  // hot
  return `You are a harsh LinkedIn outreach critic evaluating a HOT (known connection) outreach message.

PASS if the message:
- Is direct and references the actual relationship naturally
- Does not over-explain or pitch unnecessarily
- Stays under 3 sentences
- The ask is honest and specific

${sharedFails}

Use the evaluate_draft tool to return your verdict.`;
}

export function buildEvaluatorUserPrompt(draft: string): string {
  return `Evaluate this LinkedIn outreach message (${draft.length} characters):\n\n"${draft}"`;
}

export function buildPersonaRewriteUserPrompt(
  draft: string,
  reason: string,
  role: string,
  company: string,
  jdSummary: string,
  persona: Persona,
  context: string
): string {
  const contextLine = context.trim()
    ? `User context: ${context.trim()}`
    : "No specific context provided.";

  return `The previous draft was rejected: "${reason}"

Rewrite the LinkedIn message for ${role} at ${company}.
Persona: ${persona}
Fix the specific problem identified. Be concrete and non-generic.
${contextLine}

Job Description Summary:
${jdSummary}

Previous (rejected) draft — do NOT copy:
"${draft}"

Return ONLY the new message text.`;
}
