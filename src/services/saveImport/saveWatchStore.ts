const DATABASE_NAME = "palpath-save-watch";
const STORE_NAME = "worlds";
const DATABASE_VERSION = 1;

export type StoredSaveWatch = {
  version: 1;
  profileId: string;
  worldId: string;
  platform?: "xbox" | "steam";
  scope?: "xbox-account" | "steam-world";
  /** Raw platform folder identity. This record never leaves IndexedDB. */
  sourceAccountId?: string;
  accountId?: string;
  folderName: string;
  worldRootPath: string;
  directoryHandle: FileSystemDirectoryHandle;
  lastSourceSignature?: string;
  enabledAt: string;
  lastCheckedAt?: string;
  lastUpdatedAt?: string;
};

export interface SaveWatchStore {
  list(): Promise<readonly StoredSaveWatch[]>;
  put(watch: StoredSaveWatch): Promise<void>;
  delete(profileId: string): Promise<void>;
}

export class IndexedDbSaveWatchStore implements SaveWatchStore {
  private readonly fallback = new Map<string, StoredSaveWatch>();

  async list() {
    if (!globalThis.indexedDB) return [...this.fallback.values()];
    const database = await openDatabase();
    const loading = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll() as IDBRequest<StoredSaveWatch[]>;
    return request(loading);
  }

  async put(watch: StoredSaveWatch) {
    if (!globalThis.indexedDB) {
      this.fallback.set(watch.profileId, watch);
      return;
    }
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(watch, watch.profileId);
    await transactionDone(transaction);
  }

  async delete(profileId: string) {
    if (!globalThis.indexedDB) {
      this.fallback.delete(profileId);
      return;
    }
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(profileId);
    await transactionDone(transaction);
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE_NAME)) {
        opening.result.createObjectStore(STORE_NAME);
      }
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error("We couldn't open automatic refresh settings."));
  });
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("We couldn't read automatic refresh settings."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("We couldn't save automatic refresh settings."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Saving automatic refresh settings was cancelled."));
  });
}
