"use client";

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
    <div className="min-h-screen bg-[#eef1f6] text-slate-900">
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

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white px-4 py-2 md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  active ? "bg-[#c8632f] text-white" : "text-slate-700"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <Link
            href="/"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Home
          </Link>
        </div>
      </nav>
    </div>
  );
}
