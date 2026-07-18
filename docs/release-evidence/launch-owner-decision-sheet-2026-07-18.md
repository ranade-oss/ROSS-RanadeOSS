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
5. Object-storage provider, region, and backup/deletion retention: private S3-compatible object store; the owner initially described it as Fly.io in Toronto, but the deployment's actual `ROSS_S3_ENDPOINT_URL` provider must be verified without recording the secret. Approved target policy: retain active objects only until user or account deletion; remove active and quarantine copies within 24 hours of a deletion request or terminal scan failure; encrypted recovery copies, if configured, expire within 7 days and must not be restored after an intentional deletion.
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

## Verification still required

The approval records the owner's decision and the target retention policy. The
object-storage provider cannot be inferred from Fly application hosting: ROSS
uses a separately configured S3-compatible endpoint. Before the vendor and
residency launch decision can pass, an operator must verify that endpoint's
provider and Canadian region and confirm that the 24-hour deletion and seven-day
maximum recovery-copy expiry are actually configured or otherwise enforced.

Do not enter credentials, private project identifiers, or private review contents in this sheet.
