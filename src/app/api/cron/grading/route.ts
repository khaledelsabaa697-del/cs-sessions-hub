import { NextResponse, type NextRequest } from "next/server";
import { processGradingQueue } from "@/lib/grading/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function handle(request: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Grading cron is not configured." },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await processGradingQueue({ limit: 2, worker: "cron" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(
      "[grading cron] failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "Grading run failed." },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
