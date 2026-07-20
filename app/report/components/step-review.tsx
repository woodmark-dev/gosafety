import Image from "next/image";
import type { IncidentDraft } from "@/lib/report-types";

type StepReviewProps = {
  draft: IncidentDraft;
  previewUrls: Record<string, string>;
  busy: boolean;
  networkOnline: boolean;
  reviewStepNumber: number;
  onEditStep: (step: 1 | 2 | 3 | 4) => void;
  onSubmit: () => void;
};

export default function StepReview({
  draft,
  previewUrls,
  busy,
  networkOnline,
  reviewStepNumber,
  onEditStep,
  onSubmit,
}: StepReviewProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-[#e4ebf2] bg-white p-4 shadow-[0_12px_36px_-28px_rgba(12,30,54,0.45)] md:p-5">
      <div className="inline-flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#e7f7ee] text-[#0a7e49]">
          <svg
            viewBox="0 0 20 20"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="4" y="3.5" width="12" height="13" rx="2" />
            <path d="M7 10l2.1 2.1L13 8.8" />
          </svg>
        </span>
        <h2 className="text-[30px] font-semibold text-[#0f172a] md:text-[34px]">
          Step {reviewStepNumber}: Review & Submit
        </h2>
      </div>

      <p className="text-sm text-slate-600">
        Please review the information below before submitting your incident report.
      </p>

      <div className="rounded-xl border border-[#e4ebf2] bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Photos ({draft.photos.length})</h3>
          <button
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
            type="button"
            onClick={() => onEditStep(1)}
          >
            Edit
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {draft.photos.map((photo) => (
            <div key={photo.id} className="rounded-lg border border-slate-200 bg-white p-1">
              <Image
                src={previewUrls[photo.id] || "/window.svg"}
                alt={photo.filename}
                className="h-16 w-full rounded object-cover"
                width={80}
                height={64}
                unoptimized
              />
              <p className="mt-1 truncate text-[11px] text-slate-500">{photo.source}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#e4ebf2] bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Location</h3>
          <button
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
            type="button"
            onClick={() => onEditStep(2)}
          >
            Edit
          </button>
        </div>
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Detected address:</span>{" "}
          {draft.location.formattedAddress ?? "-"}
        </p>
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Site:</span> {draft.location.siteName ?? "-"}
        </p>
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Additional details:</span>{" "}
          {draft.location.manualLocationText ?? "-"}
        </p>
      </div>

      <div className="rounded-xl border border-[#e4ebf2] bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Incident details</h3>
          <button
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
            type="button"
            onClick={() => onEditStep(3)}
          >
            Edit
          </button>
        </div>
        <p className="text-sm">
          <span className="font-semibold">Title:</span> {draft.details.title}
        </p>
        <p className="text-sm">
          <span className="font-semibold">Category:</span>{" "}
          {draft.details.categoryName || draft.details.categoryId}
        </p>
        <p className="text-sm">
          <span className="font-semibold">Severity:</span>{" "}
          {draft.details.severityName || draft.details.severityId}
        </p>
        <p className="mt-2 rounded-md bg-white p-3 text-sm text-slate-700">
          {draft.details.description}
        </p>
      </div>

      {draft.details.preferredContactChannel ? (
        <div className="rounded-xl border border-[#e4ebf2] bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Reporter contact</h3>
            <button
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
              type="button"
              onClick={() => onEditStep(4)}
            >
              Edit
            </button>
          </div>
          <p className="text-sm">
            <span className="font-semibold">Name:</span> {draft.details.reporterName || "-"}
          </p>
          <p className="text-sm">
            <span className="font-semibold">Email:</span> {draft.details.reporterEmail || "-"}
          </p>
          <p className="text-sm">
            <span className="font-semibold">Phone:</span> {draft.details.reporterPhone || "-"}
          </p>
          <p className="text-sm">
            <span className="font-semibold">Preferred contact:</span>{" "}
            {draft.details.preferredContactChannel}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={onSubmit}
        className="w-full rounded-xl bg-[#0a7e49] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_-14px_rgba(10,126,73,0.8)] disabled:opacity-60"
      >
        {busy ? "Submitting..." : networkOnline ? "Submit now" : "Save and queue offline"}
      </button>
    </div>
  );
}
