"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MODEL_ID } from "../components/assistant/ModelToggle";

const STORAGE_KEY = "mike.selectedModel";

function isSelectableModelId(id: string): boolean {
    return (
        id.length <= 160 &&
        /^(?:(?:claude|gemini|gpt|grok|kimi)-[A-Za-z0-9][A-Za-z0-9._:-]*|o\d[A-Za-z0-9._:-]*|ft:(?:gpt-[A-Za-z0-9]|o\d)[A-Za-z0-9._:-]*)$/.test(
            id,
        )
    );
}

function readStored(): string {
    if (typeof window === "undefined") return DEFAULT_MODEL_ID;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isSelectableModelId(raw)) return raw;
    return DEFAULT_MODEL_ID;
}

export function useSelectedModel(): [string, (id: string) => void] {
    const [model, setModelState] = useState<string>(DEFAULT_MODEL_ID);

    useEffect(() => {
        setModelState(readStored());
    }, []);

    const setModel = useCallback((id: string) => {
        const next = isSelectableModelId(id) ? id : DEFAULT_MODEL_ID;
        setModelState(next);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, next);
        }
    }, []);

    return [model, setModel];
}
