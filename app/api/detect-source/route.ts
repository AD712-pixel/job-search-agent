import { type NextRequest, NextResponse } from "next/server";
import { detectCompanySource } from "@/lib/company-source";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? "";
  const domain = url.searchParams.get("domain") ?? "";

  if (!name.trim() || !domain.trim()) {
    return NextResponse.json({ error: "name and domain are required" }, { status: 400 });
  }

  const source = await detectCompanySource(name, domain);
  return NextResponse.json({ source });
}
