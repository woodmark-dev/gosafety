import type { IncidentDetails, LookupOption } from "@/lib/report-types";

type StepDetailsProps = {
  details: IncidentDetails;
  categories: LookupOption[];
  severities: LookupOption[];
  listening: boolean;
  onToggleVoice: () => void;
  onChangeTitle: (value: string) => void;
  onChangeCategory: (categoryId: string) => void;
  onChangeSeverity: (severityId: string) => void;
  onChangeDescription: (value: string) => void;
};

export default function StepDetails({
  details,
  categories,
  severities,
  listening,
  onToggleVoice,
  onChangeTitle,
  onChangeCategory,
  onChangeSeverity,
  onChangeDescription,
}: StepDetailsProps) {
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
            <rect x="5" y="4" width="10" height="12" rx="1.8" />
            <path d="M8 8h4M8 11h4" />
          </svg>
        </span>
        <h2 className="text-[30px] font-semibold text-[#0f172a] md:text-[34px]">
          Step 3: Incident Details
        </h2>
      </div>

      <label className="block text-sm">
        Incident title *
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          value={details.title}
          onChange={(e) => onChangeTitle(e.target.value)}
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          Category *
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            value={details.categoryId}
            onChange={(e) => onChangeCategory(e.target.value)}
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          Severity *
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            value={details.severityId}
            onChange={(e) => onChangeSeverity(e.target.value)}
          >
            <option value="">Select severity</option>
            {severities.map((severity) => (
              <option key={severity.id} value={severity.id}>
                {severity.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        Description *
        <div className="relative mt-1">
          <textarea
            className="min-h-36 w-full rounded-lg border border-slate-300 px-3 py-2.5 pb-12 pr-12 text-sm"
            value={details.description}
            onChange={(e) => onChangeDescription(e.target.value)}
          />
          <button
            type="button"
            onClick={onToggleVoice}
            aria-label={listening ? "Stop voice-to-text" : "Start voice-to-text"}
            title={listening ? "Stop voice-to-text" : "Start voice-to-text"}
            className={`absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition ${
              listening
                ? "border-rose-700 bg-rose-600 text-white"
                : "border-[#a7d6ba] bg-[#f3fbf6] text-[#0a7e49]"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 1 1-14 0 1 1 0 1 1 2 0 5 5 0 1 0 10 0Zm-4 7.93V22a1 1 0 1 1-2 0v-2.07A9.01 9.01 0 0 1 3 11a1 1 0 1 1 2 0 7 7 0 1 0 14 0 1 1 0 1 1 2 0 9.01 9.01 0 0 1-8 8.93Z" />
            </svg>
          </button>
        </div>
      </label>
    </div>
  );
}
