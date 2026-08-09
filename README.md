# @assinafy/n8n-nodes-assinafy

Community n8n nodes for [Assinafy](https://assinafy.com.br), the Brazilian electronic-signature platform. This package maps all 87 operations in the public [Assinafy REST API](https://api.assinafy.com.br/v1/docs) v1 contract to first-class n8n nodes, with a small number of clearly identified convenience and live-API compatibility operations.

This package ships:

- **Assinafy** — an action node exposing every documented endpoint in the v1 API. Resources: `assignment`, `auth`, `document`, `field` (field definition), `signer`, `signerDocument` (signer-side flows), `tag`, `template`, `webhook`, `workspace`.
- **Assinafy Trigger** — a webhook trigger that subscribes your workflow to Assinafy events and can verify an HMAC-SHA256 signature when the opt-in check is enabled.
- **Assinafy API** — a shared credential (X-Api-Key + account ID, with production/sandbox/custom base URLs).

## Installation

Public releases target **npmjs.com** as the primary registry under `@assinafy/n8n-nodes-assinafy`. Once a release is present there, no registry token or custom `.npmrc` is needed to install it. The first npmjs publication and n8n catalog submission are external release steps, not guarantees made by this repository.

### Self-hosted n8n

1. Install the package:

   ```bash
   npm install @assinafy/n8n-nodes-assinafy
   ```

2. In n8n, open **Settings → Community Nodes** and enter `@assinafy/n8n-nodes-assinafy`. See the [n8n community-node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for container and queue-mode details.

GitHub Packages may be used as an optional release mirror. Installing from that mirror requires an `@assinafy:registry=https://npm.pkg.github.com` scope mapping and a GitHub token with `read:packages`; those settings are not needed for the primary npmjs package.

### n8n Cloud

Publication to npmjs is required for n8n's verified community-node submission process. Availability in n8n Cloud still depends on n8n review and catalog approval; npm publication alone does not imply Cloud availability.

The package declares `n8n-workflow` as a peer dependency so the installed n8n instance supplies the compatible runtime. Building and testing this repository requires **Node.js 22.22 or newer**; CI and release jobs use the current LTS line, Node.js 24.

## Credentials

Create an **Assinafy API** credential for account-scoped and API-key operations:

| Field           | Required        | Notes                                                                                                                                                     |
| --------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment     | ✓               | `Production` (default), `Sandbox`, or `Custom`. Production resolves to `https://api.assinafy.com.br/v1`; sandbox to `https://sandbox.assinafy.com.br/v1`. |
| Custom Base URL | ✓ for `Custom`  | Must be absolute HTTPS and end in `/v1`, with no user info, query, or fragment. HTTP is allowed only for loopback development hosts.                      |
| API Key         | ✓ in credential | Generated from the Assinafy dashboard. Sent as the `X-Api-Key` request header.                                                                            |
| Account ID      | ✓ in credential | Default workspace (account) ID. Used by every account-scoped endpoint.                                                                                    |
| Webhook Secret  | —               | Shared secret for the Assinafy Trigger node to verify HMAC-SHA256 signatures.                                                                             |

The credential test calls `GET /accounts/{accountId}` to confirm the key and account are valid. Custom URLs are validated and normalized before either the Test request or any authenticated request can attach the API key. The **Assinafy** action credential is optional only for public, signer-access-code, and explicitly Bearer-authenticated operations. Without a selected credential those calls use the production base URL; if a selected credential cannot be loaded, the call fails instead of silently falling back to production. Select a Sandbox credential even for an unauthenticated call when you need the sandbox host. The **Assinafy Trigger** always requires a credential because subscription lifecycle calls are account-scoped.

## Supported operations

> **Full reference with request/response payloads:** see
> [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for every operation's node parameters,
> example request body/query, and example response (`{status,message,data}` envelope,
> unwrapped by the node). The tables below are a quick endpoint index.

### Resource: Document

| Operation                   | Endpoint                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Upload                      | `POST /accounts/{accountId}/documents` (multipart)                                                   |
| List                        | `GET /accounts/{accountId}/documents`                                                                |
| Search                      | `GET /accounts/{accountId}/documents/search` — lightweight name/status search                        |
| Get                         | `GET /documents/{id}`                                                                                |
| Rename                      | `PATCH /documents/{id}`                                                                              |
| Delete                      | `DELETE /documents/{id}`                                                                             |
| Download Artifact           | `GET /documents/{id}/download/{artifact}` — `original`, `certificated`, `certificate-page`, `bundle` |
| Download Thumbnail          | `GET /documents/{id}/thumbnail`                                                                      |
| Download Page               | `GET /documents/{id}/pages/{pageId}/download`                                                        |
| Get Activities              | `GET /documents/{id}/activities`                                                                     |
| Get Signing Progress        | derived from `GET /documents/{id}`                                                                   |
| Wait Until Ready            | polls `GET /documents/{id}` until status is `metadata_ready`, `pending_signature`, or `certificated` |
| Create From Template        | `POST /accounts/{accountId}/templates/{templateId}/documents`                                        |
| Estimate Cost From Template | `POST /accounts/{accountId}/templates/{templateId}/documents/estimate-cost`                          |
| Verify                      | `GET /documents/{hash}/verify` — public; verifies a certificated document by its signature hash      |
| Get Public Info             | `GET /public/documents/{id}` — unauthenticated, returns name, page count, creator                    |
| Send Public Token           | `PUT /public/documents/{id}/send-token` — emails/whatsapps the 6-digit access token                  |
| List Statuses               | `GET /documents/statuses` — enumerates document status codes and deletability                        |
| List Tags                   | `GET /accounts/{accountId}/documents/{documentId}/tags`                                              |
| Replace Tags                | `PUT /accounts/{accountId}/documents/{documentId}/tags`                                              |
| Append Tags                 | `POST /accounts/{accountId}/documents/{documentId}/tags`                                             |
| Detach Tag                  | `DELETE /accounts/{accountId}/documents/{documentId}/tags/{tagId}`                                   |

Uploads accept a binary property from the previous node (must be a non-empty PDF up to 25 MB). Downloaded artifacts are attached back to the output item as binary data. The List operation supports filtering by `status`, `method` (`virtual` / `collect`), tag IDs, and a `search` term. Create From Template supports signer roles, sequential `step` ordering, editor field values, and document tag names.

### Resource: Signer

| Operation                        | Endpoint                                                                |
| -------------------------------- | ----------------------------------------------------------------------- |
| Create                           | `POST /accounts/{accountId}/signers`                                    |
| List                             | `GET /accounts/{accountId}/signers`                                     |
| Get                              | `GET /accounts/{accountId}/signers/{signerId}`                          |
| Update                           | `PUT /accounts/{accountId}/signers/{signerId}`                          |
| Delete                           | `DELETE /accounts/{accountId}/signers/{signerId}`                       |
| Find by Email                    | `GET /accounts/{accountId}/signers?search={email}`                      |
| Get Self (Signer Side)           | `GET /signers/self?signer-access-code=…`                                |
| Accept Terms (Signer Side)       | `PUT /signers/accept-terms?signer-access-code=…`                        |
| Verify Code (Signer Side)        | `POST /verify?signer-access-code=…`                                     |
| Confirm Data (Signer Side)       | `PUT /documents/{documentId}/signers/confirm-data?signer-access-code=…` |
| Upload Signature (Signer Side)   | `POST /signature?signer-access-code=…&type=signature\|initial`          |
| Download Signature (Signer Side) | `GET /signature/{type}?signer-access-code=…`                            |

### Resource: Assignment

| Operation                   | Endpoint                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| Create                      | `POST /documents/{documentId}/assignments`                                                        |
| Estimate Cost               | `POST /documents/{documentId}/assignments/estimate-cost`                                          |
| Reset Expiration            | `PUT /documents/{documentId}/assignments/{assignmentId}/reset-expiration`                         |
| Resend Notification         | `PUT /documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/resend`                |
| Estimate Resend Cost        | `POST /documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/estimate-resend-cost` |
| List WhatsApp Notifications | `GET /documents/{documentId}/assignments/{assignmentId}/whatsapp-notifications`                   |
| Get Sign Page (Signer Side) | `GET /sign?signer-access-code=…`                                                                  |
| Sign (Signer Side)          | `POST /documents/{documentId}/assignments/{assignmentId}?signer-access-code=…`                    |
| Decline (Signer Side)       | `PUT /documents/{documentId}/assignments/{assignmentId}/reject?signer-access-code=…`              |
| List                        | `GET /assignments?accountId={accountId}`                                                          |

The `method` can be `virtual` (remote signature via email or WhatsApp) or `collect` (field-placed signatures on the document). Each signer entry accepts optional `verification_method` (`Email` / `Whatsapp`), `notification_methods`, and sequential-signing `step`. For `collect`, the node exposes the SDK-compatible `entries` JSON payload. `copy_receivers` are signer IDs, not email addresses.

### Resource: Template

| Operation | Endpoint                                                                             |
| --------- | ------------------------------------------------------------------------------------ |
| List      | `GET /accounts/{accountId}/templates` — filters: `search`, `status`, tag IDs, `sort` |
| Get       | `GET /accounts/{accountId}/templates/{templateId}`                                   |

Templates are read-only resources created through the Assinafy web app. Use **List** and **Get** to retrieve roles and field placements needed for Create From Template documents. The Get route works in the live API but is not present in the 2026-08-08 OpenAPI snapshot; it is retained as an explicitly documented compatibility operation.

### Resource: Tag

| Operation | Endpoint                                                            |
| --------- | ------------------------------------------------------------------- |
| Create    | `POST /accounts/{accountId}/tags`                                   |
| List      | `GET /accounts/{accountId}/tags` — filter: `search`                 |
| Update    | `PUT /accounts/{accountId}/tags/{tagId}`                            |
| Delete    | `DELETE /accounts/{accountId}/tags/{tagId}` — optional `force=true` |

Tags are workspace-scoped labels. They can be managed directly through the Tag resource and attached to documents through the Document tag operations. Tag color values are validated as 6-character hex strings before being sent.

### Resource: Field Definition

| Operation         | Endpoint                                                                             |
| ----------------- | ------------------------------------------------------------------------------------ |
| Create            | `POST /accounts/{accountId}/fields`                                                  |
| List              | `GET /accounts/{accountId}/fields` — filters: `include_inactive`, `include_standard` |
| Get               | `GET /accounts/{accountId}/fields/{fieldId}`                                         |
| Update            | `PUT /accounts/{accountId}/fields/{fieldId}`                                         |
| Delete            | `DELETE /accounts/{accountId}/fields/{fieldId}`                                      |
| Validate          | `POST /accounts/{accountId}/fields/{fieldId}/validate` — supports signer-access-code |
| Validate Multiple | `POST /accounts/{accountId}/fields/validate-multiple` — supports signer-access-code  |
| List Types        | `GET /field-types`                                                                   |

### Resource: Signer Document (Signer Side)

These endpoints authorize via the per-signer `signer-access-code` query parameter rather than the workspace API key. Useful for surfacing what an end signer can see/do from inside a workflow.

| Operation        | Endpoint                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Get Current      | `GET /signers/{signerId}/document?signer-access-code=…`                                   |
| List             | `GET /signers/{signerId}/documents?signer-access-code=…`                                  |
| Search           | `GET /signers/{signerId}/documents/search?signer-access-code=…&search=…`                  |
| Sign Multiple    | `PUT /signers/documents/sign-multiple?signer-access-code=…`                               |
| Decline Multiple | `PUT /signers/documents/decline-multiple?signer-access-code=…`                            |
| Download         | `GET /signers/{signerId}/documents/{documentId}/download/{artifact}?signer-access-code=…` |

### Resource: Authentication

User-account flows. Login operations return an access token used as `Authorization: Bearer …`. Operations that expose **Access Token** use it when provided and otherwise use the configured API key; public password-reset operations need neither.

| Operation              | Endpoint                                     |
| ---------------------- | -------------------------------------------- |
| Login                  | `POST /login`                                |
| Social Login           | `POST /authentication/social-login`          |
| Link Social Login      | `POST /auth/link-social-login`               |
| Create API Key         | `POST /users/api-keys`                       |
| Get API Key (Masked)   | `GET /users/api-keys`                        |
| Delete API Key         | `DELETE /users/api-keys`                     |
| Change Password        | `PUT /authentication/change-password`        |
| Request Password Reset | `PUT /authentication/request-password-reset` |
| Reset Password         | `PUT /authentication/reset-password`         |

### Resource: Workspace

| Operation              | Endpoint                                        |
| ---------------------- | ----------------------------------------------- |
| Create                 | `POST /accounts`                                |
| List                   | `GET /accounts`                                 |
| Get                    | `GET /accounts/{workspaceId}`                   |
| Update                 | `PUT /accounts/{workspaceId}`                   |
| Delete                 | `DELETE /accounts/{workspaceId}`                |
| Get Current User       | `GET /users/self`                               |
| Get Account Statistics | `GET /accounts/{workspaceId}/stats`             |
| Get User Statistics    | `GET /users/self/stats`                         |
| Get Theme              | `GET /accounts/{workspaceId}/theme`             |
| Upload Logo            | `POST /accounts/{workspaceId}/logo` (multipart) |
| Download Logo          | `GET /accounts/{workspaceId}/logo`              |
| Delete Logo            | `DELETE /accounts/{workspaceId}/logo`           |

### Resource: Webhook

| Operation               | Endpoint                                                 |
| ----------------------- | -------------------------------------------------------- |
| Register Subscription   | `PUT /accounts/{accountId}/webhooks/subscriptions`       |
| Get Subscription        | `GET /accounts/{accountId}/webhooks/subscriptions`       |
| Inactivate Subscription | `PUT /accounts/{accountId}/webhooks/inactivate`          |
| List Event Types        | `GET /webhooks/event-types`                              |
| List Dispatches         | `GET /accounts/{accountId}/webhooks`                     |
| Retry Dispatch          | `POST /accounts/{accountId}/webhooks/{dispatchId}/retry` |

## Assinafy Trigger

The trigger node registers (or replaces) the workspace-wide webhook subscription when the workflow is activated. On deactivation it first reads the current subscription and calls the documented `PUT /accounts/{accountId}/webhooks/inactivate` endpoint only when URL, email, and events still match this trigger, so an independently replaced subscription is left intact. On each incoming delivery it emits `{ event, headers, body }` as a single n8n item with authentication/cookie/signature headers redacted.

**Signature verification is opt-in.** The Assinafy public API docs do not currently document a delivery signature, so `Verify Signature` is **off by default**. If your workspace is configured to sign deliveries, set the credential **Webhook Secret** and enable `Verify Signature`: the node then requires the `X-Assinafy-Signature` header, computes the HMAC-SHA256 digest over the **raw** request body, and rejects the delivery on mismatch (or when the raw body is unavailable — it fails closed).

> [!IMPORTANT]
> The Assinafy API supports a **single** webhook subscription per workspace. Activating this trigger replaces any existing subscription; deactivation inactivates only a still-matching subscription. If you need to fan out events to multiple destinations, point the trigger at an n8n workflow that rebroadcasts to downstream systems.

The full event list (source of truth: `nodes/Assinafy/resources/webhookEvents.ts`, shown in the node's **Events** dropdown):
`assignment_created`, `document_metadata_ready`, `document_prepared`, `document_processing_failed`, `document_ready`, `document_uploaded`, `signature_requested`, `signer_created`, `signer_data_confirmed`, `signer_email_verified`, `signer_rejected_document`, `signer_signed_document`, `signer_viewed_document`, `signer_whatsapp_verified`, `template_created`, `template_processed`, `template_processing_failed`, `user_rejected_document`. When no events are selected, the trigger subscribes to a sensible default set (`document_ready`, `document_prepared`, `signer_signed_document`, `signer_rejected_document`, `document_processing_failed`).

## Example workflow

1. **HTTP Request / Read File** — load a PDF into a binary property.
2. **Assinafy** (Document · Upload) — upload the PDF.
3. **Assinafy** (Document · Wait Until Ready) — wait until metadata is ready.
4. **Assinafy** (Signer · Create) — add one signer per contact.
5. **Assinafy** (Assignment · Create) — create a `virtual` assignment linking the document and signers.
6. **Assinafy Trigger** — listen for `signer_signed_document` and `document_ready` to branch into downstream automations.

## Development

```bash
npm ci            # reproducible install from package-lock.json
npm run dev       # runs n8n-node dev — starts n8n locally with this package loaded and hot reload
npm run lint      # n8n-node lint
npm run build     # compiles TypeScript into dist/
npm test          # unit and request-shape tests
npm run test:ci   # tests with enforced coverage thresholds
npm run audit:prod # production-dependency vulnerability check
```

The codebase contains one credential, one action node with ten resources, and one trigger. The shared transport handles authenticated and public/signer-access-code requests, response-envelope unwrapping, pagination, and retryable rate limits. List-search methods back the resource-locator pickers for documents, signers, tags, and templates.

The optional sandbox suite is intentionally separate from the default test run. It requires explicit sandbox credentials, rejects production hosts, creates disposable records, and cannot complete inbox-dependent login/reset or signer-code flows without credentials/codes supplied by the operator. A route-level or request-shape check is not reported as a successful end-to-end operation. See [the operation reference](docs/OPERATIONS.md#verification-status-and-known-contract-divergences) for the verified limitations.

## Releasing

`npm run release` lints, builds, and prompts for a version bump. A version tag builds one immutable tarball, publishes it to npmjs with provenance, and mirrors the same bytes to GitHub Packages (see `.github/workflows/publish.yml`). npmjs trusted-publisher and GitHub Packages permissions must be configured in the external registries before the first release.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the verification and sandbox-test workflow. Report vulnerabilities according to [SECURITY.md](SECURITY.md); never put API keys, signer codes, personal data, or document contents in a public issue.

## License

[MIT](LICENSE.md)
