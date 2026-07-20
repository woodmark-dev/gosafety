DO $$
BEGIN
  CREATE TYPE department_title_enum AS ENUM (
    'manager',
    'deputy_manager',
    'officer',
    'lead'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id),
  deleted_at timestamptz
);

CREATE INDEX idx_departments_code ON departments(code) WHERE deleted_at IS NULL;
CREATE INDEX idx_departments_active ON departments(is_active) WHERE deleted_at IS NULL;

CREATE TABLE user_department_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  department_id uuid NOT NULL REFERENCES departments(id),
  department_title department_title_enum NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  updated_by_user_id uuid REFERENCES users(id)
);

CREATE INDEX idx_user_department_memberships_department_id
  ON user_department_memberships(department_id);
CREATE INDEX idx_user_department_memberships_department_title
  ON user_department_memberships(department_title);
