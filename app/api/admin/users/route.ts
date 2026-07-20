import { NextResponse } from "next/server";
import { dbQuery, dbTransaction } from "@/lib/server/db";

export const dynamic = "force-dynamic";

const STAFF_COOKIE = "gosafety_staff_auth";
const STAFF_ADMIN_COOKIE = "gosafety_staff_admin";
const ADMIN_ROLE_CODES = ["admin", "manager", "safety_manager"] as const;
const STAFF_EMAIL_REGEX =
  /^([A-Za-z]+(?:-[A-Za-z]+)?)\.([A-Za-z]+(?:-[A-Za-z]+)?)@nnpcgroup\.com$/i;

const DEPARTMENT_TITLES = ["manager", "deputy_manager", "officer", "lead"] as const;

type DepartmentTitle = (typeof DEPARTMENT_TITLES)[number];

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  deleted_at: string | null;
  department_id: string | null;
  department_code: string | null;
  department_name: string | null;
  department_title: DepartmentTitle | null;
  roles: Array<{ id: string; code: string; name: string }> | null;
};

type RoleLookup = {
  id: string;
  code: string;
  name: string;
};

type DepartmentLookup = {
  id: string;
  code: string;
  name: string;
};

type CreateUserBody = {
  email?: string;
  fullName?: string;
  roleCodes?: string[];
  departmentId?: string;
  departmentTitle?: DepartmentTitle;
  isActive?: boolean;
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

function ensureAdmin(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const isStaff = readCookie(cookieHeader, STAFF_COOKIE) === "1";
  const isAdmin = readCookie(cookieHeader, STAFF_ADMIN_COOKIE) === "1";

  if (!isStaff || !isAdmin) {
    return NextResponse.json({ message: "Admin access required" }, { status: 403 });
  }

  return null;
}

export async function GET(request: Request) {
  const denied = ensureAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const url = new URL(request.url);
    const includeDeleted = url.searchParams.get("includeDeleted") === "1";

    const [usersResult, rolesResult, departmentsResult] = await Promise.all([
      dbQuery<UserRow>(
        `
        SELECT
          u.id,
          u.email,
          u.full_name,
          u.is_active,
          u.deleted_at::text,
          udm.department_id::text,
          d.code AS department_code,
          d.name AS department_name,
          udm.department_title::text AS department_title,
          COALESCE(role_data.roles, '[]'::json) AS roles
        FROM users u
        LEFT JOIN user_department_memberships udm ON udm.user_id = u.id
        LEFT JOIN departments d ON d.id = udm.department_id
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'id', r.id,
              'code', r.code,
              'name', r.name
            )
            ORDER BY r.name ASC
          ) AS roles
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id
        ) role_data ON true
        WHERE ($1::boolean = true OR u.deleted_at IS NULL)
        ORDER BY u.full_name ASC
        `,
        [includeDeleted]
      ),
      dbQuery<RoleLookup>(
        `
        SELECT id, code, name
        FROM roles
        ORDER BY name ASC
        `
      ),
      dbQuery<DepartmentLookup>(
        `
        SELECT id, code, name
        FROM departments
        WHERE deleted_at IS NULL
          AND is_active = true
        ORDER BY name ASC
        `
      ),
    ]);

    return NextResponse.json({
      users: usersResult.rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        isActive: row.is_active,
        deletedAt: row.deleted_at,
        department: row.department_id
          ? {
              id: row.department_id,
              code: row.department_code,
              name: row.department_name,
              title: row.department_title,
            }
          : null,
        roles: row.roles ?? [],
      })),
      roles: rolesResult.rows,
      departments: departmentsResult.rows,
      departmentTitles: DEPARTMENT_TITLES,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to load users",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const denied = ensureAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const body = (await request.json()) as CreateUserBody;
    const email = body.email?.trim().toLowerCase() ?? "";
    const fullName = body.fullName?.trim() ?? "";
    const roleCodes = Array.from(new Set((body.roleCodes ?? []).filter(Boolean)));
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

    if (!email || !fullName || !body.departmentId || !body.departmentTitle) {
      return NextResponse.json(
        {
          message:
            "email, fullName, departmentId, and departmentTitle are required to create a user",
        },
        { status: 400 }
      );
    }

    if (!STAFF_EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { message: "Invalid staff email format. Use firstName.LastName@nnpcgroup.com" },
        { status: 400 }
      );
    }

    if (!DEPARTMENT_TITLES.includes(body.departmentTitle)) {
      return NextResponse.json({ message: "Invalid department title" }, { status: 400 });
    }

    const departmentExists = await dbQuery<{ id: string }>(
      `
      SELECT id
      FROM departments
      WHERE id = $1
        AND deleted_at IS NULL
        AND is_active = true
      LIMIT 1
      `,
      [body.departmentId]
    );

    if (!departmentExists.rows[0]) {
      return NextResponse.json({ message: "Department not found" }, { status: 400 });
    }

    if (roleCodes.length > 0) {
      const availableRoles = await dbQuery<{ code: string }>(
        `
        SELECT code
        FROM roles
        WHERE code = ANY($1::text[])
        `,
        [roleCodes]
      );

      const found = new Set(availableRoles.rows.map((r) => r.code));
      const missing = roleCodes.filter((code) => !found.has(code));

      if (missing.length > 0) {
        return NextResponse.json(
          { message: `Unknown role code(s): ${missing.join(", ")}` },
          { status: 400 }
        );
      }
    }

    const created = await dbTransaction(async (client) => {
      const user = await client.query<{ id: string }>(
        `
        INSERT INTO users (email, full_name, auth_subject, is_active, deleted_at)
        VALUES ($1, $2, $3, $4, NULL)
        ON CONFLICT (email)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          auth_subject = EXCLUDED.auth_subject,
          is_active = EXCLUDED.is_active,
          deleted_at = NULL,
          updated_at = now()
        RETURNING id
        `,
        [email, fullName, `staff-email:${email}`, isActive]
      );

      const userId = user.rows[0].id;

      await client.query(
        `
        INSERT INTO user_department_memberships (user_id, department_id, department_title)
        VALUES ($1, $2, $3::department_title_enum)
        ON CONFLICT (user_id)
        DO UPDATE SET
          department_id = EXCLUDED.department_id,
          department_title = EXCLUDED.department_title,
          updated_at = now()
        `,
        [userId, body.departmentId, body.departmentTitle]
      );

      await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);

      if (roleCodes.length > 0) {
        await client.query(
          `
          INSERT INTO user_roles (user_id, role_id)
          SELECT $1, r.id
          FROM roles r
          WHERE r.code = ANY($2::text[])
          ON CONFLICT (user_id, role_id) DO NOTHING
          `,
          [userId, roleCodes]
        );
      }

      return { userId };
    });

    return NextResponse.json({ ok: true, userId: created.userId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to create user",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
