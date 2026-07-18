import type { InventoryDocument } from "../../domain/inventory";
import type { InventoryGateway } from "./inventoryGateway";

const DATABASE_NAME = "palpath-inventory";
const STORE_NAME = "documents";
const DATABASE_VERSION = 1;

export class IndexedDbInventoryGateway implements InventoryGateway {
  private readonly fallback = new Map<string, InventoryDocument>();

  async load(ownerId: string): Promise<InventoryDocument | undefined> {
    if (!globalThis.indexedDB) return this.fallback.get(ownerId);
    const database = await openDatabase();
    const loading = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(ownerId) as IDBRequest<InventoryDocument | undefined>;
    return request(loading);
  }

  async save(ownerId: string, document: InventoryDocument): Promise<void> {
    if (!globalThis.indexedDB) {
      this.fallback.set(ownerId, document);
      return;
    }

    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(document, ownerId);
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
    opening.onerror = () => reject(opening.error ?? new Error("Could not open inventory storage."));
  });
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("Inventory storage request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Inventory storage failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Inventory storage was cancelled."));
  });
}
