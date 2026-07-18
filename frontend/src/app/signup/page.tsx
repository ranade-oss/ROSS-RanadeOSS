"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import Link from "next/link";
import { SiteLogo } from "@/app/components/site-logo";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { updateUserProfile } from "@/app/lib/mikeApi";
import { rossBrand } from "@/app/lib/rossBrand";

const authGlassCardClassName =
    "rounded-2xl border border-white/70 bg-white/72 p-8 shadow-[0_4px_14px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-8px_18px_rgba(255,255,255,0.12)] backdrop-blur-2xl";
const authInputClassName =
    "rounded-lg border border-transparent bg-gray-100 px-3 shadow-none focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2";
const authToggleClassName =
    "flex gap-1 rounded-full bg-gray-200 p-1 text-xs font-medium";
const authToggleActiveClassName =
    "inline-flex h-6 items-center rounded-full border border-white/80 bg-white/86 px-3 text-gray-900 shadow-[0_2px_7px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-3px_7px_rgba(229,231,235,0.32)] backdrop-blur-xl";
const authToggleInactiveClassName =
    "inline-flex h-6 items-center rounded-full border border-transparent px-3 text-gray-500 transition-colors hover:bg-white/38 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2";
const termsVersion =
    process.env.NEXT_PUBLIC_ROSS_TERMS_VERSION ?? "2026-07-17-public-beta";
const privacyVersion =
    process.env.NEXT_PUBLIC_ROSS_PRIVACY_VERSION ?? "2026-07-17-public-beta";

export default function SignupPage() {
    const signupsEnabled =
        process.env.NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED !== "false";
    const router = useRouter();
    const { isAuthenticated, authLoading } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [name, setName] = useState("");
    const [organisation, setOrganisation] = useState("");
    const [acceptedPolicies, setAcceptedPolicies] = useState(false);
    const [acceptedBoundary, setAcceptedBoundary] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const errorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!authLoading && isAuthenticated && !success) {
            router.replace("/assistant");
        }
    }, [authLoading, isAuthenticated, router, success]);

    useEffect(() => {
        if (error) errorRef.current?.focus();
    }, [error]);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Validate passwords match
        if (password !== confirmPassword) {
            setError("Passwords do not match");
            setLoading(false);
            return;
        }

        if (password.length < 12) {
            setError("Password must be at least 12 characters");
            setLoading(false);
            return;
        }

        if (!acceptedPolicies || !acceptedBoundary) {
            setError(
                "Accept the Terms of Use, Privacy Policy, and hosted-beta data boundary to continue.",
            );
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/assistant`,
                    data: {
                        ross_registration_source: "public-web",
                        ross_display_name: name.trim() || null,
                        ross_organisation: organisation.trim() || null,
                        ross_terms_version: termsVersion,
                        ross_terms_accepted: true,
                        ross_privacy_version: privacyVersion,
                        ross_privacy_acknowledged: true,
                        ross_data_boundary: "synthetic-or-non-confidential",
                    },
                },
            });

            if (error) throw error;

            if (data.session) {
                const trimmedName = name.trim();
                const trimmedOrg = organisation.trim();
                if (trimmedName || trimmedOrg) {
                    try {
                        await updateUserProfile({
                            ...(trimmedName && { displayName: trimmedName }),
                            ...(trimmedOrg && { organisation: trimmedOrg }),
                        });
                    } catch (profileError) {
                        console.error(
                            "[signup] failed to persist profile fields",
                            profileError,
                        );
                    }
                }
            }
            setSuccess(true);
        } catch (error: unknown) {
            setError(
                error instanceof Error
                    ? error.message
                    : "An error occurred during signup",
            );
        } finally {
            setLoading(false);
        }
    };

    if (!signupsEnabled) {
        return (
            <div className="min-h-dvh bg-gray-50/80 flex items-start justify-center px-6 pt-32 md:pt-40 pb-10 relative">
                <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                    <SiteLogo size="lg" asLink />
                </div>
                <div className="w-full max-w-md">
                    <div className={`${authGlassCardClassName} text-center`}>
                        <h2 className="text-2xl font-medium font-serif text-gray-950 mb-3">
                            Private ROSS
                        </h2>
                        <p className="text-sm text-gray-600 mb-6">
                            This deployment does not accept new account
                            registrations. Sign in with the owner account.
                        </p>
                        <Button
                            asChild
                            className="w-full bg-black hover:bg-gray-900 text-white"
                        >
                            <Link href="/login">Go to login</Link>
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Success View
    if (success) {
        return (
            <div className="min-h-dvh bg-gray-50/80 flex items-start justify-center px-6 pt-32 md:pt-40 pb-10 relative">
                <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                    <SiteLogo size="lg" asLink />
                </div>
                <div className="w-full max-w-md">
                    <div
                        className={`${authGlassCardClassName} p-10 text-center`}
                    >
                        <div className="mx-auto w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle2 className="h-6 w-6 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-950 mb-3">
                            Verify your email
                        </h2>
                        <p className="text-gray-600 leading-relaxed mb-6">
                            We sent a confirmation link to {email}. Open it to
                            activate your account, then log in to ROSS.
                        </p>
                        <Button
                            asChild
                            className="w-full bg-black hover:bg-gray-900 text-white"
                        >
                            <Link href="/login">Go to login</Link>
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Default Signup Form View
    return (
        <div className="min-h-dvh bg-gray-50/80 flex items-start justify-center px-6 pt-32 md:pt-40 pb-10 relative">
            <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                <SiteLogo size="lg" asLink />
            </div>
            <div className="w-full max-w-md">
                <div className={`${authGlassCardClassName} mb-4`}>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-left text-2xl font-medium font-serif text-gray-950">
                            Create Account
                        </h2>
                        <div className={authToggleClassName}>
                            <Link
                                href="/login"
                                className={authToggleInactiveClassName}
                            >
                                Log in
                            </Link>
                            <span className={authToggleActiveClassName}>
                                Sign up
                            </span>
                        </div>
                    </div>

                    <form onSubmit={handleSignup} className="space-y-4">
                        <div>
                            <label
                                htmlFor="name"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Name{" "}
                                <span className="text-gray-400 font-normal">
                                    (optional)
                                </span>
                            </label>
                            <Input
                                id="name"
                                type="text"
                                autoComplete="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                                className={`w-full ${authInputClassName}`}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="organisation"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Organisation{" "}
                                <span className="text-gray-400 font-normal">
                                    (optional)
                                </span>
                            </label>
                            <Input
                                id="organisation"
                                type="text"
                                autoComplete="organization"
                                value={organisation}
                                onChange={(e) =>
                                    setOrganisation(e.target.value)
                                }
                                placeholder="Your organisation"
                                className={`w-full ${authInputClassName}`}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Email
                            </label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                required
                                className={`w-full ${authInputClassName}`}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Password
                            </label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Create a password (min. 12 characters)"
                                required
                                minLength={12}
                                className={`w-full ${authInputClassName}`}
                            />
                        </div>

                        <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-5 text-gray-700">
                            <input
                                type="checkbox"
                                checked={acceptedPolicies}
                                onChange={(event) =>
                                    setAcceptedPolicies(event.target.checked)
                                }
                                required
                                className="mt-1 h-4 w-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                            />
                            <span>
                                I agree to the{" "}
                                <Link
                                    href={rossBrand.termsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-700 underline"
                                >
                                    Terms of Use
                                </Link>{" "}
                                and acknowledge the{" "}
                                <Link
                                    href={rossBrand.privacyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-700 underline"
                                >
                                    Privacy Policy
                                </Link>
                                .
                            </span>
                        </label>

                        <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
                            <input
                                type="checkbox"
                                checked={acceptedBoundary}
                                onChange={(event) =>
                                    setAcceptedBoundary(event.target.checked)
                                }
                                required
                                className="mt-1 h-4 w-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                            />
                            <span>
                                I will use the hosted beta only with synthetic
                                or affirmatively non-confidential material. I
                                will not upload privileged or confidential
                                client files.
                            </span>
                        </label>

                        <div>
                            <label
                                htmlFor="confirmPassword"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Confirm Password
                            </label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                placeholder="Confirm your password"
                                required
                                className={`w-full ${authInputClassName}`}
                            />
                        </div>

                        {error && (
                            <div
                                ref={errorRef}
                                id="signup-error"
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
                            disabled={
                                loading ||
                                !acceptedPolicies ||
                                !acceptedBoundary
                            }
                            className="w-full bg-black hover:bg-gray-900 text-white focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                        >
                            {loading ? "Creating account..." : "Sign up"}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
