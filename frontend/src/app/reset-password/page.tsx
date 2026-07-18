"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SiteLogo } from "@/app/components/site-logo";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { supabase } from "@/app/lib/supabase";

const authGlassCardClassName =
    "rounded-2xl border border-white/70 bg-white/72 p-8 shadow-[0_4px_14px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-8px_18px_rgba(255,255,255,0.12)] backdrop-blur-2xl";
const authInputClassName =
    "rounded-lg border border-transparent bg-gray-100 px-3 shadow-none focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2";

type RecoveryState = "checking" | "ready" | "complete" | "invalid";

export default function ResetPasswordPage() {
    const [recoveryState, setRecoveryState] =
        useState<RecoveryState>("checking");
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const errorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (error) errorRef.current?.focus();
    }, [error]);

    useEffect(() => {
        let active = true;

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (!active) return;
            if (event === "PASSWORD_RECOVERY" && session) {
                setRecoveryState("ready");
                setError(null);
            }
        });

        async function establishRecoverySession() {
            const url = new URL(window.location.href);
            const code = url.searchParams.get("code");

            if (code) {
                const { error: exchangeError } =
                    await supabase.auth.exchangeCodeForSession(code);
                if (exchangeError) {
                    if (active) {
                        setRecoveryState("invalid");
                        setError(
                            "This recovery link is invalid or has expired. Request a new link.",
                        );
                    }
                    return;
                }
                window.history.replaceState(
                    {},
                    document.title,
                    window.location.pathname,
                );
            }

            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (!active) return;
            if (sessionError || !session) {
                setRecoveryState("invalid");
                setError(
                    "This recovery link is invalid or has expired. Request a new link.",
                );
                return;
            }
            setRecoveryState("ready");
        }

        void establishRecoverySession();
        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, []);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setError(null);

        if (password.length < 12) {
            setError("Use at least 12 characters for the new password.");
            return;
        }
        if (password !== confirmation) {
            setError("The password confirmation does not match.");
            return;
        }

        setSaving(true);
        const { error: updateError } = await supabase.auth.updateUser({
            password,
        });

        if (updateError) {
            setError(
                "ROSS could not update the password. Request a new recovery link and try again.",
            );
            setSaving(false);
            return;
        }

        await supabase.auth.signOut({ scope: "local" });
        setPassword("");
        setConfirmation("");
        setSaving(false);
        setRecoveryState("complete");
    }

    return (
        <div className="relative flex min-h-dvh items-start justify-center bg-gray-50/80 px-6 pb-10 pt-32 md:pt-40">
            <div className="absolute left-1/2 top-4 -translate-x-1/2 md:top-8">
                <SiteLogo size="lg" asLink />
            </div>
            <main className="w-full max-w-md">
                <section
                    aria-labelledby="reset-password-title"
                    className={authGlassCardClassName}
                >
                    <h1
                        id="reset-password-title"
                        className="font-serif text-2xl font-medium text-gray-950"
                    >
                        Choose a new password
                    </h1>

                    {recoveryState === "checking" && (
                        <p
                            role="status"
                            aria-live="polite"
                            className="mt-5 text-sm text-gray-600"
                        >
                            Verifying the recovery link...
                        </p>
                    )}

                    {recoveryState === "ready" && (
                        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                            <p
                                id="password-requirements"
                                className="text-sm leading-6 text-gray-600"
                            >
                                Use at least 12 characters and a password that
                                you do not use for another service.
                            </p>
                            <div>
                                <label
                                    htmlFor="new-password"
                                    className="mb-2 block text-sm font-medium text-gray-700"
                                >
                                    New password
                                </label>
                                <Input
                                    id="new-password"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    value={password}
                                    onChange={(event) =>
                                        setPassword(event.target.value)
                                    }
                                    required
                                    aria-invalid={Boolean(error)}
                                    aria-describedby="password-requirements"
                                    className={authInputClassName}
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="confirm-password"
                                    className="mb-2 block text-sm font-medium text-gray-700"
                                >
                                    Confirm new password
                                </label>
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    value={confirmation}
                                    onChange={(event) =>
                                        setConfirmation(event.target.value)
                                    }
                                    required
                                    aria-invalid={Boolean(error)}
                                    aria-describedby={
                                        error
                                            ? "reset-password-error"
                                            : undefined
                                    }
                                    className={authInputClassName}
                                />
                            </div>

                            {error && (
                                <div
                                    ref={errorRef}
                                    id="reset-password-error"
                                    role="alert"
                                    aria-live="assertive"
                                    tabIndex={-1}
                                    className="rounded bg-red-50 p-3 text-sm text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                                >
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={saving}
                                className="w-full bg-black text-white hover:bg-gray-900 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                            >
                                {saving
                                    ? "Updating password..."
                                    : "Update password"}
                            </Button>
                        </form>
                    )}

                    {recoveryState === "invalid" && error && (
                        <div
                            ref={errorRef}
                            id="reset-password-error"
                            role="alert"
                            aria-live="assertive"
                            tabIndex={-1}
                            className="mt-5 rounded bg-red-50 p-3 text-sm leading-6 text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                        >
                            {error}
                        </div>
                    )}

                    {recoveryState === "complete" && (
                        <div
                            role="status"
                            aria-live="polite"
                            className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-900"
                        >
                            Your password has been updated. Return to the login
                            page and sign in with the new password.
                        </div>
                    )}

                    <p className="mt-6 text-center text-sm text-gray-600">
                        <Link
                            href={
                                recoveryState === "invalid"
                                    ? "/forgot-password"
                                    : "/login"
                            }
                            className="font-medium text-blue-700 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                        >
                            {recoveryState === "invalid"
                                ? "Request a new recovery link"
                                : "Return to log in"}
                        </Link>
                    </p>
                </section>
            </main>
        </div>
    );
}
