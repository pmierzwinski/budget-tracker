import { useState } from "react";
import { api } from "../api";
import { errorMessage } from "../format";
import { Icon } from "./Icon";

/** Desktop only (exe / Wydatki.cmd): stops the local server, so the console window closes too. */
export function ShutdownButton({ quiet }: { quiet?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "closed">("idle");
  const [error, setError] = useState("");

  async function shutdown() {
    setState("busy");
    setError("");
    try {
      await api.shutdown();
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
          <p>Dane zostały w folderze „data” obok programu. Możesz zamknąć tę kartę.</p>
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
        title="Wyłącza aplikację (serwer w oknie konsoli)"
        onClick={() => void shutdown()}
      >
        <Icon name="power" size={16} />
        <span>{state === "busy" ? "Zamykam…" : "Zamknij aplikację"}</span>
      </button>
      {error ? <p className="banner error">{error}</p> : null}
    </>
  );
}
