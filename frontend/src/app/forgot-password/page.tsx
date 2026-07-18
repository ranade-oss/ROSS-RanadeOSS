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

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const errorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (error) errorRef.current?.focus();
    }, [error]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setLoading(true);
        setError(null);

        const redirectTo = `${window.location.origin}/reset-password`;
        const { error: requestError } =
            await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo,
            });

        if (requestError) {
            setError(
                "ROSS could not send a recovery email. Please wait and try again.",
            );
            setLoading(false);
            return;
        }

        setSubmitted(true);
        setLoading(false);
    }

    return (
        <div className="relative flex min-h-dvh items-start justify-center bg-gray-50/80 px-6 pb-10 pt-32 md:pt-40">
            <div className="absolute left-1/2 top-4 -translate-x-1/2 md:top-8">
                <SiteLogo size="lg" asLink />
            </div>
            <main className="w-full max-w-md">
                <section
                    aria-labelledby="forgot-password-title"
                    className={authGlassCardClassName}
                >
                    <h1
                        id="forgot-password-title"
                        className="font-serif text-2xl font-medium text-gray-950"
                    >
                        Reset your password
                    </h1>
                    <p className="mt-3 text-sm leading-6 text-gray-600">
                        Enter the email address for your ROSS account. We will
                        send a time-limited recovery link if the account
                        exists.
                    </p>

                    {submitted ? (
                        <div
                            role="status"
                            aria-live="polite"
                            className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-900"
                        >
                            Check your email for a recovery link. For privacy,
                            ROSS shows this message whether or not an account
                            exists for that address.
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                            <div>
                                <label
                                    htmlFor="recovery-email"
                                    className="mb-2 block text-sm font-medium text-gray-700"
                                >
                                    Email
                                </label>
                                <Input
                                    id="recovery-email"
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(event) =>
                                        setEmail(event.target.value)
                                    }
                                    required
                                    aria-invalid={Boolean(error)}
                                    aria-describedby={
                                        error ? "recovery-error" : undefined
                                    }
                                    className={authInputClassName}
                                />
                            </div>

                            {error && (
                                <div
                                    ref={errorRef}
                                    id="recovery-error"
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
                                disabled={loading}
                                className="w-full bg-black text-white hover:bg-gray-900 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                            >
                                {loading
                                    ? "Sending recovery link..."
                                    : "Send recovery link"}
                            </Button>
                        </form>
                    )}

                    <p className="mt-6 text-center text-sm text-gray-600">
                        <Link
                            href="/login"
                            className="font-medium text-blue-700 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                        >
                            Return to log in
                        </Link>
                    </p>
                </section>
            </main>
        </div>
    );
}
