import Anthropic from "@anthropic-ai/sdk";
import { TRIAGE_TOOL, buildTitleTriageSystemPrompt, buildTitleTriageUserPrompt } from "./triage-prompts";
import type { AgentSSEEvent, NormalizedJob } from "./types";

export const FRESHNESS_WINDOW_DAYS = 15;

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export function filterByFreshness(jobs: NormalizedJob[]): NormalizedJob[] {
  const cutoff = Date.now() - FRESHNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return jobs.filter((job) => {
    if (job.postedAt === null) return true;
    const posted = Date.parse(job.postedAt);
    if (Number.isNaN(posted)) return true;
    return posted >= cutoff;
  });
}

const US_ONLY_MARKERS = [
  "united states", "usa", "u.s.", "u.s.a",
  "new york", "san francisco", "seattle", "austin", "chicago", "boston",
  "los angeles", "denver", "atlanta", "miami", "washington, d.c", "washington dc",
];

function mentionsIndiaOrRemote(lowerLocation: string): boolean {
  return lowerLocation.includes("india") || lowerLocation.includes("remote") || lowerLocation.includes("hybrid");
}

export function filterByLocation(jobs: NormalizedJob[]): NormalizedJob[] {
  return jobs.filter((job) => {
    const loc = job.location.toLowerCase();
    if (!loc) return true; // ambiguous — keep, scoring's location cap is the real backstop
    if (mentionsIndiaOrRemote(loc)) return true;
    const looksUsOnly = US_ONLY_MARKERS.some((marker) => loc.includes(marker));
    return !looksUsOnly;
  });
}

export function filterSeen(jobs: NormalizedJob[], seenIds: Set<string>): NormalizedJob[] {
  return jobs.filter((job) => !seenIds.has(job.id));
}

export function keywordRelevanceScore(title: string, keywords: string[]): number {
  const lower = title.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
}

export interface UsageTracker {
  input: number;
  output: number;
}

export async function triageTitles(
  jobs: NormalizedJob[],
  keywords: string[],
  profile: string,
  emit: (e: AgentSSEEvent) => void,
  usage: UsageTracker
): Promise<NormalizedJob[]> {
  const keywordMatched = jobs.filter((job) => keywordRelevanceScore(job.title, keywords) > 0);
  if (keywordMatched.length === 0) return [];

  const titles = keywordMatched.map((j) => j.title);
  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: buildTitleTriageSystemPrompt(profile),
      tools: [TRIAGE_TOOL],
      tool_choice: { type: "tool", name: "triage_titles" },
      messages: [{ role: "user", content: buildTitleTriageUserPrompt(titles) }],
    });

    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) return keywordMatched;

    const { decisions } = toolUse.input as { decisions: { index: number; keep: boolean }[] };
    const keepIndices = new Set(decisions.filter((d) => d.keep).map((d) => d.index));
    return keywordMatched.filter((_, i) => keepIndices.has(i));
  } catch {
    return keywordMatched;
  }
}
