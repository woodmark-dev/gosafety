import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/server/db";
import { getDepartmentMembershipByUserId } from "@/lib/server/department-membership";

const STAFF_COOKIE = "gosafety_staff_auth";
const STAFF_USER_COOKIE = "gosafety_staff_user_id";
const STAFF_ADMIN_COOKIE = "gosafety_staff_admin";

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

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const isStaff = readCookie(cookieHeader, STAFF_COOKIE) === "1";
  const staffUserId = readCookie(cookieHeader, STAFF_USER_COOKIE);
  const isAdmin = readCookie(cookieHeader, STAFF_ADMIN_COOKIE) === "1";
  const department =
    isStaff && staffUserId ? await getDepartmentMembershipByUserId(staffUserId) : null;
  const roleCodes =
    isStaff && staffUserId
      ? (
          await dbQuery<{ code: string }>(
            `
            SELECT r.code
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = $1
            ORDER BY r.code ASC
            `,
            [staffUserId]
          )
        ).rows.map((row) => row.code)
      : [];

  return NextResponse.json({
    isStaff,
    isAdmin,
    staffUserId: isStaff ? staffUserId : null,
    department,
    roleCodes,
  });
}
