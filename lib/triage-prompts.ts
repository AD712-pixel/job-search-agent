import Anthropic from "@anthropic-ai/sdk";

export const TRIAGE_TOOL: Anthropic.Tool = {
  name: "triage_titles",
  description: "Decide which job titles are worth pursuing for the candidate's target roles",
  input_schema: {
    type: "object",
    properties: {
      decisions: {
        type: "array",
        description: "One decision per title, in the same order as the input list",
        items: {
          type: "object",
          properties: {
            index: { type: "number", description: "0-based index of the title in the input list" },
            keep: { type: "boolean", description: "true if this title is plausibly a fit for the candidate's target roles" },
          },
          required: ["index", "keep"],
          additionalProperties: false,
        },
      },
    },
    required: ["decisions"],
    additionalProperties: false,
  },
};

export function buildTitleTriageSystemPrompt(profile: string): string {
  return `You are triaging job titles for relevance to a candidate's target roles.

Candidate Profile:
${profile || "No profile provided."}

For each title in the list, decide whether it is plausibly a fit for the candidate's target roles — a generous filter, not a strict one. Keep a title if there is a reasonable chance it fits; only reject titles that are clearly unrelated (e.g. "Warehouse Associate" for a Product Manager profile). Use the triage_titles tool to return one decision per title, in the same order given.`;
}

export function buildTitleTriageUserPrompt(titles: string[]): string {
  const list = titles.map((t, i) => `${i}: ${t}`).join("\n");
  return `Titles to triage:\n\n${list}\n\nUse the triage_titles tool to return a keep/drop decision for every index.`;
}

export function buildFirecrawlExtractionSystemPrompt(): string {
  return `You are a job description parser. Given the markdown content of a scraped job posting page, extract:
- title: the job title
- location: the role's location as stated on the page (empty string if not found)
- postedAt: the posting date in ISO 8601 format (YYYY-MM-DD) if stated anywhere on the page, otherwise null
- jdSummary: a thorough summary of responsibilities, requirements, and team context (plain text, not JSON)

Return ONLY a JSON object: {"title": "...", "location": "...", "postedAt": "..." or null, "jdSummary": "..."}
If the page does not look like a job posting at all, return {"title": "", "location": "", "postedAt": null, "jdSummary": ""}.`;
}

export function buildFirecrawlExtractionUserPrompt(markdown: string): string {
  return `Parse this scraped job page:\n\n${markdown}`;
}
