export function buildScoringSystemPrompt(profile: string): string {
  return `You are an expert career coach and talent evaluator specializing in B2B SaaS and fintech.
Score the fit between the given job description and the candidate profile below.

Candidate Profile:
${profile || "No profile provided."}

Use the score_role tool to return a structured score. A score of 6 means a reasonable match worth pursuing, 7-8 means strong fit, 9-10 means exceptional fit.
- skills_match (1-10): Does the candidate have the required skills?
- seniority_fit (1-10): Is the candidate's level appropriate? (over-qualified or under-qualified both reduce this)
- context_overlap (1-10): Domain alignment — score highly if the candidate's skills are transferable to this company's domain, even if not an exact match. Enterprise SaaS, B2B, payments, and platform products count as strong overlap.
- overall (1-10): Holistic fit — weight skills_match and seniority_fit most heavily, context_overlap least heavily

Location rule (hard filter, not soft penalty):
- If the role is explicitly US-only with no remote option and no India office listed, set seniority_fit to a maximum of 3 and overall to a maximum of 4. This is a hard location filter.
- If the role is India-based or remote-friendly, do not penalize for location at all.`;
}

export function buildScoringUserPrompt(
  roleTitle: string,
  jdText: string,
  companyContext: string
): string {
  return `Score this role for the candidate:

Role Title: ${roleTitle}

Job Description:
${jdText}

${companyContext ? `Additional Company Context:\n${companyContext}` : ""}

Use the score_role tool to return your assessment.`;
}
