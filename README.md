# Job Search Agent

AI agent that scans target company career pages, scores role fit against a candidate profile, drafts personalized LinkedIn outreach, and logs qualifying results to Notion — all streamed live to the browser.

## How it works

For each target company (in parallel):
1. Searches the company's careers page for matching roles (Growth PM, Pre-Sales Lead, Partnerships Manager, Product Manager)
2. Enriches vague job descriptions with additional context via web search
3. Scores each role on skills match, seniority fit, and domain overlap (1–10)
4. Skips roles scoring below 6
5. Drafts a personalized LinkedIn connection note for qualifying roles
6. Evaluates the draft and rewrites if it's too generic (max 2 iterations)
7. Logs each qualifying role to a Notion page

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your keys:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
NOTION_API_KEY=secret_...
NOTION_PAGE_ID=353d0c07-26bc-8114-b72b-f72305d785a8
```

**Getting your keys:**
- **Anthropic API key**: [console.anthropic.com](https://console.anthropic.com) → API Keys
- **Notion API key**: [notion.so/my-integrations](https://notion.so/my-integrations) → Create integration → copy "Internal Integration Secret"
- **Notion page ID**: Open the target Notion page, copy the UUID from the URL (the part after the last `/` and before `?`)

**Notion setup:** Share your target Notion page with the integration you created (open the page → "..." menu → "Add connections" → select your integration).

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

After deploying, set environment variables in **Vercel → Project → Settings → Environment Variables**:
- `ANTHROPIC_API_KEY`
- `NOTION_API_KEY`
- `NOTION_PAGE_ID`

## Using the app

1. The default target companies are Salesforce, Microsoft, Adobe, and Intuit — edit as needed
2. Click **Run Agent** to start
3. Watch live log updates as the agent searches, scores, and drafts
4. Result cards appear on completion with score breakdowns, fit rationale, and outreach drafts
5. Use the **Copy** button to grab the LinkedIn note
6. Each qualifying role is automatically saved to Notion

## Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Anthropic SDK with `claude-sonnet-4-6` + `web_search` tool
- `@notionhq/client`
- Server-Sent Events (SSE) for live streaming
