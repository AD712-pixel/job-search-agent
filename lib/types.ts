export interface Company {
  id: string;
  name: string;
  domain: string;
  searchTier?: "adzuna" | "websearch";
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
  isDirectUrl?: boolean;
}

export type AgentSSEEvent =
  | { type: "agent:scoring"; company: string; role_title: string }
  | { type: "agent:score_result"; company: string; role_title: string; score: RoleScore; skipped: boolean }
  | { type: "run:complete"; qualifying_roles: QualifyingRole[] }
  | { type: "run:error"; message: string };
