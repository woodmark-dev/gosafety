import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      message:
        "This endpoint is deprecated. Use POST /api/incidents/:incidentId/admin-actions with action='mark_resolved'.",
    },
    { status: 410 }
  );
}
