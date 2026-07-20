import { NextResponse } from "next/server";
import { dbQuery, dbTransaction } from "@/lib/server/db";
import {
  appendIncidentEvent,
  createIncidentNumber,
  getStatusByCode,
  parseWorkflowError,
  WorkflowError,
} from "@/lib/server/incident-workflow";

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

type IncidentListRow = {
  id: string;
  incident_no: string;
  title: string;
  reported_at: string;
  status_code: string;
  is_returned_for_reassignment: boolean;
  severity_code: string | null;
  site_name: string | null;
  detected_address: string | null;
  additional_location: string | null;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = (url.searchParams.get("scope") || "").toLowerCase();

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

    if (isStaff && !staffUserId) {
      return NextResponse.json(
        { message: "Staff session is incomplete. Please sign in again." },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    if (!isStaff && !visitorId) {
      return NextResponse.json(
        { items: [] },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    await dbQuery(`
      CREATE TABLE IF NOT EXISTS visitor_reporters (
        visitor_id text PRIMARY KEY,
        reporter_external_id uuid NOT NULL REFERENCES external_reporters(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const whereClauses = ["i.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (isStaff && canManageAllIncidents && scope === "mine") {
      if (!staffUserId) {
        return NextResponse.json(
          { items: [] },
          {
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          }
        );
      }

      params.push(staffUserId);
      whereClauses.push("i.reporter_user_id = $1");
    } else if (isStaff && !canManageAllIncidents && managerDepartmentId) {
      if (!staffUserId) {
        return NextResponse.json(
          { items: [] },
          {
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          }
        );
      }

      params.push(managerDepartmentId, staffUserId);

      if (scope === "reported") {
        whereClauses.push("i.reporter_user_id = $2");
      } else if (scope === "assigned") {
        whereClauses.push(`
          EXISTS (
            SELECT 1
            FROM incident_assignments ia
            WHERE ia.incident_id = i.id
              AND ia.assigned_user_id = $2
              AND ia.is_active = true
              AND ia.deleted_at IS NULL
          )
        `);
      } else {
        whereClauses.push(`
          (
            i.reporter_user_id = $2
            OR EXISTS (
              SELECT 1
              FROM incident_assignments ia_self
              WHERE ia_self.incident_id = i.id
                AND ia_self.assigned_user_id = $2
                AND ia_self.is_active = true
                AND ia_self.deleted_at IS NULL
            )
            OR (
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
                  AND assignee_udm.department_id::text = $1
              )
            )
          )
        `);
      }
    } else if (isStaff && !canManageAllIncidents) {
      if (!staffUserId) {
        return NextResponse.json(
          { items: [] },
          {
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          }
        );
      }

      params.push(staffUserId);
      if (scope === "reported") {
        whereClauses.push("i.reporter_user_id = $1");
      } else if (scope === "assigned") {
        whereClauses.push(`
          EXISTS (
            SELECT 1
            FROM incident_assignments ia
            WHERE ia.incident_id = i.id
              AND ia.assigned_user_id = $1
              AND ia.is_active = true
              AND ia.deleted_at IS NULL
          )
        `);
      } else {
        whereClauses.push(`
          (
            i.reporter_user_id = $1
            OR EXISTS (
              SELECT 1
              FROM incident_assignments ia
              WHERE ia.incident_id = i.id
                AND ia.assigned_user_id = $1
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
          WHERE vr.visitor_id = $1
          LIMIT 1
        )
      `);
    }

    const result = await dbQuery<IncidentListRow>(
      `
      SELECT
        i.id,
        i.incident_no,
        i.title,
        i.reported_at::text,
        st.code AS status_code,
        (
          EXISTS (
            SELECT 1
            FROM incident_events ie_ret
            WHERE ie_ret.incident_id = i.id
              AND ie_ret.event_type = 'incident_returned_to_admin'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM incident_assignments ia_active
            WHERE ia_active.incident_id = i.id
              AND ia_active.is_active = true
              AND ia_active.deleted_at IS NULL
          )
        ) AS is_returned_for_reassignment,
        sv.code AS severity_code,
        COALESCE(
          si.site_name,
          NULLIF(event_meta.event_data->>'siteName', ''),
          NULLIF(event_meta.event_data->>'locationName', ''),
          NULLIF(event_meta.event_data->>'formattedAddress', ''),
          NULLIF(event_meta.event_data->>'siteFallbackId', '')
        ) AS site_name,
        NULLIF(event_meta.event_data->>'formattedAddress', '') AS detected_address,
        NULLIF(event_meta.event_data->>'manualLocationText', '') AS additional_location
      FROM incidents i
      JOIN incident_statuses st ON st.id = i.current_status_id
      LEFT JOIN severity_levels sv ON sv.id = i.severity_id
      LEFT JOIN sites si ON si.id = i.site_id
      LEFT JOIN LATERAL (
        SELECT ie.event_data
        FROM incident_events ie
        WHERE ie.incident_id = i.id
          AND ie.event_type = 'incident_reported'
        ORDER BY ie.occurred_at DESC
        LIMIT 1
      ) event_meta ON true
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY i.reported_at DESC
      LIMIT 50
      `,
      params
    );

    return NextResponse.json(
      { items: result.rows },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to fetch incidents",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

type CreateIncidentBody = {
  title?: string;
  description?: string;
  reporterUserId?: string;
  reporterExternalId?: string;
  externalReporter?: {
    fullName?: string;
    email?: string;
    phone?: string;
    organization?: string;
    preferredContactChannel?: string;
  };
  incidentOccurredAt?: string;
  reportedAt?: string;
  siteId?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracyM?: number;
  categoryId?: string;
  severityId?: string;
  sourceChannel?: string;
  actorUserId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateIncidentBody;
    const title = body.title?.trim();
    const description = body.description?.trim();

    if (!title || !description) {
      throw new WorkflowError("title and description are required", 400);
    }

    const hasUserReporter = Boolean(body.reporterUserId);
    const hasExternalReporter = Boolean(
      body.reporterExternalId || body.externalReporter?.fullName?.trim()
    );

    if (hasUserReporter === hasExternalReporter) {
      throw new WorkflowError(
        "Provide exactly one reporter source: reporterUserId or external reporter details",
        400
      );
    }

    const result = await dbTransaction(async (client) => {
      const reportedStatus = await getStatusByCode(client, "reported");
      const draftStatus = await getStatusByCode(client, "draft");

      const draftToReported = await client.query<{ id: string }>(
        `
        SELECT id
        FROM status_transitions
        WHERE from_status_id = $1
          AND to_status_id = $2
          AND is_active = true
        LIMIT 1
        `,
        [draftStatus.id, reportedStatus.id]
      );

      if (!draftToReported.rows[0]) {
        throw new WorkflowError("Required transition draft -> reported is missing", 409);
      }

      let reporterExternalId = body.reporterExternalId ?? null;

      if (!body.reporterUserId && body.externalReporter?.fullName?.trim()) {
        const external = await client.query<{ id: string }>(
          `
          INSERT INTO external_reporters (
            full_name,
            email,
            phone,
            organization,
            preferred_contact_channel
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
          `,
          [
            body.externalReporter.fullName.trim(),
            body.externalReporter.email ?? null,
            body.externalReporter.phone ?? null,
            body.externalReporter.organization ?? null,
            body.externalReporter.preferredContactChannel ?? null,
          ]
        );
        reporterExternalId = external.rows[0].id;
      }

      const created = await client.query<{ id: string; incident_no: string }>(
        `
        INSERT INTO incidents (
          incident_no,
          reporter_user_id,
          reporter_external_id,
          title,
          description,
          reported_at,
          incident_occurred_at,
          site_id,
          latitude,
          longitude,
          location_accuracy_m,
          category_id,
          severity_id,
          current_status_id,
          source_channel,
          is_high_severity,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5,
          COALESCE($6::timestamptz, now()),
          $7::timestamptz,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          COALESCE($15, 'mobile'),
          false,
          $16,
          $16
        )
        RETURNING id, incident_no
        `,
        [
          createIncidentNumber(),
          body.reporterUserId ?? null,
          reporterExternalId,
          title,
          description,
          body.reportedAt ?? null,
          body.incidentOccurredAt ?? null,
          body.siteId ?? null,
          body.latitude ?? null,
          body.longitude ?? null,
          body.locationAccuracyM ?? null,
          body.categoryId ?? null,
          body.severityId ?? null,
          reportedStatus.id,
          body.sourceChannel ?? "mobile",
          body.actorUserId ?? null,
        ]
      );

      await client.query(
        `
        INSERT INTO incident_status_history (
          incident_id,
          from_status_id,
          to_status_id,
          changed_by_user_id,
          change_reason,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          created.rows[0].id,
          draftStatus.id,
          reportedStatus.id,
          body.actorUserId ?? null,
          "Incident reported",
          JSON.stringify({ sourceChannel: body.sourceChannel ?? "mobile" }),
        ]
      );

      await appendIncidentEvent(
        client,
        created.rows[0].id,
        "incident_reported",
        {
          actorUserId: body.actorUserId,
          actorExternalId: reporterExternalId ?? undefined,
        },
        {
          incidentNo: created.rows[0].incident_no,
          title,
        }
      );

      return created.rows[0];
    });

    return NextResponse.json(
      {
        id: result.id,
        incidentNo: result.incident_no,
        status: "reported",
      },
      { status: 201 }
    );
  } catch (error) {
    const parsed = parseWorkflowError(error);
    return NextResponse.json({ message: parsed.message }, { status: parsed.status });
  }
}
