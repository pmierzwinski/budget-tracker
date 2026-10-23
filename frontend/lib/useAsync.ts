import { useCallback, useEffect, useState, type DependencyList, type Dispatch, type SetStateAction } from "react";
import { errorMessage } from "./format";

export type AsyncState<T> = {
  data: T | null;
  error: string;
  /** True until the first successful (or failed) load. Reloads keep the previous `data`. */
  loading: boolean;
  setData: Dispatch<SetStateAction<T | null>>;
  /** Loads again with the same inputs; the current data stays until the new one arrives. */
  reload: () => void;
};

/**
 * Loads data whenever `deps` change (sync or async); outdated answers are dropped. Return `null` from `load`
 * to skip loading. `delay` debounces (e.g. typing in a search box).
 */
export function useAsync<T>(load: () => T | Promise<T> | null, deps: DependencyList, delay = 0): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    const start = () => {
      let pending: T | Promise<T> | null;
      try {
        pending = load();
      } catch (err) {
        setError(errorMessage(err, "Nie wczytano danych"));
        return;
      }
      if (pending === null) return;
      Promise.resolve(pending)
        .then((next) => {
          if (!alive) return;
          setData(next);
          setError("");
        })
        .catch((err) => alive && setError(errorMessage(err, "Nie wczytano danych")));
    };
    const timer = delay ? setTimeout(start, delay) : null;
    if (!timer) start();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { data, error, loading: !data && !error, setData, reload };
}
