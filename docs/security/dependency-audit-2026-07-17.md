# Dependency audit disposition, 2026-07-17

Review target: the release-readiness remediation based on commit
`2cc28cc8f05c2fdb0842f36a25c92993a3d3ec0f`.

The lockfiles were refreshed with non-breaking `npm audit fix` updates. Direct
public-website build tools were then advanced within their existing major
versions. `npm run audit:high` now fails the repository gate if any backend,
frontend, or public-website dependency tree contains a high or critical
advisory.

## Result after remediation

| Package tree | High | Critical | Remaining |
| --- | ---: | ---: | --- |
| Backend | 0 | 0 | One low and one moderate |
| Frontend | 0 | 0 | Six moderate |
| Public website | 0 | 0 | Six moderate |

## Remaining dispositions

- The backend Anthropic SDK advisory concerns default permissions in its local
  filesystem memory tool. Hosted ROSS permits only OpenAI, and ROSS does not
  use that Anthropic memory tool. Upgrading across the SDK's breaking-version
  boundary remains a self-hosted compatibility task.
- The backend esbuild advisory is in the `tsx` development toolchain. It is not
  copied into the pruned production image and no development server is exposed
  by the hosted deployment.
- Frontend `postcss` findings are nested in the Next build toolchain. ROSS does
  not accept user-supplied CSS for compilation. The upstream Next dependency
  must be updated when it carries the patched PostCSS release.
- Frontend `uuid` findings are transitive through Fortune Sheet, ExcelJS, and
  Resend/Svix. ROSS does not call the affected UUID buffer-output API. The
  affected packages remain subject to upstream upgrade and reviewer retest.
- Public-website esbuild is transitive through `drizzle-kit`, which is a local
  schema-generation tool and is not included in the deployed static runtime.
  The public-website PostCSS finding has the same build-time limitation noted
  above.

These are reachability dispositions, not permanent waivers. Re-run all three
audits at the frozen review commit and attach the timestamped output. Any new
high or critical result is release-blocking.
