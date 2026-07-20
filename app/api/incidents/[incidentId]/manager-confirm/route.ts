import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      message:
        "This endpoint is deprecated. Use POST /api/incidents/:incidentId/admin-actions with action='manager_confirm_resolved'.",
    },
    { status: 410 }
  );
}
