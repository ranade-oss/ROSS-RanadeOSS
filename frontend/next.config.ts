import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);

function configuredOrigin(value: string | undefined) {
    if (!value) return null;
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

const apiOrigin = configuredOrigin(process.env.NEXT_PUBLIC_API_BASE_URL);
const supabaseOrigin = configuredOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseWebSocketOrigin = supabaseOrigin
    ? supabaseOrigin.replace(/^http/, "ws")
    : null;
const connectSources = Array.from(
    new Set(
        ["'self'", apiOrigin, supabaseOrigin, supabaseWebSocketOrigin].filter(
            (source): source is string => Boolean(source),
        ),
    ),
);
const scriptSources = ["'self'", "'unsafe-inline'"];
const isProduction = process.env.NODE_ENV === "production";
if (!isProduction) scriptSources.push("'unsafe-eval'");

const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
    {
        key: "Content-Security-Policy",
        value: contentSecurityPolicy,
    },
    ...(isProduction
        ? [
              {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
              },
          ]
        : []),
    {
        key: "X-Content-Type-Options",
        value: "nosniff",
    },
    {
        key: "X-Frame-Options",
        value: "DENY",
    },
    {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
    },
    {
        key: "Permissions-Policy",
        value: "camera=(), geolocation=(), microphone=()",
    },
];

const nextConfig: NextConfig = {
    output: "standalone",
    outputFileTracingRoot: repositoryRoot,
    poweredByHeader: false,
    reactCompiler: true,
    turbopack: {
        root: repositoryRoot,
    },
    async rewrites() {
        return [
            {
                source: "/sitemap.xml",
                destination: "/api/sitemap/sitemap.xml",
            },
            {
                source: "/sitemap_:slug.xml",
                destination: "/api/sitemap/sitemap_:slug.xml",
            },
        ];
    },
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: securityHeaders,
            },
        ];
    },
    skipTrailingSlashRedirect: true,
};

export default nextConfig;
