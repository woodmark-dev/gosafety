"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import StepDetails from "@/app/report/components/step-details";
import StepLocation from "@/app/report/components/step-location";
import StepPhotos from "@/app/report/components/step-photos";
import StepReporterContact from "@/app/report/components/step-reporter-contact";
import StepReview from "@/app/report/components/step-review";
import { createEmptyDraft, touchDraft } from "@/lib/client/report-draft";
import {
  addQueueItem,
  clearDraft,
  deletePhotoBlob,
  deleteQueueItem,
  getPhotoBlob,
  getQueueItems,
  loadDraft,
  saveDraft,
  savePhotoBlob,
  updateQueueItem,
} from "@/lib/client/report-storage";
import type {
  IncidentDraft,
  IncidentPhoto,
  LookupOption,
  SiteOption,
  SyncQueueItem,
} from "@/lib/report-types";

type Step = 1 | 2 | 3 | 4 | 5;
const STALE_SYNC_MS = 2 * 60 * 1000;

const OFFLINE_LOOKUPS: {
  categories: LookupOption[];
  severities: LookupOption[];
  sites: SiteOption[];
} = {
  categories: [
    { id: "unsafe_condition", code: "unsafe_condition", name: "Unsafe Condition" },
    { id: "near_miss", code: "near_miss", name: "Near Miss" },
    { id: "injury", code: "injury", name: "Injury" },
    { id: "environmental", code: "environmental", name: "Environmental" },
    { id: "property_damage", code: "property_damage", name: "Property Damage" },
  ],
  severities: [
    { id: "low", code: "low", name: "Low" },
    { id: "medium", code: "medium", name: "Medium" },
    { id: "high", code: "high", name: "High" },
    { id: "critical", code: "critical", name: "Critical" },
  ],
  sites: [
    { id: "manual-nnpc-towers", site_code: "NNPC_TOWERS", site_name: "NNPC Towers" },
    { id: "manual-rti-nexus", site_code: "RTI_NEXUS", site_name: "RTI Nexus" },
    { id: "manual-krpc", site_code: "KRPC", site_name: "KRPC" },
  ],
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type PostSubmitState =
  | {
      kind: "submitted";
      incidentNo: string;
    }
  | {
      kind: "queued-offline";
    }
  | {
      kind: "queued-submit-failed";
      reason?: string;
    }
  | null;

class SubmitError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "SubmitError";
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function stepLabel(step: Step, isStaffFlow: boolean) {
  if (step === 1) return "Add Photos";
  if (step === 2) return "Location";
  if (step === 3) return "Details";
  if (!isStaffFlow && step === 4) return "Contact Details";
  return "Review & Submit";
}

function isRetryableSubmitError(error: unknown) {
  if (error instanceof SubmitError) {
    if (typeof error.status === "number") {
      // Retry transient server/network conditions only.
      if (error.status >= 500 || error.status === 408 || error.status === 429) {
        return true;
      }
      return false;
    }

    const lower = error.message.toLowerCase();
    if (lower.includes("missing local blob")) {
      return false;
    }

    return true;
  }

  return true;
}

async function scheduleBackgroundQueueSync() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const syncRegistration = registration as ServiceWorkerRegistration & {
      sync?: {
        register: (tag: string) => Promise<void>;
      };
    };

    if (!syncRegistration.sync) {
      return;
    }

    await syncRegistration.sync.register("gosafety-report-queue-sync");
  } catch {
    // Ignore unsupported or registration errors; in-app polling still handles retries.
  }
}

export default function IncidentReportWizard() {
  const pathname = usePathname();
  const [draft, setDraft] = useState<IncidentDraft | null>(null);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [queueCount, setQueueCount] = useState(0);
  const lookups = OFFLINE_LOOKUPS;
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [listening, setListening] = useState(false);
  const [postSubmitState, setPostSubmitState] = useState<PostSubmitState>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const syncProcessingRef = useRef(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoDetectAttemptedRef = useRef<string | null>(null);

  const step = draft?.step ?? 1;
  const isStaffFlow = pathname.startsWith("/dashboard");
  const isVisitorDashboard = pathname.startsWith("/visitor");
  const maxStep: Step = isStaffFlow ? 4 : 5;
  const homeHref = isStaffFlow
    ? "/dashboard/reports"
    : isVisitorDashboard
      ? "/visitor/reports"
      : "/";
  const reportsHref = isStaffFlow
    ? "/dashboard/reports"
    : isVisitorDashboard
      ? "/visitor/reports"
      : "/reports";

  function shouldRetryItem(item: SyncQueueItem) {
    if (item.status === "pending" || item.status === "failed") {
      return true;
    }

    if (item.status === "syncing") {
      const updatedAtMs = Date.parse(item.updatedAt);
      if (Number.isFinite(updatedAtMs)) {
        return Date.now() - updatedAtMs > STALE_SYNC_MS;
      }
    }

    return false;
  }

  async function processQueue() {
    if (syncProcessingRef.current) return;
    if (!navigator.onLine) return;

    syncProcessingRef.current = true;
    setSyncing(true);

    try {
      const queueItems = await getQueueItems();

      for (const item of queueItems) {
        if (!shouldRetryItem(item)) {
          continue;
        }

        const syncingItem: SyncQueueItem = {
          ...item,
          status: "syncing",
          updatedAt: nowIso(),
        };
        await updateQueueItem(syncingItem);

        try {
          const { uploadReady } = await submitOnline(syncingItem.draft, syncingItem.idempotencyKey);

          for (const photo of uploadReady.photos) {
            await deletePhotoBlob(photo.blobId);
          }

          await deleteQueueItem(syncingItem.id);
        } catch (queueError) {
          const failedItem: SyncQueueItem = {
            ...syncingItem,
            draft: syncingItem.draft,
            status: "failed",
            attempts: syncingItem.attempts + 1,
            lastError: queueError instanceof Error ? queueError.message : "Unknown sync failure",
            updatedAt: nowIso(),
          };
          await updateQueueItem(failedItem);
        }
      }

      const updatedQueue = await getQueueItems();
      setQueueCount(updatedQueue.filter((item) => item.status !== "synced").length);
    } finally {
      setSyncing(false);
      syncProcessingRef.current = false;
    }
  }

  const stepProgress = useMemo(() => {
    const flowSteps: Step[] = isStaffFlow ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
    return flowSteps.map((s) => ({ step: s, active: s <= step }));
  }, [isStaffFlow, step]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const loadedDraft = await loadDraft();
      const queueItems = await getQueueItems();
      const initialDraft = loadedDraft ?? createEmptyDraft();

      if (!mounted) {
        return;
      }

      setDraft(initialDraft);
      setQueueCount(queueItems.filter((item) => item.status !== "synced").length);
      setNetworkOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    }

    bootstrap().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to initialize report wizard");
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setNetworkOnline(true);
      void processQueue();
    };

    const onOffline = () => setNetworkOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // processQueue is intentionally used from the current render for these browser events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (navigator.onLine) {
        void processQueue();
      }
    }, 15000);

    return () => window.clearInterval(timer);
    // processQueue is intentionally captured for interval setup and refreshed by re-mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draft) return;
    void saveDraft(draft);
  }, [draft]);

  useEffect(() => {
    if (!draft) return;

    const stableDraft = draft;

    let disposed = false;
    const createdObjectUrls: string[] = [];

    async function hydratePreviewUrls() {
      const next: Record<string, string> = {};

      for (const photo of stableDraft.photos) {
        if (photo.publicUrl) {
          next[photo.id] = photo.publicUrl;
          continue;
        }

        const blob = await getPhotoBlob(photo.blobId);
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          createdObjectUrls.push(objectUrl);
          next[photo.id] = objectUrl;
        }
      }

      if (!disposed) {
        setPreviewUrls(next);
      }
    }

    hydratePreviewUrls().catch((e) => {
      if (!disposed) {
        setError(e instanceof Error ? e.message : "Failed to load image previews");
      }
    });

    return () => {
      disposed = true;
      createdObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [draft]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!draft || step !== 2 || busy) {
      return;
    }

    if (draft.location.formattedAddress?.trim()) {
      return;
    }

    if (autoDetectAttemptedRef.current === draft.id) {
      return;
    }

    autoDetectAttemptedRef.current = draft.id;
    void detectLocation();
    // detectLocation is intentionally invoked when step 2 is entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft?.id, draft?.location.formattedAddress, busy]);

  useEffect(() => {
    if (!cameraModalOpen || !cameraStream || !cameraVideoRef.current) return;

    const video = cameraVideoRef.current;
    video.srcObject = cameraStream;
    void video.play().catch(() => {
      setError("Unable to start camera preview.");
    });
  }, [cameraModalOpen, cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  function updateDraft(transform: (current: IncidentDraft) => IncidentDraft) {
    setDraft((current) => {
      if (!current) return current;
      return touchDraft(transform(current));
    });
  }

  function validateStep(targetStep: Step): string | null {
    if (!draft) return "Draft unavailable";

    if (targetStep >= 1 && draft.photos.length === 0) {
      return "Add at least one photo before continuing.";
    }

    if (targetStep >= 2) {
      const hasCoordinates =
        typeof draft.location.lat === "number" && typeof draft.location.lng === "number";
      const hasManual = Boolean(draft.location.siteId || draft.location.manualLocationText?.trim());
      if (!hasCoordinates && !hasManual) {
        return "Capture location automatically or provide manual location/site.";
      }
    }

    if (targetStep >= 3) {
      if (!draft.details.title.trim()) return "Incident title is required.";
      if (!draft.details.categoryId) return "Category is required.";
      if (!draft.details.severityId) return "Severity is required.";
      if (!draft.details.description.trim()) return "Description is required.";
    }

    if (!isStaffFlow && targetStep >= 4) {
      if (!draft.details.reporterName?.trim()) return "Reporter full name is required.";
      if (!draft.details.reporterEmail?.trim()) return "Reporter email is required.";
      if (!draft.details.reporterPhone?.trim()) return "Reporter phone number is required.";
      if (!draft.details.preferredContactChannel) {
        return "Preferred contact method is required.";
      }
    }

    return null;
  }

  async function addPhotoFiles(files: File[], source: "camera" | "gallery") {
    if (files.length === 0 || !draft) return;
    setPostSubmitState(null);
    const nextPhotos: IncidentPhoto[] = [];

    for (const file of files) {
      const photoId = crypto.randomUUID();
      const blobId = `blob-${photoId}`;
      await savePhotoBlob(blobId, file);
      nextPhotos.push({
        id: photoId,
        blobId,
        source,
        filename: file.name || `photo-${photoId}.jpg`,
        size: file.size,
        mimeType: file.type || "image/jpeg",
        createdAt: nowIso(),
      });
    }

    updateDraft((current) => ({ ...current, photos: [...current.photos, ...nextPhotos] }));
    setMessage(`${nextPhotos.length} photo(s) added from ${source}.`);
  }

  async function addPhotos(files: FileList | null, source: "camera" | "gallery") {
    if (!files || files.length === 0) return;
    await addPhotoFiles(Array.from(files), source);
  }

  function closeCameraModal() {
    setCameraModalOpen(false);
    setCameraBusy(false);
    setCameraStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }

  async function openCameraCapture() {
    setError("");
    setMessage("");

    const isSecure = window.isSecureContext || window.location.hostname === "localhost";
    if (!isSecure || !navigator.mediaDevices?.getUserMedia) {
      setMessage("Direct camera API unavailable here. Falling back to file picker.");
      cameraInputRef.current?.click();
      return;
    }

    setCameraBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      setCameraStream(stream);
      setCameraModalOpen(true);
    } catch (cameraError) {
      setMessage("Camera access blocked or unavailable. Falling back to file picker.");
      setError(cameraError instanceof Error ? cameraError.message : "Could not open camera");
      cameraInputRef.current?.click();
    } finally {
      setCameraBusy(false);
    }
  }

  async function captureFromCameraStream() {
    if (!cameraVideoRef.current || !cameraCanvasRef.current) {
      setError("Camera is not ready yet.");
      return;
    }

    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      setError("Camera preview has no frame yet. Try again.");
      return;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Unable to access image capture context.");
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92);
    });

    if (!blob) {
      setError("Failed to capture photo from camera.");
      return;
    }

    const captured = new File([blob], `camera-${crypto.randomUUID()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    await addPhotoFiles([captured], "camera");
    closeCameraModal();
  }

  async function removePhoto(photoId: string) {
    if (!draft) return;
    const photo = draft.photos.find((item) => item.id === photoId);
    if (photo) {
      await deletePhotoBlob(photo.blobId);
    }
    updateDraft((current) => ({
      ...current,
      photos: current.photos.filter((p) => p.id !== photoId),
    }));
  }

  function movePhoto(photoId: string, direction: -1 | 1) {
    updateDraft((current) => {
      const index = current.photos.findIndex((photo) => photo.id === photoId);
      if (index < 0) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.photos.length) return current;
      const list = [...current.photos];
      const [item] = list.splice(index, 1);
      list.splice(nextIndex, 0, item);
      return { ...current, photos: list };
    });
  }

  function nextStep() {
    if (!draft) return;
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setMessage("");
    setPostSubmitState(null);
    updateDraft((current) => ({
      ...current,
      step: Math.min(maxStep, (current.step + 1) as Step) as Step,
    }));
  }

  function previousStep() {
    if (!draft) return;
    setError("");
    setMessage("");
    setPostSubmitState(null);
    updateDraft((current) => ({ ...current, step: Math.max(1, current.step - 1) as Step }));
  }

  function setStep(target: Step) {
    if (!draft) return;
    setError("");
    setMessage("");
    setPostSubmitState(null);
    updateDraft((current) => ({ ...current, step: target }));
  }

  async function startAnotherReport() {
    const freshDraft = createEmptyDraft();
    setDraft(freshDraft);
    await saveDraft(freshDraft);
    setError("");
    setMessage("");
    setPostSubmitState(null);
  }

  async function detectLocation() {
    if (!draft) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (!navigator.onLine) {
        setMessage("You are offline. Please enter manual site/location details.");
        return;
      }

      if (!("geolocation" in navigator)) {
        setError("Geolocation is unavailable on this device/browser.");
        return;
      }

      const coords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            updateDraft((current) => ({
              ...current,
              location: {
                ...current.location,
                lat,
                lng,
                accuracy: position.coords.accuracy,
                capturedAt: nowIso(),
                source: "gps",
              },
            }));
            resolve({ lat, lng });
          },
          (geoError) => {
            reject(geoError);
          },
          { enableHighAccuracy: true, timeout: 12000 }
        );
      });

      if (navigator.onLine) {
        try {
          const response = await fetch(
            `/api/report/reverse-geocode?lat=${encodeURIComponent(String(coords.lat))}&lng=${encodeURIComponent(String(coords.lng))}`
          );

          if (!response.ok) {
            throw new Error("Reverse geocoding unavailable");
          }

          console.log(await response.json());

          const geo = (await response.json()) as {
            formattedAddress?: string;
            locationName?: string;
            locality?: string;
            region?: string;
            country?: string;
          };

          updateDraft((current) => ({
            ...current,
            location: {
              ...current.location,
              formattedAddress: geo.formattedAddress || undefined,
              locationName: geo.locationName || undefined,
              locality: geo.locality || undefined,
              region: geo.region || undefined,
              country: geo.country || undefined,
              siteId: undefined,
              siteName: undefined,
            },
          }));

          setMessage("Location and place name captured successfully.");
        } catch {
          setMessage(
            "Coordinates captured, but place name lookup failed. You can continue or use manual location details."
          );
        }
      } else {
        setMessage("Location captured successfully.");
      }
    } catch (geoError) {
      const messageText = geoError instanceof Error ? geoError.message : "Location unavailable";
      setError(`Automatic location unavailable: ${messageText}. Use manual fallback.`);
    } finally {
      setBusy(false);
    }
  }

  function getSpeechRecognitionConstructor() {
    const win = window as Window & {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      SpeechRecognition?: new () => SpeechRecognitionLike;
    };

    return win.SpeechRecognition || win.webkitSpeechRecognition || null;
  }

  function toggleSpeechToText() {
    if (!draft) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");

      updateDraft((current) => ({
        ...current,
        details: {
          ...current.details,
          description: transcript.trim(),
        },
      }));
    };

    recognition.onerror = (event) => {
      setError(`Voice input error: ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setListening(true);
      setMessage("Listening... speak clearly. You can edit transcript manually.");
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : "Could not start voice input");
      setListening(false);
    }
  }

  async function uploadDraftPhotos(inputDraft: IncidentDraft) {
    const updatedPhotos: IncidentPhoto[] = [];

    for (const photo of inputDraft.photos) {
      if (photo.publicUrl) {
        updatedPhotos.push(photo);
        continue;
      }

      const blob = await getPhotoBlob(photo.blobId);
      if (!blob) {
        throw new SubmitError(
          `Missing local blob for ${photo.filename}. Please remove and re-add this photo.`
        );
      }

      const formData = new FormData();
      const file = new File([blob], photo.filename, {
        type: photo.mimeType || blob.type || "image/jpeg",
      });
      formData.append("file", file);
      formData.append("source", photo.source);

      const response = await fetch("/api/report/upload", {
        method: "POST",
        body: formData,
      });

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const body = contentType.includes("application/json")
        ? ((await response.json()) as { message?: string; publicUrl?: string; serverPath?: string })
        : null;
      if (!response.ok) {
        const messageText = body?.message?.trim() || "Photo upload failed";
        throw new SubmitError(messageText || "Photo upload failed", response.status);
      }

      if (!body?.publicUrl) {
        throw new SubmitError("Photo upload failed: missing public URL from server response.");
      }

      updatedPhotos.push({
        ...photo,
        publicUrl: body.publicUrl,
        serverPath: body.serverPath,
      });
    }

    return {
      ...inputDraft,
      photos: updatedPhotos,
      updatedAt: nowIso(),
    };
  }

  async function submitOnline(inputDraft: IncidentDraft, idempotencyKey: string) {
    const uploadReady = await uploadDraftPhotos(inputDraft);

    const response = await fetch("/api/report/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey,
        draft: uploadReady,
      }),
    });

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const body = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
      const messageText = typeof body?.message === "string" ? body.message.trim() : "";
      throw new SubmitError(messageText || "Submit failed", response.status);
    }

    return {
      uploadReady,
      submitResult: body,
    };
  }

  async function enqueueForSync(inputDraft: IncidentDraft, reason: string) {
    const item: SyncQueueItem = {
      id: crypto.randomUUID(),
      draft: { ...inputDraft, step: 4, updatedAt: nowIso() },
      idempotencyKey: `report-${inputDraft.id}`,
      status: "pending",
      attempts: 0,
      lastError: reason,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await addQueueItem(item);
    await scheduleBackgroundQueueSync();
    const queueItems = await getQueueItems();
    setQueueCount(queueItems.filter((q) => q.status !== "synced").length);
  }

  async function resetDraftAndCleanup(
    inputDraft: IncidentDraft,
    options?: { keepBlobs?: boolean }
  ) {
    if (!options?.keepBlobs) {
      for (const photo of inputDraft.photos) {
        await deletePhotoBlob(photo.blobId);
      }
    }

    const freshDraft = createEmptyDraft();
    setDraft(freshDraft);
    await saveDraft(freshDraft);
  }

  async function submitCurrentDraft() {
    if (!draft) return;

    const validationError = validateStep(maxStep);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    setPostSubmitState(null);

    const idempotencyKey = `report-${draft.id}`;
    const isLikelyOffline = !navigator.onLine && !networkOnline;

    try {
      if (isLikelyOffline) {
        await enqueueForSync(draft, "Saved offline");
        await resetDraftAndCleanup(draft, { keepBlobs: true });
        await clearDraft();
        setMessage("You are offline. Report queued for automatic sync.");
        setPostSubmitState({ kind: "queued-offline" });
        return;
      }

      const { uploadReady, submitResult } = await submitOnline(draft, idempotencyKey);
      await resetDraftAndCleanup(uploadReady);
      await clearDraft();
      setMessage(`Report submitted successfully (${submitResult.incidentNo}).`);
      setPostSubmitState({
        kind: "submitted",
        incidentNo: String(submitResult.incidentNo ?? ""),
      });
    } catch (submitError) {
      const failure = submitError instanceof Error ? submitError.message : "Submit failed";

      if (!isRetryableSubmitError(submitError)) {
        setError(failure);
        setMessage(
          "Submission blocked by invalid/missing local data. Please fix the report and submit again."
        );
        return;
      }

      await enqueueForSync(draft, failure);
      await resetDraftAndCleanup(draft, { keepBlobs: true });
      await clearDraft();
      setMessage(`Unable to submit now (${failure}). Report moved to pending sync queue.`);
      setPostSubmitState({
        kind: "queued-submit-failed",
        reason: failure,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-[#eef1f6] p-6 text-slate-800">
        <p className="mx-auto mt-20 max-w-md rounded-xl bg-white p-6 text-center shadow-sm">
          Loading report wizard...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] p-3 text-slate-900 md:p-6">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-[#e4e9ef] bg-white shadow-[0_22px_50px_-35px_rgba(18,42,66,0.45)]">
        <header className="px-5 pb-4 pt-5 md:px-7 md:pt-6">
          <div className="mb-3 flex items-start justify-between">
            <h1 className="text-[34px] font-semibold tracking-tight text-[#0f172a] md:text-[38px]">
              <span className="font-bold text-[#0a7e49]">GoSafety</span>
              <span className="mx-1.5 text-slate-400">/</span>
              <span>Incident Reporting</span>
            </h1>

            <div className="hidden items-center gap-3 md:flex">
              <button
                type="button"
                aria-label="Notifications"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e1e7ee] bg-white text-slate-500"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M10 3.5a4 4 0 0 0-4 4v2.4c0 .9-.3 1.7-.8 2.4l-.7 1h11l-.7-1a4 4 0 0 1-.8-2.4V7.5a4 4 0 0 0-4-4z" />
                  <path d="M8.2 15.8a2 2 0 0 0 3.6 0" />
                </svg>
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
              </button>

              <Link
                href={homeHref}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#0a7e49]"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#dbe7df] text-[#0a7e49]">
                  <svg
                    viewBox="0 0 20 20"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12.5 5 7.5 10l5 5" />
                  </svg>
                </span>
                <span>
                  {isStaffFlow || isVisitorDashboard ? "Back to Dashboard" : "Back to Home"}
                </span>
              </Link>
            </div>
          </div>

          <div className="mb-5 flex items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                networkOnline ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {networkOnline ? "Online" : "Offline"}
            </span>
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {syncing ? "Syncing queue..." : `Queue: ${queueCount}`}
            </span>
          </div>

          <div className="mb-2 flex items-start gap-2 md:gap-3">
            {stepProgress.map((item, index) => (
              <div key={item.step} className="flex min-w-0 flex-1 items-start">
                <div className="flex w-full flex-col items-center">
                  <div className="flex w-full items-center">
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                        item.active
                          ? "border-[#0a7e49] bg-[#0a7e49] text-white"
                          : "border-[#d5dde6] bg-[#f2f5f8] text-[#64748b]"
                      }`}
                    >
                      {item.step}
                    </span>
                    {index < stepProgress.length - 1 ? (
                      <span
                        className={`mx-2 h-[2px] flex-1 rounded-full ${
                          step > item.step ? "bg-[#0a7e49]" : "bg-[#d9e2eb]"
                        }`}
                      />
                    ) : null}
                  </div>
                  <span
                    className={`mt-2 text-center text-[11px] font-semibold md:text-xs ${
                      item.active ? "text-[#0f5132]" : "text-slate-500"
                    }`}
                  >
                    {stepLabel(item.step, isStaffFlow)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </header>

        <section className="space-y-4 px-4 pb-4 md:px-6">
          {step === 1 ? (
            <StepPhotos
              photos={draft.photos}
              previewUrls={previewUrls}
              onOpenCamera={() => {
                void openCameraCapture();
              }}
              onOpenGallery={() => galleryInputRef.current?.click()}
              onMovePhoto={movePhoto}
              onRemovePhoto={(photoId) => {
                void removePhoto(photoId);
              }}
            />
          ) : null}

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void addPhotos(e.target.files, "camera");
              e.currentTarget.value = "";
            }}
          />

          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void addPhotos(e.target.files, "gallery");
              e.currentTarget.value = "";
            }}
          />

          {step === 2 ? (
            <StepLocation
              location={draft.location}
              sites={lookups.sites}
              busy={busy}
              onDetect={() => {
                void detectLocation();
              }}
              onSelectSite={(siteId) => {
                const site = lookups.sites.find((item) => item.id === siteId);
                updateDraft((current) => ({
                  ...current,
                  location: {
                    ...current.location,
                    siteId: siteId || undefined,
                    siteName: site?.site_name,
                    source: "manual",
                  },
                }));
              }}
              onManualLocationChange={(value) => {
                updateDraft((current) => ({
                  ...current,
                  location: {
                    ...current.location,
                    manualLocationText: value,
                    source: "manual",
                  },
                }));
              }}
            />
          ) : null}

          {step === 3 ? (
            <StepDetails
              details={draft.details}
              categories={lookups.categories}
              severities={lookups.severities}
              listening={listening}
              onToggleVoice={toggleSpeechToText}
              onChangeTitle={(value) => {
                updateDraft((current) => ({
                  ...current,
                  details: { ...current.details, title: value },
                }));
              }}
              onChangeCategory={(categoryId) => {
                const category = lookups.categories.find((item) => item.id === categoryId);
                updateDraft((current) => ({
                  ...current,
                  details: {
                    ...current.details,
                    categoryId,
                    categoryName: category?.name,
                  },
                }));
              }}
              onChangeSeverity={(severityId) => {
                const severity = lookups.severities.find((item) => item.id === severityId);
                updateDraft((current) => ({
                  ...current,
                  details: {
                    ...current.details,
                    severityId,
                    severityName: severity?.name,
                  },
                }));
              }}
              onChangeDescription={(value) => {
                updateDraft((current) => ({
                  ...current,
                  details: { ...current.details, description: value },
                }));
              }}
            />
          ) : null}

          {step === 4 ? (
            isStaffFlow ? (
              <StepReview
                draft={draft}
                previewUrls={previewUrls}
                busy={busy}
                networkOnline={networkOnline}
                reviewStepNumber={4}
                onEditStep={setStep}
                onSubmit={() => {
                  void submitCurrentDraft();
                }}
              />
            ) : (
              <StepReporterContact
                details={draft.details}
                onChangeName={(value) => {
                  updateDraft((current) => ({
                    ...current,
                    details: { ...current.details, reporterName: value },
                  }));
                }}
                onChangeEmail={(value) => {
                  updateDraft((current) => ({
                    ...current,
                    details: { ...current.details, reporterEmail: value },
                  }));
                }}
                onChangePhone={(value) => {
                  updateDraft((current) => ({
                    ...current,
                    details: { ...current.details, reporterPhone: value },
                  }));
                }}
                onChangePreferredContact={(value) => {
                  updateDraft((current) => ({
                    ...current,
                    details: { ...current.details, preferredContactChannel: value },
                  }));
                }}
              />
            )
          ) : null}

          {step === 5 ? (
            <StepReview
              draft={draft}
              previewUrls={previewUrls}
              busy={busy}
              networkOnline={networkOnline}
              reviewStepNumber={5}
              onEditStep={setStep}
              onSubmit={() => {
                void submitCurrentDraft();
              }}
            />
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}
        </section>

        <footer className="flex items-center justify-between border-t border-[#e5ebf1] px-4 py-4 md:px-6">
          <button
            type="button"
            onClick={previousStep}
            disabled={step === 1 || busy}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Back
          </button>

          {step < maxStep ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={busy}
              className="rounded-lg bg-[#0a7e49] px-6 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-14px_rgba(10,126,73,0.8)] disabled:opacity-60"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                void submitCurrentDraft();
              }}
              disabled={busy}
              className="rounded-lg bg-[#0a7e49] px-6 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-14px_rgba(10,126,73,0.8)] disabled:opacity-60"
            >
              {busy ? "Submitting..." : networkOnline ? "Submit now" : "Save and queue offline"}
            </button>
          )}
        </footer>
      </div>

      {cameraModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Camera Capture</h3>
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 text-sm"
                onClick={closeCameraModal}
              >
                Close
              </button>
            </div>

            <video
              ref={cameraVideoRef}
              className="h-auto max-h-[70vh] w-full rounded-lg bg-black"
              autoPlay
              muted
              playsInline
            />
            <canvas ref={cameraCanvasRef} className="hidden" />

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-4 py-2 text-sm"
                onClick={closeCameraModal}
                disabled={cameraBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => {
                  void captureFromCameraStream();
                }}
                disabled={cameraBusy}
              >
                Capture Photo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {postSubmitState ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {postSubmitState.kind === "submitted"
                ? "Report submitted successfully"
                : postSubmitState.kind === "queued-offline"
                  ? "You are offline - report saved to queue"
                  : "Could not submit now - report saved to queue"}
            </h3>
            {postSubmitState.kind === "submitted" ? (
              <p className="mt-1 text-sm text-slate-600">
                Incident {postSubmitState.incidentNo} was created. What would you like to do next?
              </p>
            ) : postSubmitState.kind === "queued-offline" ? (
              <p className="mt-1 text-sm text-slate-600">
                Your report could not be submitted because you are offline. It will sync
                automatically when internet returns. What would you like to do next?
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                We could not submit your report right now
                {postSubmitState.reason ? ` (${postSubmitState.reason})` : ""}. It has been placed
                in the pending sync queue and will retry automatically. What would you like to do
                next?
              </p>
            )}

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  void startAnotherReport();
                }}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Submit another report
              </button>
              <Link
                href={reportsHref}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-800"
              >
                View submitted reports
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
