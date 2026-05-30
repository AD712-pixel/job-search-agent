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
  jd_summary: string;
}

export type AgentSSEEvent =
  | { type: "agent:start"; company: string }
  | { type: "agent:search"; company: string; query: string }
  | { type: "agent:roles_found"; company: string; count: number }
  | { type: "agent:roles_capped"; company: string; total: number; scoring: number }
  | { type: "agent:enriching"; company: string; role_title: string }
  | { type: "agent:scoring"; company: string; role_title: string }
  | { type: "agent:score_result"; company: string; role_title: string; score: RoleScore; skipped: boolean }
  | { type: "agent:done"; company: string }
  | { type: "agent:debug"; company: string; message: string }
  | { type: "run:complete"; qualifying_roles: QualifyingRole[] }
  | { type: "run:error"; message: string };
