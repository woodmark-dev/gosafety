import type { IncidentDraft, SiteOption } from "@/lib/report-types";

type StepLocationProps = {
  location: IncidentDraft["location"];
  sites: SiteOption[];
  busy: boolean;
  onDetect: () => void;
  onSelectSite: (siteId: string) => void;
  onManualLocationChange: (value: string) => void;
};

export default function StepLocation({
  location,
  sites,
  busy,
  onDetect,
  onSelectSite,
  onManualLocationChange,
}: StepLocationProps) {
  const hasDetectedAddress = Boolean(location.formattedAddress?.trim());

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
            <path d="M10 16c2.8-3.3 4.5-5.5 4.5-7.7A4.5 4.5 0 0 0 10 3.8a4.5 4.5 0 0 0-4.5 4.5c0 2.2 1.7 4.4 4.5 7.7z" />
            <circle cx="10" cy="8.3" r="1.4" />
          </svg>
        </span>
        <h2 className="text-[30px] font-semibold text-[#0f172a] md:text-[34px]">
          Step 2: Location
        </h2>
      </div>

      <p className="text-[15px] text-slate-600 md:text-base">
        We will auto-detect your address when you enter this step. You can run detection again.
      </p>

      <button
        type="button"
        onClick={onDetect}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-[#0a7e49] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-14px_rgba(10,126,73,0.75)] disabled:opacity-60"
      >
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M10 3.8v2.1M10 14.1v2.1M3.8 10h2.1M14.1 10h2.1" />
          <circle cx="10" cy="10" r="4.2" />
        </svg>
        {busy ? "Detecting..." : "Auto-detect location"}
      </button>

      {hasDetectedAddress ? (
        <div className="rounded-xl border border-[#e4ebf2] bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Detected location</h3>
          <label className="mb-2 block text-sm">
            Detected address
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={location.formattedAddress ?? ""}
              readOnly
            />
          </label>

          <label className="block text-sm">
            Additional address details (optional)
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={location.manualLocationText ?? ""}
              onChange={(e) => onManualLocationChange(e.target.value)}
              placeholder="e.g., Floor 4, Room 12B, next to control panel"
            />
          </label>
        </div>
      ) : (
        <div className="rounded-xl border border-[#e4ebf2] bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Manual fallback</h3>
          <label className="mb-2 block text-sm">
            Site selection
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={location.siteId ?? ""}
              onChange={(e) => onSelectSite(e.target.value)}
            >
              <option value="">Select site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.site_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            Additional address details (optional)
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={location.manualLocationText ?? ""}
              onChange={(e) => onManualLocationChange(e.target.value)}
              placeholder="e.g., Floor 4, Room 12B, next to control panel"
            />
          </label>
        </div>
      )}

      {hasDetectedAddress ? (
        <div className="rounded-xl bg-[#eafaf0] px-3 py-2.5 text-sm text-[#0b7a45]">
          Location and place name captured successfully.
        </div>
      ) : null}
    </div>
  );
}
