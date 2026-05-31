import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedJob {
  title: string;
  company: string;
  location: string;
  jd_summary: string;
}

export async function fetchAndParseUrl(url: string): Promise<ParsedJob> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; job-search-agent/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);

  const html = await res.text();
  const text = stripHtml(html).slice(0, 8000);

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 600,
    system: `You are a job description parser. Extract the job title, company name, location, and a 300-word summary of the role requirements from the provided text. Return only JSON: {"title": "...", "company": "...", "location": "...", "jd_summary": "..."}`,
    messages: [{ role: "user", content: `Parse this job page text:\n\n${text}` }],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  if (!textBlock) throw new Error("No response from parser");

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in parser response");

  return JSON.parse(jsonMatch[0]) as ParsedJob;
}
