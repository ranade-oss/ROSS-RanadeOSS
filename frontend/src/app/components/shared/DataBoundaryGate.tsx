"use client";

import { useState, useSyncExternalStore } from "react";
import {
    ROSS_DATA_BOUNDARY_EVENT,
    ROSS_DATA_BOUNDARY_VERSION,
    ROSS_HOSTED_MODE,
    acknowledgeDataBoundary,
    hasDataBoundaryAcknowledgement,
} from "@/app/lib/dataBoundary";
import { recordDataBoundaryAcknowledgement } from "@/app/lib/mikeApi";

function subscribe(callback: () => void) {
    window.addEventListener(ROSS_DATA_BOUNDARY_EVENT, callback);
    window.addEventListener("storage", callback);
    return () => {
        window.removeEventListener(ROSS_DATA_BOUNDARY_EVENT, callback);
        window.removeEventListener("storage", callback);
    };
}

export function DataBoundaryGate({ children }: { children: React.ReactNode }) {
    const acknowledged = useSyncExternalStore(
        subscribe,
        hasDataBoundaryAcknowledgement,
        () => ROSS_HOSTED_MODE !== "controlled-beta",
    );
    const [confirmed, setConfirmed] = useState(false);
    if (acknowledged) return children;

    return (
        <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-5 py-12 text-slate-900">
            <section
                aria-labelledby="data-boundary-title"
                className="w-full max-w-2xl rounded-2xl bg-white p-7 shadow-2xl sm:p-10"
            >
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
                    Controlled beta · policy {ROSS_DATA_BOUNDARY_VERSION}
                </p>
                <h1
                    id="data-boundary-title"
                    className="mt-3 font-serif text-4xl"
                >
                    Choose services appropriate for your information
                </h1>
                <p className="mt-5 leading-7 text-slate-600">
                    ROSS sends relevant prompts, files, and context to the model
                    and connected services you choose so they can perform the
                    functions you request. Transmission is necessary for those
                    features. Each service handles information under its own
                    terms and settings.
                </p>
                <p className="mt-4 leading-7 text-slate-600">
                    Confidential or privileged use is at your own risk. Review
                    each provider&apos;s retention, training, human-review,
                    security, and disclosure practices. You are responsible for
                    choosing providers and settings that meet your duties to
                    clients and the court.
                </p>
                <label className="mt-7 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                        className="mt-1 h-4 w-4"
                    />
                    <span className="text-sm leading-6">
                        I understand how ROSS uses connected services and accept
                        responsibility for choosing providers and settings
                        appropriate for the information I use.
                    </span>
                </label>
                <button
                    type="button"
                    disabled={!confirmed}
                    onClick={() => {
                        // The browser acknowledgement controls the policy
                        // header and must not depend on optional server-side
                        // audit storage being available.
                        acknowledgeDataBoundary();
                        void recordDataBoundaryAcknowledgement({
                            version: ROSS_DATA_BOUNDARY_VERSION,
                            acknowledgement:
                                "provider-responsibility-acknowledged",
                        }).catch(() => {
                            // The durable server mirror is best effort. The
                            // explicit browser record remains authoritative
                            // for this device and policy version.
                        });
                    }}
                    className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Enter controlled beta
                </button>
            </section>
        </main>
    );
}
