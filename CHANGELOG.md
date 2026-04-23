# Changelog

All notable changes to `@assinafy/n8n-nodes-assinafy` will be documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — Unreleased

Initial release. Mirrors the surface of the official Assinafy Node and PHP SDKs
and the public REST API at https://api.assinafy.com.br/v1/docs. Published to the
GitHub Packages npm registry (`https://npm.pkg.github.com`) under the
`@assinafy` scope.

### Changed

- Audited the n8n assignment node against the local SDKs so `collect` assignments now accept the SDK-compatible `entries` payload and document `copy_receivers` correctly as signer IDs.
- Aligned webhook registration defaults and trigger signature verification with the local SDK behavior (`document_prepared` stays in the default event set and only `X-Assinafy-Signature` is trusted for HMAC verification).
- Added the same guardrails used by the Node SDK for document uploads (reject empty PDFs and files larger than 25MB) and signer lookup/create email validation.

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
