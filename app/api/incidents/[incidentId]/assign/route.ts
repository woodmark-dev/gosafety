import { NextResponse } from "next/server";
import { dbTransaction } from "@/lib/server/db";
import {
  appendIncidentEvent,
  parseWorkflowError,
  transitionIncident,
  WorkflowError,
} from "@/lib/server/incident-workflow";

type AssignBody = {
  assignedTeamId?: string;
  assignedUserId?: string;
  assignedByUserId?: string;
  actorUserId?: string;
  assignmentNotes?: string;
};

export async function POST(request: Request, context: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await context.params;
    const body = (await request.json()) as AssignBody;

    if (!body.assignedTeamId || !body.assignedByUserId) {
      throw new WorkflowError("assignedTeamId and assignedByUserId are required", 400);
    }

    const result = await dbTransaction(async (client) => {
      await client.query(
        `
        UPDATE incident_assignments
        SET is_active = false,
            unassigned_at = now(),
            updated_at = now(),
            updated_by_user_id = COALESCE($2, updated_by_user_id)
        WHERE incident_id = $1
          AND is_active = true
          AND deleted_at IS NULL
        `,
        [incidentId, body.actorUserId ?? body.assignedByUserId]
      );

      await client.query(
        `
        INSERT INTO incident_assignments (
          incident_id,
          assigned_team_id,
          assigned_user_id,
          assigned_by_user_id,
          assignment_notes,
          is_active,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, true, $6, $6)
        `,
        [
          incidentId,
          body.assignedTeamId,
          body.assignedUserId ?? null,
          body.assignedByUserId,
          body.assignmentNotes ?? null,
          body.actorUserId ?? body.assignedByUserId,
        ]
      );

      const transition = await transitionIncident(
        client,
        incidentId,
        "assigned",
        { actorUserId: body.actorUserId ?? body.assignedByUserId },
        "Incident assigned",
        {
          assignedTeamId: body.assignedTeamId,
          assignedUserId: body.assignedUserId ?? null,
        }
      );

      await appendIncidentEvent(
        client,
        incidentId,
        "incident_assigned",
        { actorUserId: body.actorUserId ?? body.assignedByUserId },
        {
          assignedTeamId: body.assignedTeamId,
          assignedUserId: body.assignedUserId ?? null,
          assignmentNotes: body.assignmentNotes ?? null,
        }
      );

      return transition;
    });

    return NextResponse.json({
      incidentId,
      status: result.toStatusCode,
      previousStatus: result.fromStatusCode,
    });
  } catch (error) {
    const parsed = parseWorkflowError(error);
    return NextResponse.json({ message: parsed.message }, { status: parsed.status });
  }
}
