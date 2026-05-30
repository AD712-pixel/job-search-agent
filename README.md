# Job Search Agent

AI agent that scans target company career pages, scores role fit against a candidate profile, and generates personalized LinkedIn outreach on demand — all streamed live to the browser.

## How it works

For each target company (in parallel):
1. Searches for matching roles using your configured keywords (e.g. Product Manager, Pre-Sales)
2. Enriches vague job descriptions with additional context via web search
3. Scores each role on skills match, seniority fit, and domain overlap (1–10)
4. Skips roles scoring below 5; caps scoring to the top 5 most relevant roles per company

Then, per result card:
5. Select a persona (Cold / Warm / Hot) and provide one line of context
6. Click **Draft message** — a single API call drafts and evaluates the outreach (max 2 rewrite iterations)

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
```

Get your key at [console.anthropic.com](https://console.anthropic.com) → API Keys.

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

Set `ANTHROPIC_API_KEY` in **Vercel → Project → Settings → Environment Variables**.

## Using the app

1. Edit **Search keywords** — these drive the search query and top-5 role filtering
2. Edit target companies as needed (default: Salesforce, Microsoft, Adobe, Intuit)
3. Click **Run Agent** — live log shows search, enrichment, and scoring progress
4. Result cards appear with score breakdown and fit rationale
5. On each card: select **Cold**, **Warm**, or **Hot** persona, add one line of context, click **Draft message**
6. Copy the generated note with the **Copy** button

## Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Anthropic SDK with `claude-sonnet-4-6` (search, enrichment, drafting) + `claude-haiku-4-5-20251001` (extraction, scoring, evaluation)
- Server-Sent Events (SSE) for live streaming
