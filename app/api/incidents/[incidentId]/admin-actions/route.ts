import { NextResponse } from "next/server";
import { dbQuery, dbTransaction } from "@/lib/server/db";
import {
  appendIncidentEvent,
  getIncidentForUpdate,
  getStatusByCode,
  parseWorkflowError,
  transitionIncident,
  WorkflowError,
} from "@/lib/server/incident-workflow";

export const dynamic = "force-dynamic";

const STAFF_COOKIE = "gosafety_staff_auth";
const STAFF_USER_COOKIE = "gosafety_staff_user_id";
const ALLOWED_ROLE_CODES = ["admin", "evaluator_hse"] as const;
const FULFILLMENT_ROLE_CODE = "fulfillment_member";

type AllowedRoleCode = (typeof ALLOWED_ROLE_CODES)[number];

type AdminActionBody =
  | {
      action: "acknowledge";
    }
  | {
      action: "update_details";
      title?: string;
      description?: string;
      categoryId?: string;
      severityId?: string;
    }
  | {
      action: "assign_fulfillment";
      assignedUserId?: string;
      assignmentNotes?: string;
    }
  | {
      action: "assign_sla";
      slaRuleId?: string;
    }
  | {
      action: "return_to_admin";
      returnComment?: string;
    }
  | {
      action: "mark_resolved";
      resolutionComment?: string;
    }
  | {
      action: "manager_confirm_resolved";
      managerComment?: string;
    }
  | {
      action: "close_out";
      closeOutComment?: string;
    };

type FulfillmentUser = {
  id: string;
  full_name: string;
  email: string;
  team_id: string | null;
  team_name: string | null;
};

type SlaRule = {
  id: string;
  rule_name: string;
  response_due_minutes: number;
  resolution_due_minutes: number;
};

function readCookie(cookieHeader: string, name: string) {
  const parts = cookieHeader.split(";");

  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

async function getActorUserAndRoles(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const isStaff = readCookie(cookieHeader, STAFF_COOKIE) === "1";
  const userId = readCookie(cookieHeader, STAFF_USER_COOKIE)?.trim() ?? null;

  if (!isStaff || !userId) {
    throw new WorkflowError("Staff authentication required", 403);
  }

  const roles = await dbQuery<{ code: string }>(
    `
    SELECT r.code
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
    `,
    [userId]
  );

  const roleCodes = roles.rows.map((row) => row.code as AllowedRoleCode | string);
  return {
    userId,
    roleCodes,
  };
}

function canManageIncident(roleCodes: string[]) {
  return roleCodes.some((code) => ALLOWED_ROLE_CODES.includes(code as AllowedRoleCode));
}

export async function GET(request: Request, context: { params: Promise<{ incidentId: string }> }) {
  try {
    const actor = await getActorUserAndRoles(request);
    if (!canManageIncident(actor.roleCodes)) {
      throw new WorkflowError("Admin or evaluator_hse role required", 403);
    }

    const { incidentId } = await context.params;

    const [fulfillmentUsers, slaRules] = await Promise.all([
      dbQuery<FulfillmentUser>(
        `
        SELECT
          u.id,
          u.full_name,
          u.email,
          MIN(tm.team_id::text) AS team_id,
          NULLIF(string_agg(DISTINCT t.team_name, ', ' ORDER BY t.team_name), '') AS team_name
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id AND r.code = 'fulfillment_member'
        LEFT JOIN team_memberships tm ON tm.user_id = u.id
        LEFT JOIN teams t ON t.id = tm.team_id
        WHERE u.deleted_at IS NULL
          AND u.is_active = true
        GROUP BY u.id, u.full_name, u.email
        ORDER BY u.full_name ASC, u.email ASC
        `
      ),
      dbQuery<SlaRule>(
        `
        SELECT id, rule_name, response_due_minutes, resolution_due_minutes
        FROM sla_rules
        WHERE is_active = true
          AND (effective_to IS NULL OR effective_to > now())
        ORDER BY priority ASC, rule_name ASC
        `
      ),
    ]);

    const currentSla = await dbQuery<{ sla_rule_id: string | null }>(
      `
      SELECT sla_rule_id::text
      FROM incident_sla_instances
      WHERE incident_id = $1
      LIMIT 1
      `,
      [incidentId]
    );

    return NextResponse.json(
      {
        fulfillmentUsers: fulfillmentUsers.rows.map((user) => ({
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          teamId: user.team_id,
          teamName: user.team_name,
        })),
        slaRules: slaRules.rows,
        currentSlaRuleId: currentSla.rows[0]?.sla_rule_id ?? null,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const parsed = parseWorkflowError(error);
    return NextResponse.json({ message: parsed.message }, { status: parsed.status });
  }
}

export async function POST(request: Request, context: { params: Promise<{ incidentId: string }> }) {
  try {
    const actor = await getActorUserAndRoles(request);
    const { incidentId } = await context.params;
    const body = (await request.json()) as AdminActionBody;

    if (body.action === "return_to_admin" || body.action === "mark_resolved") {
      if (!actor.roleCodes.includes(FULFILLMENT_ROLE_CODE)) {
        throw new WorkflowError("fulfillment_member role required", 403);
      }
    } else if (body.action === "manager_confirm_resolved") {
      // Department manager authorization is validated in the action handler.
    } else if (!canManageIncident(actor.roleCodes)) {
      throw new WorkflowError("Admin or evaluator_hse role required", 403);
    }

    const result = await dbTransaction(async (client) => {
      if (body.action === "acknowledge") {
        const incident = await getIncidentForUpdate(client, incidentId);

        if (incident.current_status_code === "reported") {
          const transition = await transitionIncident(
            client,
            incidentId,
            "under_review",
            { actorUserId: actor.userId },
            "Incident acknowledged"
          );

          await appendIncidentEvent(
            client,
            incidentId,
            "incident_acknowledged",
            { actorUserId: actor.userId },
            {}
          );

          return { action: body.action, transition };
        }

        return { action: body.action, transition: null };
      }

      if (body.action === "update_details") {
        const incidentState = await client.query<{ has_active_assignment: boolean }>(
          `
          SELECT
            EXISTS (
              SELECT 1
              FROM incident_assignments ia
              WHERE ia.incident_id = i.id
                AND ia.is_active = true
                AND ia.deleted_at IS NULL
            ) AS has_active_assignment
          FROM incidents i
          WHERE i.id = $1
            AND i.deleted_at IS NULL
          LIMIT 1
          `,
          [incidentId]
        );

        const currentIncidentState = incidentState.rows[0] ?? null;
        if (!currentIncidentState) {
          throw new WorkflowError("Incident not found", 404);
        }

        if (currentIncidentState.has_active_assignment) {
          throw new WorkflowError("Incident details are locked after fulfillment assignment", 409);
        }

        if (typeof body.categoryId === "string" && body.categoryId.trim()) {
          const categoryExists = await client.query<{ id: string }>(
            `
            SELECT id
            FROM incident_categories
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
            `,
            [body.categoryId.trim()]
          );

          if (!categoryExists.rows[0]) {
            throw new WorkflowError("Invalid category selected", 400);
          }
        }

        if (typeof body.severityId === "string" && body.severityId.trim()) {
          const severityExists = await client.query<{ id: string }>(
            `
            SELECT id
            FROM severity_levels
            WHERE id = $1
            LIMIT 1
            `,
            [body.severityId.trim()]
          );

          if (!severityExists.rows[0]) {
            throw new WorkflowError("Invalid severity selected", 400);
          }
        }

        const updates: string[] = [];
        const params: unknown[] = [incidentId];

        if (typeof body.title === "string" && body.title.trim()) {
          updates.push(`title = $${params.length + 1}`);
          params.push(body.title.trim());
        }

        if (typeof body.description === "string" && body.description.trim()) {
          updates.push(`description = $${params.length + 1}`);
          params.push(body.description.trim());
        }

        if (typeof body.categoryId === "string" && body.categoryId.trim()) {
          updates.push(`category_id = $${params.length + 1}`);
          params.push(body.categoryId.trim());
        }

        if (typeof body.severityId === "string" && body.severityId.trim()) {
          updates.push(`severity_id = $${params.length + 1}`);
          params.push(body.severityId.trim());
          updates.push(
            `is_high_severity = EXISTS (SELECT 1 FROM severity_levels s WHERE s.id = $${params.length} AND s.code IN ('high', 'critical'))`
          );
        }

        if (updates.length === 0) {
          throw new WorkflowError("No valid fields provided for update", 400);
        }

        updates.push("updated_at = now()");
        updates.push(`updated_by_user_id = $${params.length + 1}`);
        params.push(actor.userId);
        updates.push("row_version = row_version + 1");

        const updated = await client.query<{ id: string }>(
          `
          UPDATE incidents
          SET ${updates.join(", ")}
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id
          `,
          params
        );

        if (!updated.rows[0]) {
          throw new WorkflowError("Incident not found", 404);
        }

        await appendIncidentEvent(
          client,
          incidentId,
          "incident_details_updated",
          { actorUserId: actor.userId },
          {
            title: body.title ?? null,
            description: body.description ?? null,
            categoryId: body.categoryId ?? null,
            severityId: body.severityId ?? null,
          }
        );

        return { action: body.action, transition: null };
      }

      if (body.action === "assign_fulfillment") {
        if (!body.assignedUserId?.trim()) {
          throw new WorkflowError("assignedUserId is required", 400);
        }

        const assignmentTarget = await client.query<{ team_id: string | null }>(
          `
          SELECT tm.team_id::text
          FROM users u
          JOIN user_roles ur ON ur.user_id = u.id
          JOIN roles r ON r.id = ur.role_id
          LEFT JOIN team_memberships tm ON tm.user_id = u.id
          WHERE u.id = $1
            AND u.deleted_at IS NULL
            AND u.is_active = true
            AND r.code = 'fulfillment_member'
          LIMIT 1
          `,
          [body.assignedUserId.trim()]
        );

        if (!assignmentTarget.rows[0]) {
          throw new WorkflowError(
            "Selected fulfillment member must have fulfillment_member role",
            400
          );
        }

        const currentAssignment = await client.query<{ assigned_team_id: string }>(
          `
          SELECT assigned_team_id::text
          FROM incident_assignments
          WHERE incident_id = $1
            AND is_active = true
            AND deleted_at IS NULL
          ORDER BY assigned_at DESC
          LIMIT 1
          `,
          [incidentId]
        );

        const fallbackTeam = await client.query<{ id: string }>(
          `
          SELECT id::text AS id
          FROM teams
          WHERE deleted_at IS NULL
          ORDER BY team_name ASC
          LIMIT 1
          `
        );

        const ensuredDefaultTeam = await client.query<{ id: string }>(
          `
          INSERT INTO teams (
            team_code,
            team_name,
            team_type,
            created_by_user_id,
            updated_by_user_id,
            deleted_at
          )
          VALUES (
            'FULFILLMENT_DEFAULT',
            'Default Fulfillment Team',
            'fulfillment',
            $1,
            $1,
            NULL
          )
          ON CONFLICT (team_code)
          DO UPDATE SET
            team_name = EXCLUDED.team_name,
            team_type = EXCLUDED.team_type,
            updated_at = now(),
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            deleted_at = NULL
          RETURNING id::text AS id
          `,
          [actor.userId]
        );

        const teamId =
          assignmentTarget.rows[0].team_id ??
          currentAssignment.rows[0]?.assigned_team_id ??
          fallbackTeam.rows[0]?.id ??
          ensuredDefaultTeam.rows[0]?.id ??
          null;

        await client.query(
          `
          UPDATE incident_assignments
          SET is_active = false,
              unassigned_at = now(),
              updated_at = now(),
              updated_by_user_id = $2
          WHERE incident_id = $1
            AND is_active = true
            AND deleted_at IS NULL
          `,
          [incidentId, actor.userId]
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
          VALUES ($1, $2, $3, $4, $5, true, $4, $4)
          `,
          [
            incidentId,
            teamId,
            body.assignedUserId.trim(),
            actor.userId,
            body.assignmentNotes?.trim() || null,
          ]
        );

        const incident = await getIncidentForUpdate(client, incidentId);
        let transition: { fromStatusCode: string; toStatusCode: string } | null = null;

        if (
          !["reported", "under_review", "evaluated", "reopen_requested", "assigned"].includes(
            incident.current_status_code
          )
        ) {
          throw new WorkflowError(
            `Cannot assign fulfillment member while incident is in status ${incident.current_status_code}`,
            409
          );
        }

        if (incident.current_status_code === "reported") {
          await transitionIncident(
            client,
            incidentId,
            "under_review",
            { actorUserId: actor.userId },
            "Incident acknowledged during assignment"
          );
          await transitionIncident(
            client,
            incidentId,
            "evaluated",
            { actorUserId: actor.userId },
            "Incident evaluated during assignment"
          );
          transition = await transitionIncident(
            client,
            incidentId,
            "assigned",
            { actorUserId: actor.userId },
            "Incident assigned to fulfillment member"
          );
        } else if (incident.current_status_code === "under_review") {
          await transitionIncident(
            client,
            incidentId,
            "evaluated",
            { actorUserId: actor.userId },
            "Incident evaluated during assignment"
          );
          transition = await transitionIncident(
            client,
            incidentId,
            "assigned",
            { actorUserId: actor.userId },
            "Incident assigned to fulfillment member"
          );
        } else if (
          incident.current_status_code === "evaluated" ||
          incident.current_status_code === "reopen_requested"
        ) {
          transition = await transitionIncident(
            client,
            incidentId,
            "assigned",
            { actorUserId: actor.userId },
            "Incident assigned to fulfillment member"
          );
        }

        await appendIncidentEvent(
          client,
          incidentId,
          "incident_assigned",
          { actorUserId: actor.userId },
          {
            assignedUserId: body.assignedUserId.trim(),
            assignedTeamId: teamId,
            assignmentNotes: body.assignmentNotes?.trim() || null,
          }
        );

        return { action: body.action, transition };
      }

      if (body.action === "assign_sla") {
        const incidentState = await client.query<{ has_active_assignment: boolean }>(
          `
          SELECT
            EXISTS (
              SELECT 1
              FROM incident_assignments ia
              WHERE ia.incident_id = i.id
                AND ia.is_active = true
                AND ia.deleted_at IS NULL
            ) AS has_active_assignment
          FROM incidents i
          WHERE i.id = $1
            AND i.deleted_at IS NULL
          LIMIT 1
          `,
          [incidentId]
        );

        const currentIncidentState = incidentState.rows[0] ?? null;
        if (!currentIncidentState) {
          throw new WorkflowError("Incident not found", 404);
        }

        if (currentIncidentState.has_active_assignment) {
          throw new WorkflowError("SLA is locked after fulfillment assignment", 409);
        }

        if (!body.slaRuleId?.trim()) {
          throw new WorkflowError("slaRuleId is required", 400);
        }

        const rule = await client.query<{
          id: string;
          response_due_minutes: number;
          resolution_due_minutes: number;
        }>(
          `
          SELECT id, response_due_minutes, resolution_due_minutes
          FROM sla_rules
          WHERE id = $1
            AND is_active = true
            AND (effective_to IS NULL OR effective_to > now())
          LIMIT 1
          `,
          [body.slaRuleId.trim()]
        );

        if (!rule.rows[0]) {
          throw new WorkflowError("SLA rule not found or inactive", 400);
        }

        const incidentTimes = await client.query<{ reported_at: string }>(
          `
          SELECT reported_at::text
          FROM incidents
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
          `,
          [incidentId]
        );

        if (!incidentTimes.rows[0]) {
          throw new WorkflowError("Incident not found", 404);
        }

        const startedAt = new Date(incidentTimes.rows[0].reported_at);
        const responseDueAt = new Date(
          startedAt.getTime() + rule.rows[0].response_due_minutes * 60 * 1000
        );
        const resolutionDueAt = new Date(
          startedAt.getTime() + rule.rows[0].resolution_due_minutes * 60 * 1000
        );

        await client.query(
          `
          INSERT INTO incident_sla_instances (
            incident_id,
            sla_rule_id,
            started_at,
            response_due_at,
            resolution_due_at,
            last_evaluated_at,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, now(), $6, $6)
          ON CONFLICT (incident_id)
          DO UPDATE SET
            sla_rule_id = EXCLUDED.sla_rule_id,
            started_at = EXCLUDED.started_at,
            response_due_at = EXCLUDED.response_due_at,
            resolution_due_at = EXCLUDED.resolution_due_at,
            last_evaluated_at = now(),
            updated_at = now(),
            updated_by_user_id = EXCLUDED.updated_by_user_id
          `,
          [
            incidentId,
            body.slaRuleId.trim(),
            startedAt.toISOString(),
            responseDueAt.toISOString(),
            resolutionDueAt.toISOString(),
            actor.userId,
          ]
        );

        await appendIncidentEvent(
          client,
          incidentId,
          "incident_sla_assigned",
          { actorUserId: actor.userId },
          {
            slaRuleId: body.slaRuleId.trim(),
            responseDueAt: responseDueAt.toISOString(),
            resolutionDueAt: resolutionDueAt.toISOString(),
          }
        );

        return { action: body.action, transition: null };
      }

      if (body.action === "return_to_admin") {
        const returnComment = body.returnComment?.trim();
        if (!returnComment) {
          throw new WorkflowError("returnComment is required", 400);
        }

        const activeAssignment = await client.query<{
          id: string;
          assigned_user_id: string | null;
        }>(
          `
          SELECT id, assigned_user_id::text
          FROM incident_assignments
          WHERE incident_id = $1
            AND is_active = true
            AND deleted_at IS NULL
          ORDER BY assigned_at DESC
          LIMIT 1
          `,
          [incidentId]
        );

        const assignment = activeAssignment.rows[0] ?? null;
        if (!assignment) {
          throw new WorkflowError("No active fulfillment assignment to return", 409);
        }

        if (!assignment.assigned_user_id || assignment.assigned_user_id !== actor.userId) {
          throw new WorkflowError(
            "Only the assigned fulfillment member can return this incident",
            403
          );
        }

        const incident = await getIncidentForUpdate(client, incidentId);
        if (!["assigned", "in_progress"].includes(incident.current_status_code)) {
          throw new WorkflowError(
            `Cannot return incident while it is in status ${incident.current_status_code}`,
            409
          );
        }

        await client.query(
          `
          UPDATE incident_assignments
          SET is_active = false,
              unassigned_at = now(),
              updated_at = now(),
              updated_by_user_id = $2
          WHERE id = $1
          `,
          [assignment.id, actor.userId]
        );

        await appendIncidentEvent(
          client,
          incidentId,
          "incident_returned_to_admin",
          { actorUserId: actor.userId },
          {
            assignmentId: assignment.id,
            returnComment,
          }
        );

        return { action: body.action, transition: null };
      }

      if (body.action === "mark_resolved") {
        const resolutionComment = body.resolutionComment?.trim() ?? null;
        const activeAssignment = await client.query<{
          id: string;
          assigned_user_id: string | null;
        }>(
          `
          SELECT id, assigned_user_id::text
          FROM incident_assignments
          WHERE incident_id = $1
            AND is_active = true
            AND deleted_at IS NULL
          ORDER BY assigned_at DESC
          LIMIT 1
          `,
          [incidentId]
        );

        const assignment = activeAssignment.rows[0] ?? null;
        if (!assignment) {
          throw new WorkflowError("No active fulfillment assignment found", 409);
        }

        if (!assignment.assigned_user_id || assignment.assigned_user_id !== actor.userId) {
          throw new WorkflowError(
            "Only the assigned fulfillment member can mark this incident",
            403
          );
        }

        const incident = await getIncidentForUpdate(client, incidentId);
        if (!["assigned", "in_progress"].includes(incident.current_status_code)) {
          throw new WorkflowError(
            `Cannot mark incident resolved while it is in status ${incident.current_status_code}`,
            409
          );
        }

        let transition: { fromStatusCode: string; toStatusCode: string } | null = null;
        if (incident.current_status_code === "assigned") {
          transition = await transitionIncident(
            client,
            incidentId,
            "in_progress",
            { actorUserId: actor.userId },
            "Fulfillment member marked incident as resolved and sent for manager confirmation"
          );
        }

        await client.query(
          `
          INSERT INTO incident_resolutions (
            incident_id,
            assignment_id,
            resolved_by_user_id,
            resolution_summary,
            completion_evidence,
            resolved_at,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, now(), $3, $3)
          `,
          [
            incidentId,
            assignment.id,
            actor.userId,
            resolutionComment ?? "Marked resolved by fulfillment member",
            JSON.stringify({ source: "admin-actions/mark_resolved" }),
          ]
        );

        await appendIncidentEvent(
          client,
          incidentId,
          "incident_marked_resolved_by_fulfillment",
          { actorUserId: actor.userId },
          {
            assignmentId: assignment.id,
            resolutionComment,
          }
        );

        return { action: body.action, transition };
      }

      if (body.action === "manager_confirm_resolved") {
        const managerComment = body.managerComment?.trim() ?? null;
        const managerMembership = await client.query<{
          department_id: string;
          department_title: string;
        }>(
          `
          SELECT department_id::text, department_title::text
          FROM user_department_memberships
          WHERE user_id = $1
          LIMIT 1
          `,
          [actor.userId]
        );

        const managerDept = managerMembership.rows[0] ?? null;
        if (!managerDept || managerDept.department_title !== "manager") {
          throw new WorkflowError("Department manager access required", 403);
        }

        const activeAssignment = await client.query<{
          id: string;
          assigned_user_id: string | null;
          assignee_department_id: string | null;
        }>(
          `
          SELECT
            ia.id,
            ia.assigned_user_id::text,
            udm.department_id::text AS assignee_department_id
          FROM incident_assignments ia
          LEFT JOIN user_department_memberships udm ON udm.user_id = ia.assigned_user_id
          WHERE ia.incident_id = $1
            AND ia.is_active = true
            AND ia.deleted_at IS NULL
          ORDER BY ia.assigned_at DESC
          LIMIT 1
          `,
          [incidentId]
        );

        const assignment = activeAssignment.rows[0] ?? null;
        if (!assignment?.assignee_department_id) {
          throw new WorkflowError("No active assignment with department found", 409);
        }

        if (assignment.assignee_department_id !== managerDept.department_id) {
          throw new WorkflowError(
            "Only the manager of the assigned fulfillment member's department can confirm",
            403
          );
        }

        const incident = await getIncidentForUpdate(client, incidentId);
        if (incident.current_status_code !== "in_progress") {
          throw new WorkflowError(
            `Cannot confirm resolution while incident is in status ${incident.current_status_code}`,
            409
          );
        }

        const latestResolution = await client.query<{ id: string }>(
          `
          SELECT id::text AS id
          FROM incident_resolutions
          WHERE incident_id = $1
          ORDER BY resolved_at DESC, created_at DESC
          LIMIT 1
          `,
          [incidentId]
        );

        let resolutionId = latestResolution.rows[0]?.id ?? null;

        if (!resolutionId) {
          const latestFulfillmentMarkEvent = await client.query<{
            actor_user_id: string | null;
            resolution_comment: string | null;
          }>(
            `
            SELECT
              ie.actor_user_id::text,
              NULLIF(ie.event_data->>'resolutionComment', '') AS resolution_comment
            FROM incident_events ie
            WHERE ie.incident_id = $1
              AND ie.event_type = 'incident_marked_resolved_by_fulfillment'
            ORDER BY ie.occurred_at DESC
            LIMIT 1
            `,
            [incidentId]
          );

          const fulfillmentEvent = latestFulfillmentMarkEvent.rows[0] ?? null;
          if (!fulfillmentEvent) {
            throw new WorkflowError(
              "No fulfillment resolution exists for manager confirmation",
              409
            );
          }

          const fallbackResolvedByUserId =
            fulfillmentEvent.actor_user_id ?? assignment.assigned_user_id ?? null;
          if (!fallbackResolvedByUserId) {
            throw new WorkflowError(
              "Unable to determine fulfillment resolver for manager confirmation",
              409
            );
          }

          const insertedResolution = await client.query<{ id: string }>(
            `
            INSERT INTO incident_resolutions (
              incident_id,
              assignment_id,
              resolved_by_user_id,
              resolution_summary,
              completion_evidence,
              resolved_at,
              created_by_user_id,
              updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, now(), $6, $6)
            RETURNING id::text AS id
            `,
            [
              incidentId,
              assignment.id,
              fallbackResolvedByUserId,
              fulfillmentEvent.resolution_comment ??
                "Backfilled from fulfillment resolved event during manager confirmation",
              JSON.stringify({ source: "manager_confirm_resolved_backfill" }),
              actor.userId,
            ]
          );

          resolutionId = insertedResolution.rows[0]?.id ?? null;
          if (!resolutionId) {
            throw new WorkflowError(
              "Unable to create fulfillment resolution for manager confirmation",
              500
            );
          }
        }

        await client.query(
          `
          INSERT INTO manager_confirmations (
            incident_id,
            resolution_id,
            manager_user_id,
            confirmation_result,
            comments,
            created_by_user_id
          )
          VALUES ($1, $2, $3, 'approved', $4, $3)
          `,
          [incidentId, resolutionId, actor.userId, managerComment]
        );

        await appendIncidentEvent(
          client,
          incidentId,
          "incident_resolution_confirmed_by_manager",
          { actorUserId: actor.userId },
          {
            assignmentId: assignment.id,
            managerComment,
          }
        );

        return { action: body.action, transition: null };
      }

      if (body.action === "close_out") {
        const closeOutComment = body.closeOutComment?.trim() ?? null;
        const incident = await getIncidentForUpdate(client, incidentId);
        if (incident.current_status_code !== "in_progress") {
          throw new WorkflowError(
            `Cannot close out incident while it is in status ${incident.current_status_code}`,
            409
          );
        }

        const managerConfirmation = await client.query<{ id: string }>(
          `
          SELECT id
          FROM manager_confirmations
          WHERE incident_id = $1
            AND confirmation_result = 'approved'
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [incidentId]
        );

        if (!managerConfirmation.rows[0]) {
          throw new WorkflowError("Manager confirmation is required before close out", 409);
        }

        const transition = await transitionIncident(
          client,
          incidentId,
          "resolved",
          { actorUserId: actor.userId },
          "Incident closed out by admin/evaluator"
        );

        await appendIncidentEvent(
          client,
          incidentId,
          "incident_closed_out",
          { actorUserId: actor.userId },
          {
            closeOutComment,
          }
        );

        return { action: body.action, transition };
      }

      throw new WorkflowError("Unsupported action", 400);
    });

    return NextResponse.json({
      ok: true,
      action: body.action,
      transition: result.transition,
    });
  } catch (error) {
    const parsed = parseWorkflowError(error);
    return NextResponse.json({ message: parsed.message }, { status: parsed.status });
  }
}
