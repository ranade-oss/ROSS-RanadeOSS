# ROSS Usability Improvements

Living tracker for usability observations discovered while building and testing ROSS (Ranade OSS). Update this document as new issues are confirmed.

Last updated: July 17, 2026

## Priority guide

- **P0 — Blocking:** prevents a core task or risks data loss.
- **P1 — High:** core task works, but the interface is difficult to discover or use.
- **P2 — Medium:** meaningful improvement that is not required for the initial private deployment.
- **P3 — Later:** polish or convenience.

## Confirmed usability improvements

### UX-001 — Add a visible Download button to the built-in document viewer

- **Priority:** P1
- **Status:** Implemented in Deliverable H; deployment verification pending
- **Area:** Projects → Documents → built-in PDF/document viewer
- **Observed behaviour:** Clicking a project document opens the built-in viewer, but the deployed interface does not show a visible Download button.
- **Current workaround:** Right-click the document name in the project document table and select **Download**. This works correctly.
- **Why it matters:** Downloading is a normal document action. Requiring a context menu makes the function difficult to discover, especially for users who do not know that right-click actions exist.
- **Proposed improvement:** Add a clearly labelled **Download** button, with a download icon, to the viewer header. Keep the right-click action as a secondary route.
- **Acceptance criteria:**
  - The button is visible whenever the signed-in user may download the displayed document.
  - It downloads the currently displayed document/version with the correct filename.
  - It works for PDF, Word, and supported spreadsheet previews.
  - It is keyboard accessible and has an accessible name.
  - It does not expose a permanent public file URL.

### UX-002 — Add document actions to the standalone upload/document picker

- **Priority:** P1
- **Status:** Backlog
- **Area:** Add Documents modal → Files
- **Observed behaviour:** A standalone document can be uploaded and selected, but the modal offers no way to open, preview, download, rename, or delete it.
- **Current workaround:** Create or open a Project, add the uploaded document to that Project, and then use the Project document interface.
- **Why it matters:** After a successful upload, users reasonably expect to be able to retrieve or manage the file from the place where it appears.
- **Proposed improvement:** Add an action menu beside each standalone document with **Open**, **Download**, **Rename**, and **Delete**. Keep selection as the primary row action.
- **Acceptance criteria:**
  - Actions are available without changing the row's selection behaviour.
  - **Open** launches the same built-in viewer used by Project documents.
  - **Download** retrieves the original file with the correct filename.
  - **Delete** requires confirmation and removes both metadata and private object storage data.
  - Owner-only authorization is enforced by the backend, not only the interface.

### UX-003 — Make Project document actions discoverable without right-clicking

- **Priority:** P2
- **Status:** Backlog
- **Area:** Projects → Documents table
- **Observed behaviour:** Useful actions, including Download, are available through a right-click context menu, but the row does not clearly indicate that the menu exists.
- **Proposed improvement:** Add a visible three-dot action button at the end of every document row. The button and right-click menu should expose the same commands.
- **Acceptance criteria:**
  - The three-dot button is visible on hover and keyboard focus, and remains usable on touch devices.
  - It exposes the same authorized actions as the context menu.
  - Right-click continues to work for experienced users.

### UX-004 — Provide useful post-upload confirmation and next actions

- **Priority:** P2
- **Status:** Backlog
- **Area:** Document upload flows
- **Observed behaviour:** Uploading succeeds, but the interface does not clearly direct the user to preview, download, attach, or manage the uploaded document.
- **Proposed improvement:** After upload, show a concise success state with context-appropriate actions such as **Open**, **Add to Project**, **Attach to Chat**, and **Download**.
- **Acceptance criteria:**
  - The user can tell that the upload completed.
  - At least one obvious route is provided to retrieve or use the uploaded file.
  - Duplicate clicks do not upload the same file again while processing.

### UX-005 — Reconcile the live assistant stream with the saved response

- **Priority:** P1
- **Status:** Root cause confirmed after five-run test; renderer hotfix prepared
- **Area:** Assistant chat → live response rendering
- **Observed behaviour:** After the prefix-aware parser was freshly deployed, five consecutive tests produced three complete live responses (tests 1, 3, and 4) and two truncated live responses (tests 2 and 5). Refreshing and reopening the chat displays the complete saved response. The defect is intermittent and limited to live rendering rather than model completion or persistence.
- **Confirmed cause:** `useSmoothedReveal` updates only its internal floating-position reference when streaming becomes inactive, leaving the rendered character count stale. If the animation has already caught up, the response appears complete; otherwise its final characters remain hidden until another render or page refresh.
- **Current workaround:** Refresh ROSS and reopen the conversation from Assistant History.
- **Why it matters:** A user can incorrectly conclude that the AI request failed even though the backend completed and saved it.
- **Proposed improvement:** When smoothing is inactive, render the complete `text` value directly instead of slicing it to the last animated character count. Retain the prefix-aware citation parser, canonical final event, and saved-response reconciliation as safeguards.
- **Deployment verification:** Prefix-aware parser deployment run `29563163297` checked out merge commit `55f5a7825c7a7af15f079ae3c572e3891400e998`; both application builds executed, both Fly images were published, and health checks passed. The subsequent five-run test passed on attempts 1, 3, and 4 and truncated on attempts 2 and 5, confirming an animation-timing defect. The renderer hotfix is prepared but not yet deployed.
- **Acceptance criteria:**
  - The live response and the reloaded saved response contain identical assistant text.
  - Final buffered text is rendered before the loading state ends.
  - A dropped or malformed stream displays a clear retryable error instead of silently leaving partial text.
  - Automated tests cover an SSE response whose final content and completion events arrive in the last network chunk.
  - Five consecutive new-chat live tests display the complete response without a refresh.

### UX-007 — Make deployments rebuild and prove the current source revision

- **Priority:** P0
- **Status:** Complete and verified in deployment run `29561702306`
- **Area:** GitHub Actions → private Fly deployment
- **Observed behaviour:** Deployment run `29560320383` checked out PR #11's merge commit `67bf635d21c3ddb7d96f6d0d4086a62faaa0abdf`, but Fly reused cached source-copy and build layers for both the API and frontend. The workflow completed successfully even though the intended application changes were not freshly built.
- **Current workaround:** None within the existing workflow.
- **Why it matters:** A green deployment can leave the live application on older code, making fixes appear ineffective and preventing reliable release verification.
- **Proposed improvement:** Add Fly's supported `--no-cache` option to both deployment commands during the controlled-beta phase. Inspect the next run to confirm the source-copy and application-build layers execute instead of reporting `CACHED`.
- **Deployment verification:** The workflow checked out commit `00095508fdae0300692253280e17571d790c529b`. `COPY backend/src`, the backend build, `COPY frontend`, and the frontend build all executed. Both Fly images were published and the owner-only service health checks passed. Cache hits were limited to base-image metadata, not ROSS application source or builds.
- **Acceptance criteria:**
  - Both API and frontend deployment commands use `--no-cache`.
  - Automated baseline coverage prevents either cache bypass from being removed accidentally.
  - The next deployment log shows both application builds executing from the checked-out revision.
  - A post-deployment Assistant smoke test returns the complete response without refresh.
  - A future optimization may replace unconditional cache bypass with revision-stamped, verifiable images, but must retain deployment provenance.

### UX-006 — Preserve user prompts in Assistant History

- **Priority:** P0
- **Status:** Live database corrected; canonical repository correction merged in ROSS PR #10
- **Area:** Assistant chat → message persistence and history
- **Observed behaviour:** After refreshing and reopening the smoke-test conversation, the complete assistant answer appeared but the original user prompt was absent.
- **Confirmed cause:** The fresh Supabase schema does not include `public.chat_messages.workflow`, while the backend writes a `workflow` field for user messages. The failed user-message insert is not checked, so the assistant request continues and its response is saved.
- **Current workaround:** None. The missing prompt must not be treated as reliably persisted.
- **Proposed improvement:** Add the missing nullable `workflow jsonb` column, update the canonical fresh schema, and make the backend check and report user-message insert failures before calling the model.
- **Deployment verification:** The missing column was added to the live Supabase database. A new prompt and complete assistant response both appeared correctly in Assistant History after refresh.
- **Acceptance criteria:**
  - New user prompts, attachments, and optional workflow metadata persist and reappear after refresh.
  - A failed user-message insert prevents the model request and returns a clear error.
  - The canonical fresh schema matches every field written by the backend.
  - A deployment smoke test verifies both user and assistant messages after a full page refresh.

### UX-008 — Discover API-key model access and expose model-specific reasoning effort

- **Priority:** P1
- **Status:** Implemented in Deliverable H for the assistant and OpenAI key-scoped discovery; deployment verification pending
- **Area:** Assistant model picker; Account → Models; OpenAI Responses API adapter
- **Observed behaviour:** ROSS shows a hard-coded OpenAI model list containing GPT-5.5 and GPT-5.4. A configured OpenAI API key does not cause ROSS to discover newly available models such as GPT-5.6. ROSS also exposes only a general thinking toggle and does not let the user choose the model's supported reasoning effort.
- **Confirmed cause:** The frontend and backend both maintain static allowlists. The OpenAI request adapter can request a reasoning summary but does not send `reasoning.effort`.
- **Why it matters:** Users cannot select newer models their API project can access or make an explicit cost, latency, and reasoning-quality tradeoff. Static lists become stale whenever a provider changes its catalogue.
- **Proposed improvement:** Discover available models server-side with the user's provider credential, intersect them with a ROSS-compatible model capability registry, and display the resulting choices. Add a model-specific **Reasoning effort** selector whose options and default are derived from that registry. Keep a refresh action and a safe curated fallback if provider discovery fails.
- **OpenAI compatibility note:** The OpenAI model-list endpoint returns model identifiers and basic availability information, but not reasoning capabilities. ROSS therefore needs both live key-scoped discovery and a maintained capability registry. As of 2026-07-17, GPT-5.6 supports `none`, `low`, `medium`, `high`, `xhigh`, and `max`; GPT-5.5 supports `none`, `low`, `medium`, `high`, and `xhigh`.
- **Acceptance criteria:**
  - Model discovery is performed by the authenticated backend; the API key is never returned to the browser or written to logs.
  - Every provider model returned for the configured key that is compatible with ROSS chat appears in the picker.
  - Non-chat models such as embeddings, image, audio, moderation, and transcription models are not offered as assistant-chat choices.
  - The interface distinguishes provider availability from ROSS compatibility and explains why an available but unsupported model is omitted or disabled.
  - The reasoning selector shows only values supported by the selected model and clearly identifies the default.
  - The selected model and reasoning effort are validated by the backend, persisted with the relevant preference or chat, and sent to the provider request.
  - Changing models automatically preserves a supported effort or selects that model's documented default; it never silently sends an invalid value.
  - A **Refresh models** action updates key-scoped availability without requiring a deployment.
  - Discovery failures keep the last known-good curated list and show a retryable, credential-safe error.
  - Automated tests cover a newly available model, a model without reasoning controls, invalid effort rejection, discovery failure, and API-key secrecy.

### UX-009 — Show the active model and reasoning settings on saved answers

- **Priority:** P2
- **Status:** Backlog
- **Area:** Assistant response metadata and Assistant History
- **Proposed improvement:** Show a compact model/effort badge on each saved assistant response and retain that metadata when a conversation is reopened or exported.
- **Acceptance criteria:** A user can determine which provider model and reasoning effort produced an answer without exposing credentials or hidden reasoning.

### UX-010 — Add retry, regenerate, and recover controls for failed requests

- **Priority:** P1
- **Status:** Backlog
- **Area:** Assistant errors and interrupted streams
- **Proposed improvement:** Provide **Retry**, **Regenerate**, and **Copy prompt** actions with idempotency protection so recovery cannot silently create duplicate messages or tool actions.
- **Acceptance criteria:** A failed request presents an understandable cause and a safe one-click recovery path.

### UX-011 — Make authority verification a first-class interaction

- **Priority:** P1
- **Status:** Backlog
- **Area:** Ontario research answers and citations
- **Proposed improvement:** Add a citation panel that opens the relied-on passage, provider, court, decision date, retrieval date, coverage status, and public source link from the answer.
- **Acceptance criteria:** Every relied-on authority can be inspected and independently opened with no citation-number hunting.

### UX-012 — Surface legal-source availability before a research request

- **Priority:** P1
- **Status:** Backlog
- **Area:** Assistant composer and source-readiness dashboard
- **Proposed improvement:** Show the enabled Ontario/Canadian providers, their latest health check, and material coverage gaps before the user submits a source-dependent request.
- **Acceptance criteria:** A user is warned about unavailable or metadata-only coverage before relying on an answer.

### UX-013 — Add a short first-run readiness checklist

- **Priority:** P2
- **Status:** Backlog
- **Area:** Account onboarding
- **Proposed improvement:** Guide a new user through email verification, model key setup, jurisdiction defaults, source coverage, terms, and a synthetic smoke test.
- **Acceptance criteria:** The checklist detects completed steps automatically and never asks the user to re-enter a stored secret.

### UX-014 — Provide visible progress for long document operations

- **Priority:** P2
- **Status:** Backlog
- **Area:** Upload, conversion, indexing, tabular review, and export
- **Proposed improvement:** Display queued/running/completed/failed state, elapsed time, cancellation where safe, and a durable notification when a long task finishes.
- **Acceptance criteria:** Closing a modal does not make the operation or its result undiscoverable.

### UX-015 — Add conversation export with citations and provenance

- **Priority:** P2
- **Status:** Backlog
- **Area:** Assistant History
- **Proposed improvement:** Export a conversation to accessible DOCX/PDF/Markdown with prompts, answers, citations, retrieval dates, model metadata, and a clear generated-content notice.
- **Acceptance criteria:** The export contains no provider keys, signed URLs, hidden reasoning, or unrelated matter data.

### UX-016 — Add a consistent keyboard and mobile action model

- **Priority:** P2
- **Status:** Backlog
- **Area:** Projects, documents, assistant, tables, and modals
- **Proposed improvement:** Standardize visible action menus, keyboard shortcuts, focus restoration, touch targets, and an optional command palette.
- **Acceptance criteria:** Core tasks can be completed with keyboard alone and without right-click or hover-only controls.

### UX-017 — Let users report incorrect or stale authorities in context

- **Priority:** P2
- **Status:** Backlog
- **Area:** Citations and legal-source results
- **Proposed improvement:** Add **Report source issue** beside an authority, pre-populated with non-confidential technical metadata and an optional user explanation.
- **Acceptance criteria:** Reports preserve an audit trail and never include prompt or document content unless the user explicitly adds it.

### UX-018 — Preserve drafts and clearly indicate unsent content

- **Priority:** P2
- **Status:** Backlog
- **Area:** Assistant composer
- **Proposed improvement:** Save per-chat local drafts, restore them after navigation or refresh, and offer a clear discard action.
- **Acceptance criteria:** Drafts never cross chats, projects, browsers, or users unexpectedly.

## Verified working behaviour

- Owner authentication works on the private ROSS website.
- Uploading a document to private object storage works.
- Adding an existing standalone document to a Project works.
- Opening a Project document in the built-in PDF viewer works.
- Downloading from the Project document right-click menu works and returns the file correctly.
- The saved OpenAI assistant response reloads completely after a page refresh.
- The OpenAI API key is accepted and model inference completes successfully.
- New user prompts persist after adding `public.chat_messages.workflow jsonb` to the live database.

## New observation template

### UX-XXX — Short title

- **Priority:** P0 / P1 / P2 / P3
- **Status:** Needs confirmation / Backlog / In progress / Complete
- **Area:**
- **Observed behaviour:**
- **Current workaround:**
- **Why it matters:**
- **Proposed improvement:**
- **Acceptance criteria:**
