export interface Company {
  id: string;
  name: string;
  domain: string;
}

export interface RawRole {
  title: string;
  url: string;
  snippet: string;
}

export interface RoleScore {
  skills_match: number;
  seniority_fit: number;
  context_overlap: number;
  overall: number;
  rationale: string;
}

export interface QualifyingRole {
  company: string;
  role_title: string;
  role_url: string;
  location: string;
  score: RoleScore;
  outreach_draft: string;
  eval_tag: "passed" | "rewritten";
  notion_url?: string;
}

export type AgentSSEEvent =
  | { type: "agent:start"; company: string }
  | { type: "agent:search"; company: string; query: string }
  | { type: "agent:roles_found"; company: string; count: number }
  | { type: "agent:enriching"; company: string; role_title: string }
  | { type: "agent:scoring"; company: string; role_title: string }
  | { type: "agent:score_result"; company: string; role_title: string; score: RoleScore; skipped: boolean }
  | { type: "agent:drafting"; company: string; role_title: string }
  | { type: "agent:evaluating"; company: string; role_title: string; iteration: number }
  | { type: "agent:eval_result"; company: string; role_title: string; eval_tag: "passed" | "rewritten" }
  | { type: "agent:notion_log"; company: string; role_title: string; notion_url: string }
  | { type: "agent:done"; company: string }
  | { type: "agent:debug"; company: string; message: string }
  | { type: "run:complete"; qualifying_roles: QualifyingRole[] }
  | { type: "run:error"; message: string };
