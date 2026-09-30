# Job Search Agent

AI agent that pulls live job postings from ATS feeds (or scrapes career pages), scores role fit against a candidate profile, and generates personalized LinkedIn outreach on demand — all streamed live to the browser.

## How it works

For each target company (in parallel):
1. Fetches jobs directly — from Greenhouse, Lever, or Ashby's public API if configured, or via Firecrawl (map/search + scrape) as a fallback
2. Filters in plain code: drops postings older than 15 days (undated postings are kept but flagged "date unverified"), drops clearly US-only roles, drops jobs already seen in a prior run
3. Triages remaining titles for target-role fit — a keyword pass, then one batched Haiku call
4. Scores the survivors on skills match, seniority fit, and domain overlap (1–10)
5. Skips roles scoring below 5; caps scoring to the top 5 most relevant roles per company

Then, per result card:
6. Select a persona (Cold / Warm / Hot) and provide one line of context
7. Click **Draft message** — a single API call drafts and evaluates the outreach (max 2 rewrite iterations)

At the end of each run, the log shows a per-company and total funnel (fetched → after date filter → after location filter → after seen filter → after triage → scored → shown), plus an estimated Firecrawl credit count and Haiku token usage.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
FIRECRAWL_API_KEY=fc-...
```

Get your Anthropic key at [console.anthropic.com](https://console.anthropic.com) → API Keys. Get a Firecrawl key at [firecrawl.dev](https://www.firecrawl.dev) — only needed for companies using the Firecrawl fallback (not required for companies fully covered by Greenhouse/Lever/Ashby).

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

```bash
vercel deploy
```

Or push to GitHub and import via the [Vercel dashboard](https://vercel.com/new).

Set `ANTHROPIC_API_KEY` and `FIRECRAWL_API_KEY` in **Vercel → Project → Settings → Environment Variables**.

## Using the app

1. Edit **Search keywords** — these drive title triage and relevance ranking
2. Edit target companies. For each company, pick a source (Greenhouse / Lever / Ashby / Firecrawl) and click **Detect source** to auto-guess the ATS slug, or enter one manually. Firecrawl companies can optionally set a careers page URL; without one, the agent falls back to a Firecrawl search
3. Click **Run Agent** — live log shows fetch, filter, triage, and scoring progress per company, plus a run-total summary at the end
4. Result cards show a score breakdown, posted date (with a "date unverified" badge if the source didn't provide one), and source badge
5. On each card: select **Cold**, **Warm**, or **Hot** persona, add one line of context, click **Draft message**
6. Copy the generated note with the **Copy** button
7. Use **Reset seen jobs** in the sidebar to clear the "already seen" filter and let previously-scored jobs reappear

## Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Anthropic SDK with `claude-sonnet-5` (drafting/rewrites only) + `claude-haiku-4-5-20251001` (extraction, title triage, scoring, evaluation)
- Firecrawl REST API (map / search / scrape) as the fallback job-discovery path
- Server-Sent Events (SSE) over a `fetch`-streamed `POST` for live streaming
