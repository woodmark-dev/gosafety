import type { IncidentDetails } from "@/lib/report-types";

type PreferredContact = "email" | "phone" | "either";

type StepReporterContactProps = {
  details: IncidentDetails;
  onChangeName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onChangePhone: (value: string) => void;
  onChangePreferredContact: (value: PreferredContact) => void;
};

export default function StepReporterContact({
  details,
  onChangeName,
  onChangeEmail,
  onChangePhone,
  onChangePreferredContact,
}: StepReporterContactProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 4: Contact Details</h2>

      <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">
        These details are required so the team can follow up about this hazard report.
      </p>

      <label className="block text-sm">
        Full name *
        <input
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          value={details.reporterName ?? ""}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="Enter your full name"
        />
      </label>

      <label className="block text-sm">
        Email address *
        <input
          type="email"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          value={details.reporterEmail ?? ""}
          onChange={(e) => onChangeEmail(e.target.value)}
          placeholder="name@example.com"
        />
      </label>

      <label className="block text-sm">
        Phone number *
        <input
          type="tel"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          value={details.reporterPhone ?? ""}
          onChange={(e) => onChangePhone(e.target.value)}
          placeholder="Enter phone number"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Preferred contact method *</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { value: "email", label: "Email" },
            { value: "phone", label: "Phone number" },
            { value: "either", label: "Either" },
          ].map((option) => {
            const active = details.preferredContactChannel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChangePreferredContact(option.value as PreferredContact)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
