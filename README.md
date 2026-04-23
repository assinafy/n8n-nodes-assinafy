# n8n-nodes-assinafy

Community n8n nodes for [Assinafy](https://assinafy.com.br), the Brazilian electronic-signature platform. This package exposes the public [Assinafy REST API](https://api.assinafy.com.br/v1/docs) (v1) as first-class n8n nodes, mirroring the surface of the official Node and PHP SDKs.

This package ships:

- **Assinafy** — an action node with operations across `document`, `signer`, `assignment`, `workspace`, and `webhook` resources.
- **Assinafy Trigger** — a webhook trigger that subscribes your workflow to Assinafy events and verifies the HMAC-SHA256 signature on each delivery.
- **Assinafy API** — a shared credential (X-Api-Key + account ID, with production/sandbox/custom base URLs).

## Installation

In your n8n instance, open **Settings → Community Nodes** and install `n8n-nodes-assinafy`.

Or, for self-hosted n8n:

```bash
npm install n8n-nodes-assinafy
```

Requires n8n ≥ 1.0. Compatible with the `@n8n/node-cli` build toolchain.

## Credentials

Create an **Assinafy API** credential and fill in:

| Field | Required | Notes |
| --- | --- | --- |
| Environment | ✓ | `Production` (default), `Sandbox`, or `Custom`. Production resolves to `https://api.assinafy.com.br/v1`; sandbox to `https://sandbox.assinafy.com.br/v1`. |
| Custom Base URL | — | Only when `Custom` is selected. Must include the `/v1` path. |
| API Key | ✓ | Generated from the Assinafy dashboard. Sent as the `X-Api-Key` request header. |
| Account ID | ✓ | Default workspace (account) ID. Used by every account-scoped endpoint. |
| Webhook Secret | — | Shared secret for the Assinafy Trigger node to verify HMAC-SHA256 signatures. |

The credential test calls `GET /accounts/{accountId}` to confirm the key and account are valid.

## Supported operations

### Resource: Document

| Operation | Endpoint |
| --- | --- |
| Upload | `POST /accounts/{accountId}/documents` (multipart) |
| List | `GET /accounts/{accountId}/documents` |
| Get | `GET /documents/{id}` |
| Delete | `DELETE /documents/{id}` |
| Download Artifact | `GET /documents/{id}/download/{artifact}` — `original`, `certificated`, `certificate-page`, `bundle` |
| Download Thumbnail | `GET /documents/{id}/thumbnail` |
| Download Page | `GET /documents/{id}/pages/{pageId}/download` |
| Get Activities | `GET /documents/{id}/activities` |
| Get Signing Progress | derived from `GET /documents/{id}` |
| Wait Until Ready | polls `GET /documents/{id}` until status is `metadata_ready`, `pending_signature`, or `certificated` |

Uploads accept a binary property from the previous node (must be a non-empty PDF up to 25MB). Downloaded artifacts are attached back to the output item as binary data.

### Resource: Signer

| Operation | Endpoint |
| --- | --- |
| Create | `POST /accounts/{accountId}/signers` |
| List | `GET /accounts/{accountId}/signers` |
| Get | `GET /accounts/{accountId}/signers/{signerId}` |
| Update | `PUT /accounts/{accountId}/signers/{signerId}` |
| Delete | `DELETE /accounts/{accountId}/signers/{signerId}` |
| Find by Email | `GET /accounts/{accountId}/signers?search={email}` |

### Resource: Assignment

| Operation | Endpoint |
| --- | --- |
| Create | `POST /documents/{documentId}/assignments` |
| Estimate Cost | `POST /documents/{documentId}/assignments/estimate-cost` |
| Reset Expiration | `PUT /documents/{documentId}/assignments/{assignmentId}/reset-expiration` |
| Resend Notification | `PUT /documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/resend` |
| Estimate Resend Cost | `POST /documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/estimate-resend-cost` |
| Cancel Signature Request | `POST /accounts/{accountId}/signature-requests/{documentId}/cancel` |

The `method` can be `virtual` (remote signature via email or WhatsApp) or `collect` (field-placed signatures on the document). Each signer entry accepts an optional `verification_method` (`Email` / `Whatsapp`) and `notification_methods`. For `collect`, the node now exposes the SDK-compatible `entries` JSON payload. `copy_receivers` are signer IDs, not email addresses.

### Resource: Workspace

| Operation | Endpoint |
| --- | --- |
| Create | `POST /accounts` |
| List | `GET /accounts` |
| Get | `GET /accounts/{workspaceId}` |
| Update | `PUT /accounts/{workspaceId}` |
| Delete | `DELETE /accounts/{workspaceId}` |

### Resource: Webhook

| Operation | Endpoint |
| --- | --- |
| Register Subscription | `PUT /accounts/{accountId}/webhooks/subscriptions` |
| Get Subscription | `GET /accounts/{accountId}/webhooks/subscriptions` |
| Delete Subscription | `DELETE /accounts/{accountId}/webhooks/subscriptions` |
| Inactivate Subscription | `PUT /accounts/{accountId}/webhooks/inactivate` |
| List Event Types | `GET /webhooks/event-types` |
| List Dispatches | `GET /accounts/{accountId}/webhooks` |
| Retry Dispatch | `POST /accounts/{accountId}/webhooks/{dispatchId}/retry` |

## Assinafy Trigger

The trigger node registers (or replaces) the workspace-wide webhook subscription when the workflow is activated, and deletes it on deactivation. On each incoming delivery it:

1. Reads the `X-Assinafy-Signature` header.
2. Verifies the HMAC-SHA256 digest over the raw request body against the credential webhook secret (toggle off with `Verify Signature`).
3. Emits `{ event, headers, body }` as a single n8n item.

> [!IMPORTANT]
> The Assinafy API supports a **single** webhook subscription per workspace. Activating this trigger replaces any existing subscription, and deactivating it deletes the subscription entirely. If you need to fan out events to multiple destinations, point the trigger at an n8n workflow that rebroadcasts to downstream systems.

Supported events include `document_uploaded`, `document_metadata_ready`, `document_prepared`, `document_ready`, `assignment_created`, `signature_requested`, `signer_created`, `signer_email_verified`, `signer_whatsapp_verified`, `signer_data_confirmed`, `signer_viewed_document`, `signer_signed_document`, `signer_rejected_document`, `user_rejected_document`, `document_processing_failed`, and the template lifecycle events.

## Example workflow

1. **HTTP Request / Read File** — load a PDF into a binary property.
2. **Assinafy** (Document · Upload) — upload the PDF.
3. **Assinafy** (Document · Wait Until Ready) — wait until metadata is ready.
4. **Assinafy** (Signer · Create) — add one signer per contact.
5. **Assinafy** (Assignment · Create) — create a `virtual` assignment linking the document and signers.
6. **Assinafy Trigger** — listen for `signer_signed_document` and `document_ready` to branch into downstream automations.

## Development

```bash
npm install
npm run dev       # runs n8n-node dev — starts n8n locally with this package loaded and hot reload
npm run lint      # n8n-node lint
npm run build     # compiles TypeScript into dist/
```

The codebase is intentionally small: one credential, one action node with five resources (each in its own file under `nodes/Assinafy/resources/`), and one trigger. The `nodes/Assinafy/shared/transport.ts` helper wraps `httpRequestWithAuthentication` and unwraps the `{ status, message, data }` envelope returned by the API.

## Releasing

`npm run release` lints, builds, and prompts for a version bump. CI publishes to npm on every version tag push (see `.github/workflows/publish.yml`).

## License

[MIT](LICENSE.md)
