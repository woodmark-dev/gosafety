"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type IncidentDetailsResponse = {
  incident: {
    id: string;
    incidentNo: string;
    title: string;
    description: string;
    reportedAt: string;
    statusCode: string;
    statusName: string;
    categoryId: string | null;
    categoryCode: string | null;
    categoryName: string | null;
    severityId: string | null;
    severityCode: string | null;
    severityName: string | null;
    sourceChannel: string;
    isHighSeverity: boolean;
    submittedBy:
      | {
          type: "staff";
          id: string | null;
          name: string | null;
          email: string | null;
        }
      | {
          type: "visitor";
          id: string | null;
          name: string | null;
          email: string | null;
          phone: string | null;
          preferredContactChannel: string | null;
        };
    location: {
      siteName: string | null;
      detectedAddress: string | null;
      additionalLocation: string | null;
      locationName: string | null;
      locality: string | null;
      region: string | null;
      country: string | null;
      latitude: string | null;
      longitude: string | null;
      accuracyM: string | null;
    };
  };
  photos: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    publicUrl: string | null;
    storageKey: string;
    sizeBytes: number;
    capturedAt: string | null;
  }>;
  timeline: Array<{
    id: string;
    changedAt: string;
    reason: string | null;
    fromStatusCode: string | null;
    fromStatusName: string | null;
    toStatusCode: string;
    toStatusName: string;
  }>;
  currentAssignment: {
    id: string;
    assignedAt: string;
    assignmentNotes: string | null;
    assignedUserId: string | null;
    assignedUserName: string | null;
    assignedUserEmail: string | null;
    assignedUserDepartmentId: string | null;
    assignedUserDepartmentName: string | null;
    teamId: string;
    teamName: string;
  } | null;
  latestReturn: {
    comment: string | null;
    returnedAt: string;
    returnedByUserId: string | null;
    returnedByName: string | null;
    returnedByEmail: string | null;
  } | null;
  currentSla: {
    slaRuleId: string;
    ruleName: string;
    startedAt: string;
    responseDueAt: string;
    resolutionDueAt: string;
    responseMetAt: string | null;
    resolutionMetAt: string | null;
    responseBreached: boolean;
    resolutionBreached: boolean;
    breachedAt: string | null;
  } | null;
  latestManagerConfirmation: {
    confirmationResult: "approved" | "rejected";
    comments: string | null;
    createdAt: string;
    managerUserId: string | null;
    managerName: string | null;
    managerEmail: string | null;
  } | null;
};

type SessionInfo = {
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

type ActionLookups = {
  fulfillmentUsers: Array<{
    id: string;
    fullName: string;
    email: string;
    teamId: string | null;
    teamName: string | null;
  }>;
  slaRules: Array<{
    id: string;
    rule_name: string;
    response_due_minutes: number;
    resolution_due_minutes: number;
  }>;
  currentSlaRuleId: string | null;
};

type ReportLookups = {
  categories: Array<{ id: string; name: string }>;
  severities: Array<{ id: string; name: string }>;
};

type TimelineStage = {
  key: "submitted" | "acknowledged" | "assigned" | "in-progress" | "resolved";
  label: string;
  statusCodes: string[];
};

const TIMELINE_STAGES: TimelineStage[] = [
  { key: "submitted", label: "Submitted", statusCodes: ["reported"] },
  { key: "acknowledged", label: "Acknowledged", statusCodes: ["under_review", "evaluated"] },
  { key: "assigned", label: "Assigned", statusCodes: ["assigned"] },
  { key: "in-progress", label: "In Progress", statusCodes: ["in_progress"] },
  {
    key: "resolved",
    label: "Resolved",
    statusCodes: ["resolved", "manager_confirmed", "closed"],
  },
];

function getStageIndexForStatus(statusCode: string) {
  return TIMELINE_STAGES.findIndex((stage) => stage.statusCodes.includes(statusCode));
}

function statusTone(code: string) {
  if (code === "reported") return "bg-blue-100 text-blue-800";
  if (code === "under_review" || code === "evaluated") return "bg-amber-100 text-amber-800";
  if (code === "assigned" || code === "in_progress") return "bg-indigo-100 text-indigo-800";
  if (code === "resolved" || code === "manager_confirmed") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (code === "closed") return "bg-slate-200 text-slate-800";
  return "bg-slate-100 text-slate-700";
}

export default function ReportDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const pathname = usePathname();
  const router = useRouter();
  const [incidentId, setIncidentId] = useState("");
  const [data, setData] = useState<IncidentDetailsResponse | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [actionLookups, setActionLookups] = useState<ActionLookups | null>(null);
  const [reportLookups, setReportLookups] = useState<ReportLookups>({
    categories: [],
    severities: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSeverityId, setEditSeverityId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [returnComment, setReturnComment] = useState("");
  const [resolutionComment, setResolutionComment] = useState("");
  const [managerComment, setManagerComment] = useState("");
  const [closeOutComment, setCloseOutComment] = useState("");
  const [slaRuleId, setSlaRuleId] = useState("");

  const canManageIncident = useMemo(() => {
    if (!session?.isStaff) {
      return false;
    }

    return Boolean(
      session.roleCodes?.includes("admin") || session.roleCodes?.includes("evaluator_hse")
    );
  }, [session]);

  const isAlreadyAcknowledged = useMemo(() => {
    return data?.incident.statusCode !== "reported";
  }, [data?.incident.statusCode]);

  const isFulfillmentMember = useMemo(() => {
    return Boolean(session?.roleCodes?.includes("fulfillment_member"));
  }, [session?.roleCodes]);

  const canShowAssignmentControls = useMemo(() => {
    if (!canManageIncident) {
      return false;
    }

    return !data?.currentAssignment;
  }, [canManageIncident, data?.currentAssignment]);

  const canReturnToAdmin = useMemo(() => {
    if (!data?.currentAssignment?.assignedUserId) {
      return false;
    }

    if (data.incident.statusCode !== "assigned") {
      return false;
    }

    return isFulfillmentMember && data.currentAssignment.assignedUserId === session?.staffUserId;
  }, [
    data?.currentAssignment?.assignedUserId,
    data?.incident.statusCode,
    isFulfillmentMember,
    session?.staffUserId,
  ]);

  const canMarkResolved = useMemo(() => {
    if (!isFulfillmentMember) {
      return false;
    }

    if (data?.incident.statusCode !== "assigned") {
      return false;
    }

    return data.currentAssignment?.assignedUserId === session?.staffUserId;
  }, [
    data?.currentAssignment?.assignedUserId,
    data?.incident.statusCode,
    isFulfillmentMember,
    session?.staffUserId,
  ]);

  const canManagerConfirmResolved = useMemo(() => {
    if (!session?.department || session.department.departmentTitle !== "manager") {
      return false;
    }

    if (data?.incident.statusCode !== "in_progress") {
      return false;
    }

    if (data.latestManagerConfirmation?.confirmationResult === "approved") {
      return false;
    }

    return (
      Boolean(data.currentAssignment?.assignedUserDepartmentId) &&
      data.currentAssignment?.assignedUserDepartmentId === session.department.departmentId
    );
  }, [
    data?.currentAssignment?.assignedUserDepartmentId,
    data?.incident.statusCode,
    data?.latestManagerConfirmation?.confirmationResult,
    session?.department,
  ]);

  const canCloseOut = useMemo(() => {
    if (!canManageIncident) {
      return false;
    }

    return (
      data?.incident.statusCode === "in_progress" &&
      data.latestManagerConfirmation?.confirmationResult === "approved"
    );
  }, [canManageIncident, data?.incident.statusCode, data?.latestManagerConfirmation]);

  async function loadActionLookups(targetIncidentId: string) {
    const cacheBust = Date.now();
    const [staffSessionResponse, actionResponse, reportLookupsResponse] = await Promise.all([
      fetch("/api/staff/session", { cache: "no-store" }),
      fetch(`/api/incidents/${targetIncidentId}/admin-actions?ts=${cacheBust}`, {
        cache: "no-store",
      }),
      fetch("/api/report/lookups", { cache: "no-store" }),
    ]);

    const sessionPayload = (await staffSessionResponse.json()) as SessionInfo & {
      message?: string;
    };
    if (staffSessionResponse.ok) {
      setSession(sessionPayload);
    }

    const reportLookupsPayload = (await reportLookupsResponse.json()) as ReportLookups & {
      message?: string;
    };
    if (reportLookupsResponse.ok) {
      setReportLookups({
        categories: reportLookupsPayload.categories ?? [],
        severities: reportLookupsPayload.severities ?? [],
      });
    }

    const actionPayload = (await actionResponse.json()) as ActionLookups & { message?: string };
    if (actionResponse.ok) {
      setActionLookups(actionPayload);
      setSlaRuleId(actionPayload.currentSlaRuleId ?? actionPayload.slaRules[0]?.id ?? "");
      setAssignedUserId((current) => {
        if (actionPayload.fulfillmentUsers.some((user) => user.id === current)) {
          return current;
        }

        return actionPayload.fulfillmentUsers[0]?.id ?? "";
      });
    } else {
      setActionLookups(null);
    }
  }

  async function reloadIncident(targetIncidentId: string) {
    const response = await fetch(`/api/incidents/${targetIncidentId}`, {
      method: "GET",
      cache: "no-store",
    });

    const payload = (await response.json()) as IncidentDetailsResponse & { message?: string };

    if (!response.ok) {
      throw new Error(payload.message ?? "Failed to load incident details");
    }

    setData(payload);
    setEditTitle(payload.incident.title);
    setEditDescription(payload.incident.description);
    setEditCategoryId(payload.incident.categoryId ?? "");
    setEditSeverityId(payload.incident.severityId ?? "");
  }

  async function runAction(body: Record<string, unknown>) {
    if (!incidentId) {
      return;
    }

    setBusyAction(true);
    setActionMessage("");
    setError("");

    try {
      const response = await fetch(`/api/incidents/${incidentId}/admin-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Action failed");
      }

      if (body.action === "return_to_admin") {
        setReturnComment("");
        const targetReportsHref = pathname.startsWith("/dashboard")
          ? "/dashboard/reports"
          : pathname.startsWith("/visitor")
            ? "/visitor/reports"
            : "/reports";
        router.push(targetReportsHref);
        return;
      }

      await Promise.all([reloadIncident(incidentId), loadActionLookups(incidentId)]);
      if (body.action === "assign_fulfillment") {
        setAssignmentNotes("");
      }
      if (body.action === "mark_resolved") {
        setResolutionComment("");
      }
      if (body.action === "manager_confirm_resolved") {
        setManagerComment("");
      }
      if (body.action === "close_out") {
        setCloseOutComment("");
      }
      setActionMessage("Incident updated successfully.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed");
    } finally {
      setBusyAction(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      setLoading(true);
      setError("");

      try {
        const resolvedParams = await params;
        if (cancelled) return;

        setIncidentId(resolvedParams.incidentId);

        if (!cancelled) {
          await reloadIncident(resolvedParams.incidentId);
          await loadActionLookups(resolvedParams.incidentId);
        }
      } catch (detailsError) {
        if (!cancelled) {
          setError(
            detailsError instanceof Error ? detailsError.message : "Failed to load incident details"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!incidentId) {
      return;
    }

    const refreshLookups = () => {
      void loadActionLookups(incidentId);
    };

    const timer = window.setInterval(refreshLookups, 15000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshLookups();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [incidentId]);

  const timeline = useMemo(() => data?.timeline ?? [], [data]);
  const reportsHref = pathname.startsWith("/dashboard")
    ? "/dashboard/reports"
    : pathname.startsWith("/visitor")
      ? "/visitor/reports"
      : "/reports";

  const stageRows = useMemo(() => {
    const entries = timeline;
    const currentStatus = data?.incident.statusCode ?? "";
    const currentIndex = getStageIndexForStatus(currentStatus);

    let maxReachedByHistory = -1;
    for (const entry of entries) {
      const idx = getStageIndexForStatus(entry.toStatusCode);
      if (idx > maxReachedByHistory) {
        maxReachedByHistory = idx;
      }
    }

    const effectiveCurrentIndex = currentIndex >= 0 ? currentIndex : maxReachedByHistory;

    return TIMELINE_STAGES.map((stage, index) => {
      const matchedEntry = entries
        .filter((entry) => stage.statusCodes.includes(entry.toStatusCode))
        .sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt))[0];

      const isCurrent = index === effectiveCurrentIndex;
      const isCompleted = index < effectiveCurrentIndex || Boolean(matchedEntry);

      return {
        key: stage.key,
        label: stage.label,
        isCurrent,
        isCompleted,
        reason: matchedEntry?.reason ?? null,
        changedAt: matchedEntry?.changedAt ?? null,
      };
    });
  }, [data?.incident.statusCode, timeline]);

  const slaTone = useMemo(() => {
    if (!data?.currentSla) {
      return null;
    }

    if (data.currentSla.responseBreached || data.currentSla.resolutionBreached) {
      return {
        container: "border-rose-300 bg-rose-50",
        badge: "bg-rose-600 text-white",
        heading: "text-rose-900",
        body: "text-rose-800",
      };
    }

    return {
      container: "border-emerald-300 bg-emerald-50",
      badge: "bg-emerald-700 text-white",
      heading: "text-emerald-900",
      body: "text-emerald-800",
    };
  }, [data?.currentSla]);

  const isActionPanelLocked = useMemo(() => {
    return Boolean(data?.currentAssignment?.assignedUserId);
  }, [data?.currentAssignment?.assignedUserId]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f3f6fa] p-3 text-slate-900 md:p-6">
      <div className="mx-auto w-full max-w-6xl rounded-3xl border border-[#e4e9ef] bg-white shadow-[0_22px_50px_-35px_rgba(18,42,66,0.45)]">
        <header className="border-b border-[#e4e9ef] px-4 py-4 md:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="break-words text-[30px] font-semibold tracking-tight text-[#0f172a] md:text-[34px]">
                <span className="font-bold text-[#0a7e49]">GoSafety</span>
                <span className="mx-1.5 text-slate-400">/</span>
                <span>Incident Details</span>
              </h1>
              <p className="text-sm text-slate-500">
                Detailed report view with photos and timeline.
              </p>
            </div>
            <Link
              href={reportsHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#8cc9a7] px-4 py-2 text-center text-sm font-semibold text-[#0a7e49] sm:w-auto"
            >
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12.5 5 7.5 10l5 5" />
              </svg>
              Back to reports
            </Link>
          </div>
        </header>

        <section className="space-y-4 p-4 md:p-6">
          {loading ? <p className="text-sm text-slate-600">Loading incident details...</p> : null}
          {error ? (
            <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
          ) : null}

          {!loading && !error && data ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[#e4ebf2] bg-white p-3 md:p-4">
                  <h3 className="mb-3 inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#e9f7ef] text-[#0a7e49]">
                      <svg
                        viewBox="0 0 20 20"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <rect x="3.5" y="4.5" width="13" height="11" rx="2" />
                        <path d="M7 4.5V3.5h6v1" />
                      </svg>
                    </span>
                    Photos
                  </h3>
                  {data.photos.length === 0 ? (
                    <p className="text-sm text-slate-600">No photos available.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.photos.map((photo) => (
                        <div
                          key={photo.id}
                          className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white"
                        >
                          {photo.publicUrl ? (
                            <img
                              src={photo.publicUrl}
                              alt={photo.fileName}
                              className="h-44 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-44 items-center justify-center bg-slate-100 text-xs text-slate-500">
                              Preview unavailable
                            </div>
                          )}
                          <div className="space-y-1 p-3 text-xs text-slate-600">
                            <p className="truncate font-semibold text-slate-800">
                              {photo.fileName}
                            </p>
                            <p>{(photo.sizeBytes / 1024).toFixed(1)} KB</p>
                            <p>
                              {photo.capturedAt ? new Date(photo.capturedAt).toLocaleString() : "-"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-[#e4ebf2] bg-white p-3 md:p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="max-w-full break-all rounded-md bg-[#e8f6ee] px-2 py-1 text-[10px] font-semibold text-[#0f7a45]">
                      {data.incident.incidentNo}
                    </span>
                    <span
                      className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase ${statusTone(data.incident.statusCode)}`}
                    >
                      {data.incident.statusCode}
                    </span>
                    <span className="rounded-md bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">
                      Severity: {data.incident.severityCode ?? "-"}
                    </span>
                  </div>

                  <h2 className="break-words text-[30px] font-semibold text-slate-900 md:text-[34px]">
                    {data.incident.title}
                  </h2>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p className="inline-flex items-start gap-2">
                      <svg
                        viewBox="0 0 20 20"
                        className="mt-0.5 h-4 w-4 text-[#0a7e49]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M5 4.5h10v11H5z" />
                        <path d="M7.5 7.5h5M7.5 10h4" />
                      </svg>
                      <span>{data.incident.description}</span>
                    </p>
                    <p className="inline-flex items-start gap-2">
                      <svg
                        viewBox="0 0 20 20"
                        className="mt-0.5 h-4 w-4 text-[#0a7e49]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="m4 10 3 3 9-9" />
                      </svg>
                      <span>Category: {data.incident.categoryName ?? "-"}</span>
                    </p>
                    <p className="inline-flex items-start gap-2">
                      <svg
                        viewBox="0 0 20 20"
                        className="mt-0.5 h-4 w-4 text-[#64748b]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <rect x="4" y="5" width="12" height="11" rx="1.8" />
                        <path d="M7 3.5v3M13 3.5v3M4 8.5h12" />
                      </svg>
                      <span>Reported: {new Date(data.incident.reportedAt).toLocaleString()}</span>
                    </p>
                  </div>
                </div>
              </div>

              {data.currentSla && slaTone ? (
                <div className={`rounded-xl border p-4 ${slaTone.container}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${slaTone.badge}`}
                    >
                      SLA assigned
                    </span>
                    {(data.currentSla.responseBreached || data.currentSla.resolutionBreached) && (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-800">
                        Breach detected
                      </span>
                    )}
                  </div>

                  <h3 className={`text-base font-semibold ${slaTone.heading}`}>
                    {data.currentSla.ruleName}
                  </h3>
                  <div className={`mt-2 grid gap-2 text-sm sm:grid-cols-2 ${slaTone.body}`}>
                    <p>Started: {new Date(data.currentSla.startedAt).toLocaleString()}</p>
                    <p>Response due: {new Date(data.currentSla.responseDueAt).toLocaleString()}</p>
                    <p>
                      Resolution due: {new Date(data.currentSla.resolutionDueAt).toLocaleString()}
                    </p>
                    <p>
                      Response status: {data.currentSla.responseBreached ? "Breached" : "On track"}
                    </p>
                  </div>
                </div>
              ) : null}

              {canManageIncident ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 text-base font-semibold text-slate-900">Incident Actions</h3>
                  {actionMessage ? (
                    <p className="mb-3 rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">
                      {actionMessage}
                    </p>
                  ) : null}
                  {isActionPanelLocked ? (
                    <p className="mb-3 rounded-md bg-slate-100 p-2 text-sm text-slate-700">
                      A fulfillment member has been assigned. Acknowledge, SLA, and detail edits are
                      now locked.
                    </p>
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-2">
                    {!isActionPanelLocked ? (
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-sm font-semibold text-slate-800">Acknowledge Incident</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Sets incident status to acknowledged stage.
                        </p>
                        <button
                          type="button"
                          disabled={busyAction || isAlreadyAcknowledged}
                          onClick={() => {
                            void runAction({ action: "acknowledge" });
                          }}
                          className={`mt-3 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 ${
                            isAlreadyAcknowledged ? "blur-[1px]" : ""
                          }`}
                        >
                          Acknowledge
                        </button>
                      </div>
                    ) : null}

                    {!isActionPanelLocked ? (
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-sm font-semibold text-slate-800">Assign SLA</p>
                        <select
                          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={slaRuleId}
                          onChange={(event) => setSlaRuleId(event.target.value)}
                        >
                          {(actionLookups?.slaRules ?? []).map((rule) => (
                            <option key={rule.id} value={rule.id}>
                              {rule.rule_name} ({rule.response_due_minutes}m /{" "}
                              {rule.resolution_due_minutes}m)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busyAction || !slaRuleId}
                          onClick={() => {
                            void runAction({ action: "assign_sla", slaRuleId });
                          }}
                          className="mt-3 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Assign SLA
                        </button>
                      </div>
                    ) : null}

                    {!isActionPanelLocked ? (
                      <div className="rounded-lg border border-slate-200 p-3 lg:col-span-2">
                        <p className="text-sm font-semibold text-slate-800">
                          Edit Incident Details
                        </p>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <input
                            className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            placeholder="Title"
                          />
                          <select
                            className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={editCategoryId}
                            onChange={(event) => setEditCategoryId(event.target.value)}
                          >
                            <option value="">Select category</option>
                            {reportLookups.categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                          <select
                            className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={editSeverityId}
                            onChange={(event) => setEditSeverityId(event.target.value)}
                          >
                            <option value="">Select severity</option>
                            {reportLookups.severities.map((severity) => (
                              <option key={severity.id} value={severity.id}>
                                {severity.name}
                              </option>
                            ))}
                          </select>
                          <textarea
                            className="min-h-24 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
                            value={editDescription}
                            onChange={(event) => setEditDescription(event.target.value)}
                            placeholder="Description"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => {
                            void runAction({
                              action: "update_details",
                              title: editTitle,
                              description: editDescription,
                              categoryId: editCategoryId,
                              severityId: editSeverityId,
                            });
                          }}
                          className="mt-3 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Save Details
                        </button>
                      </div>
                    ) : null}

                    {data.currentAssignment ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 lg:col-span-2">
                        <p className="text-sm font-semibold text-slate-800">
                          Fulfillment Assignment
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Assigned to {data.currentAssignment.assignedUserName ?? "-"} (
                          {data.currentAssignment.assignedUserEmail ?? "-"}) in team{" "}
                          {data.currentAssignment.teamName} on{" "}
                          {new Date(data.currentAssignment.assignedAt).toLocaleString()}.
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Assignment comment: {data.currentAssignment.assignmentNotes ?? "-"}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Assignee department:{" "}
                          {data.currentAssignment.assignedUserDepartmentName ?? "-"}
                        </p>
                      </div>
                    ) : null}

                    {canShowAssignmentControls ? (
                      <div className="rounded-lg border border-slate-200 p-3 lg:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800">
                            Assign Fulfillment Member
                          </p>
                          <button
                            type="button"
                            disabled={busyAction || !incidentId}
                            onClick={() => {
                              void loadActionLookups(incidentId);
                            }}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                          >
                            Refresh members
                          </button>
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <select
                            className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={assignedUserId}
                            onChange={(event) => setAssignedUserId(event.target.value)}
                          >
                            {(actionLookups?.fulfillmentUsers?.length ?? 0) === 0 ? (
                              <option value="">No fulfillment members available</option>
                            ) : null}
                            {(actionLookups?.fulfillmentUsers ?? []).map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.fullName} ({user.email}){" "}
                                {user.teamName ? `- ${user.teamName}` : ""}
                              </option>
                            ))}
                          </select>
                          <input
                            className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={assignmentNotes}
                            onChange={(event) => setAssignmentNotes(event.target.value)}
                            placeholder="Assignment notes"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={busyAction || !assignedUserId}
                          onClick={() => {
                            void runAction({
                              action: "assign_fulfillment",
                              assignedUserId,
                              assignmentNotes,
                            });
                          }}
                          className="mt-3 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Assign Member
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {data?.latestReturn?.comment ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-base font-semibold text-amber-900">
                    Latest Fulfillment Return Comment
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-amber-900">
                    {data.latestReturn.comment}
                  </p>
                  <p className="mt-2 text-xs text-amber-800">
                    Returned by {data.latestReturn.returnedByName ?? "Fulfillment member"} on{" "}
                    {new Date(data.latestReturn.returnedAt).toLocaleString()}
                  </p>
                </div>
              ) : null}

              {data.latestManagerConfirmation?.confirmationResult === "approved" ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <h3 className="text-base font-semibold text-emerald-900">Manager Confirmation</h3>
                  <p className="mt-2 text-sm text-emerald-900">
                    Confirmed by{" "}
                    {data.latestManagerConfirmation.managerName ?? "Department manager"} on{" "}
                    {new Date(data.latestManagerConfirmation.createdAt).toLocaleString()}.
                  </p>
                  <p className="mt-1 text-sm text-emerald-900">
                    Comment: {data.latestManagerConfirmation.comments ?? "-"}
                  </p>
                </div>
              ) : null}

              {canMarkResolved ? (
                <div className="rounded-xl border border-indigo-300 bg-white p-4">
                  <h3 className="text-base font-semibold text-slate-900">Fulfillment Resolution</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Click Resolved to move this incident to In Progress and send it to your
                    department manager.
                  </p>
                  <textarea
                    className="mt-2 min-h-24 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={resolutionComment}
                    onChange={(event) => setResolutionComment(event.target.value)}
                    placeholder="Resolution comment (optional)"
                  />
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => {
                      void runAction({
                        action: "mark_resolved",
                        resolutionComment,
                      });
                    }}
                    className="mt-3 rounded-md bg-indigo-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Resolved
                  </button>
                </div>
              ) : null}

              {canManagerConfirmResolved ? (
                <div className="rounded-xl border border-emerald-300 bg-white p-4">
                  <h3 className="text-base font-semibold text-slate-900">Manager Review</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Confirm this incident is resolved so admin/evaluator can close it out.
                  </p>
                  <textarea
                    className="mt-2 min-h-24 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={managerComment}
                    onChange={(event) => setManagerComment(event.target.value)}
                    placeholder="Manager confirmation comment (optional)"
                  />
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => {
                      void runAction({
                        action: "manager_confirm_resolved",
                        managerComment,
                      });
                    }}
                    className="mt-3 rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Confirm Resolved
                  </button>
                </div>
              ) : null}

              {canCloseOut ? (
                <div className="rounded-xl border border-blue-300 bg-white p-4">
                  <h3 className="text-base font-semibold text-slate-900">Close Out Incident</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Finalize this incident. Status will move to Resolved.
                  </p>
                  <textarea
                    className="mt-2 min-h-24 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={closeOutComment}
                    onChange={(event) => setCloseOutComment(event.target.value)}
                    placeholder="Close out comment (optional)"
                  />
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => {
                      void runAction({
                        action: "close_out",
                        closeOutComment,
                      });
                    }}
                    className="mt-3 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Close Out
                  </button>
                </div>
              ) : null}

              {canReturnToAdmin ? (
                <div className="rounded-xl border border-amber-300 bg-white p-4">
                  <h3 className="text-base font-semibold text-slate-900">
                    Return to Admin/Evaluator
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Add a comment so admin/evaluator can reassign this incident.
                  </p>
                  <textarea
                    className="mt-2 min-h-24 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={returnComment}
                    onChange={(event) => setReturnComment(event.target.value)}
                    placeholder="Why are you returning this incident?"
                  />
                  <button
                    type="button"
                    disabled={busyAction || !returnComment.trim()}
                    onClick={() => {
                      void runAction({
                        action: "return_to_admin",
                        returnComment,
                      });
                    }}
                    className="mt-3 rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Return Incident
                  </button>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0 rounded-2xl border border-[#e4ebf2] p-4">
                  <h3 className="mb-3 inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#e9f7ef] text-[#0a7e49]">
                      <svg
                        viewBox="0 0 20 20"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <circle cx="10" cy="6.8" r="2.2" />
                        <path d="M5.2 15.5c1-2.1 2.8-3.2 4.8-3.2s3.8 1.1 4.8 3.2" />
                      </svg>
                    </span>
                    Submitted By
                    <span className="ml-auto text-slate-400 lg:hidden">
                      <svg
                        viewBox="0 0 20 20"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M7 5l5 5-5 5" />
                      </svg>
                    </span>
                  </h3>
                  <dl className="grid grid-cols-1 gap-2 text-sm text-slate-700">
                    <div>
                      <dt className="font-semibold text-slate-600">Reporter type</dt>
                      <dd>
                        {data.incident.submittedBy.type === "staff" ? (
                          <span className="inline-flex rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold uppercase text-blue-800">
                            Staff
                          </span>
                        ) : (
                          <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-800">
                            Visitor
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">Name</dt>
                      <dd className="break-words">{data.incident.submittedBy.name ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">Email</dt>
                      <dd className="break-words">{data.incident.submittedBy.email ?? "-"}</dd>
                    </div>
                    {data.incident.submittedBy.type === "visitor" ? (
                      <>
                        <div>
                          <dt className="font-semibold text-slate-600">Phone</dt>
                          <dd className="break-words">{data.incident.submittedBy.phone ?? "-"}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-600">Preferred contact</dt>
                          <dd>{data.incident.submittedBy.preferredContactChannel ?? "-"}</dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                </div>

                <div className="min-w-0 rounded-2xl border border-[#e4ebf2] p-4">
                  <h3 className="mb-3 inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#e9f7ef] text-[#0a7e49]">
                      <svg
                        viewBox="0 0 20 20"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M10 16c2.8-3.3 4.5-5.5 4.5-7.7A4.5 4.5 0 0 0 10 3.8a4.5 4.5 0 0 0-4.5 4.5c0 2.2 1.7 4.4 4.5 7.7z" />
                        <circle cx="10" cy="8.3" r="1.2" />
                      </svg>
                    </span>
                    Location
                    <span className="ml-auto text-slate-400 lg:hidden">
                      <svg
                        viewBox="0 0 20 20"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M7 5l5 5-5 5" />
                      </svg>
                    </span>
                  </h3>
                  <dl className="grid grid-cols-1 gap-2 text-sm text-slate-700">
                    <div>
                      <dt className="font-semibold text-slate-600">Site</dt>
                      <dd className="break-words">{data.incident.location.siteName ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">Detected address</dt>
                      <dd className="break-words">
                        {data.incident.location.detectedAddress ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">Additional location</dt>
                      <dd className="break-words">
                        {data.incident.location.additionalLocation ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">Coordinates</dt>
                      <dd>
                        {data.incident.location.latitude && data.incident.location.longitude
                          ? `${data.incident.location.latitude}, ${data.incident.location.longitude}`
                          : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">Accuracy (m)</dt>
                      <dd>{data.incident.location.accuracyM ?? "-"}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-2xl border border-[#e4ebf2] p-4 lg:col-span-2">
                  <h3 className="mb-3 inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#e9f7ef] text-[#0a7e49]">
                      <svg
                        viewBox="0 0 20 20"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M5 4.5v11M5 10h4M9 10l2.2-2.2M9 10l2.2 2.2M14.5 4.5v11" />
                      </svg>
                    </span>
                    Status Timeline
                  </h3>
                  <ol className="space-y-0">
                    {stageRows.map((stage, index) => {
                      const markerClass = stage.isCurrent
                        ? "border-[#0a7e49] bg-[#0a7e49] text-white"
                        : stage.isCompleted
                          ? "border-[#0a7e49] bg-[#0a7e49] text-white"
                          : "border-slate-300 bg-white text-transparent";

                      return (
                        <li key={stage.key} className="relative pb-5 pl-9 last:pb-0">
                          {index < stageRows.length - 1 ? (
                            <span className="absolute left-[11px] top-6 h-full w-px bg-slate-300" />
                          ) : null}

                          <span
                            className={`absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${markerClass}`}
                          >
                            {stage.isCurrent || stage.isCompleted ? "\u2713" : ""}
                          </span>

                          <p className="text-sm font-semibold text-slate-700 md:text-base">
                            {stage.label}
                          </p>
                          <p className="text-xs text-slate-600 md:text-sm">{stage.reason ?? "-"}</p>
                          <p className="text-xs text-slate-500 md:text-sm">
                            {stage.changedAt ? new Date(stage.changedAt).toLocaleString() : "-"}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            </>
          ) : null}

          {!loading && !error && !data ? (
            <p className="text-sm text-slate-600">No details found for incident ID {incidentId}.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
