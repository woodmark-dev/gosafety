import { NextRequest, NextResponse } from "next/server";

const STAFF_COOKIE = "gosafety_staff_auth";

export function middleware(request: NextRequest) {
  const isStaff = request.cookies.get(STAFF_COOKIE)?.value === "1";
  const { pathname } = request.nextUrl;

  if (isStaff && (pathname === "/" || pathname === "/staff-login")) {
    return NextResponse.redirect(new URL("/dashboard/reports", request.url));
  }

  if (isStaff && pathname.startsWith("/visitor/report")) {
    return NextResponse.redirect(new URL("/dashboard/report", request.url));
  }

  if (pathname.startsWith("/dashboard") && !isStaff) {
    return NextResponse.redirect(new URL("/staff-login", request.url));
  }

  if (pathname.startsWith("/visitor") && isStaff) {
    return NextResponse.redirect(new URL("/dashboard/reports", request.url));
  }

  if (isStaff && pathname === "/report") {
    return NextResponse.redirect(new URL("/dashboard/report", request.url));
  }

  if (!isStaff && pathname === "/report") {
    return NextResponse.redirect(new URL("/visitor/report", request.url));
  }

  if (isStaff && pathname === "/reports") {
    return NextResponse.redirect(new URL("/dashboard/reports", request.url));
  }

  if (!isStaff && pathname === "/reports") {
    return NextResponse.redirect(new URL("/visitor/reports", request.url));
  }

  if (isStaff && pathname.startsWith("/reports/")) {
    const suffix = pathname.slice("/reports".length);
    return NextResponse.redirect(new URL(`/dashboard/reports${suffix}`, request.url));
  }

  if (!isStaff && pathname.startsWith("/reports/")) {
    const suffix = pathname.slice("/reports".length);
    return NextResponse.redirect(new URL(`/visitor/reports${suffix}`, request.url));
  }

  if (pathname.startsWith("/workbench")) {
    return NextResponse.redirect(
      new URL(isStaff ? "/dashboard/reports" : "/staff-login", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/staff-login",
    "/dashboard/:path*",
    "/visitor/:path*",
    "/workbench/:path*",
    "/report",
    "/reports/:path*",
  ],
};
