import type { AppState } from "@/lib/types";

const DB_NAME = "map-diary-local-v1";
const DB_STORE = "kv";
const STATE_KEY = "app-state";
export const CLOUD_KEY = "map-diary-cloud-v1";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function readState(): Promise<AppState | null> {
  const db = await openDB();

  if (!db) {
    const raw = window.localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(STATE_KEY);

    request.onsuccess = () => resolve((request.result as AppState | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function writeState(state: AppState): Promise<void> {
  const db = await openDB();

  if (!db) {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(state, STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function mirrorToCloud(state: AppState) {
  const snapshot = {
    version: state.version,
    profileId: state.profile.id,
    updatedAt: new Date().toISOString(),
    state
  };

  if (state.settings.cloudEndpoint) {
    await fetch(state.settings.cloudEndpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot)
    });

    return "Cloud endpoint";
  }

  window.localStorage.setItem(CLOUD_KEY, JSON.stringify(snapshot));
  return "Local mirror";
}
