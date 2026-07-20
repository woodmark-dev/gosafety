import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/server/db";

export async function GET() {
  try {
    const health = await dbQuery<{ now: string }>("SELECT now()::text AS now");
    const statusCount = await dbQuery<{ count: string }>(
      "SELECT count(*)::text AS count FROM incident_statuses"
    );

    return NextResponse.json({
      ok: true,
      serverTime: health.rows[0]?.now,
      incidentStatusCount: Number(statusCount.rows[0]?.count ?? 0),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Database health check failed",
      },
      { status: 500 }
    );
  }
}
