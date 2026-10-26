import { useState } from "react";
import { getContext } from "../app/AppContext";
import { errorMessage } from "../lib/format";
import { Icon } from "../ui/Icon";

/** Desktop only: stops the app (the window, or the console behind Wydatki.cmd). */
export function ShutdownButton({ quiet }: { quiet?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "closed">("idle");
  const [error, setError] = useState("");

  async function shutdown() {
    setState("busy");
    setError("");
    try {
      const response = await fetch("/api/shutdown", { method: "POST" });
      if (!response.ok) throw new Error("Nie udało się zamknąć aplikacji");
      setState("closed");
    } catch (err) {
      setError(errorMessage(err, "Nie udało się zamknąć aplikacji"));
      setState("idle");
    }
  }

  if (state === "closed") {
    return (
      <div className="shutdown-screen" role="status">
        <div className="empty-card">
          <h2>Aplikacja zamknięta</h2>
          <p>Dane zostały w folderze {getContext().meta.app.dataDir || "„data”"}. Możesz zamknąć to okno.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={quiet ? "ghost sm shutdown-btn" : "ghost shutdown-btn"}
        disabled={state === "busy"}
        title="Wyłącza aplikację"
        onClick={() => void shutdown()}
      >
        <Icon name="power" size={16} />
        <span>{state === "busy" ? "Zamykam…" : "Zamknij aplikację"}</span>
      </button>
      {error ? <p className="banner error">{error}</p> : null}
    </>
  );
}
