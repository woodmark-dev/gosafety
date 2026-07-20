import type { IncidentDraft } from "@/lib/report-types";

export function createEmptyDraft(): IncidentDraft {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    step: 1,
    photos: [],
    location: {},
    details: {
      title: "",
      categoryId: "",
      severityId: "",
      description: "",
      reporterName: "",
      reporterEmail: "",
      reporterPhone: "",
      preferredContactChannel: undefined,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function touchDraft(draft: IncidentDraft): IncidentDraft {
  return { ...draft, updatedAt: new Date().toISOString() };
}
