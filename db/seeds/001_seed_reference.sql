INSERT INTO roles (code, name) VALUES
('reporter','Reporter'),
('evaluator_hse','Evaluator HSE'),
('fulfillment_member','Fulfillment Member'),
('manager','Manager'),
('safety_manager','Safety Manager'),
('admin','Administrator'),
('external_reporter','External Reporter')
ON CONFLICT (code) DO NOTHING;

INSERT INTO incident_categories (code, name) VALUES
('unsafe_condition','Unsafe Condition'),
('near_miss','Near Miss'),
('injury','Injury'),
('environmental','Environmental'),
('property_damage','Property Damage')
ON CONFLICT (code) DO NOTHING;

INSERT INTO severity_levels (code, name, rank, color) VALUES
('low','Low',1,'#22c55e'),
('medium','Medium',2,'#f59e0b'),
('high','High',3,'#ef4444'),
('critical','Critical',4,'#b91c1c')
ON CONFLICT (code) DO NOTHING;

INSERT INTO incident_statuses (code, name, sequence_no, is_terminal) VALUES
('draft','Draft',1,false),
('reported','Reported',2,false),
('under_review','Under Review',3,false),
('evaluated','Evaluated',4,false),
('assigned','Assigned',5,false),
('in_progress','In Progress',6,false),
('resolved','Resolved',7,false),
('manager_confirmed','Manager Confirmed',8,false),
('reopen_requested','Reopen Requested',9,false),
('closed','Closed',10,true),
('canceled','Canceled',11,true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO status_transitions (from_status_id, to_status_id)
SELECT s1.id, s2.id
FROM incident_statuses s1
JOIN incident_statuses s2 ON
(s1.code, s2.code) IN (
('draft','reported'),
('reported','under_review'),
('under_review','evaluated'),
('evaluated','assigned'),
('assigned','in_progress'),
('in_progress','resolved'),
('resolved','manager_confirmed'),
('manager_confirmed','closed'),
('resolved','reopen_requested'),
('manager_confirmed','reopen_requested'),
('reopen_requested','assigned'),
('reported','canceled'),
('under_review','canceled'),
('evaluated','canceled'),
('assigned','canceled'),
('in_progress','canceled')
)
ON CONFLICT (from_status_id, to_status_id) DO NOTHING;

INSERT INTO sla_rules (
  rule_name,
  category_id,
  severity_id,
  response_due_minutes,
  resolution_due_minutes,
  priority,
  is_active
)
SELECT
  'Default High/Critical Rule',
  NULL,
  s.id,
  CASE WHEN s.code = 'critical' THEN 15 ELSE 30 END,
  CASE WHEN s.code = 'critical' THEN 240 ELSE 480 END,
  10,
  true
FROM severity_levels s
WHERE s.code IN ('high', 'critical')
AND NOT EXISTS (
  SELECT 1
  FROM sla_rules r
  WHERE r.rule_name = 'Default High/Critical Rule'
    AND r.severity_id = s.id
);

INSERT INTO sla_rules (
  rule_name,
  category_id,
  severity_id,
  response_due_minutes,
  resolution_due_minutes,
  priority,
  is_active
)
SELECT
  'Default Low/Medium Rule',
  NULL,
  s.id,
  60,
  1440,
  50,
  true
FROM severity_levels s
WHERE s.code IN ('low', 'medium')
AND NOT EXISTS (
  SELECT 1
  FROM sla_rules r
  WHERE r.rule_name = 'Default Low/Medium Rule'
    AND r.severity_id = s.id
);
