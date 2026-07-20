import { NextResponse } from "next/server";
import { dbQuery, dbTransaction } from "@/lib/server/db";

export const dynamic = "force-dynamic";

const STAFF_COOKIE = "gosafety_staff_auth";
const STAFF_USER_COOKIE = "gosafety_staff_user_id";
const STAFF_ADMIN_COOKIE = "gosafety_staff_admin";
const ADMIN_ROLE_CODES = ["admin", "manager", "safety_manager"] as const;

const DEPARTMENT_TITLES = ["manager", "deputy_manager", "officer", "lead"] as const;

type DepartmentTitle = (typeof DEPARTMENT_TITLES)[number];

type UpdateUserBody = {
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

function requireAdmin(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const isStaff = readCookie(cookieHeader, STAFF_COOKIE) === "1";
  const isAdmin = readCookie(cookieHeader, STAFF_ADMIN_COOKIE) === "1";
  const actingUserId = readCookie(cookieHeader, STAFF_USER_COOKIE)?.trim() ?? null;

  if (!isStaff || !isAdmin || !actingUserId) {
    return {
      denied: NextResponse.json({ message: "Admin access required" }, { status: 403 }),
      actingUserId: null,
    };
  }

  return { denied: null, actingUserId };
}

async function isUserAdminLike(userId: string) {
  const result = await dbQuery<{ is_admin: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN users u ON u.id = ur.user_id
      WHERE ur.user_id = $1
        AND r.code = ANY($2::text[])
        AND u.deleted_at IS NULL
        AND u.is_active = true
    ) AS is_admin
    `,
    [userId, ADMIN_ROLE_CODES]
  );

  return Boolean(result.rows[0]?.is_admin);
}

async function countOtherAdminLikeUsers(excludingUserId: string) {
  const result = await dbQuery<{ count: string }>(
    `
    SELECT COUNT(DISTINCT u.id)::text AS count
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE u.deleted_at IS NULL
      AND u.is_active = true
      AND r.code = ANY($1::text[])
      AND u.id <> $2
    `,
    [ADMIN_ROLE_CODES, excludingUserId]
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { denied } = requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const { userId } = await context.params;
    const body = (await request.json()) as UpdateUserBody;

    const roleCodes = body.roleCodes ? Array.from(new Set(body.roleCodes.filter(Boolean))) : null;
    const hasDepartmentInputs =
      typeof body.departmentId !== "undefined" || typeof body.departmentTitle !== "undefined";

    if (hasDepartmentInputs && (!body.departmentId || !body.departmentTitle)) {
      return NextResponse.json(
        { message: "departmentId and departmentTitle must be provided together" },
        { status: 400 }
      );
    }

    if (body.departmentTitle && !DEPARTMENT_TITLES.includes(body.departmentTitle)) {
      return NextResponse.json({ message: "Invalid department title" }, { status: 400 });
    }

    const existingUser = await dbQuery<{ id: string }>(
      `
      SELECT id
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [userId]
    );

    if (!existingUser.rows[0]) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    if (body.departmentId) {
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
    }

    if (roleCodes) {
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

    const targetIsAdmin = await isUserAdminLike(userId);
    const nextRoleCodesIncludesAdmin = roleCodes
      ? roleCodes.some((code) =>
          ADMIN_ROLE_CODES.includes(code as (typeof ADMIN_ROLE_CODES)[number])
        )
      : null;
    const targetWillBeInactive = body.isActive === false;
    const removingAdminPrivileges =
      targetIsAdmin &&
      ((nextRoleCodesIncludesAdmin !== null && !nextRoleCodesIncludesAdmin) ||
        targetWillBeInactive);

    if (removingAdminPrivileges) {
      const remainingAdmins = await countOtherAdminLikeUsers(userId);
      if (remainingAdmins < 1) {
        return NextResponse.json(
          {
            message:
              "This change would remove the last admin-capable user. Assign another admin before proceeding.",
          },
          { status: 400 }
        );
      }
    }

    await dbTransaction(async (client) => {
      if (typeof body.fullName === "string" && body.fullName.trim()) {
        await client.query(
          `
          UPDATE users
          SET full_name = $2,
              updated_at = now()
          WHERE id = $1
          `,
          [userId, body.fullName.trim()]
        );
      }

      if (typeof body.isActive === "boolean") {
        await client.query(
          `
          UPDATE users
          SET is_active = $2,
              updated_at = now()
          WHERE id = $1
          `,
          [userId, body.isActive]
        );
      }

      if (body.departmentId && body.departmentTitle) {
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
      }

      if (roleCodes) {
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
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to update user",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { denied, actingUserId } = requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const { userId } = await context.params;

    if (userId === actingUserId) {
      return NextResponse.json({ message: "You cannot delete your own account" }, { status: 400 });
    }

    const existingUser = await dbQuery<{ id: string }>(
      `
      SELECT id
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [userId]
    );

    if (!existingUser.rows[0]) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const targetIsAdmin = await isUserAdminLike(userId);
    if (targetIsAdmin) {
      const remainingAdmins = await countOtherAdminLikeUsers(userId);
      if (remainingAdmins < 1) {
        return NextResponse.json(
          {
            message: "You cannot delete the last admin-capable user. Assign another admin first.",
          },
          { status: 400 }
        );
      }
    }

    await dbTransaction(async (client) => {
      await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM user_department_memberships WHERE user_id = $1`, [userId]);
      await client.query(
        `
        UPDATE users
        SET is_active = false,
            deleted_at = now(),
            updated_at = now()
        WHERE id = $1
        `,
        [userId]
      );
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to delete user",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
