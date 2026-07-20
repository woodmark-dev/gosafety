const CACHE_NAME = "gosafety-pwa-v3";
const OFFLINE_URL = "/offline.html";
const REPORT_DB_NAME = "gosafety-reporting";
const REPORT_DB_VERSION = 1;
const QUEUE_STORE = "syncQueue";
const BLOB_STORE = "photoBlobs";
const REPORT_SYNC_TAG = "gosafety-report-queue-sync";
const STALE_SYNC_MS = 2 * 60 * 1000;

const CORE_ASSETS = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

function openReportDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REPORT_DB_NAME, REPORT_DB_VERSION);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, run) {
  const db = await openReportDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);

  try {
    const result = await run(store);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

async function getQueueItems() {
  return withStore(QUEUE_STORE, "readonly", async (store) => {
    const items = await requestToPromise(store.getAll());
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

async function updateQueueItem(item) {
  return withStore(QUEUE_STORE, "readwrite", async (store) => {
    await requestToPromise(store.put(item));
  });
}

async function deleteQueueItem(id) {
  return withStore(QUEUE_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(id));
  });
}

async function getPhotoBlob(blobId) {
  return withStore(BLOB_STORE, "readonly", async (store) => {
    const record = await requestToPromise(store.get(blobId));
    return record?.blob ?? null;
  });
}

async function deletePhotoBlob(blobId) {
  return withStore(BLOB_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(blobId));
  });
}

function nowIso() {
  return new Date().toISOString();
}

async function uploadDraftPhotos(inputDraft) {
  const updatedPhotos = [];

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
    formData.append("file", blob, photo.filename);
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

async function submitOnline(inputDraft, idempotencyKey) {
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

  return { uploadReady, submitResult: body };
}

async function processReportQueue() {
  const queueItems = await getQueueItems();

  for (const item of queueItems) {
    const shouldRetry =
      item.status === "pending" ||
      item.status === "failed" ||
      (item.status === "syncing" &&
        Number.isFinite(Date.parse(item.updatedAt)) &&
        Date.now() - Date.parse(item.updatedAt) > STALE_SYNC_MS);

    if (!shouldRetry) {
      continue;
    }

    const syncingItem = {
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
      const failedItem = {
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
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return networkResponse;
      })
      .catch(() =>
        caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return caches.match(OFFLINE_URL);
        })
      )
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === REPORT_SYNC_TAG) {
    event.waitUntil(processReportQueue());
  }
});
