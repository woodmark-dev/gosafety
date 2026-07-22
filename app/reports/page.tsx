"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clearQueueAndRelatedBlobs, getQueueItems } from "@/lib/client/report-storage";
import type { SyncQueueItem } from "@/lib/report-types";

type IncidentListItem = {
  id: string;
  incident_no: string;
  title: string;
  reported_at: string;
  status_code: string;
  is_returned_for_reassignment: boolean;
  severity_code: string | null;
  site_name: string | null;
  detected_address: string | null;
  additional_location: string | null;
};

type StaffSessionInfo = {
  isStaff: boolean;
  isAdmin: boolean;
  staffUserId: string | null;
  roleCodes?: string[];
  department?: {
    departmentId: string;
    departmentCode: string;
    departmentName: string;
    departmentTitle: "manager" | "deputy_manager" | "officer" | "lead";
  } | null;
};

function statusTone(code: string) {
  if (code === "assigned") {
    return "bg-[#e8f1ff] text-[#2c6cc5]";
  }
  if (code === "reported") {
    return "bg-[#fff3d5] text-[#c78700]";
  }
  if (code === "in_progress") {
    return "bg-[#ecefff] text-[#4b56cf]";
  }
  if (code === "resolved" || code === "manager_confirmed" || code === "closed") {
    return "bg-[#e8f7ed] text-[#228753]";
  }
  return "bg-slate-100 text-slate-700";
}

function severityTone(code: string | null) {
  const normalized = code?.toLowerCase() ?? "";
  if (normalized === "low") {
    return "bg-[#e8f6ec] text-[#2d8f59]";
  }
  if (normalized === "medium") {
    return "bg-[#fff3d5] text-[#b98600]";
  }
  if (normalized === "high" || normalized === "critical") {
    return "bg-[#ffe7e7] text-[#d53d3d]";
  }
  return "bg-slate-100 text-slate-700";
}

function severityLabel(code: string) {
  if (code === "unspecified") {
    return "Unspecified";
  }

  return code
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ReportsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const isStaffDashboard = pathname.startsWith("/dashboard");
  const isVisitorDashboard = pathname.startsWith("/visitor");

  const [scope, setScope] = useState<"all" | "mine" | "reported" | "assigned">("all");
  const [adminView, setAdminView] = useState<"list" | "dashboard">("list");
  const [staffSession, setStaffSession] = useState<StaffSessionInfo | null>(null);

  const reportsRoot = isStaffDashboard
    ? "/dashboard/reports"
    : isVisitorDashboard
      ? "/visitor/reports"
      : "/reports";
  const reportEntry = isStaffDashboard
    ? "/dashboard/report"
    : isVisitorDashboard
      ? "/visitor/report"
      : "/report";

  const [items, setItems] = useState<IncidentListItem[]>([]);
  const [queuedItems, setQueuedItems] = useState<SyncQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearingQueue, setClearingQueue] = useState(false);
  const [error, setError] = useState("");
  const [reportTableView, setReportTableView] = useState<"submitted" | "pending">("submitted");

  const [dashboardSearch, setDashboardSearch] = useState("");
  const [dashboardStatus, setDashboardStatus] = useState("all");
  const [dashboardSeverity, setDashboardSeverity] = useState("all");
  const [dashboardDateRange, setDashboardDateRange] = useState<"all" | "7d" | "30d" | "90d">("30d");
  const [dashboardReturnedOnly, setDashboardReturnedOnly] = useState(false);
  const [dashboardSiteFilter, setDashboardSiteFilter] = useState("");

  const hasManageRole = Boolean(
    staffSession?.roleCodes?.includes("admin") || staffSession?.roleCodes?.includes("evaluator_hse")
  );
  const isAdminRole = Boolean(staffSession?.roleCodes?.includes("admin"));
  const showAdminDashboard = isStaffDashboard && isAdminRole && adminView === "dashboard";
  const isFulfillmentStaff =
    Boolean(isStaffDashboard && staffSession && !hasManageRole) &&
    Boolean(staffSession?.roleCodes?.includes("fulfillment_member"));

  const dashboardStatusOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of items) {
      values.add(item.status_code);
    }
    return Array.from(values).sort();
  }, [items]);

  const dashboardSeverityOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of items) {
      if (item.severity_code) {
        values.add(item.severity_code);
      }
    }
    return Array.from(values).sort();
  }, [items]);

  const dashboardItems = useMemo(() => {
    const now = Date.now();
    const maxAgeMs =
      dashboardDateRange === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : dashboardDateRange === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : dashboardDateRange === "90d"
            ? 90 * 24 * 60 * 60 * 1000
            : null;

    const search = dashboardSearch.trim().toLowerCase();
    const site = dashboardSiteFilter.trim().toLowerCase();

    return items.filter((item) => {
      if (dashboardStatus !== "all" && item.status_code !== dashboardStatus) {
        return false;
      }
      if (dashboardSeverity !== "all" && (item.severity_code ?? "") !== dashboardSeverity) {
        return false;
      }
      if (dashboardReturnedOnly && !item.is_returned_for_reassignment) {
        return false;
      }

      if (maxAgeMs !== null) {
        const reportedAtMs = Date.parse(item.reported_at);
        if (!Number.isNaN(reportedAtMs) && now - reportedAtMs > maxAgeMs) {
          return false;
        }
      }

      if (site) {
        const siteText = `${item.site_name ?? ""} ${item.detected_address ?? ""}`.toLowerCase();
        if (!siteText.includes(site)) {
          return false;
        }
      }

      if (search) {
        const haystack =
          `${item.incident_no} ${item.title} ${item.status_code} ${item.site_name ?? ""} ${item.detected_address ?? ""} ${item.additional_location ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    });
  }, [
    items,
    dashboardStatus,
    dashboardSeverity,
    dashboardReturnedOnly,
    dashboardDateRange,
    dashboardSearch,
    dashboardSiteFilter,
  ]);

  const dashboardSummary = useMemo(() => {
    const statusCounts = new Map<string, number>();
    const severityCounts = new Map<string, number>();
    let returnedCount = 0;
    let highSeverityCount = 0;

    for (const item of dashboardItems) {
      statusCounts.set(item.status_code, (statusCounts.get(item.status_code) ?? 0) + 1);
      const severityKey = (item.severity_code?.toLowerCase() || "unspecified").trim();
      severityCounts.set(severityKey, (severityCounts.get(severityKey) ?? 0) + 1);
      if (item.is_returned_for_reassignment) {
        returnedCount += 1;
      }
      if (item.severity_code && ["high", "critical"].includes(item.severity_code.toLowerCase())) {
        highSeverityCount += 1;
      }
    }

    const openCount = dashboardItems.filter((item) => item.status_code !== "resolved").length;
    const severityOrder = ["critical", "high", "medium", "low", "unspecified"];
    const severityPalette = ["#e11d48", "#f97316", "#f59e0b", "#16a34a", "#64748b"];

    const severityBreakdown = Array.from(severityCounts.entries())
      .sort((a, b) => {
        const aRank = severityOrder.indexOf(a[0]);
        const bRank = severityOrder.indexOf(b[0]);
        const safeARank = aRank === -1 ? severityOrder.length : aRank;
        const safeBRank = bRank === -1 ? severityOrder.length : bRank;

        if (safeARank !== safeBRank) {
          return safeARank - safeBRank;
        }

        return b[1] - a[1];
      })
      .map(([code, count], index) => ({
        code,
        label: severityLabel(code),
        count,
        color: severityPalette[index % severityPalette.length],
      }));

    return {
      total: dashboardItems.length,
      open: openCount,
      returned: returnedCount,
      highSeverity: highSeverityCount,
      severityBreakdown,
      topStatuses: Array.from(statusCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4),
    };
  }, [dashboardItems]);

  const severityChart = useMemo(() => {
    const total = dashboardSummary.severityBreakdown.reduce((sum, item) => sum + item.count, 0);
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    let cumulative = 0;

    const slices = dashboardSummary.severityBreakdown.map((item) => {
      const value = total > 0 ? item.count / total : 0;
      const dashLength = value * circumference;
      const dashOffset = -cumulative;
      cumulative += dashLength;

      return {
        ...item,
        percentage: value * 100,
        dashLength,
        dashOffset,
      };
    });

    return {
      total,
      radius,
      circumference,
      slices,
    };
  }, [dashboardSummary.severityBreakdown]);

  useEffect(() => {
    if (isFulfillmentStaff && (scope === "all" || scope === "mine")) {
      setScope("reported");
    }
  }, [isFulfillmentStaff, scope]);

  useEffect(() => {
    if (!isStaffDashboard || !isAdminRole) {
      setAdminView("list");
    }
  }, [isStaffDashboard, isAdminRole]);

  useEffect(() => {
    if (showAdminDashboard && scope !== "all") {
      setScope("all");
    }
  }, [showAdminDashboard, scope]);

  useEffect(() => {
    let cancelled = false;

    async function loadReports(silent = false) {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      try {
        let effectiveSession = staffSession;
        if (isStaffDashboard && !effectiveSession) {
          const sessionResponse = await fetch("/api/staff/session", {
            method: "GET",
            cache: "no-store",
          });
          const sessionData = (await sessionResponse.json()) as StaffSessionInfo;
          if (sessionResponse.ok) {
            effectiveSession = sessionData;
            if (!cancelled) {
              setStaffSession(sessionData);
            }
          }
        }

        const effectiveHasManageRole = Boolean(
          effectiveSession?.roleCodes?.includes("admin") ||
          effectiveSession?.roleCodes?.includes("evaluator_hse")
        );
        const effectiveIsFulfillmentStaff =
          Boolean(isStaffDashboard && effectiveSession && !effectiveHasManageRole) &&
          Boolean(effectiveSession?.roleCodes?.includes("fulfillment_member"));

        const incidentsUrl =
          isStaffDashboard && effectiveHasManageRole && scope === "mine"
            ? "/api/incidents?scope=mine"
            : isStaffDashboard &&
                effectiveIsFulfillmentStaff &&
                (scope === "reported" || scope === "assigned")
              ? `/api/incidents?scope=${scope}`
              : "/api/incidents";

        const [response, queue] = await Promise.all([
          fetch(incidentsUrl, { method: "GET", cache: "no-store" }),
          getQueueItems(),
        ]);
        const data = (await response.json()) as { items?: IncidentListItem[]; message?: string };

        if (!response.ok) {
          if (response.status === 401 && isStaffDashboard) {
            throw new Error("Your staff session expired. Please sign in again.");
          }
          throw new Error(data.message ?? "Failed to load submitted reports");
        }

        if (!cancelled) {
          setItems(data.items ?? []);
          setQueuedItems(queue.filter((q) => q.status !== "synced"));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load submitted reports"
          );
        }
      } finally {
        if (!cancelled) {
          if (silent) {
            setRefreshing(false);
          } else {
            setLoading(false);
          }
        }
      }
    }

    void loadReports();

    const timer = window.setInterval(() => {
      void loadReports(true);
    }, 30000);

    const onOnline = () => {
      void loadReports(true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadReports(true);
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isStaffDashboard, scope, staffSession]);

  return (
    <div className="min-h-screen bg-[#f3f6fa] p-0 text-slate-900 md:p-4">
      <div className="mx-auto w-full max-w-[1320px] overflow-hidden rounded-none border-0 bg-white shadow-none md:rounded-[24px] md:border md:border-[#e3e8ef] md:shadow-[0_20px_52px_-40px_rgba(16,39,64,0.45)]">
        <section className="relative overflow-hidden bg-gradient-to-r from-[#0a5f37] via-[#075d36] to-[#0d6d40] px-5 pb-6 pt-7 text-white md:px-7 md:pb-8 md:pt-9">
          <div className="pointer-events-none absolute -left-6 top-5 grid grid-cols-6 gap-1 opacity-20">
            {Array.from({ length: 36 }).map((_, index) => (
              <span key={index} className="h-1 w-1 rounded-full bg-[#49c585]" />
            ))}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[120px] border-t-[96px] border-l-transparent border-t-[#ffd31a] md:border-l-[150px] md:border-t-[120px]" />
          <div className="pointer-events-none absolute right-0 top-[38px] h-0 w-0 border-l-[92px] border-t-[78px] border-l-transparent border-t-[#ef2d2d] md:top-[52px] md:border-l-[116px] md:border-t-[96px]" />

          <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-[21px] font-bold tracking-tight md:text-[34px]">
                Submitted Reports
              </h1>
              <p className="mt-1 text-[14px] text-[#d4e9db] md:text-[18px]">
                Latest incidents submitted in GoSafety.
              </p>
              {refreshing ? <p className="mt-2 text-xs text-[#d2f3de]">Refreshing...</p> : null}
            </div>
            <Link
              href={reportEntry}
              className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#14813f] px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(0,0,0,0.55)] transition hover:brightness-105 md:text-[16px]"
            >
              <svg
                viewBox="0 0 20 20"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="10" cy="10" r="7" />
                <path d="M10 6.8v6.4M6.8 10h6.4" />
              </svg>
              <span>New report</span>
            </Link>
          </div>
        </section>

        <section className="px-4 pb-6 pt-15 md:px-6 md:pb-7">
          <div className="-mt-4 grid grid-cols-2 gap-2 md:-mt-6 md:max-w-[620px] md:gap-3 md:pb-5">
            <button
              type="button"
              onClick={() => setReportTableView("submitted")}
              className={`rounded-2xl border bg-gradient-to-br p-3 text-left shadow-[0_10px_22px_-20px_rgba(6,53,28,0.55)] transition md:p-4 ${
                reportTableView === "submitted"
                  ? "border-[#0a7e49] from-[#eaf8f0] to-[#def4e8] ring-2 ring-[#0a7e49]/30"
                  : "border-[#def1e6] from-[#f4fbf7] to-[#e9f6ef] hover:border-[#6db890]"
              }`}
              aria-pressed={reportTableView === "submitted"}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-[#1b8b51] md:h-7 md:w-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M8 3.5h8" />
                  <rect x="5" y="5" width="14" height="16" rx="2" />
                  <path d="M9 11h6M9 15h4" />
                  <path d="M15.5 18.5l1.5 1.5 3-3" />
                </svg>
                <div>
                  <p className="text-[9px] font-semibold text-[#24794c] md:text-[12px]">
                    Submitted
                  </p>
                  <p className="text-[24px] font-bold leading-none text-[#12743f] md:text-[36px]">
                    {items.length}
                  </p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setReportTableView("pending")}
              className={`rounded-2xl border bg-gradient-to-br p-3 text-left shadow-[0_10px_22px_-20px_rgba(77,50,0,0.45)] transition md:p-4 ${
                reportTableView === "pending"
                  ? "border-[#d69600] from-[#fff8e8] to-[#fff2cd] ring-2 ring-[#d69600]/30"
                  : "border-[#f7ebcc] from-[#fffbf0] to-[#fff6dc] hover:border-[#e6bd54]"
              }`}
              aria-pressed={reportTableView === "pending"}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-[#d69600] md:h-7 md:w-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8v4l3 2" />
                </svg>
                <div>
                  <p className="text-[9px] font-semibold text-[#b98400] md:text-[12px]">
                    Pending sync
                  </p>
                  <p className="text-[24px] font-bold leading-none text-[#e44d29] md:text-[36px]">
                    {queuedItems.length}
                  </p>
                </div>
              </div>
            </button>
          </div>

          {isStaffDashboard && hasManageRole ? (
            <div className="mb-4 mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdminView("list");
                  setScope("all");
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold md:text-sm ${
                  adminView === "list" && scope === "all"
                    ? "bg-blue-700 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                All Reports
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminView("list");
                  setScope("mine");
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold md:text-sm ${
                  adminView === "list" && scope === "mine"
                    ? "bg-blue-700 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                My Reports
              </button>
              {isAdminRole ? (
                <button
                  type="button"
                  onClick={() => {
                    setAdminView("dashboard");
                    setScope("all");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold md:text-sm ${
                    adminView === "dashboard"
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  Incidence Dashboard
                </button>
              ) : null}
            </div>
          ) : isFulfillmentStaff ? (
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScope("reported")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold md:text-sm ${
                  scope === "reported"
                    ? "bg-blue-700 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                My Reports
              </button>
              <button
                type="button"
                onClick={() => setScope("assigned")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold md:text-sm ${
                  scope === "assigned"
                    ? "bg-blue-700 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                Assigned Reports
              </button>
            </div>
          ) : null}

          {loading ? <p className="text-xs text-slate-600 md:text-sm">Loading reports...</p> : null}
          {error ? (
            <p className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 md:text-sm">{error}</p>
          ) : null}

          {!loading && !error && showAdminDashboard ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#334155] p-4 text-white md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold tracking-tight md:text-lg">
                      Admin Incidence Command Deck
                    </h2>
                    <p className="text-[11px] text-slate-200 md:text-xs">
                      Live operational view with layered filters and rapid triage signals.
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-slate-200 md:text-xs">
                    <p>Dataset: {items.length} total reports</p>
                    <p>Filtered: {dashboardSummary.total} incidents</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Total
                  </p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{dashboardSummary.total}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Open
                  </p>
                  <p className="mt-1 text-xl font-bold text-amber-900">{dashboardSummary.open}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    High/Critical
                  </p>
                  <p className="mt-1 text-xl font-bold text-rose-900">
                    {dashboardSummary.highSeverity}
                  </p>
                </div>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    Returned
                  </p>
                  <p className="mt-1 text-xl font-bold text-indigo-900">
                    {dashboardSummary.returned}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2 xl:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Severity Mix
                  </p>

                  {severityChart.total > 0 ? (
                    <div className="mt-4 flex flex-col items-center gap-5 md:flex-row md:justify-center md:gap-8">
                      <div className="relative h-32 w-32 shrink-0 md:h-44 md:w-44">
                        <svg
                          viewBox="0 0 120 120"
                          className="h-32 w-32 md:h-44 md:w-44"
                          aria-hidden="true"
                        >
                          <circle
                            cx="60"
                            cy="60"
                            r={severityChart.radius}
                            fill="none"
                            stroke="#e2e8f0"
                            strokeWidth="16"
                          />
                          {severityChart.slices.map((slice) => (
                            <circle
                              key={slice.code}
                              cx="60"
                              cy="60"
                              r={severityChart.radius}
                              fill="none"
                              stroke={slice.color}
                              strokeWidth="16"
                              strokeLinecap="butt"
                              strokeDasharray={`${slice.dashLength} ${severityChart.circumference}`}
                              strokeDashoffset={slice.dashOffset}
                              transform="rotate(-90 60 60)"
                            />
                          ))}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:text-xs">
                            Total
                          </span>
                          <span className="text-lg font-bold text-slate-900 md:text-2xl">
                            {severityChart.total}
                          </span>
                        </div>
                      </div>

                      <div className="w-full max-w-sm space-y-1.5 text-[11px] text-slate-700 md:text-sm">
                        {severityChart.slices.map((slice) => (
                          <div
                            key={`${slice.code}-legend`}
                            className="flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: slice.color }}
                                aria-hidden="true"
                              />
                              <span>{slice.label}</span>
                            </div>
                            <span className="font-semibold text-slate-900">
                              {slice.count} ({slice.percentage.toFixed(0)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      No severity data for selected filters.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Search
                    <input
                      type="text"
                      value={dashboardSearch}
                      onChange={(event) => setDashboardSearch(event.target.value)}
                      placeholder="Incident no, title, status, address"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-800 md:text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Status
                    <select
                      value={dashboardStatus}
                      onChange={(event) => setDashboardStatus(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-800 md:text-sm"
                    >
                      <option value="all">All statuses</option>
                      {dashboardStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Severity
                    <select
                      value={dashboardSeverity}
                      onChange={(event) => setDashboardSeverity(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-800 md:text-sm"
                    >
                      <option value="all">All severities</option>
                      {dashboardSeverityOptions.map((severity) => (
                        <option key={severity} value={severity}>
                          {severity}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Site / Address
                    <input
                      type="text"
                      value={dashboardSiteFilter}
                      onChange={(event) => setDashboardSiteFilter(event.target.value)}
                      placeholder="Filter by site or detected address"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-800 md:text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Time Window
                    <select
                      value={dashboardDateRange}
                      onChange={(event) =>
                        setDashboardDateRange(event.target.value as "all" | "7d" | "30d" | "90d")
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-800 md:text-sm"
                    >
                      <option value="7d">Last 7 days</option>
                      <option value="30d">Last 30 days</option>
                      <option value="90d">Last 90 days</option>
                      <option value="all">All time</option>
                    </select>
                  </label>
                  <div className="flex items-end gap-3 pb-1">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 md:text-sm">
                      <input
                        type="checkbox"
                        checked={dashboardReturnedOnly}
                        onChange={(event) => setDashboardReturnedOnly(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700"
                      />
                      Returned for reassignment only
                    </label>
                  </div>
                </div>

                {dashboardSummary.topStatuses.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {dashboardSummary.topStatuses.map(([status, count]) => (
                      <span
                        key={status}
                        className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {status}: {count}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {dashboardItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  No incidents match the selected filters.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200 text-xs md:text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">
                          Incident
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">
                          Severity
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">
                          Site / Address
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">
                          Reported
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dashboardItems.map((item) => (
                        <tr
                          key={item.id}
                          tabIndex={0}
                          role="button"
                          onClick={() => router.push(`${reportsRoot}/${item.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(`${reportsRoot}/${item.id}`);
                            }
                          }}
                          className="cursor-pointer hover:bg-slate-50"
                        >
                          <td className="px-3 py-2">
                            <p className="font-semibold text-slate-800">{item.incident_no}</p>
                            <p className="line-clamp-1 text-slate-600">{item.title}</p>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <span className="uppercase text-slate-700">{item.status_code}</span>
                              {item.is_returned_for_reassignment ? (
                                <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                  Returned
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 uppercase text-slate-700">
                            {item.severity_code ?? "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            <p>{item.site_name ?? "-"}</p>
                            <p className="line-clamp-1 text-xs text-slate-500">
                              {item.detected_address ?? item.additional_location ?? "-"}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {new Date(item.reported_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {!loading && !error && !showAdminDashboard && reportTableView === "submitted" ? (
            items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No submitted reports yet.
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto rounded-[20px] border border-[#e8edf3] bg-white shadow-[0_12px_28px_-25px_rgba(8,36,60,0.45)] md:block">
                  <table className="min-w-full text-[12px] md:text-[13px]">
                    <thead className="border-b border-[#edf1f5] bg-[#f9fbfd]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[12px] font-semibold text-[#2f3946]">
                          Incident No
                        </th>
                        <th className="px-4 py-3 text-left text-[12px] font-semibold text-[#2f3946]">
                          Title
                        </th>
                        <th className="px-4 py-3 text-left text-[12px] font-semibold text-[#2f3946]">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-[12px] font-semibold text-[#2f3946]">
                          Severity
                        </th>
                        <th className="px-4 py-3 text-left text-[12px] font-semibold text-[#2f3946]">
                          Site
                        </th>
                        <th className="px-4 py-3 text-left text-[12px] font-semibold text-[#2f3946]">
                          Detected Address
                        </th>
                        <th className="px-4 py-3 text-left text-[12px] font-semibold text-[#2f3946]">
                          Additional Location info
                        </th>
                        <th className="px-4 py-3 text-left text-[12px] font-semibold text-[#2f3946]">
                          Reported At
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef2f6]">
                      {items.map((item) => (
                        <tr
                          key={item.id}
                          tabIndex={0}
                          role="button"
                          onClick={() => router.push(`${reportsRoot}/${item.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(`${reportsRoot}/${item.id}`);
                            }
                          }}
                          className="cursor-pointer hover:bg-[#f9fbfd]"
                        >
                          <td className="px-4 py-3 font-semibold text-[#12743f]">
                            {item.incident_no}
                          </td>
                          <td className="px-4 py-3 text-[#344252]">{item.title}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1.5">
                              <span
                                className={`inline-flex w-fit rounded-lg px-2 py-1 text-[10px] font-semibold uppercase ${statusTone(item.status_code)}`}
                              >
                                {item.status_code.replaceAll("_", " ")}
                              </span>
                              {item.is_returned_for_reassignment ? (
                                <span className="inline-flex w-fit rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-800">
                                  Returned
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-semibold uppercase ${severityTone(item.severity_code)}`}
                            >
                              {item.severity_code ?? "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#344252]">{item.site_name ?? "-"}</td>
                          <td className="px-4 py-3 text-[#344252]">
                            {item.detected_address ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-[#344252]">
                            {item.additional_location ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-[#344252]">
                            {new Date(item.reported_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden">
                  <p className="mb-2 text-[11px] font-medium text-slate-500">
                    Swipe horizontally to view all columns.
                  </p>
                  <div className="overflow-x-auto rounded-[16px] border border-[#e8edf3] bg-white shadow-[0_12px_28px_-25px_rgba(8,36,60,0.45)]">
                    <table className="min-w-[980px] text-xs">
                      <thead className="border-b border-[#edf1f5] bg-[#f9fbfd]">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#2f3946]">
                            Incident No
                          </th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#2f3946]">
                            Title
                          </th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#2f3946]">
                            Status
                          </th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#2f3946]">
                            Severity
                          </th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#2f3946]">
                            Site
                          </th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#2f3946]">
                            Detected Address
                          </th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#2f3946]">
                            Additional Location info
                          </th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#2f3946]">
                            Reported At
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eef2f6]">
                        {items.map((item) => (
                          <tr
                            key={item.id}
                            tabIndex={0}
                            role="button"
                            onClick={() => router.push(`${reportsRoot}/${item.id}`)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                router.push(`${reportsRoot}/${item.id}`);
                              }
                            }}
                            className="cursor-pointer hover:bg-[#f9fbfd]"
                          >
                            <td className="px-3 py-2.5 font-semibold text-[#12743f]">
                              {item.incident_no}
                            </td>
                            <td className="px-3 py-2.5 text-[#344252]">{item.title}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col gap-1.5">
                                <span
                                  className={`inline-flex w-fit rounded-lg px-2 py-1 text-[10px] font-semibold uppercase ${statusTone(item.status_code)}`}
                                >
                                  {item.status_code.replaceAll("_", " ")}
                                </span>
                                {item.is_returned_for_reassignment ? (
                                  <span className="inline-flex w-fit rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-800">
                                    Returned
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-semibold uppercase ${severityTone(item.severity_code)}`}
                              >
                                {item.severity_code ?? "-"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-[#344252]">{item.site_name ?? "-"}</td>
                            <td className="px-3 py-2.5 text-[#344252]">
                              {item.detected_address ?? "-"}
                            </td>
                            <td className="px-3 py-2.5 text-[#344252]">
                              {item.additional_location ?? "-"}
                            </td>
                            <td className="px-3 py-2.5 text-[#344252]">
                              {new Date(item.reported_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          ) : null}

          {!loading && !error && !showAdminDashboard && reportTableView === "pending" ? (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                  Pending Sync Queue
                </h2>
                {queuedItems.length > 0 ? (
                  <button
                    type="button"
                    disabled={clearingQueue}
                    onClick={() => {
                      void (async () => {
                        setClearingQueue(true);
                        try {
                          await clearQueueAndRelatedBlobs();
                          setQueuedItems([]);
                        } finally {
                          setClearingQueue(false);
                        }
                      })();
                    }}
                    className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 disabled:opacity-60 md:text-xs"
                  >
                    {clearingQueue ? "Clearing..." : "Clear pending queue"}
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500 md:text-sm">
                These reports are saved locally and will submit automatically when connectivity and
                server access are available.
              </p>

              {queuedItems.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  No pending sync items.
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-xs md:text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">
                          Draft ID
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Title</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">
                          Attempts
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">
                          Last Error
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">
                          Queued At
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {queuedItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">
                            {item.draft.id}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {item.draft.details.title || "-"}
                          </td>
                          <td className="px-3 py-2 uppercase text-amber-700">{item.status}</td>
                          <td className="px-3 py-2 text-slate-700">{item.attempts}</td>
                          <td className="px-3 py-2 text-slate-600">{item.lastError || "-"}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {new Date(item.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
