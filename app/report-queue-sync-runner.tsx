"use client";

import { useEffect, useRef } from "react";
import {
  deletePhotoBlob,
  deleteQueueItem,
  getPhotoBlob,
  getQueueItems,
  updateQueueItem,
} from "@/lib/client/report-storage";
import type { IncidentDraft, IncidentPhoto, SyncQueueItem } from "@/lib/report-types";

const STALE_SYNC_MS = 2 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
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
      throw new Error(`Missing local blob for ${photo.filename}`);
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

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.message ?? "Photo upload failed");
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

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.message ?? "Submit failed");
  }

  return {
    uploadReady,
    submitResult: body,
  };
}

export default function ReportQueueSyncRunner() {
  const processingRef = useRef(false);

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
    if (processingRef.current) return;
    if (!navigator.onLine) return;
    if (window.location.pathname === "/report" || window.location.pathname.startsWith("/report/"))
      return;

    processingRef.current = true;

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
    } finally {
      processingRef.current = false;
    }
  }

  useEffect(() => {
    void processQueue();

    const onOnline = () => {
      void processQueue();
    };

    const timer = window.setInterval(() => {
      void processQueue();
    }, 15000);

    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
    // processQueue intentionally stays in this mount-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
