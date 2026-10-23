import { emptyStore, type Store } from "../../shared/store";
import { Database } from "./Database";

const NAME = "wydatki";
const BOX = "files";
const KEY = "document";

/** Web and Android: the same document, in this browser's storage. Nothing is sent anywhere. */
export class BrowserDatabase extends Database {
  protected async read(): Promise<Store> {
    const raw = await access<string | undefined>((box) => box.get(KEY));
    if (!raw) return emptyStore();
    return JSON.parse(raw) as Store;
  }

  protected async write(store: Store): Promise<void> {
    await access((box) => box.put(JSON.stringify(store), KEY), "readwrite");
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BOX)) request.result.createObjectStore(BOX);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function access<T>(run: (box: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode = "readonly"): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(BOX, mode);
        const request = run(transaction.objectStore(BOX));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}
