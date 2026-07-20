import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { dbTransaction } from "@/lib/server/db";
import { createIncidentNumber, getStatusByCode } from "@/lib/server/incident-workflow";
import type { IncidentDraft } from "@/lib/report-types";

type SubmitBody = {
  idempotencyKey?: string;
  draft?: IncidentDraft;
};

class SubmitValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SubmitValidationError";
    this.status = status;
  }
}

const VISITOR_COOKIE = "gosafety_visitor_id";
const STAFF_COOKIE = "gosafety_staff_auth";
const STAFF_USER_COOKIE = "gosafety_staff_user_id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuidOrNull(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return UUID_RE.test(trimmed) ? trimmed : null;
}

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

function normalizePreferredContactChannel(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "email" || normalized === "phone" || normalized === "either") {
    return normalized;
  }
  if (normalized === "phone number") {
    return "phone";
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const isStaff = readCookie(cookieHeader, STAFF_COOKIE) === "1";
    const staffUserId = isStaff ? readCookie(cookieHeader, STAFF_USER_COOKIE)?.trim() : null;
    const existingVisitorId = readCookie(cookieHeader, VISITOR_COOKIE)?.trim();
    const visitorId = existingVisitorId || randomUUID();

    const body = (await request.json()) as SubmitBody;
    const idempotencyKey = body.idempotencyKey?.trim();
    const draft = body.draft;
    const reporterUserId = staffUserId || null;

    if (isStaff && !staffUserId) {
      return NextResponse.json(
        {
          message: "Staff session is incomplete. Please sign in again before submitting.",
        },
        { status: 401 }
      );
    }

    if (!idempotencyKey || !draft) {
      return NextResponse.json(
        { message: "idempotencyKey and draft are required" },
        { status: 400 }
      );
    }

    if (!draft.photos || draft.photos.length === 0) {
      return NextResponse.json({ message: "At least one photo is required" }, { status: 400 });
    }

    if (!draft.details.title?.trim() || !draft.details.description?.trim()) {
      return NextResponse.json({ message: "Title and description are required" }, { status: 400 });
    }

    const normalizedSiteId = asUuidOrNull(draft.location.siteId);
    const scopedIdempotencyKey = reporterUserId
      ? `staff:${reporterUserId}:${idempotencyKey}`
      : idempotencyKey;

    const result = await dbTransaction(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS visitor_reporters (
          visitor_id text PRIMARY KEY,
          reporter_external_id uuid NOT NULL REFERENCES external_reporters(id),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS report_submission_keys (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          idempotency_key text NOT NULL UNIQUE,
          incident_id uuid NOT NULL REFERENCES incidents(id),
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const existing = reporterUserId
        ? await client.query<{ incident_id: string; incident_no: string }>(
            `
            SELECT r.incident_id, i.incident_no
            FROM report_submission_keys r
            JOIN incidents i ON i.id = r.incident_id
            WHERE r.idempotency_key = $1
               OR (r.idempotency_key = $2 AND i.reporter_user_id = $3)
            LIMIT 1
            `,
            [scopedIdempotencyKey, idempotencyKey, reporterUserId]
          )
        : await client.query<{ incident_id: string; incident_no: string }>(
            `
            SELECT r.incident_id, i.incident_no
            FROM report_submission_keys r
            JOIN incidents i ON i.id = r.incident_id
            WHERE r.idempotency_key = $1
            LIMIT 1
            `,
            [scopedIdempotencyKey]
          );

      if (existing.rows[0]) {
        return {
          incidentId: existing.rows[0].incident_id,
          incidentNo: existing.rows[0].incident_no,
          idempotentReplay: true,
        };
      }

      let reporterExternalId: string | null = null;
      const reporterName = draft.details.reporterName?.trim() || "";
      const reporterEmail = draft.details.reporterEmail?.trim() || "";
      const reporterPhone = draft.details.reporterPhone?.trim() || "";
      const preferredContactChannel = normalizePreferredContactChannel(
        draft.details.preferredContactChannel
      );
      const hasRequiredVisitorContact =
        Boolean(reporterName) &&
        Boolean(reporterEmail) &&
        Boolean(reporterPhone) &&
        Boolean(preferredContactChannel);

      if (!reporterUserId) {
        const mappedReporter = await client.query<{ reporter_external_id: string }>(
          `
          SELECT reporter_external_id
          FROM visitor_reporters
          WHERE visitor_id = $1
          LIMIT 1
          `,
          [visitorId]
        );

        reporterExternalId = mappedReporter.rows[0]?.reporter_external_id ?? null;

        if (!reporterExternalId && !hasRequiredVisitorContact) {
          throw new SubmitValidationError(
            "Visitor contact details are required: name, email, phone number, and preferred contact method"
          );
        }
      }

      if (!reporterUserId && !reporterExternalId) {
        const reporter = await client.query<{ id: string }>(
          `
          INSERT INTO external_reporters (full_name, email, phone, organization, preferred_contact_channel)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
          `,
          [
            reporterName || "External Reporter",
            reporterEmail || null,
            reporterPhone || null,
            "External",
            preferredContactChannel,
          ]
        );

        reporterExternalId = reporter.rows[0].id;

        await client.query(
          `
          INSERT INTO visitor_reporters (visitor_id, reporter_external_id)
          VALUES ($1, $2)
          ON CONFLICT (visitor_id)
          DO UPDATE SET reporter_external_id = EXCLUDED.reporter_external_id, updated_at = now()
          `,
          [visitorId, reporterExternalId]
        );
      } else if (!reporterUserId && reporterExternalId) {
        if (!hasRequiredVisitorContact) {
          // Backward compatibility: allow legacy queued drafts to submit using existing visitor mapping.
          // New reports are still enforced to provide these fields before first mapping is created.
        } else {
          await client.query(
            `
          UPDATE external_reporters
          SET
            full_name = $2,
            email = $3,
            phone = $4,
            preferred_contact_channel = $5,
            updated_at = now()
          WHERE id = $1
          `,
            [
              reporterExternalId,
              reporterName || "External Reporter",
              reporterEmail || null,
              reporterPhone || null,
              preferredContactChannel,
            ]
          );
        }
      }

      const reportedStatus = await getStatusByCode(client, "reported");
      const draftStatus = await getStatusByCode(client, "draft");

      const incident = await client.query<{ id: string; incident_no: string }>(
        `
        INSERT INTO incidents (
          incident_no,
          reporter_user_id,
          reporter_external_id,
          title,
          description,
          reported_at,
          site_id,
          latitude,
          longitude,
          location_accuracy_m,
          category_id,
          severity_id,
          current_status_id,
          source_channel,
          is_high_severity
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          now(),
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          'mobile',
          EXISTS (SELECT 1 FROM severity_levels s WHERE s.id = $11 AND s.code IN ('high', 'critical'))
        )
        RETURNING id, incident_no
        `,
        [
          createIncidentNumber(),
          reporterUserId,
          reporterExternalId,
          draft.details.title.trim(),
          draft.details.description.trim(),
          normalizedSiteId,
          draft.location.lat ?? null,
          draft.location.lng ?? null,
          draft.location.accuracy ?? null,
          draft.details.categoryId || null,
          draft.details.severityId || null,
          reportedStatus.id,
        ]
      );

      await client.query(
        `
        INSERT INTO incident_status_history (
          incident_id,
          from_status_id,
          to_status_id,
          change_reason,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          incident.rows[0].id,
          draftStatus.id,
          reportedStatus.id,
          "Incident submitted via report wizard",
          JSON.stringify({ idempotencyKey }),
        ]
      );

      for (const photo of draft.photos) {
        await client.query(
          `
          INSERT INTO incident_attachments (
            incident_id,
            attachment_type,
            file_name,
            mime_type,
            storage_key,
            file_size_bytes,
            captured_at,
            metadata
          )
          VALUES ($1, 'photo', $2, $3, $4, $5, $6::timestamptz, $7::jsonb)
          `,
          [
            incident.rows[0].id,
            photo.filename,
            photo.mimeType,
            photo.publicUrl || photo.serverPath || photo.filename,
            photo.size,
            photo.createdAt,
            JSON.stringify({ source: photo.source, publicUrl: photo.publicUrl ?? null }),
          ]
        );
      }

      await client.query(
        `
        INSERT INTO incident_events (incident_id, event_type, actor_user_id, actor_external_id, event_data)
        VALUES ($1, 'incident_reported', $2, $3, $4::jsonb)
        `,
        [
          incident.rows[0].id,
          reporterUserId,
          reporterExternalId,
          JSON.stringify({
            locationSource: draft.location.source ?? null,
            locationName: draft.location.locationName ?? null,
            formattedAddress: draft.location.formattedAddress ?? null,
            locality: draft.location.locality ?? null,
            region: draft.location.region ?? null,
            country: draft.location.country ?? null,
            siteId: normalizedSiteId,
            siteFallbackId: normalizedSiteId ? null : (draft.location.siteId ?? null),
            siteName: draft.location.siteName ?? null,
            manualLocationText: draft.location.manualLocationText ?? null,
            photoCount: draft.photos.length,
          }),
        ]
      );

      await client.query(
        "INSERT INTO report_submission_keys (idempotency_key, incident_id) VALUES ($1, $2)",
        [scopedIdempotencyKey, incident.rows[0].id]
      );

      return {
        incidentId: incident.rows[0].id,
        incidentNo: incident.rows[0].incident_no,
        idempotentReplay: false,
      };
    });

    const response = NextResponse.json(result, { status: 201 });

    if (!staffUserId) {
      response.cookies.set({
        name: VISITOR_COOKIE,
        value: visitorId,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (error) {
    const status = error instanceof SubmitValidationError ? error.status : 500;
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        message: status === 500 ? "Failed to submit report" : detail,
        error: detail,
      },
      { status }
    );
  }
}
