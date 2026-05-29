import { CANDIDATE_PROFILE } from "./candidate-profile";
import type { RoleScore } from "./types";

export function buildDraftingSystemPrompt(): string {
  return `You are a B2B LinkedIn outreach expert. Draft personalized LinkedIn connection notes.

Rules (strictly enforced):
- UNDER 300 characters — this is LinkedIn's connection note limit
- Reference a SPECIFIC detail from the job description or company (not generic praise)
- Highlight 1-2 most relevant candidate strengths for THIS specific role
- Clear, specific ask (not "I'd love to connect" — something concrete like "Would you have 15 min to share what the first 90 days look like in this role?")
- Human and warm tone — not templated or corporate

Candidate Profile:
${CANDIDATE_PROFILE}`;
}

export function buildDraftingUserPrompt(
  roleTitle: string,
  company: string,
  jdText: string,
  score: RoleScore
): string {
  return `Draft a LinkedIn connection note for this opportunity.

Role: ${roleTitle} at ${company}
Why this is a fit: ${score.rationale}

Job Description:
${jdText}

Return ONLY the message text. No labels, no quotes, no explanation. Under 300 characters.`;
}

export function buildEvaluatorSystemPrompt(): string {
  return `You are a harsh LinkedIn outreach critic. Identify generic, template-sounding messages.

PASS if the message:
- References something specific to the company, role, or job description
- Has a concrete, non-generic ask
- Sounds genuinely personal and human

FAIL if the message:
- Uses clichés: "I came across your posting", "I believe my background aligns", "excited about this opportunity", "contribute to your team", "I'd love to connect"
- Could be copy-pasted to any company or role without changing anything
- Has a vague or generic ask

Use the evaluate_draft tool to return your verdict.`;
}

export function buildEvaluatorUserPrompt(draft: string): string {
  return `Evaluate this LinkedIn outreach message:\n\n"${draft}"`;
}

export function buildRewriteUserPrompt(
  originalDraft: string,
  failReason: string,
  roleTitle: string,
  company: string,
  jdText: string
): string {
  return `The previous draft was rejected: "${failReason}"

Rewrite the LinkedIn connection note for ${roleTitle} at ${company}.
Fix the specific problem identified. Be concrete and non-generic.

Job Description:
${jdText}

Previous (rejected) draft — do NOT copy:
"${originalDraft}"

Return ONLY the new message text. Under 300 characters.`;
}
