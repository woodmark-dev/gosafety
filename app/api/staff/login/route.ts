import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/server/db";
import {
  ensureDefaultDepartmentMembership,
  getDepartmentMembershipByUserId,
} from "@/lib/server/department-membership";

type LoginBody = {
  email?: string;
};

const STAFF_EMAIL_REGEX =
  /^([A-Za-z]+(?:-[A-Za-z]+)?)\.([A-Za-z]+(?:-[A-Za-z]+)?)@nnpcgroup\.com$/i;

const ADMIN_ROLE_CODES = ["admin", "manager", "safety_manager"];
const DEFAULT_REPORTER_ROLE_CODE = "reporter";

async function ensureDefaultReporterRole(userId: string) {
  await dbQuery(
    `
    INSERT INTO user_roles (user_id, role_id)
    SELECT $1, r.id
    FROM roles r
    WHERE r.code = $2
    ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [userId, DEFAULT_REPORTER_ROLE_CODE]
  );
}

async function readIsAdmin(userId: string) {
  const roleCheck = await dbQuery<{ is_admin: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
        AND r.code = ANY($2::text[])
    ) AS is_admin
    `,
    [userId, ADMIN_ROLE_CODES]
  );

  return Boolean(roleCheck.rows[0]?.is_admin);
}

function setStaffCookies(response: NextResponse, userId: string, isAdmin: boolean) {
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set({
    name: "gosafety_staff_auth",
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  response.cookies.set({
    name: "gosafety_staff_user_id",
    value: userId,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  response.cookies.set({
    name: "gosafety_staff_admin",
    value: isAdmin ? "1" : "0",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const rawEmail = body.email?.trim();

    if (!rawEmail) {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }

    const match = rawEmail.match(STAFF_EMAIL_REGEX);
    if (!match) {
      return NextResponse.json(
        {
          message: "Invalid staff email format. Use firstName.LastName@nnpcgroup.com",
        },
        { status: 400 }
      );
    }

    const normalizedEmail = rawEmail.toLowerCase();

    const existing = await dbQuery<{ id: string; email: string; full_name: string }>(
      `
      SELECT id, email, full_name
      FROM users
      WHERE lower(email) = lower($1)
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [normalizedEmail]
    );

    if (existing.rows[0]) {
      await ensureDefaultReporterRole(existing.rows[0].id);
      await ensureDefaultDepartmentMembership(existing.rows[0].id);
      const department = await getDepartmentMembershipByUserId(existing.rows[0].id);
      const isAdmin = await readIsAdmin(existing.rows[0].id);

      const response = NextResponse.json({
        user: {
          id: existing.rows[0].id,
          email: existing.rows[0].email,
          fullName: existing.rows[0].full_name,
          firstName: existing.rows[0].full_name.split(" ")[0] ?? "Staff",
          lastName: existing.rows[0].full_name.split(" ").slice(1).join(" ") || "",
        },
        created: false,
        isAdmin,
        department,
      });

      setStaffCookies(response, existing.rows[0].id, isAdmin);

      return response;
    }

    const firstName = toTitleCase(match[1]);
    const lastName = toTitleCase(match[2]);
    const fullName = `${firstName} ${lastName}`;

    const inserted = await dbQuery<{ id: string; email: string; full_name: string }>(
      `
      INSERT INTO users (email, full_name, auth_subject)
      VALUES ($1, $2, $3)
      RETURNING id, email, full_name
      `,
      [normalizedEmail, fullName, `staff-email:${normalizedEmail}`]
    );

    await ensureDefaultReporterRole(inserted.rows[0].id);
    await ensureDefaultDepartmentMembership(inserted.rows[0].id);

    const department = await getDepartmentMembershipByUserId(inserted.rows[0].id);

    const isAdmin = await readIsAdmin(inserted.rows[0].id);

    const response = NextResponse.json({
      user: {
        id: inserted.rows[0].id,
        email: inserted.rows[0].email,
        fullName: inserted.rows[0].full_name,
        firstName,
        lastName,
      },
      created: true,
      isAdmin,
      department,
    });

    setStaffCookies(response, inserted.rows[0].id, isAdmin);

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to process staff login",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
