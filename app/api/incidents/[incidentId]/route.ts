import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/server/db";

export const dynamic = "force-dynamic";

const STAFF_COOKIE = "gosafety_staff_auth";
const STAFF_USER_COOKIE = "gosafety_staff_user_id";
const STAFF_ADMIN_COOKIE = "gosafety_staff_admin";
const VISITOR_COOKIE = "gosafety_visitor_id";

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

type DetailRow = {
  id: string;
  incident_no: string;
  title: string;
  description: string;
  reported_at: string;
  status_code: string;
  status_name: string;
  category_id: string | null;
  category_code: string | null;
  category_name: string | null;
  severity_id: string | null;
  severity_code: string | null;
  severity_name: string | null;
  site_name: string | null;
  latitude: string | null;
  longitude: string | null;
  location_accuracy_m: string | null;
  source_channel: string;
  is_high_severity: boolean;
  reporter_user_id: string | null;
  reporter_external_id: string | null;
  reporter_user_name: string | null;
  reporter_user_email: string | null;
  reporter_external_name: string | null;
  reporter_external_email: string | null;
  reporter_external_phone: string | null;
  reporter_external_preferred_contact_channel: string | null;
  event_data: Record<string, unknown> | null;
};

type AttachmentRow = {
  id: string;
  file_name: string;
  mime_type: string;
  storage_key: string;
  file_size_bytes: string;
  captured_at: string | null;
  public_url: string | null;
};

type TimelineRow = {
  id: string;
  changed_at: string;
  change_reason: string | null;
  from_status_code: string | null;
  from_status_name: string | null;
  to_status_code: string;
  to_status_name: string;
};

type ActiveAssignmentRow = {
  id: string;
  assigned_at: string;
  assignment_notes: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_user_email: string | null;
  assigned_user_department_id: string | null;
  assigned_user_department_name: string | null;
  team_id: string;
  team_name: string;
};

type LatestReturnRow = {
  return_comment: string | null;
  returned_at: string;
  returned_by_user_id: string | null;
  returned_by_name: string | null;
  returned_by_email: string | null;
};

type CurrentSlaRow = {
  sla_rule_id: string;
  rule_name: string;
  started_at: string;
  response_due_at: string;
  resolution_due_at: string;
  response_met_at: string | null;
  resolution_met_at: string | null;
  response_breached: boolean;
  resolution_breached: boolean;
  breached_at: string | null;
};

type LatestManagerConfirmationRow = {
  confirmation_result: "approved" | "rejected";
  comments: string | null;
  created_at: string;
  manager_user_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
};

export async function GET(request: Request, context: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await context.params;
    const cookieHeader = request.headers.get("cookie") ?? "";
    const isStaff = readCookie(cookieHeader, STAFF_COOKIE) === "1";
    const staffUserId = readCookie(cookieHeader, STAFF_USER_COOKIE);
    const isStaffAdmin = readCookie(cookieHeader, STAFF_ADMIN_COOKIE) === "1";
    const visitorId = readCookie(cookieHeader, VISITOR_COOKIE);
    const roleCodes =
      isStaff && staffUserId
        ? (
            await dbQuery<{ code: string }>(
              `
              SELECT r.code
              FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = $1
              `,
              [staffUserId]
            )
          ).rows.map((row) => row.code)
        : [];
    const managerMembership =
      isStaff && staffUserId
        ? await dbQuery<{ department_id: string; department_title: string }>(
            `
            SELECT department_id::text, department_title::text
            FROM user_department_memberships
            WHERE user_id = $1
            LIMIT 1
            `,
            [staffUserId]
          )
        : { rows: [] as Array<{ department_id: string; department_title: string }> };
    const managerDepartmentId =
      managerMembership.rows[0]?.department_title === "manager"
        ? managerMembership.rows[0].department_id
        : null;
    const isDepartmentManager = Boolean(managerDepartmentId);
    const canManageAllIncidents =
      roleCodes.includes("admin") || roleCodes.includes("evaluator_hse");
    const canViewSla = canManageAllIncidents || roleCodes.includes("fulfillment_member");

    if (!isStaff && !visitorId) {
      return NextResponse.json({ message: "Incident not found" }, { status: 404 });
    }

    await dbQuery(`
      CREATE TABLE IF NOT EXISTS visitor_reporters (
        visitor_id text PRIMARY KEY,
        reporter_external_id uuid NOT NULL REFERENCES external_reporters(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const whereClauses = ["i.id = $1", "i.deleted_at IS NULL"];
    const params: unknown[] = [incidentId];

    if (isStaff && !canManageAllIncidents) {
      if (!staffUserId) {
        return NextResponse.json({ message: "Incident not found" }, { status: 404 });
      }

      if (managerDepartmentId) {
        params.push(managerDepartmentId);
        whereClauses.push(`
          (
            i.current_status_id = (
              SELECT id
              FROM incident_statuses
              WHERE code = 'in_progress'
              LIMIT 1
            )
            AND EXISTS (
              SELECT 1
              FROM incident_events ie
              WHERE ie.incident_id = i.id
                AND ie.event_type = 'incident_marked_resolved_by_fulfillment'
            )
            AND EXISTS (
              SELECT 1
              FROM incident_assignments ia
              JOIN user_department_memberships assignee_udm ON assignee_udm.user_id = ia.assigned_user_id
              WHERE ia.incident_id = i.id
                AND ia.is_active = true
                AND ia.deleted_at IS NULL
                AND assignee_udm.department_id::text = $2
            )
          )
        `);
      } else {
        params.push(staffUserId);
        whereClauses.push(`
          (
            i.reporter_user_id = $2
            OR EXISTS (
              SELECT 1
              FROM incident_assignments ia
              WHERE ia.incident_id = i.id
                AND ia.assigned_user_id = $2
                AND ia.is_active = true
                AND ia.deleted_at IS NULL
            )
          )
        `);
      }
    } else if (!isStaff) {
      params.push(visitorId);
      whereClauses.push(`
        i.reporter_external_id = (
          SELECT vr.reporter_external_id
          FROM visitor_reporters vr
          WHERE vr.visitor_id = $2
          LIMIT 1
        )
      `);
    }

    const detailResult = await dbQuery<DetailRow>(
      `
      SELECT
        i.id,
        i.incident_no,
        i.title,
        i.description,
        i.reported_at::text,
        st.code AS status_code,
        st.name AS status_name,
        i.category_id::text AS category_id,
        cat.code AS category_code,
        cat.name AS category_name,
        i.severity_id::text AS severity_id,
        sv.code AS severity_code,
        sv.name AS severity_name,
        COALESCE(
          si.site_name,
          NULLIF(event_meta.event_data->>'siteName', ''),
          NULLIF(event_meta.event_data->>'locationName', ''),
          NULLIF(event_meta.event_data->>'formattedAddress', ''),
          NULLIF(event_meta.event_data->>'siteFallbackId', '')
        ) AS site_name,
        i.latitude::text,
        i.longitude::text,
        i.location_accuracy_m::text,
        i.source_channel,
        i.is_high_severity,
        i.reporter_user_id::text,
        i.reporter_external_id::text,
        u.full_name AS reporter_user_name,
        u.email AS reporter_user_email,
        er.full_name AS reporter_external_name,
        er.email AS reporter_external_email,
        er.phone AS reporter_external_phone,
        er.preferred_contact_channel AS reporter_external_preferred_contact_channel,
        event_meta.event_data
      FROM incidents i
      JOIN incident_statuses st ON st.id = i.current_status_id
      LEFT JOIN incident_categories cat ON cat.id = i.category_id
      LEFT JOIN severity_levels sv ON sv.id = i.severity_id
      LEFT JOIN sites si ON si.id = i.site_id
      LEFT JOIN users u ON u.id = i.reporter_user_id
      LEFT JOIN external_reporters er ON er.id = i.reporter_external_id
      LEFT JOIN LATERAL (
        SELECT ie.event_data
        FROM incident_events ie
        WHERE ie.incident_id = i.id
          AND ie.event_type = 'incident_reported'
        ORDER BY ie.occurred_at DESC
        LIMIT 1
      ) event_meta ON true
      WHERE ${whereClauses.join(" AND ")}
      LIMIT 1
      `,
      params
    );

    const detail = detailResult.rows[0];

    if (!detail) {
      return NextResponse.json({ message: "Incident not found" }, { status: 404 });
    }

    const attachmentsResult = await dbQuery<AttachmentRow>(
      `
      SELECT
        ia.id,
        ia.file_name,
        ia.mime_type,
        ia.storage_key,
        ia.file_size_bytes::text,
        ia.captured_at::text,
        COALESCE(
          NULLIF(ia.metadata->>'publicUrl', ''),
          CASE WHEN ia.storage_key LIKE '/%' THEN ia.storage_key ELSE NULL END
        ) AS public_url
      FROM incident_attachments ia
      WHERE ia.incident_id = $1
        AND ia.deleted_at IS NULL
      ORDER BY ia.captured_at ASC NULLS LAST, ia.created_at ASC
      `,
      [incidentId]
    );

    const timelineResult = await dbQuery<TimelineRow>(
      `
      SELECT
        h.id,
        h.changed_at::text,
        h.change_reason,
        fs.code AS from_status_code,
        fs.name AS from_status_name,
        ts.code AS to_status_code,
        ts.name AS to_status_name
      FROM incident_status_history h
      LEFT JOIN incident_statuses fs ON fs.id = h.from_status_id
      JOIN incident_statuses ts ON ts.id = h.to_status_id
      WHERE h.incident_id = $1
      ORDER BY h.changed_at ASC
      `,
      [incidentId]
    );

    const activeAssignmentResult = await dbQuery<ActiveAssignmentRow>(
      `
      SELECT
        ia.id,
        ia.assigned_at::text,
        ia.assignment_notes,
        ia.assigned_user_id::text,
        u.full_name AS assigned_user_name,
        u.email AS assigned_user_email,
        udm.department_id::text AS assigned_user_department_id,
        d.name AS assigned_user_department_name,
        ia.assigned_team_id::text AS team_id,
        t.team_name
      FROM incident_assignments ia
      JOIN teams t ON t.id = ia.assigned_team_id
      LEFT JOIN users u ON u.id = ia.assigned_user_id
      LEFT JOIN user_department_memberships udm ON udm.user_id = ia.assigned_user_id
      LEFT JOIN departments d ON d.id = udm.department_id AND d.deleted_at IS NULL
      WHERE ia.incident_id = $1
        AND ia.is_active = true
        AND ia.deleted_at IS NULL
      ORDER BY ia.assigned_at DESC
      LIMIT 1
      `,
      [incidentId]
    );

    const latestReturnResult = await dbQuery<LatestReturnRow>(
      `
      SELECT
        NULLIF(ie.event_data->>'returnComment', '') AS return_comment,
        ie.occurred_at::text AS returned_at,
        ie.actor_user_id::text AS returned_by_user_id,
        u.full_name AS returned_by_name,
        u.email AS returned_by_email
      FROM incident_events ie
      LEFT JOIN users u ON u.id = ie.actor_user_id
      WHERE ie.incident_id = $1
        AND ie.event_type = 'incident_returned_to_admin'
      ORDER BY ie.occurred_at DESC
      LIMIT 1
      `,
      [incidentId]
    );

    const currentSlaResult = canViewSla
      ? await dbQuery<CurrentSlaRow>(
          `
          SELECT
            s.sla_rule_id::text,
            r.rule_name,
            s.started_at::text,
            s.response_due_at::text,
            s.resolution_due_at::text,
            s.response_met_at::text,
            s.resolution_met_at::text,
            s.response_breached,
            s.resolution_breached,
            s.breached_at::text
          FROM incident_sla_instances s
          JOIN sla_rules r ON r.id = s.sla_rule_id
          WHERE s.incident_id = $1
          LIMIT 1
          `,
          [incidentId]
        )
      : { rows: [] as CurrentSlaRow[] };

    const latestManagerConfirmationResult = await dbQuery<LatestManagerConfirmationRow>(
      `
      SELECT
        mc.confirmation_result,
        mc.comments,
        mc.created_at::text,
        mc.manager_user_id::text,
        u.full_name AS manager_name,
        u.email AS manager_email
      FROM manager_confirmations mc
      LEFT JOIN users u ON u.id = mc.manager_user_id
      WHERE mc.incident_id = $1
      ORDER BY mc.created_at DESC
      LIMIT 1
      `,
      [incidentId]
    );

    const eventData = detail.event_data ?? {};

    return NextResponse.json({
      incident: {
        id: detail.id,
        incidentNo: detail.incident_no,
        title: detail.title,
        description: detail.description,
        reportedAt: detail.reported_at,
        statusCode: detail.status_code,
        statusName: detail.status_name,
        categoryId: detail.category_id,
        categoryCode: detail.category_code,
        categoryName: detail.category_name,
        severityId: detail.severity_id,
        severityCode: detail.severity_code,
        severityName: detail.severity_name,
        sourceChannel: detail.source_channel,
        isHighSeverity: detail.is_high_severity,
        submittedBy: detail.reporter_user_id
          ? {
              type: "staff",
              id: detail.reporter_user_id,
              name: detail.reporter_user_name,
              email: detail.reporter_user_email,
            }
          : {
              type: "visitor",
              id: detail.reporter_external_id,
              name: detail.reporter_external_name,
              email: detail.reporter_external_email,
              phone: detail.reporter_external_phone,
              preferredContactChannel: detail.reporter_external_preferred_contact_channel,
            },
        location: {
          siteName: detail.site_name,
          detectedAddress:
            typeof eventData.formattedAddress === "string" ? eventData.formattedAddress : null,
          additionalLocation:
            typeof eventData.manualLocationText === "string" ? eventData.manualLocationText : null,
          locationName: typeof eventData.locationName === "string" ? eventData.locationName : null,
          locality: typeof eventData.locality === "string" ? eventData.locality : null,
          region: typeof eventData.region === "string" ? eventData.region : null,
          country: typeof eventData.country === "string" ? eventData.country : null,
          latitude: detail.latitude,
          longitude: detail.longitude,
          accuracyM: detail.location_accuracy_m,
        },
      },
      photos: attachmentsResult.rows.map((row) => ({
        id: row.id,
        fileName: row.file_name,
        mimeType: row.mime_type,
        publicUrl: row.public_url,
        storageKey: row.storage_key,
        sizeBytes: Number(row.file_size_bytes),
        capturedAt: row.captured_at,
      })),
      timeline: timelineResult.rows.map((row) => ({
        id: row.id,
        changedAt: row.changed_at,
        reason: row.change_reason,
        fromStatusCode: row.from_status_code,
        fromStatusName: row.from_status_name,
        toStatusCode: row.to_status_code,
        toStatusName: row.to_status_name,
      })),
      currentAssignment: activeAssignmentResult.rows[0]
        ? {
            id: activeAssignmentResult.rows[0].id,
            assignedAt: activeAssignmentResult.rows[0].assigned_at,
            assignmentNotes: activeAssignmentResult.rows[0].assignment_notes,
            assignedUserId: activeAssignmentResult.rows[0].assigned_user_id,
            assignedUserName: activeAssignmentResult.rows[0].assigned_user_name,
            assignedUserEmail: activeAssignmentResult.rows[0].assigned_user_email,
            assignedUserDepartmentId: activeAssignmentResult.rows[0].assigned_user_department_id,
            assignedUserDepartmentName:
              activeAssignmentResult.rows[0].assigned_user_department_name,
            teamId: activeAssignmentResult.rows[0].team_id,
            teamName: activeAssignmentResult.rows[0].team_name,
          }
        : null,
      latestReturn: latestReturnResult.rows[0]
        ? {
            comment: latestReturnResult.rows[0].return_comment,
            returnedAt: latestReturnResult.rows[0].returned_at,
            returnedByUserId: latestReturnResult.rows[0].returned_by_user_id,
            returnedByName: latestReturnResult.rows[0].returned_by_name,
            returnedByEmail: latestReturnResult.rows[0].returned_by_email,
          }
        : null,
      currentSla: currentSlaResult.rows[0]
        ? {
            slaRuleId: currentSlaResult.rows[0].sla_rule_id,
            ruleName: currentSlaResult.rows[0].rule_name,
            startedAt: currentSlaResult.rows[0].started_at,
            responseDueAt: currentSlaResult.rows[0].response_due_at,
            resolutionDueAt: currentSlaResult.rows[0].resolution_due_at,
            responseMetAt: currentSlaResult.rows[0].response_met_at,
            resolutionMetAt: currentSlaResult.rows[0].resolution_met_at,
            responseBreached: currentSlaResult.rows[0].response_breached,
            resolutionBreached: currentSlaResult.rows[0].resolution_breached,
            breachedAt: currentSlaResult.rows[0].breached_at,
          }
        : null,
      latestManagerConfirmation: latestManagerConfirmationResult.rows[0]
        ? {
            confirmationResult: latestManagerConfirmationResult.rows[0].confirmation_result,
            comments: latestManagerConfirmationResult.rows[0].comments,
            createdAt: latestManagerConfirmationResult.rows[0].created_at,
            managerUserId: latestManagerConfirmationResult.rows[0].manager_user_id,
            managerName: latestManagerConfirmationResult.rows[0].manager_name,
            managerEmail: latestManagerConfirmationResult.rows[0].manager_email,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to fetch incident details",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
