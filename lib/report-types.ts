export type PhotoSource = "camera" | "gallery";
export type LocationSource = "gps" | "network" | "manual";
export type SyncStatus = "pending" | "syncing" | "failed" | "synced";

export interface IncidentPhoto {
  id: string;
  source: PhotoSource;
  filename: string;
  size: number;
  mimeType: string;
  createdAt: string;
  blobId: string;
  publicUrl?: string;
  serverPath?: string;
}

export interface IncidentLocation {
  lat?: number;
  lng?: number;
  accuracy?: number;
  capturedAt?: string;
  source?: LocationSource;
  formattedAddress?: string;
  locationName?: string;
  locality?: string;
  region?: string;
  country?: string;
  siteId?: string;
  siteName?: string;
  manualLocationText?: string;
}

export interface IncidentDetails {
  title: string;
  categoryId: string;
  categoryName?: string;
  severityId: string;
  severityName?: string;
  description: string;
  reporterName?: string;
  reporterEmail?: string;
  reporterPhone?: string;
  preferredContactChannel?: "email" | "phone" | "either";
}

export interface IncidentDraft {
  id: string;
  step: 1 | 2 | 3 | 4 | 5;
  photos: IncidentPhoto[];
  location: IncidentLocation;
  details: IncidentDetails;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueItem {
  id: string;
  draft: IncidentDraft;
  idempotencyKey: string;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LookupOption {
  id: string;
  code: string;
  name: string;
}

export interface SiteOption {
  id: string;
  site_code: string;
  site_name: string;
}
