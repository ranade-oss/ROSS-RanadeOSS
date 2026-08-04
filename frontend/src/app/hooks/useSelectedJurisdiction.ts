"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export type ChatJurisdiction = "CA-ON" | "CA" | "US";

const STORAGE_PREFIX = "ross.selectedJurisdiction.v1";
const listeners = new Map<string, Set<() => void>>();

function defaultJurisdiction(
  jurisdictions?: readonly ChatJurisdiction[],
): ChatJurisdiction {
  if (jurisdictions?.includes("CA-ON")) return "CA-ON";
  if (jurisdictions?.includes("CA")) return "CA";
  if (jurisdictions?.includes("US")) return "US";
  return "CA-ON";
}

function isJurisdiction(value: string | null): value is ChatJurisdiction {
  return value === "CA-ON" || value === "CA" || value === "US";
}

function readStoredJurisdiction(
  storageKey: string,
  fallback: ChatJurisdiction,
): ChatJurisdiction {
  if (typeof window === "undefined") return fallback;
  const stored = window.sessionStorage.getItem(storageKey);
  return isJurisdiction(stored) ? stored : fallback;
}

function subscribe(storageKey: string, onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  let storageListeners = listeners.get(storageKey);
  if (!storageListeners) {
    storageListeners = new Set();
    listeners.set(storageKey, storageListeners);
  }
  storageListeners.add(onStoreChange);

  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea === window.sessionStorage && event.key === storageKey) {
      onStoreChange();
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("storage", handleStorage);
    storageListeners.delete(onStoreChange);
    if (storageListeners.size === 0) listeners.delete(storageKey);
  };
}

function notify(storageKey: string): void {
  listeners.get(storageKey)?.forEach((listener) => listener());
}

export function jurisdictionCodes(
  jurisdiction: ChatJurisdiction,
): ChatJurisdiction[] {
  return jurisdiction === "CA-ON" ? ["CA-ON", "CA"] : [jurisdiction];
}

/**
 * Keep the submitted jurisdiction stable when the first-prompt view is
 * replaced by the conversation view. Project callers use a project-scoped key
 * so a matter's selection cannot leak into another project.
 */
export function useSelectedJurisdiction(
  jurisdictions?: readonly ChatJurisdiction[],
  persistenceScope = "assistant",
): [ChatJurisdiction, (jurisdiction: ChatJurisdiction) => void] {
  const fallback = defaultJurisdiction(jurisdictions);
  const storageKey = useMemo(
    () => `${STORAGE_PREFIX}:${persistenceScope}`,
    [persistenceScope],
  );
  const subscribeToJurisdiction = useCallback(
    (onStoreChange: () => void) => subscribe(storageKey, onStoreChange),
    [storageKey],
  );
  const getSnapshot = useCallback(
    () => readStoredJurisdiction(storageKey, fallback),
    [fallback, storageKey],
  );
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  const jurisdiction = useSyncExternalStore(
    subscribeToJurisdiction,
    getSnapshot,
    getServerSnapshot,
  );

  const setJurisdiction = useCallback(
    (next: ChatJurisdiction) => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(storageKey, next);
        notify(storageKey);
      }
    },
    [storageKey],
  );

  return [jurisdiction, setJurisdiction];
}
