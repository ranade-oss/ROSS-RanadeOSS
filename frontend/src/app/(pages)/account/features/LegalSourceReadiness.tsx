"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import {
    getLegalSourceDashboard,
    runOntarioResearchReadiness,
    type LegalSourceDashboard,
    type OntarioResearchReadiness,
} from "@/app/lib/mikeApi";
import { AccountSection } from "../AccountSection";

const PROVIDER_ORDER = [
    "a2aj-canada",
    "ontario-elaws",
    "justice-laws-canada",
    "courtlistener-us",
    "canlii-licensed",
];

export function LegalSourceReadiness() {
    const [dashboard, setDashboard] = useState<LegalSourceDashboard | null>(
        null,
    );
    const [readiness, setReadiness] =
        useState<OntarioResearchReadiness | null>(null);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setDashboard(await getLegalSourceDashboard());
        } catch {
            setError("Could not load legal-source status. Try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const coverage = useMemo(
        () =>
            new Map(
                dashboard?.coverage.map((entry) => [
                    entry.provider.id,
                    entry.coverage,
                ]) ?? [],
            ),
        [dashboard],
    );
    const providers = useMemo(
        () =>
            [...(dashboard?.providers ?? [])].sort(
                (a, b) =>
                    PROVIDER_ORDER.indexOf(a.id) -
                    PROVIDER_ORDER.indexOf(b.id),
            ),
        [dashboard],
    );

    const runReadiness = async () => {
        setChecking(true);
        setError(null);
        try {
            const result = await runOntarioResearchReadiness();
            setReadiness(result.readiness);
            await load();
        } catch {
            setError("The deployed research check could not complete.");
        } finally {
            setChecking(false);
        }
    };

    return (
        <section className="space-y-3" aria-labelledby="legal-source-status">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h2
                        id="legal-source-status"
                        className="font-serif text-2xl font-medium text-gray-900"
                    >
                        Legal-source readiness
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Inspect configured coverage and run a fixed, read-only
                        retrieval check from this deployed ROSS instance.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading || checking}
                    className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-950 disabled:opacity-45"
                >
                    <RefreshCw
                        className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                    />
                    Refresh
                </button>
            </div>

            <AccountSection>
                <div className="space-y-4 px-4 py-5">
                    {loading && !dashboard ? (
                        <p className="text-sm text-gray-500" role="status">
                            Checking configured providers…
                        </p>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {providers.map((provider) => {
                                const rows = coverage.get(provider.id) ?? [];
                                return (
                                    <div
                                        key={provider.id}
                                        className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-start sm:justify-between"
                                    >
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-medium text-gray-900">
                                                    {provider.name}
                                                </span>
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-xs ${provider.health.ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
                                                >
                                                    {provider.health.ok
                                                        ? "Configured"
                                                        : "Unavailable"}
                                                </span>
                                                {!provider.enabledForUser && (
                                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                                        Disabled for this account
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-sm text-gray-500">
                                                {provider.health.detail}
                                            </p>
                                        </div>
                                        <p className="shrink-0 text-xs text-gray-500">
                                            {rows.length
                                                ? `${rows.length} reported dataset${rows.length === 1 ? "" : "s"}`
                                                : provider.id ===
                                                    "canlii-licensed"
                                                  ? "Licence required"
                                                  : "No dataset report"}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {dashboard?.knownOntarioGaps.length ? (
                        <div className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-900">
                            <p className="font-medium">
                                Published Ontario coverage gaps
                            </p>
                            <p className="mt-1">
                                {dashboard.knownOntarioGaps
                                    .map((item) => item.label)
                                    .join(", ")}
                            </p>
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 text-sm text-gray-600">
                            {readiness ? (
                                <div className="flex items-start gap-2" role="status">
                                    {readiness.status === "healthy" ? (
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
                                    ) : (
                                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                                    )}
                                    <span>
                                        Deployed research check: {readiness.status}.{" "}
                                        {readiness.checks
                                            .map(
                                                (item) =>
                                                    `${item.providerId}: ${item.reasonCode}`,
                                            )
                                            .join("; ")}
                                    </span>
                                </div>
                            ) : (
                                "The deployed check performs fixed public-source requests and stores no legal text."
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => void runReadiness()}
                            disabled={checking || loading}
                            className="shrink-0 rounded-md bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-45"
                        >
                            {checking ? "Running check…" : "Run research check"}
                        </button>
                    </div>

                    {error && (
                        <p className="text-sm text-red-600" role="alert">
                            {error}
                        </p>
                    )}
                    <p className="text-xs leading-5 text-gray-500">
                        Healthy means reachable for this check only. It does not
                        establish comprehensive coverage, legal accuracy,
                        treatment status, or confidential-data approval.
                    </p>
                </div>
            </AccountSection>
        </section>
    );
}
