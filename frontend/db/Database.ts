import { emptyStore, type Store } from "../../shared/store";

/**
 * All the app's data as one document, kept in memory. A subclass only reads and writes it
 * (a file on this computer, or the browser's storage). No business rules here.
 */
export abstract class Database {
  #store: Store = emptyStore();
  #writing: Promise<void> = Promise.resolve();
  #listeners = new Set<() => void>();

  protected abstract read(): Promise<Store>;
  protected abstract write(store: Store): Promise<void>;

  get data(): Store {
    return this.#store;
  }

  async load(): Promise<void> {
    this.#store = { ...emptyStore(), ...(await this.read()) };
  }

  /**
   * Changes the data: `change` gets a shallow copy and replaces whole fields on it
   * (`draft.rules = [...]`), never mutating arrays in place. Writes run one after another.
   */
  async update<T>(change: (draft: Store) => T): Promise<T> {
    const draft = { ...this.#store };
    const result = change(draft);
    this.#store = draft;
    for (const listener of this.#listeners) listener();
    const write = this.#writing.then(() => this.write(draft));
    this.#writing = write.catch(() => undefined);
    await write;
    return result;
  }

  /** Called after every change (the app recomputes what it shows). */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
