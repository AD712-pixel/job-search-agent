import { type NextRequest, NextResponse } from "next/server";
import { fetchAndParseUrl } from "@/lib/fetch-url";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    return NextResponse.json({ error: "Missing or invalid URL" }, { status: 400 });
  }

  try {
    const parsed = await fetchAndParseUrl(url);
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
