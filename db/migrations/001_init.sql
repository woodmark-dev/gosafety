CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_no text UNIQUE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  auth_subject text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  UNIQUE (user_id, role_id)
);

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_code text NOT NULL UNIQUE,
  team_name text NOT NULL,
  team_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id),
  deleted_at timestamptz
);

CREATE TABLE team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  user_id uuid NOT NULL REFERENCES users(id),
  is_lead boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  UNIQUE (team_id, user_id)
);

CREATE TABLE external_reporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  organization text,
  preferred_contact_channel text,
  verification_status text NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_code text NOT NULL UNIQUE,
  site_name text NOT NULL,
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id),
  deleted_at timestamptz
);

CREATE TABLE incident_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE severity_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  rank smallint NOT NULL UNIQUE,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incident_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sequence_no smallint NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE status_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_status_id uuid NOT NULL REFERENCES incident_statuses(id),
  to_status_id uuid NOT NULL REFERENCES incident_statuses(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_status_id, to_status_id),
  CHECK (from_status_id <> to_status_id)
);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_no text NOT NULL UNIQUE,
  client_generated_id uuid,
  reporter_user_id uuid REFERENCES users(id),
  reporter_external_id uuid REFERENCES external_reporters(id),
  title text NOT NULL,
  description text NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  incident_occurred_at timestamptz,
  site_id uuid REFERENCES sites(id),
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_accuracy_m numeric(8,2),
  category_id uuid REFERENCES incident_categories(id),
  severity_id uuid REFERENCES severity_levels(id),
  current_status_id uuid NOT NULL REFERENCES incident_statuses(id),
  priority_score numeric(6,2),
  row_version integer NOT NULL DEFAULT 1,
  source_channel text NOT NULL DEFAULT 'mobile',
  is_high_severity boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id),
  deleted_at timestamptz,
  CHECK (
    (reporter_user_id IS NOT NULL AND reporter_external_id IS NULL) OR
    (reporter_user_id IS NULL AND reporter_external_id IS NOT NULL)
  )
);

CREATE INDEX idx_incidents_status ON incidents(current_status_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_site ON incidents(site_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_severity ON incidents(severity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_reported_at ON incidents(reported_at DESC);
CREATE UNIQUE INDEX uq_incidents_client_generated_id ON incidents(client_generated_id) WHERE client_generated_id IS NOT NULL;

CREATE TABLE incident_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  client_generated_id uuid,
  attachment_type text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  file_size_bytes bigint NOT NULL,
  checksum_sha256 text,
  captured_at timestamptz,
  uploaded_at timestamptz,
  gps_latitude numeric(9,6),
  gps_longitude numeric(9,6),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id),
  deleted_at timestamptz
);

CREATE INDEX idx_attachments_incident ON incident_attachments(incident_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_attachments_client_generated_id ON incident_attachments(client_generated_id) WHERE client_generated_id IS NOT NULL;

CREATE TABLE incident_transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  attachment_id uuid REFERENCES incident_attachments(id),
  language_code text,
  transcript_text text NOT NULL,
  confidence_score numeric(5,4),
  engine text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id)
);

CREATE INDEX idx_transcriptions_incident ON incident_transcriptions(incident_id);

CREATE TABLE incident_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  evaluator_user_id uuid NOT NULL REFERENCES users(id),
  category_id uuid NOT NULL REFERENCES incident_categories(id),
  severity_id uuid NOT NULL REFERENCES severity_levels(id),
  assigned_team_id uuid REFERENCES teams(id),
  evaluation_notes text,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id)
);

CREATE INDEX idx_evaluations_incident ON incident_evaluations(incident_id);
CREATE INDEX idx_evaluations_evaluator ON incident_evaluations(evaluator_user_id, evaluated_at DESC);

CREATE TABLE incident_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  assigned_team_id uuid NOT NULL REFERENCES teams(id),
  assigned_user_id uuid REFERENCES users(id),
  assigned_by_user_id uuid NOT NULL REFERENCES users(id),
  assignment_notes text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id),
  deleted_at timestamptz
);

CREATE INDEX idx_assignments_active ON incident_assignments(incident_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_assignments_user_active ON incident_assignments(assigned_user_id, is_active) WHERE deleted_at IS NULL;

CREATE TABLE incident_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  assignment_id uuid REFERENCES incident_assignments(id),
  resolved_by_user_id uuid NOT NULL REFERENCES users(id),
  resolution_summary text NOT NULL,
  completion_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id)
);

CREATE INDEX idx_resolutions_incident ON incident_resolutions(incident_id, resolved_at DESC);

CREATE TABLE manager_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  resolution_id uuid NOT NULL REFERENCES incident_resolutions(id),
  manager_user_id uuid NOT NULL REFERENCES users(id),
  confirmation_result text NOT NULL CHECK (confirmation_result IN ('approved','rejected')),
  comments text,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id)
);

CREATE INDEX idx_manager_confirm_pending ON manager_confirmations(incident_id, confirmed_at DESC);

CREATE TABLE incident_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL UNIQUE REFERENCES incidents(id),
  closure_notes text,
  closed_by_user_id uuid NOT NULL REFERENCES users(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id)
);

CREATE TABLE incident_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  sender_user_id uuid REFERENCES users(id),
  sender_external_id uuid REFERENCES external_reporters(id),
  recipient_user_id uuid REFERENCES users(id),
  recipient_external_id uuid REFERENCES external_reporters(id),
  message text NOT NULL,
  visibility_scope text NOT NULL DEFAULT 'submitter_and_staff',
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (
    (sender_user_id IS NOT NULL AND sender_external_id IS NULL) OR
    (sender_user_id IS NULL AND sender_external_id IS NOT NULL)
  )
);

CREATE INDEX idx_feedback_incident ON incident_feedback(incident_id, sent_at);

CREATE TABLE sla_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  category_id uuid REFERENCES incident_categories(id),
  severity_id uuid REFERENCES severity_levels(id),
  site_id uuid REFERENCES sites(id),
  response_due_minutes integer NOT NULL CHECK (response_due_minutes > 0),
  resolution_due_minutes integer NOT NULL CHECK (resolution_due_minutes > 0),
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id)
);

CREATE INDEX idx_sla_rules_match ON sla_rules(is_active, priority, category_id, severity_id, site_id);

CREATE TABLE incident_sla_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL UNIQUE REFERENCES incidents(id),
  sla_rule_id uuid NOT NULL REFERENCES sla_rules(id),
  started_at timestamptz NOT NULL,
  response_due_at timestamptz NOT NULL,
  resolution_due_at timestamptz NOT NULL,
  response_met_at timestamptz,
  resolution_met_at timestamptz,
  response_breached boolean NOT NULL DEFAULT false,
  resolution_breached boolean NOT NULL DEFAULT false,
  breached_at timestamptz,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id)
);

CREATE INDEX idx_incident_sla_due ON incident_sla_instances(resolution_due_at, resolution_breached);

CREATE TABLE notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES incidents(id),
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  triggered_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_events_type_time ON notification_events(event_type, triggered_at DESC);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_event_id uuid NOT NULL REFERENCES notification_events(id),
  recipient_user_id uuid REFERENCES users(id),
  recipient_external_id uuid REFERENCES external_reporters(id),
  recipient_contact text,
  channel text NOT NULL CHECK (channel IN ('in_app','email','sms','push')),
  status text NOT NULL CHECK (status IN ('queued','sent','failed','dead_letter')) DEFAULT 'queued',
  priority smallint NOT NULL DEFAULT 5,
  subject text,
  message text NOT NULL,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  attempt_count integer NOT NULL DEFAULT 0,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    recipient_user_id IS NOT NULL OR
    recipient_external_id IS NOT NULL OR
    recipient_contact IS NOT NULL
  )
);

CREATE INDEX idx_notifications_queue ON notifications(status, scheduled_at);
CREATE UNIQUE INDEX uq_notifications_idempotency ON notifications(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id),
  attempt_number integer NOT NULL,
  provider text,
  provider_message_id text,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, attempt_number)
);

CREATE TABLE client_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid uuid NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id),
  platform text NOT NULL,
  app_version text,
  os_version text,
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE sync_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_device_id uuid NOT NULL REFERENCES client_devices(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  session_status text NOT NULL CHECK (session_status IN ('started','completed','failed')) DEFAULT 'started',
  total_operations integer NOT NULL DEFAULT 0,
  applied_operations integer NOT NULL DEFAULT 0,
  conflicted_operations integer NOT NULL DEFAULT 0,
  failed_operations integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_sessions_device ON sync_sessions(client_device_id, started_at DESC);

CREATE TABLE sync_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_session_id uuid NOT NULL REFERENCES sync_sessions(id),
  operation_uuid uuid NOT NULL,
  entity_type text NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('insert','update','delete','upload_attachment')),
  client_generated_id uuid,
  server_entity_id uuid,
  client_version integer,
  expected_server_version integer,
  resulting_server_version integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_checksum text,
  local_updated_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  operation_status text NOT NULL CHECK (operation_status IN ('received','applied','conflicted','rejected')) DEFAULT 'received',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sync_session_id, operation_uuid)
);

CREATE INDEX idx_sync_operations_status ON sync_operations(operation_status, received_at DESC);
CREATE INDEX idx_sync_operations_entity ON sync_operations(entity_type, client_generated_id);

CREATE TABLE sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_operation_id uuid NOT NULL REFERENCES sync_operations(id),
  conflict_type text NOT NULL,
  client_payload jsonb NOT NULL,
  server_snapshot jsonb NOT NULL,
  resolution_status text NOT NULL CHECK (resolution_status IN ('open','resolved_client_wins','resolved_server_wins','resolved_merge')) DEFAULT 'open',
  resolved_by_user_id uuid REFERENCES users(id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_conflicts_open ON sync_conflicts(resolution_status, created_at DESC);

CREATE TABLE incident_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  from_status_id uuid REFERENCES incident_statuses(id),
  to_status_id uuid NOT NULL REFERENCES incident_statuses(id),
  changed_by_user_id uuid REFERENCES users(id),
  change_reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_status_history_incident_time ON incident_status_history(incident_id, changed_at DESC);

CREATE TABLE incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  actor_external_id uuid REFERENCES external_reporters(id),
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_events_incident_time ON incident_events(incident_id, occurred_at DESC);
CREATE INDEX idx_incident_events_type ON incident_events(event_type, occurred_at DESC);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  actor_external_id uuid REFERENCES external_reporters(id),
  actor_ip inet,
  actor_user_agent text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_user_id, created_at DESC);
