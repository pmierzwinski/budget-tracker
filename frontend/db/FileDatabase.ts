import type { Store } from "../../shared/store";
import { Database } from "./Database";

/** Desktop and `npm run dev`: the document lives in data/ next to the app, via the local server. */
export class FileDatabase extends Database {
  protected async read(): Promise<Store> {
    const response = await fetch("/api/store");
    const data = (await response.json().catch(() => ({}))) as Store & { error?: string };
    if (!response.ok) throw new Error(data.error || "Nie udało się odczytać danych");
    return data;
  }

  protected async write(store: Store): Promise<void> {
    const response = await fetch("/api/store", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(store),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(data.error || "Nie udało się zapisać danych");
  }
}
