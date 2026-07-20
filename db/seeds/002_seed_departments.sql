INSERT INTO departments (code, name, description)
VALUES
  ('operations', 'Operations', 'Default operations department'),
  ('hse', 'Health, Safety and Environment', 'HSE oversight and compliance'),
  ('management', 'Management', 'Management oversight and approvals')
ON CONFLICT (code) DO NOTHING;

INSERT INTO user_department_memberships (user_id, department_id, department_title)
SELECT
  u.id,
  d.id,
  'officer'::department_title_enum
FROM users u
JOIN departments d ON d.code = 'operations'
WHERE u.deleted_at IS NULL
ON CONFLICT (user_id) DO NOTHING;
