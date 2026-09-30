export type SourceType = "greenhouse" | "lever" | "ashby" | "firecrawl";

export interface CompanySource {
  type: SourceType;
  slug?: string;
  careersUrl?: string;
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  source: CompanySource;
}

export interface NormalizedJob {
  id: string;
  company: string;
  title: string;
  location: string;
  postedAt: string | null;
  dateVerified: boolean;
  url: string;
  jdText: string;
  source: SourceType;
}

export interface RoleScore {
  skills_match: number;
  seniority_fit: number;
  context_overlap: number;
  overall: number;
  rationale: string;
}

export interface FunnelStats {
  fetched: number;
  afterDate: number;
  afterLocation: number;
  afterSeen: number;
  afterTriage: number;
  scored: number;
  shown: number;
}

export interface QualifyingRole {
  company: string;
  role_title: string;
  role_url: string;
  location: string;
  score: RoleScore;
  jd_summary: string;
  postedAt: string | null;
  dateVerified: boolean;
  source: SourceType;
}

export type AgentSSEEvent =
  | { type: "agent:start"; company: string }
  | { type: "agent:fetching"; company: string; source: SourceType; detail: string }
  | { type: "agent:fetched"; company: string; count: number }
  | { type: "agent:filter_progress"; company: string; stage: "date" | "location" | "seen" | "triage"; before: number; after: number }
  | { type: "agent:scoring"; company: string; role_title: string }
  | { type: "agent:score_result"; company: string; role_title: string; score: RoleScore; skipped: boolean }
  | { type: "agent:company_stats"; company: string; source: SourceType; funnel: FunnelStats }
  | { type: "agent:company_timeout"; company: string; message: string }
  | { type: "agent:done"; company: string }
  | { type: "agent:debug"; company: string; message: string }
  | {
      type: "run:stats";
      totalFunnel: FunnelStats;
      estimatedFirecrawlCredits: number;
      haikuTokens: { input: number; output: number };
      scored_job_ids: string[];
    }
  | { type: "run:complete"; qualifying_roles: QualifyingRole[] }
  | { type: "run:error"; message: string };
