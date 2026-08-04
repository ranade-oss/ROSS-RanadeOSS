"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type ChatJurisdiction = "CA-ON" | "CA" | "US";

const STORAGE_PREFIX = "ross.selectedJurisdiction.v1";

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
  const [jurisdiction, setJurisdictionState] =
    useState<ChatJurisdiction>(fallback);

  useEffect(() => {
    const stored =
      typeof window === "undefined"
        ? null
        : window.sessionStorage.getItem(storageKey);
    setJurisdictionState(isJurisdiction(stored) ? stored : fallback);
  }, [fallback, storageKey]);

  const setJurisdiction = useCallback(
    (next: ChatJurisdiction) => {
      setJurisdictionState(next);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(storageKey, next);
      }
    },
    [storageKey],
  );

  return [jurisdiction, setJurisdiction];
}
