import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * State backed by sessionStorage — survives client-side navigation within the
 * tab (so results aren't lost when you leave a page and come back) and is
 * cleared when the tab closes. SSR-safe: renders `initial` first, then hydrates
 * from storage after mount to avoid hydration mismatches.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initial);
  const skipPersist = useRef(true);

  // Hydrate once on mount.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) setState(JSON.parse(raw) as T);
    } catch {
      // ignore malformed or unavailable storage
    }
  }, [key]);

  // Persist on change. Skip the first run so we don't overwrite stored data
  // with `initial` before hydration completes.
  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore quota / unavailable storage
    }
  }, [key, state]);

  return [state, setState];
}
