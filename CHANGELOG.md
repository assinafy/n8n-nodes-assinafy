# Changelog

All notable changes to `@assinafy/n8n-nodes-assinafy` will be documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] — 2026-06-05

Production-hardening audit against the live Assinafy v1 API (sandbox-verified, every
operation exercised). Adds a full per-operation reference, a much larger test suite,
and CI that actually runs it.

### Removed

- **Assignment — `Cancel Signature Request`.** Live testing confirmed the endpoint
  does not exist (every candidate path — `POST /accounts/{id}/signature-requests/{docId}/cancel`,
  `/documents/{id}/cancel`, `.../assignments/{id}/cancel` — returns 404, even against a real
  document with an active assignment), and the API docs document no cancellation endpoint. The
  non-functional operation was removed.

### Fixed

- **Signer reuse race now handles the real conflict status.** A duplicate-email create
  returns **HTTP 400** (`"Um signatário com este e-mail já existe."`), not 409. `Create`
  (with *Reuse If Exists*) now treats 400 and 409 alike: it re-resolves and returns the
  existing signer instead of surfacing the error.
- **`Verify` (document by hash) now calls the public endpoint with `skipAuth`,** matching the
  other public endpoints, so it works without an API key.
- **Pagination is header-accurate everywhere.** The resource-locator pickers
  (`getDocuments`/`getSigners`/`getTags`/`getTemplates`) now derive the next page from the
  `X-Pagination-Page-Count` header instead of a brittle page-size heuristic.
- **Transport retries transient `429 Too Many Requests`** with bounded exponential backoff,
  honoring a `Retry-After` header, including mid-pagination.

### Changed

- **Trigger signature verification is now opt-in (default off).** The Assinafy docs document
  no delivery signature; enabling `Verify Signature` (with a credential Webhook Secret) keeps the
  HMAC-SHA256 check, which now **fails closed** when the raw request body is unavailable instead
  of re-serializing the parsed body.
- **`assinafyApiRequestAllItems` honors `skipAuth`** and wraps page errors in `NodeApiError`,
  and `per-page` is clamped to the documented maximum of 100.
- **Signer Document `List` emits one n8n item per document** (was a single bundled item),
  matching every other list operation.

### Refactored (no behaviour change)

- Extracted shared helpers to remove ~6× duplicated list-pagination blocks, ~10× envelope
  unwraps, and duplicated `requireAccessCode` / `normalizeTagFilter` / JSON-parse logic:
  `executeListOperation`, `searchResource`, `asArray` (transport) and `requireAccessCode`,
  `parseJsonParam`, `normalizeTagFilter` (utils). `cleanQs` now also drops empty arrays.

### Tooling

- **CI now runs the Jest suite** (and a Node `20 / 22 / 24` matrix); the publish workflow runs
  lint + tests + build and asserts the git tag matches `package.json` version before publishing.
- Added `engines.node >= 20.19`, pinned `@n8n/node-cli`, bumped `tsconfig` target/lib to ES2022,
  fixed `build:watch` to copy assets (`n8n-node dev`), corrected jest coverage globs, and added a
  coverage floor.

### Documentation & tests

- **New [`docs/OPERATIONS.md`](docs/OPERATIONS.md):** full request/response payload reference for
  all 80 operations across 10 resources.
- Test suite grown from 98 to 185 tests: request-shape assertions for every resource/operation,
  the Trigger's HMAC verification + lifecycle, and the list-search pickers (~80% statement
  coverage, up from ~27%).

## [1.2.0] — 2026-05-11

Full API-coverage release. The action node now exposes every documented endpoint
in `https://api.assinafy.com.br/v1/docs`, including the signer-side flows that
authenticate via `signer-access-code` and the public/unauthenticated endpoints.

### Added

- **Document — `Get Public Info`** (`GET /public/documents/{id}`, unauthenticated).
- **Document — `Send Public Token`** (`PUT /public/documents/{id}/send-token`).
- **Document — `List Statuses`** (`GET /documents/statuses`).
- **Assignment — `List WhatsApp Notifications`**
  (`GET /documents/{documentId}/assignments/{assignmentId}/whatsapp-notifications`).
- **Assignment — `Get Sign Page` / `Sign` / `Decline`** (signer-side flow over
  `signer-access-code`).
- **Signer — `Get Self`, `Accept Terms`, `Verify Code`, `Confirm Data`,
  `Upload Signature`, `Download Signature`** (signer-side flows).
- **Field Definition** resource (entirely new): `Create`, `List`, `Get`,
  `Update`, `Delete`, `Validate`, `Validate Multiple`, `List Types` — covers
  `POST/GET/PUT/DELETE /accounts/{accountId}/fields(/{fieldId})`, the
  `validate(-multiple)` endpoints, and `GET /field-types`.
- **Signer Document** resource (entirely new, signer-side): `Get Current`,
  `List`, `Sign Multiple`, `Decline Multiple`, `Download` for
  `/signers/{signerId}/document(s)` and the bulk sign/decline endpoints.
- **Authentication** resource (entirely new): `Login`, `Social Login`,
  `Create / Get / Delete API Key`, `Change Password`, `Request Password Reset`,
  `Reset Password`.

### Changed

- **Trigger tear-down switched to the documented inactivate endpoint.**
  Deactivating an `Assinafy Trigger` workflow now calls
  `PUT /accounts/{accountId}/webhooks/inactivate` instead of the previously
  undocumented `DELETE /accounts/{accountId}/webhooks/subscriptions`. The
  trigger's `checkExists` hook now compares URL, contact email, active flag,
  and the full event set, so changing any of those re-registers the
  subscription on workflow re-activation.
- **Webhook — empty subscription detected.** The API returns
  `{ events: [], url: null, is_active: true }` when no subscription has ever
  been registered. The webhook resource now treats that sentinel as "no
  subscription" rather than returning it to callers.
- **Transport — unauthenticated requests.** `assinafyApiRequest` now supports
  a `skipAuth: true` option so the new public and signer-access-code endpoints
  can be called without the `X-Api-Key` header.

### Refactored (no behaviour change)

- `extractRequiredId`, `assertEmail`, `safeJsonParse`, `sanitizeCpf`, and a
  resource-scoped `showOnly` helper were consolidated in
  `nodes/Assinafy/shared/utils.ts`. Duplicates that lived inside `signer.ts`,
  `document.ts`, and `assignment.ts` were removed in favour of the shared
  versions.
- `cleanQs` now accepts an optional list of keys whose `0` values should also
  be dropped, eliminating the bespoke filter-cleanup loop in `webhook.ts`.

## [1.1.1] — 2026-05-06

### Added

- **Signer: Create / Update — CPF field** — Added an optional `CPF` additional field to the Signer Create and Update operations. The value accepts any common CPF format (`123.456.789-00`, `12345678900`, etc.); non-digit characters are stripped before sending, matching the PHP SDK's `sanitizeDocument()` behaviour. CPF is a Brazilian tax ID used by the Assinafy platform for signer identity matching.

## [1.1.0] — 2026-05-06

Full audit against the Assinafy REST API v1 docs (`https://api.assinafy.com.br/v1/docs`).
All endpoints re-verified. Three new Document operations and a complete Template resource added.

### Added

- **Document: Create From Template** — `POST /accounts/{accountId}/templates/{templateId}/documents`. Accepts `signers[]` (with `role_id`, `id`, `verification_method`, `notification_methods`), optional `name`, `message`, `expires_at`, and `editor_fields` JSON array.
- **Document: Estimate Cost From Template** — `POST /accounts/{accountId}/templates/{templateId}/documents/estimate-cost`. Same signer shape as Create From Template.
- **Document: Verify** — `GET /documents/{hash}/verify`. Public endpoint that verifies a certificated document by its SHA-1 signature hash.
- **Template** resource (entirely new):
  - **List** — `GET /accounts/{accountId}/templates` with `search`, `status` (`uploading` / `uploaded` / `processing` / `ready` / `failed`), and `sort` filters; supports `Return All`.
  - **Get** — `GET /accounts/{accountId}/templates/{templateId}`.
- **`getTemplates` list-search method** — backs future resource-locator pickers for Template ID fields.

### Fixed

- **Document Upload — multipart boundary** — removed the explicit `Content-Type: multipart/form-data` header from `uploadDocument`. When `FormData` is passed as the request body the HTTP client generates the `Content-Type` header including the required boundary string; setting it explicitly dropped the boundary and caused server-side parse errors.
- **Signer Create — email now optional** — the API allows signers to be created with a WhatsApp phone number and no email address (WhatsApp-only verification flow). The `email` field is no longer required; the node now throws a validation error only when *neither* email nor `whatsapp_phone_number` is supplied.

### Changed

- **Document List — Signature Method filter** — added `method` (`virtual` / `collect`) filter option to the Document List operation, matching the `?method=` query parameter documented by the API.
- Updated node description to reference the new Template resource.

## [1.0.0] — 2025-01-01

Initial release. Mirrors the surface of the official Assinafy PHP SDK and the public REST API at `https://api.assinafy.com.br/v1/docs`. Published to the GitHub Packages npm registry (`https://npm.pkg.github.com`) under the `@assinafy` scope.

### Added

- **AssinafyApi** credential — `X-Api-Key` authentication, Production / Sandbox / Custom base URL, default account ID, and optional webhook secret for HMAC verification. Credential test calls `GET /accounts/{accountId}`.
- **Assinafy** action node with five resources:
  - **Document** — Upload (multipart PDF), List, Get, Delete, Download Artifact (`original` / `certificated` / `certificate-page` / `bundle`), Download Thumbnail, Download Page, Get Activities, Get Signing Progress, Wait Until Ready.
  - **Signer** — Create, List, Get, Update, Delete, Find by Email.
  - **Assignment** — Create (virtual / collect), Estimate Cost, Reset Expiration, Resend Notification, Estimate Resend Cost, Cancel Signature Request.
  - **Workspace** — Create, List, Get, Update, Delete.
  - **Webhook** — Register / Get / Delete / Inactivate Subscription, List Event Types, List Dispatches, Retry Dispatch.
- Resource-locator pickers for documents and signers backed by `getDocuments` and `getSigners` list-search methods.
- **Assinafy Trigger** webhook node — registers and tears down the workspace webhook subscription on workflow activation, verifies the HMAC-SHA256 signature on each delivery, and emits `{ event, headers, body }` as a workflow item.
- Shared transport helper that authenticates through n8n's `httpRequestWithAuthentication`, unwraps the `{ status, message, data }` response envelope, and follows pagination via the `X-Pagination-*` response headers.

### Changed

- Audited the assignment node against the API so `collect` assignments accept the SDK-compatible `entries` payload and `copy_receivers` are correctly documented as signer IDs.
- Aligned webhook registration defaults and trigger signature verification with the API behavior (`document_prepared` stays in the default event set; only `X-Assinafy-Signature` is trusted for HMAC verification).
- Added guardrails for document uploads (reject empty PDFs and files larger than 25 MB) and signer email validation.
