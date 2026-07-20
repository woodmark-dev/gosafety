"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type NavItem = {
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Report", href: "/dashboard/report" },
  { label: "Reports", href: "/dashboard/reports" },
];

type SessionInfo = {
  isStaff: boolean;
  isAdmin: boolean;
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/staff/session", { cache: "no-store" });
        const data = (await response.json()) as SessionInfo;
        if (!cancelled) {
          setSession(data);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = useMemo(() => {
    if (session?.isAdmin) {
      return [...NAV_ITEMS, { label: "Users", href: "/dashboard/users" }];
    }
    return NAV_ITEMS;
  }, [session?.isAdmin]);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await fetch("/api/staff/logout", { method: "POST" });
    } finally {
      localStorage.removeItem("gosafety_staff_session");
      router.replace("/staff-login");
      setLoggingOut(false);
    }
  }

  const dashboardFooter = (
    <footer className="relative mt-4 hidden overflow-hidden rounded-xl border border-[#e4e8ef] bg-white md:block">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-44 bg-[linear-gradient(120deg,transparent_0%,transparent_52%,#eef2f6_52%,#eef2f6_70%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-28">
        <div className="absolute right-14 top-0 h-full w-7 skew-x-[-28deg] bg-[#e9edf2]" />
        <div className="absolute right-8 top-0 h-full w-7 skew-x-[-28deg] bg-[#0a7e49]" />
        <div className="absolute right-4 top-0 h-full w-7 skew-x-[-28deg] bg-[#ffd31a]" />
        <div className="absolute right-0 top-0 h-full w-7 skew-x-[-28deg] bg-[#ef2d2d]" />
      </div>

      <div className="relative flex h-12 items-center justify-center gap-3 px-4">
        <Image src="/nnpc-logo.svg" alt="NNPC" width={86} height={28} className="h-6 w-auto" />
        <p className="text-[11px] text-slate-500">© 2026 NNPC GoSafety. All rights reserved.</p>
      </div>
    </footer>
  );

  return (
    <div className="min-h-screen bg-[#f3f6fa] text-slate-900">
      <div className="border-b border-[#e3e8ef] bg-white md:hidden">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Go to home page">
            <Image
              src="/nnpc-logo.svg"
              alt="NNPC"
              width={124}
              height={40}
              className="h-8 w-auto"
              priority
            />
            <span className="h-8 w-px bg-[#d9dfe6]" />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold uppercase tracking-[0.04em] text-[#0a7e49]">
                GOSAFETY DASHBOARD
              </p>
              <p className="text-[10px] text-[#4f5d6c]">Staff incident console</p>
            </div>
          </Link>
        </div>
      </div>

      <div className="hidden md:block">
        <div className="mx-auto flex w-full max-w-[1480px] gap-4 px-3 py-3 lg:gap-5">
          <aside className="sticky top-3 flex h-[calc(100vh-1.5rem)] w-[250px] shrink-0 flex-col overflow-hidden rounded-[16px] bg-gradient-to-b from-[#05593a] via-[#04543a] to-[#034a34] px-4 py-4 text-white shadow-[0_20px_45px_-30px_rgba(5,57,39,0.85)]">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5"
              aria-label="Go to home page"
            >
              <Image
                src="/nnpc-logo.svg"
                alt="NNPC"
                width={112}
                height={36}
                className="h-8 w-auto"
              />
            </Link>

            <nav className="mt-6 space-y-1.5">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-[#0f7e57] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]"
                        : "text-emerald-50/90 hover:bg-white/10"
                    }`}
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center">
                      {item.label === "Report" ? (
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <circle cx="10" cy="10" r="7" />
                          <path d="M10 6.8v6.4M6.8 10h6.4" />
                        </svg>
                      ) : item.label === "Users" ? (
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <circle cx="7" cy="7" r="2.3" />
                          <circle cx="13" cy="8" r="2" />
                          <path d="M3.8 15c.8-2 2.2-3 4.2-3s3.4 1 4.2 3" />
                          <path d="M11.6 15c.4-1.3 1.4-2.1 3-2.3" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <rect x="4" y="3.5" width="12" height="13" rx="2" />
                          <path d="M7 7.5h6M7 10.5h6M7 13.5h4" />
                        </svg>
                      )}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto space-y-3">
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-[11px] font-semibold text-emerald-100">Need help?</p>
                <p className="text-[11px] text-emerald-50/80">Visit our Help Centre</p>
              </div>

              <Link
                href="/dashboard/profile"
                className={`flex items-center justify-between rounded-xl px-2 py-2 transition ${
                  pathname.startsWith("/dashboard/profile") ? "bg-white/14" : "hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-[11px] font-semibold">
                    AA
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-white">Profile</p>
                    <p className="text-[11px] text-emerald-50/80">Staff user</p>
                  </div>
                </div>
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4 text-emerald-100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M7 5l5 5-5 5" />
                </svg>
              </Link>

              <button
                type="button"
                onClick={() => {
                  void handleLogout();
                }}
                disabled={loggingOut}
                className="flex w-full items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/12 disabled:opacity-60"
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </aside>

          <main className="min-w-0 flex-1 pb-6">
            {children}
            {dashboardFooter}
          </main>
        </div>
      </div>

      <div className="pb-24 md:hidden">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-3 pb-2 pt-1.5 md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
          <Link
            href="/"
            className="flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium text-slate-500"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M3 9.5l7-6 7 6" />
              <path d="M5 8.5V16h10V8.5" />
            </svg>
            <span>Home</span>
          </Link>

          <Link
            href="/dashboard/reports"
            className={`flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium ${
              pathname.startsWith("/dashboard/reports") ? "text-[#0a7e49]" : "text-slate-500"
            }`}
          >
            <svg
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <rect x="4.5" y="3.5" width="11" height="13" rx="2" />
              <path d="M8.2 3.5v3h3.6" />
              <path d="M8 10h4M8 13h4" />
            </svg>
            <span>Reports</span>
          </Link>

          <Link
            href="/dashboard/report"
            className="flex flex-col items-center gap-0.5 py-0 text-[10px] font-medium text-slate-500"
          >
            <span className="-mt-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0a7e49] text-white shadow-[0_10px_18px_-10px_rgba(10,126,73,0.95)]">
              <svg
                viewBox="0 0 20 20"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M10 5v10M5 10h10" />
              </svg>
            </span>
            <span>Report</span>
          </Link>

          <button
            type="button"
            className="flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium text-slate-500"
            aria-label="Help Center"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="10" cy="10" r="7" />
              <path d="M8.2 7.7a2 2 0 0 1 3.6 1.1c0 1.6-1.8 1.9-1.8 3" />
              <circle cx="10" cy="13.8" r="0.9" fill="currentColor" stroke="none" />
            </svg>
            <span>Help Center</span>
          </button>

          <Link
            href="/dashboard/profile"
            className={`flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium ${
              pathname.startsWith("/dashboard/profile") ? "text-[#0a7e49]" : "text-slate-500"
            }`}
            aria-label="My Profile"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="10" cy="6.8" r="2.6" />
              <path d="M4.8 15.8c1-2.2 2.9-3.3 5.2-3.3s4.2 1.1 5.2 3.3" />
            </svg>
            <span>My Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
