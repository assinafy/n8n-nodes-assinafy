# @assinafy/n8n-nodes-assinafy

[Português (Brasil)](README.pt-BR.md) · **English**

Community n8n nodes for [Assinafy](https://assinafy.com.br), the Brazilian electronic-signature platform. The package is centered on document upload, signer creation, assignments, signing status, certified-artifact downloads, templates, tags, and webhooks. Related account and authentication operations remain available when a workflow needs them.

This package ships:

- **Assinafy** — an action node for `assignment`, `auth`, `document`, `field`, `oauth`, `signer`, `signerDocument`, `tag`, `template`, `webhook`, and `workspace` resources.
- **Assinafy Trigger** — a webhook trigger with mandatory credential-derived URL authentication and optional HMAC-SHA256 payload verification.
- **Assinafy OAuth2 API** — authorization code with PKCE, encrypted token storage and automatic refresh managed by n8n.
- **Assinafy API** — a shared credential (X-Api-Key + account ID, with production/sandbox/custom base URLs).

## Installation

Public releases use **npmjs.com** under `@assinafy/n8n-nodes-assinafy`; installation does not require a custom registry or `.npmrc`.

### Self-hosted n8n

In n8n, open **Settings → Community Nodes → Install**, enter `@assinafy/n8n-nodes-assinafy`, and follow the installation prompts. For a manual installation, install the package in your instance's community-node directory and restart n8n. See the [official installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation) for containers and queue workers.

GitHub Packages may be used as an optional release mirror. Installing from that mirror requires an `@assinafy:registry=https://npm.pkg.github.com` scope mapping and a GitHub token with `read:packages`; those settings are not needed for the primary npmjs package.

### n8n Cloud

Publication to npmjs is required for n8n's verified community-node submission process. Availability in n8n Cloud still depends on n8n review and catalog approval; npm publication alone does not imply Cloud availability.

The package declares `n8n-workflow` as a peer dependency so the installed n8n instance supplies the runtime. Use **Node.js 24.21.0 LTS** for development, builds, and tests. Your n8n runtime must satisfy the package's `node >=24.21.0` requirement; the official n8n image supplies its own compatible Node.js version.

For production hosting, use the supported official n8n image, a stable HTTPS hostname, persistent data, and backups of the database and credential encryption key. Keep every queue worker on the same n8n version with this package installed. Follow n8n's [Docker deployment guidance](https://docs.n8n.io/deploy/host-n8n/install-options/install-with-docker) for database and runtime configuration. The Compose service in this repository is an isolated local test instance.

## Credentials

### OAuth for document workflows

Use a current n8n release; the local setup in this repository pins n8n 2.40.5. Select **Authentication → OAuth2** in the Assinafy action node and create an **Assinafy OAuth2 API** credential.

1. Copy the **OAuth Redirect URL** displayed by n8n. It must be a public HTTPS URL, normally `https://n8n.example.com/rest/oauth2-credential/callback`.
2. In your Assinafy workspace, open **Integrations → OAuth Apps → New application**. Choose **Server application / Confidential**, enter the exact callback, and select the permissions your workflows need.
3. Copy the issued Client ID and one-time Client Secret into the n8n credential. Store the secret in n8n credentials, never in workflow parameters or exported JSON.
4. Set **Scope** to a space-separated subset of the permissions registered for the application. A document workflow uses `documents:read documents:write account:read offline_access`; add `templates:read` when using templates. To register or inactivate Assinafy webhooks through the action node, enable `webhooks:write` in the OAuth application and add it to the credential's **Scope** field. The credential default includes `templates:read`, so remove it if the application does not allow it.
5. Leave **Account ID** empty to discover the single workspace selected during consent, or enter that workspace's ID explicitly. Click **Connect my account**, sign in to Assinafy, select the workspace, and approve the requested access.
6. Test the connection with **Workspace → List**. OAuth returns only the consented workspace; a different workspace is forbidden. The credential's connection test also calls `GET /accounts`.

n8n performs Authorization Code with PKCE S256 and sends the confidential client secret in the token request body. A public application can leave Client Secret empty. Access tokens expire after one hour. `offline_access` requests rotating refresh tokens; authorization lasts at most 30 days before reconnection is required. Reconnect when a grant expires or is revoked. Keep queue workers on the same supported n8n version and shared credential/coordination infrastructure; never copy rotating tokens into separate credentials or refresh the same connection manually.

| Permission | Workflow use |
| --- | --- |
| `documents:read` | Read documents, signing state, signers, and document artifacts |
| `documents:write` | Upload documents, manage signers, and request signatures |
| `templates:read` | Read templates used to generate documents |
| `account:read` | Read the selected workspace's permitted details |
| `webhooks:write` | Register or inactivate a webhook subscription through the action node; add this scope only when needed |
| `offline_access` | Maintain the connection using rotating refresh tokens |
| `openid`, `profile`, `email` | OAuth UserInfo: identity, name, and email, respectively; optional |

OAuth does not authorize owner administration such as password/API-key changes, workspace lifecycle, billing, or membership. Use the API-key credential for those operations and for **Assinafy Trigger**. The action node's Webhook operations can use OAuth when the application grants the required scopes: `account:read` to get the subscription, `webhooks:write` to register or inactivate it, and `documents:read` to list event types or dispatches. Signer-side operations still require the signer's access code.

**Each deployment registers its callback.** Self-hosted n8n and n8n Cloud use the URL shown by that instance. One application may serve multiple workflows and connections; separate deployments should use separate applications, or explicitly register each exact callback in an application they control. There is no shared client secret or desktop loopback callback in this package. Behind a reverse proxy, configure `N8N_EDITOR_BASE_URL`, `WEBHOOK_URL`, and `N8N_PROXY_HOPS` so n8n advertises the external HTTPS origin. A temporary tunnel URL changes when the tunnel is recreated, requiring a callback update and reconnection. OAuth currently uses Production; Sandbox remains available for API-key workflows.

### API key for owner operations and webhooks

Create an **Assinafy API** credential for account-scoped and API-key operations:

| Field           | Required        | Notes                                                                                                                                                     |
| --------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment     | ✓               | `Production` (default), `Sandbox`, or `Custom`. Production resolves to `https://api.assinafy.com.br/v1`; sandbox to `https://sandbox.assinafy.com.br/v1`. |
| Custom Base URL | ✓ for `Custom`  | Must be absolute HTTPS and end in `/v1`, with no user info, query, or fragment. HTTP is allowed only for loopback development hosts.                      |
| API Key         | ✓ in credential | Generated from the Assinafy dashboard. Sent as the `X-Api-Key` request header.                                                                            |
| Account ID      | ✓ in credential | Default workspace (account) ID. Used by every account-scoped endpoint.                                                                                    |
| Webhook Secret  | —               | Secret used for Trigger URL authentication and optional HMAC-SHA256 payload verification. When empty, URL authentication is derived from the API key.     |

The credential test calls `GET /accounts/{accountId}` to confirm the key and account are valid. Custom URLs are validated and normalized before either the Test request or any authenticated request can attach the API key. The **Assinafy** action credential is optional only for public, signer-access-code, and explicitly Bearer-authenticated operations. Without a selected credential those calls use the production base URL; if a selected credential cannot be loaded, the call fails instead of silently falling back to production. Select a Sandbox credential even for an unauthenticated call when you need the sandbox host. The **Assinafy Trigger** always requires a credential because subscription lifecycle calls are account-scoped.

## Document workflow

Sending and receiving are separate n8n workflows because a trigger starts a workflow and has no input connection:

```text
Send:     PDF → Upload → Wait Until Ready → Create Signer(s) → Estimate Cost → Create Assignment
Receive:  Assinafy Trigger → deduplicate event → route by event → Download Certified PDF / handle failure
```

### Workflow A: upload and request signatures

1. Start with a Manual Trigger, Webhook, form, storage node, or another source that provides a non-empty PDF as binary data, up to 25 MB and 2,000 pages. The default binary property is `data`. Confirm the intended recipients before sending.
2. Add **Assinafy → Document → Upload**, select the binary property, and name the node `Upload document`. Its output is the document object; the reusable ID expression is `={{ $('Upload document').first().json.id }}`. Persist the ID so a retry can reconcile the existing document.
3. Add **Assinafy → Document → Wait Until Ready**. Set **Document ID** to the upload expression. Continue only after the status is `metadata_ready`, `pending_signature`, or `certificated`; `failed`, rejection, expiration, and timeout states raise an error.
4. Add **Assinafy → Signer → Create** for each recipient. Only Full Name is mandatory, but a virtual email or WhatsApp assignment needs the matching contact field. **Reuse If Exists** searches every result page before creating another contact with the same email. Name the nodes, for example, `Create signer 1` and `Create signer 2`.
5. Add **Assignment → Estimate Cost** before sending. Use the uploaded document ID and the same verification and notification options intended for Create. Check `has_sufficient_resources`, `total_credits`, and `blocking_reason` before allowing the assignment. Stop if the resources or expected cost are unacceptable.
6. Add **Assignment → Create**:
   - **Document ID:** `={{ $('Upload document').first().json.id }}`
   - **Method:** `virtual` for remote signing or `collect` for positioned fields
   - **Signer 1 ID:** `={{ $('Create signer 1').first().json.id }}`
   - **Signer 2 ID:** `={{ $('Create signer 2').first().json.id }}`
   - Set each signer's verification method, notification method, and `step`. Equal steps run in parallel; increasing steps enforce sequence.
   - Add `expires_at`, `message`, or `copy_receivers` only when needed. Attach tags with **Document → Append Tags** or **Replace Tags**.
7. Persist the returned assignment ID together with the document ID in your application or data store. Do not use automatic workflow retries around Create Assignment unless your workflow first checks whether the assignment already exists; only explicit HTTP 429 failures are retried by the node; other failures are returned to the workflow.

For a dynamic recipient array, use n8n's Split Out/Loop Over Items to create signers, Aggregate their returned IDs, and build the Assignment signer collection from that aggregate. Keep the document ID from `Upload document` through a named-node expression instead of relying on the current item after the signer loop.

The assignment request built by the node has this shape:

```json
{
  "method": "virtual",
  "signers": [{
    "id": "<signer-id>",
    "verification_method": "Email",
    "notification_methods": ["Email"],
    "step": 1
  }],
  "message": "Demonstration document for signing"
}
```

The recipient opens the signing invitation, receives the access code through the selected channel, confirms their information, and signs. Digital-certificate signing uses the signer's own certificate and browser flow. `metadata_ready` only means the PDF is ready for an assignment; it does not mean anyone has signed it.

For a template-based document, use **Template → List/Get** to obtain the role IDs, **Document → Estimate Cost From Template** with the intended signer configuration, and **Document → Create From Template** with one signer per role and the editor field values. Save the returned document and assignment IDs and use the same completion workflow below.

### Workflow B: receive completion and download the artifact

1. Create a separate workflow beginning with **Assinafy Trigger**. Select `document_ready`, `signer_rejected_document`, and `document_processing_failed`; add `signer_signed_document` if intermediate signer progress is useful.
2. Store `$json.body.id` as an idempotency key before side effects. Assinafy can redeliver an event.
3. Add a Switch node on `={{ $json.event }}`.
4. For `document_ready`, use `={{ $json.body.object.id }}` as **Document ID** in **Document → Get**. Continue to **Document → Download Artifact** with `certificated` only when the returned status is `certificated` and `artifacts.certificated` exists. Otherwise, use an IF node and a short Wait node to loop back to Get with a bounded retry count or workflow timeout; stop immediately on a failed, rejected, or expired status. The PDF is returned in the configured binary property (`data` by default) with JSON metadata containing `documentId`, filename, MIME type, and size.
5. For rejection or processing failure, route `$json.body.object.id`, `$json.body.message`, and `$json.body.payload` to your notification or incident workflow.

The Trigger owns the account's single Assinafy subscription. Use one trigger workflow per account and fan out inside n8n when multiple downstream processes need the same events. If you use OAuth without an API-key webhook connection, start the completion workflow from your own scheduler or application and poll **Document → Get** with bounded Wait/Get loops.

Store the certified PDF binary in your chosen storage system. The `certificate-page` artifact contains the certificate, `bundle` is a ZIP, and `pades` is available when digital-certificate signing was used. **Get Signing Progress** provides counts when available, but downloading must still wait for the final status and artifact.

After an uncertain Upload or Create Assignment result, reconcile the saved document and assignment before repeating the operation. Repeating a completion workflow should only read status and download existing artifacts.

### Data and error conventions

- Assinafy's `{ status, message, data }` response envelope is removed before output.
- List operations emit one n8n item per resource. Array-valued mutation responses emit one item shaped as `{ "data": [...] }`.
- Binary downloads emit one item with JSON metadata and the file in the selected binary property.
- **Get Signing Progress** sets `available: false` and returns null counts when the document response does not include assignment details; it never reports a synthetic `0/0` as known progress.
- OAuth code exchange, refresh, and revocation are never automatically retried. HTTP requests have a 30-second timeout.
- HTTP 429 responses are retried with a bounded budget for every method, honoring `Retry-After`. A rate limit is refused before the request is handled, so replaying it cannot duplicate a document, signer, assignment, notification, or webhook action. Every other failure is surfaced after a single attempt, because an ambiguous response may mean the mutation was applied.

## Assinafy Trigger

The trigger node registers or replaces the workspace-wide webhook subscription when the workflow is activated. The delivery URL must use HTTPS; HTTP is accepted only for `localhost`, `127.0.0.1`, or `::1` development URLs. The node adds an `assinafy-token` query parameter derived with HMAC-SHA256 from the credential's Webhook Secret, or from its API key when no secret is configured. Every delivery must present that token and is rejected on a missing or mismatched value. Reactivate the workflow after rotating either credential value so Assinafy receives the new URL.

On deactivation, the node reads the current subscription and calls `PUT /accounts/{accountId}/webhooks/inactivate` only after its secured URL, email, and event set match. Assinafy's inactivate endpoint is unconditional, so do not replace the account subscription concurrently with workflow deactivation. Each accepted delivery emits `{ event, headers, body }` as one n8n item; authentication, cookie, API-key, token, secret, and signature headers are redacted.

**Payload-signature verification is an additional opt-in check.** If your workspace signs deliveries, set **Webhook Secret** and enable **Verify Signature**. The node then requires `X-Assinafy-Signature`, computes HMAC-SHA256 over the raw request body, and fails closed when the signature or raw bytes are unavailable.

> [!IMPORTANT]
> The Assinafy API supports a **single** webhook subscription per workspace. Activating this trigger replaces any existing subscription. Coordinate activation and deactivation changes for that account, and fan out inside one n8n workflow when multiple destinations need the same events.

The full event list (source of truth: `nodes/Assinafy/resources/webhookEvents.ts`, shown in the node's **Events** dropdown):
`assignment_created`, `document_metadata_ready`, `document_prepared`, `document_processing_failed`, `document_ready`, `document_uploaded`, `signature_requested`, `signer_created`, `signer_data_confirmed`, `signer_email_verified`, `signer_rejected_document`, `signer_signed_document`, `signer_viewed_document`, `signer_whatsapp_verified`, `template_created`, `template_processed`, `template_processing_failed`, `user_rejected_document`. When no events are selected, the trigger subscribes to a sensible default set (`document_ready`, `document_prepared`, `signer_signed_document`, `signer_rejected_document`, `document_processing_failed`).

## Supported operations

> **Full reference with request/response payloads:** see
> [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for each operation's node parameters,
> example request body/query, and example response (`{status,message,data}` envelope,
> unwrapped by the node). The tables below are a quick endpoint index.

### Signer access codes

Operations marked **(Signer Side)** authenticate with a per-signer `signer-access-code` instead of the workspace API key. **No endpoint returns that code** — it reaches the signer only in the notification the API sends when an assignment is created or resent, by email or WhatsApp. The `signing_urls` on a new assignment are not a substitute: each one addresses the web signing page for the document (`https://app.assinafy.com.br/sign/{documentId}?email=…`) and carries no code, so passing its path segment as `signer-access-code` returns an HTTP 401 authentication error.

Drive these operations only when a code enters the workflow through a step you control — an inbox-reading node, a WhatsApp integration, or a human pasting it in. To simply get a signer to their document, hand them the signing URL or use **Document → Send Public Token**. Owner administration uses the API-key credential; delegated document operations may use OAuth. See [Where a signer access code comes from](docs/OPERATIONS.md#where-a-signer-access-code-comes-from).

### Resource: Document

| Operation                   | Endpoint                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Upload                      | `POST /accounts/{accountId}/documents` (multipart)                                                            |
| List                        | `GET /accounts/{accountId}/documents`                                                                         |
| Search                      | `GET /accounts/{accountId}/documents/search` — lightweight name/status search                                 |
| Get                         | `GET /documents/{id}`                                                                                         |
| Rename                      | `PATCH /documents/{id}`                                                                                       |
| Delete                      | `DELETE /documents/{id}`                                                                                      |
| Download Artifact           | `GET /documents/{id}/download/{artifact}` — `original`, `certificated`, `certificate-page`, `pades`, `bundle` |
| Download Thumbnail          | `GET /documents/{id}/thumbnail`                                                                               |
| Download Page               | `GET /documents/{id}/pages/{pageId}/download`                                                                 |
| Get Activities              | `GET /documents/{id}/activities`                                                                              |
| Get Signing Progress        | derived from `GET /documents/{id}`                                                                            |
| Wait Until Ready            | polls `GET /documents/{id}` until status is `metadata_ready`, `pending_signature`, or `certificated`          |
| Create From Template        | `POST /accounts/{accountId}/templates/{templateId}/documents`                                                 |
| Estimate Cost From Template | `POST /accounts/{accountId}/templates/{templateId}/documents/estimate-cost`                                   |
| Verify                      | `GET /documents/{hash}/verify` — public; verifies a certificated document by its signature hash               |
| Get Public Info             | `GET /public/documents/{id}` — public                                                                         |
| Send Public Token           | `PUT /public/documents/{id}/send-token` — emails/whatsapps the 6-digit access token                           |
| List Statuses               | `GET /documents/statuses` — enumerates document status codes and deletability                                 |
| List Tags                   | `GET /accounts/{accountId}/documents/{documentId}/tags`                                                       |
| Replace Tags                | `PUT /accounts/{accountId}/documents/{documentId}/tags`                                                       |
| Append Tags                 | `POST /accounts/{accountId}/documents/{documentId}/tags`                                                      |
| Detach Tag                  | `DELETE /accounts/{accountId}/documents/{documentId}/tags/{tagId}`                                            |

Uploads accept a binary property from the previous node (must be a non-empty PDF up to 25 MB and no more than 2,000 pages). Downloaded artifacts are attached back to the output item as binary data. The `pades` PDF contains the signers' ICP-Brasil signatures plus the platform certification box and exists only for documents with digital-certificate signers; `bundle` is a ZIP containing the three standard PDF artifacts and `pades` when available. The List operation supports filtering by `status`, `method` (`virtual` / `collect`), tag IDs, and a `search` term. Create From Template supports signer roles, sequential `step` ordering, editor field values, and document tag names.

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

Signer creation follows the published request body: only **Full Name** is required; email and WhatsApp are optional and may be added later before a remote signature request. Signer Update exposes `government_id` for a CPF or CNPJ and normalizes it to digits. Changing an unverified email/WhatsApp channel with requests in flight rotates its links and OTPs; a verified in-flight channel cannot be changed until its documents are certificated. Signer Create does not send the unsupported `cpf` or `metadata` keys.

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

The `method` can be `virtual` (remote signature via email or WhatsApp) or `collect` (field-placed signatures on the document). Each signer entry accepts optional `verification_method` (`Email`, `Whatsapp`, or `DigitalCertificate`), exactly one compatible `notification_methods` value when supplied, and sequential-signing `step`. Match the notification channel to the available signer contact data; when omitted, the API infers the notification channel from the verification method, defaulting both to `Email` when neither is supplied. `DigitalCertificate` requires the account feature, a signer CPF/CNPJ in `government_id`, and a signing step containing no other signer; it costs 2 credits per signer in addition to notification cost and produces the optional `pades` artifact. For `collect`, provide `entries` as JSON. `copy_receivers` are signer IDs, not email addresses.

### Resource: Template

| Operation | Endpoint                                                                             |
| --------- | ------------------------------------------------------------------------------------ |
| List      | `GET /accounts/{accountId}/templates` — filters: `search`, `status`, tag IDs, `sort` |
| Get       | `GET /accounts/{accountId}/templates/{templateId}`                                   |

Templates are read-only resources created through the Assinafy web app. Use **List** and **Get** to retrieve roles and field placements needed for Create From Template documents.

### Resource: Tag

| Operation | Endpoint                                                            |
| --------- | ------------------------------------------------------------------- |
| Create    | `POST /accounts/{accountId}/tags`                                   |
| List      | `GET /accounts/{accountId}/tags` — filter: `search`                 |
| Update    | `PUT /accounts/{accountId}/tags/{tagId}`                            |
| Delete    | `DELETE /accounts/{accountId}/tags/{tagId}` — optional `force=true` |

Tags are workspace-scoped labels. They can be managed directly through the Tag resource and attached to documents through the Document tag operations. Tag color values are validated as 6-character hex strings before being sent. Multiple-value tag arrays preserve each entry as one tag, including embedded commas (for example, `Example, Inc.`); only a scalar comma-delimited value is split.

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

These signer-link endpoints do not use the workspace API key. Get Current, List, Search, Sign Multiple, and Decline Multiple require the per-signer `signer-access-code` query parameter. Download is public; its access-code field is optional and is sent only when supplied.

| Operation        | Endpoint                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Get Current      | `GET /signers/{signerId}/document?signer-access-code=…`                                             |
| List             | `GET /signers/{signerId}/documents?signer-access-code=…`                                            |
| Search           | `GET /signers/{signerId}/documents/search?signer-access-code=…&search=…`                            |
| Sign Multiple    | `PUT /signers/documents/sign-multiple?signer-access-code=…`                                         |
| Decline Multiple | `PUT /signers/documents/decline-multiple?signer-access-code=…`                                      |
| Download         | `GET /signers/{signerId}/documents/{documentId}/download/{artifact}` — public; optional access code |

Signer-side Download supports the same `original`, `certificated`, `certificate-page`, `pades`, and `bundle` artifacts as the authenticated document download. List supports pagination plus `status`, `method`, `search`, and `sort` filters.

### Resource: OAuth

| Operation | Endpoint |
| --- | --- |
| Exchange Code | `POST /oauth/token`, `grant_type=authorization_code` |
| Refresh Token | `POST /oauth/token`, `grant_type=refresh_token` |
| Revoke Token | `POST /oauth/revoke` |
| Get User Info | `GET /oauth/userinfo` |
| Get Metadata | `GET /.well-known/oauth-protected-resource` at the API origin, outside `/v1` |

Use the native credential for ordinary workflows. Raw token operations return sensitive execution data and never retry code exchange, refresh, or revocation automatically. See the [complete OAuth payloads and lifecycle](docs/OPERATIONS.md#oauth).

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

| Operation                       | Endpoint                                        |
| ------------------------------- | ----------------------------------------------- |
| Create                          | `POST /accounts`                                |
| List                            | `GET /accounts`                                 |
| Get                             | `GET /accounts/{workspaceId}`                   |
| Update                          | `PUT /accounts/{workspaceId}`                   |
| Delete                          | `DELETE /accounts/{workspaceId}`                |
| Get Current User                | `GET /users/self`                               |
| Get Account Statistics          | `GET /accounts/{workspaceId}/stats`             |
| Get User Statistics             | `GET /users/self/stats`                         |
| Get Theme                       | `GET /accounts/{workspaceId}/theme`             |
| Get Notification Preferences    | `GET /users/self/notification-preferences`      |
| Update Notification Preferences | `PUT /users/self/notification-preferences`      |
| Upload Logo                     | `POST /accounts/{workspaceId}/logo` (multipart) |
| Download Logo                   | `GET /accounts/{workspaceId}/logo`              |
| Delete Logo                     | `DELETE /accounts/{workspaceId}/logo`           |

`GET /users/self` returns the authenticated user data from Assinafy after the standard response envelope is removed.

### Resource: Webhook

| Operation               | Endpoint                                                 |
| ----------------------- | -------------------------------------------------------- |
| Register Subscription   | `PUT /accounts/{accountId}/webhooks/subscriptions`       |
| Get Subscription        | `GET /accounts/{accountId}/webhooks/subscriptions`       |
| Inactivate Subscription | `PUT /accounts/{accountId}/webhooks/inactivate`          |
| List Event Types        | `GET /webhooks/event-types`                              |
| List Dispatches         | `GET /accounts/{accountId}/webhooks`                     |
| Retry Dispatch          | `POST /accounts/{accountId}/webhooks/{dispatchId}/retry` |

See the [webhook delivery payload reference](docs/OPERATIONS.md#webhook-delivery-payloads) for the complete POST envelope, all 18 event-specific payload variants, success/retry/circuit-breaker behavior, and the trigger's n8n output shape.

## Development

```bash
npm ci --strict-peer-deps # reproducible install with peer compatibility checks
npm run verify:dependencies # check the complete installed dependency tree
npm run dev       # runs n8n-node dev — starts n8n locally with this package loaded and hot reload
npm run lint      # n8n-node lint
npm run build     # compiles TypeScript into dist/
npm test          # unit and request-shape tests
npm run test:ci   # tests with enforced coverage thresholds
npm run audit:dev # development-tooling vulnerability gate
npm run audit:prod # production-dependency vulnerability check
npm run verify:package # check package contents, load modules, and scan source and compiled tarball
```

For an isolated instance on `http://localhost:5679`, run `npm run build` followed by `docker compose up -d`, complete owner setup, and follow [Local n8n and HTTPS OAuth](CONTRIBUTING.md#local-n8n-and-https-oauth). Rebuild and restart the service after code changes.

The codebase contains two credentials, one action node with eleven resources, and one trigger. The shared transport handles authenticated and public/signer-access-code requests, response-envelope unwrapping, pagination, and bounded rate-limit retries. List-search methods back the resource-locator pickers for documents, signers, tags, and templates.

The sandbox suite requires explicit credentials, rejects production hosts, and cleans up disposable records. Mutations, account-credit consumption, and workspace/logo/subscription changes each have separate opt-in gates. See [CONTRIBUTING.md](CONTRIBUTING.md) for the commands and environment variables.

## Releasing

Prepare a versioned main commit and a matching stable `vMAJOR.MINOR.PATCH` tag. Pushing the tag to GitHub verifies the package, builds one immutable tarball, publishes it to npmjs with provenance, and then mirrors the same bytes to GitHub Packages (see `.github/workflows/publish.yml`). Direct `npm publish` from the source tree is blocked, and this repository does not use the n8n CLI's local `npm run release` path.

Before tagging a release, configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for package `@assinafy/n8n-nodes-assinafy`: GitHub repository `assinafy/n8n-nodes-assinafy`, workflow `publish.yml`, environment `npm`, with `npm publish` allowed. The protected GitHub environment gate remains required. The workflow authenticates to npmjs through GitHub OIDC and publishes with provenance; it does not need an npm token.

See [CONTRIBUTING.md](CONTRIBUTING.md) for verification and optional sandbox tests. Report vulnerabilities according to [SECURITY.md](SECURITY.md); never put API keys, signer codes, personal data, or document contents in a public issue.

## License

[MIT](LICENSE.md)
