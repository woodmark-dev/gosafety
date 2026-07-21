"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Report", href: "/visitor/report" },
  { label: "My Reports", href: "/visitor/reports" },
];

export default function VisitorDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
              <p className="text-[10px] text-[#4f5d6c]">Visitor reporting console</p>
            </div>
          </Link>
        </div>
      </div>

      <div className="hidden border-b border-slate-200 bg-white md:block">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b0582d]">
              GoSafety Visitor Dashboard
            </p>
            <p className="text-sm text-slate-500">Submit and track your hazard reports</p>
          </div>

          <nav className="flex items-center gap-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    active ? "bg-[#c8632f] text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Home
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl pb-24 md:pb-8">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-3 pb-2 pt-1.5 md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 items-end gap-1">
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
            href="/visitor/report"
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

          <Link
            href="/visitor/reports"
            className={`flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium ${
              pathname.startsWith("/visitor/reports") ? "text-[#0a7e49]" : "text-slate-500"
            }`}
            aria-label="Reports"
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
        </div>
      </nav>
    </div>
  );
}
