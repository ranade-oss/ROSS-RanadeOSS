# Public-beta launch owner decision sheet

Complete this once. The answers populate the public brand, effective notices, subprocessor inventory, and launch gate.

## Already fixed by the candidate

- Release mode: verified-account public controlled beta
- Content boundary: synthetic or affirmatively non-confidential only
- Public indexing: disabled unless separately approved
- Public website: `https://ross-ontario.augustmaat.chatgpt.site`
- Public application: `https://ross-ranadeoss-public.fly.dev`
- Public API: `https://ross-ranadeoss-api.fly.dev`
- Private scan worker: Fly private networking only
- Security channel: GitHub private vulnerability reporting
- Source posture: limited-source, explicit gaps, optional per-user CanLII/CourtListener keys, no CanLII scraping
- Product, privacy, security, accessibility, and legal-content approvals: recorded 2026-07-18

## Owner supplies or confirms these launch facts

1. Exact legal operator name (person or entity): Abhi Ranade
2. Public support email: `abhi@soundmarklaw.com`
3. Public privacy/complaints email (may match support): `abhi@soundmarklaw.com`
4. Supabase project region and product/tier: `ca-central`; Free tier
5. Object-storage provider, region, and backup/deletion retention: Supabase Storage S3, Free tier, Canada Central (`ca-central-1` endpoint verified without recording credentials). Retain active objects until user/account deletion; remove active and quarantine objects through the Storage API within 24 hours of an applicable deletion or terminal scan failure. Storage versioning is unavailable and deletion is permanent. Supabase Free has no automatic daily database backup; the manual logical export and isolated restore method was exercised successfully, without a continuous recovery commitment.
6. Confirm Fly.io application/API/worker region is Toronto (`yyz`): yes
7. Confirm hosted model route at launch: users supply their own OpenAI API key. OpenAI is the only hosted allowlisted provider at launch; adding another provider requires a governed post-launch change.
8. Confirm the website `/status` page is the public status location until a separate service exists: yes — `https://ross-ontario.augustmaat.chatgpt.site/status`
9. Effective date for privacy notice, hosted terms, acceptable use, and subprocessor list (`YYYY-MM-DD`): `2026-07-18`
10. Conditions or expiry on the public beta: none

## Owner decision

- Decision: `Approved`
- Approver: Abhi Ranade
- Date (`YYYY-MM-DD`): `2026-07-18`
- Evidence retained by: AR

## Verification completed

The separately configured endpoint was verified as Supabase Storage S3 in
Canada Central during isolated restore exercise
`ross-restore-20260718-67661f17effb`. All database and object fingerprints
matched, the temporary environment was destroyed, and no credential was written
to evidence. The owner accepts the disclosed Free-tier durability boundary and
requires users to retain local copies.

Do not enter credentials, private project identifiers, or private review contents in this sheet.
