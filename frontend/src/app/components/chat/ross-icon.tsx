"use client";

import type { CSSProperties } from "react";

export function RossIcon({
    spin = false,
    done = false,
    error = false,
    size = 24,
    style,
}: {
    spin?: boolean;
    done?: boolean;
    error?: boolean;
    size?: number;
    style?: CSSProperties;
}) {
    const accent = error ? "#dc2626" : done ? "#16a34a" : "#0f8b8d";

    return (
        <span
            className="inline-block shrink-0 animate-[spin_3s_linear_infinite]"
            style={{
                animationPlayState: spin ? "running" : "paused",
                ...style,
            }}
            aria-hidden="true"
        >
            <svg width={size} height={size} viewBox="0 0 64 64" role="img">
                <rect width="64" height="64" rx="15" fill="#102a43" />
                <path
                    d="M16 14h19c11 0 18 6 18 16 0 7-4 12-10 14l11 13H40L30 45h-3v12H16V14Zm11 10v12h8c5 0 7-2 7-6s-2-6-7-6h-8Z"
                    fill="#fff"
                />
                <path d="M17 45h16" stroke={accent} strokeWidth="5" strokeLinecap="round" />
            </svg>
        </span>
    );
}
