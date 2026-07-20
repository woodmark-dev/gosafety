import { dbQuery } from "@/lib/server/db";
import type { DepartmentMembership, DepartmentTitle } from "@/lib/types/department";

const DEFAULT_DEPARTMENT_CODE = "operations";
const DEFAULT_DEPARTMENT_TITLE: DepartmentTitle = "officer";

type DepartmentMembershipRow = {
  user_id: string;
  department_id: string;
  department_code: string;
  department_name: string;
  department_title: DepartmentTitle;
};

function toDepartmentMembership(row: DepartmentMembershipRow): DepartmentMembership {
  return {
    userId: row.user_id,
    departmentId: row.department_id,
    departmentCode: row.department_code,
    departmentName: row.department_name,
    departmentTitle: row.department_title,
  };
}

export async function getDepartmentMembershipByUserId(
  userId: string
): Promise<DepartmentMembership | null> {
  const result = await dbQuery<DepartmentMembershipRow>(
    `
    SELECT
      udm.user_id,
      udm.department_id,
      d.code AS department_code,
      d.name AS department_name,
      udm.department_title::text AS department_title
    FROM user_department_memberships udm
    JOIN departments d ON d.id = udm.department_id
    WHERE udm.user_id = $1
      AND d.deleted_at IS NULL
    LIMIT 1
    `,
    [userId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return toDepartmentMembership(result.rows[0]);
}

export async function ensureDefaultDepartmentMembership(userId: string): Promise<void> {
  await dbQuery(
    `
    INSERT INTO user_department_memberships (user_id, department_id, department_title)
    SELECT $1, d.id, $3::department_title_enum
    FROM departments d
    WHERE d.code = $2
      AND d.deleted_at IS NULL
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId, DEFAULT_DEPARTMENT_CODE, DEFAULT_DEPARTMENT_TITLE]
  );

  const membership = await getDepartmentMembershipByUserId(userId);
  if (!membership) {
    throw new Error("Department membership is required for staff users");
  }
}
