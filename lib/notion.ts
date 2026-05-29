import { Client } from "@notionhq/client";
import type { QualifyingRole } from "./types";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function logRoleToNotion(role: QualifyingRole): Promise<string> {
  const pageId = process.env.NOTION_PAGE_ID;
  if (!pageId) throw new Error("NOTION_PAGE_ID not set");

  let response;
  try {
    response = await notion.pages.create({
    parent: { type: "page_id", page_id: pageId },
    properties: {
      title: {
        title: [{ text: { content: `${role.company} — ${role.role_title}` } }],
      },
    },
    children: [
      {
        object: "block" as const,
        type: "heading_2" as const,
        heading_2: {
          rich_text: [{ text: { content: "Score Breakdown" } }],
        },
      },
      {
        object: "block" as const,
        type: "bulleted_list_item" as const,
        bulleted_list_item: {
          rich_text: [
            {
              text: {
                content: `Skills Match: ${role.score.skills_match}/10  |  Seniority Fit: ${role.score.seniority_fit}/10  |  Context Overlap: ${role.score.context_overlap}/10  |  Overall: ${role.score.overall}/10`,
              },
            },
          ],
        },
      },
      {
        object: "block" as const,
        type: "heading_2" as const,
        heading_2: {
          rich_text: [{ text: { content: "Fit Rationale" } }],
        },
      },
      {
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: {
          rich_text: [{ text: { content: role.score.rationale } }],
        },
      },
      {
        object: "block" as const,
        type: "heading_2" as const,
        heading_2: {
          rich_text: [{ text: { content: "LinkedIn Outreach Draft" } }],
        },
      },
      {
        object: "block" as const,
        type: "quote" as const,
        quote: {
          rich_text: [{ text: { content: role.outreach_draft } }],
        },
      },
      {
        object: "block" as const,
        type: "heading_2" as const,
        heading_2: {
          rich_text: [{ text: { content: "Details" } }],
        },
      },
      {
        object: "block" as const,
        type: "bulleted_list_item" as const,
        bulleted_list_item: {
          rich_text: [
            {
              text: {
                content: `Company: ${role.company}  |  Location: ${role.location}  |  Eval: ${role.eval_tag}  |  Date: ${new Date().toISOString().split("T")[0]}`,
              },
            },
          ],
        },
      },
      ...(role.role_url && role.role_url !== "#"
        ? [
            {
              object: "block" as const,
              type: "bookmark" as const,
              bookmark: { url: role.role_url },
            },
          ]
        : []),
    ],
  });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Notion API error for "${role.company} — ${role.role_title}": ${detail}`);
  }

  const id = (response as { id: string }).id;
  return `https://notion.so/${id.replace(/-/g, "")}`;
}
