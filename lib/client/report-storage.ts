import type { IncidentDraft, SyncQueueItem } from "@/lib/report-types";

const DB_NAME = "gosafety-reporting";
const DB_VERSION = 1;
const DRAFT_STORE = "drafts";
const QUEUE_STORE = "syncQueue";
const BLOB_STORE = "photoBlobs";
const ACTIVE_DRAFT_ID = "active";

type BlobRecord = {
  id: string;
  blob: Blob;
  createdAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
) {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);

  try {
    const result = await run(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

export async function saveDraft(draft: IncidentDraft) {
  return withStore(DRAFT_STORE, "readwrite", async (store) => {
    await requestToPromise(store.put({ ...draft, id: ACTIVE_DRAFT_ID }));
  });
}

export async function loadDraft() {
  return withStore(DRAFT_STORE, "readonly", async (store) => {
    const value = await requestToPromise<IncidentDraft | undefined>(store.get(ACTIVE_DRAFT_ID));
    return value ?? null;
  });
}

export async function clearDraft() {
  return withStore(DRAFT_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(ACTIVE_DRAFT_ID));
  });
}

export async function savePhotoBlob(blobId: string, blob: Blob) {
  return withStore(BLOB_STORE, "readwrite", async (store) => {
    const record: BlobRecord = { id: blobId, blob, createdAt: new Date().toISOString() };
    await requestToPromise(store.put(record));
  });
}

export async function getPhotoBlob(blobId: string) {
  return withStore(BLOB_STORE, "readonly", async (store) => {
    const record = await requestToPromise<BlobRecord | undefined>(store.get(blobId));
    return record?.blob ?? null;
  });
}

export async function deletePhotoBlob(blobId: string) {
  return withStore(BLOB_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(blobId));
  });
}

export async function addQueueItem(item: SyncQueueItem) {
  return withStore(QUEUE_STORE, "readwrite", async (store) => {
    await requestToPromise(store.put(item));
  });
}

export async function updateQueueItem(item: SyncQueueItem) {
  return withStore(QUEUE_STORE, "readwrite", async (store) => {
    await requestToPromise(store.put(item));
  });
}

export async function deleteQueueItem(id: string) {
  return withStore(QUEUE_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(id));
  });
}

export async function getQueueItems() {
  return withStore(QUEUE_STORE, "readonly", async (store) => {
    const items = await requestToPromise<SyncQueueItem[]>(store.getAll());
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

export async function clearQueueAndRelatedBlobs() {
  const queueItems = await getQueueItems();
  const blobIds = new Set<string>();

  for (const item of queueItems) {
    for (const photo of item.draft.photos) {
      blobIds.add(photo.blobId);
    }
  }

  await withStore(QUEUE_STORE, "readwrite", async (store) => {
    await requestToPromise(store.clear());
  });

  for (const blobId of blobIds) {
    await deletePhotoBlob(blobId);
  }
}
