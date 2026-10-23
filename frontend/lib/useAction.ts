import { useCallback, useState } from "react";
import { errorMessage } from "./format";

/**
 * Busy flag + success/error banners for user actions. `run` clears both banners, runs the action and shows
 * its error (or `fallback`) when it throws; set the success text with `setMessage` inside the action.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const run = useCallback(async (action: () => Promise<unknown>, fallback: string): Promise<boolean> => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      return true;
    } catch (err) {
      setError(errorMessage(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, message, error, setMessage, setError, run };
}
