import { NextResponse } from "next/server";
import { dbTransaction } from "@/lib/server/db";
import {
  appendIncidentEvent,
  getIncidentForUpdate,
  parseWorkflowError,
  transitionIncident,
  WorkflowError,
} from "@/lib/server/incident-workflow";

type EvaluateBody = {
  evaluatorUserId?: string;
  actorUserId?: string;
  categoryId?: string;
  severityId?: string;
  assignedTeamId?: string;
  evaluationNotes?: string;
};

export async function POST(request: Request, context: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await context.params;
    const body = (await request.json()) as EvaluateBody;

    if (!body.evaluatorUserId || !body.categoryId || !body.severityId) {
      throw new WorkflowError("evaluatorUserId, categoryId and severityId are required", 400);
    }

    const result = await dbTransaction(async (client) => {
      const incident = await getIncidentForUpdate(client, incidentId);

      await client.query(
        `
        INSERT INTO incident_evaluations (
          incident_id,
          evaluator_user_id,
          category_id,
          severity_id,
          assigned_team_id,
          evaluation_notes,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
        `,
        [
          incidentId,
          body.evaluatorUserId,
          body.categoryId,
          body.severityId,
          body.assignedTeamId ?? null,
          body.evaluationNotes ?? null,
          body.actorUserId ?? body.evaluatorUserId,
        ]
      );

      await client.query(
        `
        UPDATE incidents
        SET category_id = $2,
            severity_id = $3,
            updated_at = now(),
            updated_by_user_id = COALESCE($4, updated_by_user_id),
            row_version = row_version + 1,
            is_high_severity = EXISTS (
              SELECT 1 FROM severity_levels s
              WHERE s.id = $3 AND s.code IN ('high', 'critical')
            )
        WHERE id = $1
        `,
        [incidentId, body.categoryId, body.severityId, body.actorUserId ?? body.evaluatorUserId]
      );

      if (incident.current_status_code === "reported") {
        await transitionIncident(
          client,
          incidentId,
          "under_review",
          { actorUserId: body.actorUserId ?? body.evaluatorUserId },
          "Evaluation started"
        );
      }

      const transition = await transitionIncident(
        client,
        incidentId,
        "evaluated",
        { actorUserId: body.actorUserId ?? body.evaluatorUserId },
        "Incident evaluated",
        {
          evaluatorUserId: body.evaluatorUserId,
          assignedTeamId: body.assignedTeamId ?? null,
        }
      );

      await appendIncidentEvent(
        client,
        incidentId,
        "incident_evaluated",
        { actorUserId: body.actorUserId ?? body.evaluatorUserId },
        {
          categoryId: body.categoryId,
          severityId: body.severityId,
          assignedTeamId: body.assignedTeamId ?? null,
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
