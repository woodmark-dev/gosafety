import type { PoolClient } from "pg";

export class WorkflowError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "WorkflowError";
    this.status = status;
  }
}

type StatusRow = { id: string; code: string };

type IncidentRow = {
  id: string;
  incident_no: string;
  current_status_id: string;
  current_status_code: string;
};

export type Actor = {
  actorUserId?: string;
  actorExternalId?: string;
};

export function createIncidentNumber() {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate()
  ).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(
    d.getUTCMinutes()
  ).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INC-${stamp}-${random}`;
}

export async function getStatusByCode(client: PoolClient, code: string) {
  const result = await client.query<StatusRow>(
    "SELECT id, code FROM incident_statuses WHERE code = $1 LIMIT 1",
    [code]
  );

  if (!result.rows[0]) {
    throw new WorkflowError(`Unknown incident status: ${code}`, 500);
  }

  return result.rows[0];
}

export async function getIncidentForUpdate(client: PoolClient, incidentId: string) {
  const result = await client.query<IncidentRow>(
    `
    SELECT i.id, i.incident_no, i.current_status_id, st.code AS current_status_code
    FROM incidents i
    JOIN incident_statuses st ON st.id = i.current_status_id
    WHERE i.id = $1 AND i.deleted_at IS NULL
    FOR UPDATE
    `,
    [incidentId]
  );

  if (!result.rows[0]) {
    throw new WorkflowError("Incident not found", 404);
  }

  return result.rows[0];
}

export async function validateTransition(
  client: PoolClient,
  fromStatusId: string,
  toStatusId: string
) {
  const result = await client.query<{ id: string }>(
    `
    SELECT id
    FROM status_transitions
    WHERE from_status_id = $1
      AND to_status_id = $2
      AND is_active = true
    LIMIT 1
    `,
    [fromStatusId, toStatusId]
  );

  return Boolean(result.rows[0]);
}

async function appendStatusHistory(
  client: PoolClient,
  incidentId: string,
  fromStatusId: string,
  toStatusId: string,
  actor: Actor,
  reason: string,
  metadata: Record<string, unknown> = {}
) {
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
      incidentId,
      fromStatusId,
      toStatusId,
      actor.actorUserId ?? null,
      reason,
      JSON.stringify(metadata),
    ]
  );
}

export async function appendIncidentEvent(
  client: PoolClient,
  incidentId: string,
  eventType: string,
  actor: Actor,
  eventData: Record<string, unknown> = {}
) {
  await client.query(
    `
    INSERT INTO incident_events (
      incident_id,
      event_type,
      actor_user_id,
      actor_external_id,
      event_data
    )
    VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      incidentId,
      eventType,
      actor.actorUserId ?? null,
      actor.actorExternalId ?? null,
      JSON.stringify(eventData),
    ]
  );
}

export async function transitionIncident(
  client: PoolClient,
  incidentId: string,
  toStatusCode: string,
  actor: Actor,
  reason: string,
  metadata: Record<string, unknown> = {}
) {
  const incident = await getIncidentForUpdate(client, incidentId);
  const toStatus = await getStatusByCode(client, toStatusCode);

  const allowed = await validateTransition(client, incident.current_status_id, toStatus.id);

  if (!allowed) {
    throw new WorkflowError(
      `Transition not allowed: ${incident.current_status_code} -> ${toStatus.code}`,
      409
    );
  }

  await client.query(
    `
    UPDATE incidents
    SET current_status_id = $2,
        row_version = row_version + 1,
        updated_at = now(),
        updated_by_user_id = COALESCE($3, updated_by_user_id)
    WHERE id = $1
    `,
    [incidentId, toStatus.id, actor.actorUserId ?? null]
  );

  await appendStatusHistory(
    client,
    incidentId,
    incident.current_status_id,
    toStatus.id,
    actor,
    reason,
    metadata
  );

  await appendIncidentEvent(client, incidentId, "status_changed", actor, {
    fromStatus: incident.current_status_code,
    toStatus: toStatus.code,
    reason,
    ...metadata,
  });

  return {
    fromStatusCode: incident.current_status_code,
    toStatusCode: toStatus.code,
  };
}

export function parseWorkflowError(error: unknown) {
  if (error instanceof WorkflowError) {
    return { status: error.status, message: error.message };
  }

  if (error instanceof Error) {
    return { status: 500, message: error.message };
  }

  return { status: 500, message: "Unknown workflow error" };
}
