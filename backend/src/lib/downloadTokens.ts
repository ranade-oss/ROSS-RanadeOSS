import crypto from "crypto";

/**
 * HMAC-signed, expiring download tokens.
 *
 * The token encodes the R2 storage path + filename; the backend route
 * `/download/:token` validates the signature and streams the file. This
 * avoids exposing storage credentials or relying on storage-bucket CORS.
 */

type DownloadTokenPayload = {
    v: 1;
    p: string;
    f: string;
    iat: number;
    exp: number;
};

const DEFAULT_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const MAX_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function getSigningSecret(): string {
    const secret = process.env.DOWNLOAD_SIGNING_SECRET;
    if (!secret) {
        throw new Error(
            "DOWNLOAD_SIGNING_SECRET must be set. " +
                "Generate a strong random value (e.g. `openssl rand -hex 32`) and set it in the environment.",
        );
    }
    return secret;
}

function getVerificationSecrets(): string[] {
    return Array.from(
        new Set(
            [
                getSigningSecret(),
                process.env.DOWNLOAD_SIGNING_SECRET_PREVIOUS?.trim(),
            ].filter((secret): secret is string => Boolean(secret)),
        ),
    );
}

function tokenTtlSeconds(): number {
    const configured = Number.parseInt(
        process.env.DOWNLOAD_TOKEN_TTL_SECONDS ?? "",
        10,
    );
    if (!Number.isFinite(configured) || configured <= 0)
        return DEFAULT_TOKEN_TTL_SECONDS;
    return Math.min(configured, MAX_TOKEN_TTL_SECONDS);
}

function tokenNotBefore(): number {
    const configured = Number.parseInt(
        process.env.DOWNLOAD_TOKEN_NOT_BEFORE ?? "0",
        10,
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

function b64urlEncode(buf: Buffer): string {
    return buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
    let t = s.replace(/-/g, "+").replace(/_/g, "/");
    while (t.length % 4) t += "=";
    return Buffer.from(t, "base64");
}

function timingSafeEqStr(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function signDownload(
    path: string,
    filename: string,
    issuedAt = Math.floor(Date.now() / 1000),
): string {
    const payload: DownloadTokenPayload = {
        v: 1,
        p: path,
        f: filename,
        iat: issuedAt,
        exp: issuedAt + tokenTtlSeconds(),
    };
    const serialized = JSON.stringify(payload);
    const enc = b64urlEncode(Buffer.from(serialized, "utf8"));
    const sig = crypto
        .createHmac("sha256", getSigningSecret())
        .update(enc)
        .digest();
    return `${enc}.${b64urlEncode(sig)}`;
}

export function verifyDownload(
    token: string,
    now = Math.floor(Date.now() / 1000),
): { path: string; filename: string } | null {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [enc, sigEnc] = parts;
    const validSignature = getVerificationSecrets().some((secret) => {
        const expected = crypto
            .createHmac("sha256", secret)
            .update(enc)
            .digest();
        return timingSafeEqStr(sigEnc, b64urlEncode(expected));
    });
    if (!validSignature) return null;
    try {
        const parsed = JSON.parse(
            b64urlDecode(enc).toString("utf8"),
        ) as DownloadTokenPayload;
        if (
            parsed?.v !== 1 ||
            typeof parsed.p !== "string" ||
            !parsed.p ||
            typeof parsed.f !== "string" ||
            !parsed.f ||
            !Number.isSafeInteger(parsed.iat) ||
            !Number.isSafeInteger(parsed.exp) ||
            parsed.exp <= parsed.iat ||
            parsed.exp > parsed.iat + MAX_TOKEN_TTL_SECONDS ||
            parsed.exp <= now ||
            parsed.iat < tokenNotBefore()
        )
            return null;
        return { path: parsed.p, filename: parsed.f };
    } catch {
        return null;
    }
}

/**
 * Returns a relative download URL (e.g. "/download/abc.def"). The frontend
 * prefixes it with NEXT_PUBLIC_API_BASE_URL when rendering `<a href=…>`.
 */
export function buildDownloadUrl(path: string, filename: string): string {
    return `/download/${signDownload(path, filename)}`;
}
