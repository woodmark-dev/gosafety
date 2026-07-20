import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  const secure = process.env.NODE_ENV === "production";

  for (const cookieName of [
    "gosafety_staff_auth",
    "gosafety_staff_user_id",
    "gosafety_staff_admin",
  ]) {
    response.cookies.set({
      name: cookieName,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      expires: new Date(0),
    });
  }

  return response;
}
