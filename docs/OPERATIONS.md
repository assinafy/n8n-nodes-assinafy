# Assinafy n8n Node — Operation Reference

Full request/response reference for every operation exposed by the **Assinafy** action node, including signer-side and authentication flows. Account-scoped paths use the **Account ID** from the credential (shown as `{accountId}`). List operations paginate via the `X-Pagination-*` response headers when **Return All** is enabled.

Reference: [Assinafy v1 API documentation](https://api.assinafy.com.br/v1/docs) and [OpenAPI JSON](https://api.assinafy.com.br/v1/docs/openapi.json).

## How to read payloads

Unless a section says otherwise, the HTTP response is a JSON envelope:

```json
{
	"status": 200,
	"message": "",
	"data": "<operation payload>"
}
```

The node unwraps `data`, so each **Example response** below is the n8n JSON output, not the outer transport envelope. List operations emit one n8n item per resource unless the section documents a synthesized wrapper. A mutation that returns an array emits one item shaped as `{ "data": [...] }`. Empty delete responses may be converted to an explicit confirmation such as `{ "deleted": true }`.

Errors keep the API's standard shape and are surfaced by n8n as node errors:

```json
{
	"status": 400,
	"message": "Bad request.",
	"data": null
}
```

The API error families are validation, unauthorized, not found, and server errors. Account deletion can additionally return the complete blocker payload below. `PendingDocuments` appears only together with `ActivePaidSubscription`, never alone.

```json
{
	"status": 400,
	"message": "Cannot delete while restrictions are active.",
	"data": null,
	"restrictions": [
		{
			"code": "ActivePaidSubscription",
			"message": "Account has an active paid subscription.",
			"account_ids": ["<workspace-id>"]
		}
	]
}
```

The shared transport retries safe `GET` requests after HTTP 429 at most three times, honoring `Retry-After` when present and otherwise using bounded exponential backoff. Mutation requests are never replayed automatically.

Binary endpoints do not use the JSON envelope in the node output. Their bytes are written to the configured n8n binary property and the JSON side contains only file metadata. Multipart endpoints describe their form parts rather than pretending they have a JSON request body.

The action-node credential is optional for public routes, signer-access-code flows, and calls that supply a Bearer token. When no credential is selected, those requests default to `https://api.assinafy.com.br/v1`. If a selected credential cannot be loaded, the node fails rather than redirecting the request or a Bearer token to production. Select a Sandbox credential to route even an unauthenticated request to `https://sandbox.assinafy.com.br/v1`. Account-scoped and API-key-authenticated operations still require a credential and its Account ID. Custom credential URLs must be absolute HTTPS URLs ending in `/v1` (HTTP is allowed only for loopback hosts) and cannot contain user info, a query, or a fragment; the same validation runs before credential Test and runtime authentication attach the API key. The trigger always requires a credential.

Examples use synthetic placeholders only:

- `<account-id>`, `<workspace-id>`, `<document-id>`, `<signer-id>`, `<government-id>`, `<telephone>`, and similar values are identifiers.
- `<signer-access-code>`, `<verification-code>`, `<access-token>`, `<api-key>`, password, reset-token, and provider-token placeholders represent secrets that must never be logged or committed.
- All example email addresses use the reserved `example.com` domain.

## Shared schema catalog

Sections below show each operation-specific request and a representative response. To avoid repeating large objects in every example, this catalog is the complete reusable success-payload reference. `T[]` means an array, `/ null` marks a nullable value, and all timestamps are ISO 8601 strings unless noted. The node preserves forward-compatible fields added by the API.

| Schema                      | Complete unwrapped payload                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiKey`                    | `api_key:string / null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `AuthUser`                  | `id:string`, `name:string`, `email:string`, `telephone:string / null`, `government_id:string / null`, `is_email_verified:boolean`, `has_accepted_terms:boolean`, `created_at:string`, `to_be_deleted_at:string / null`                                                                                                                                                                                                                                                                                                                                                                         |
| `AuthAccount`               | `id:string`, `name:string`, `roles:string[]`, `is_delete_allowed:boolean`, `created_at:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `AuthSession`               | `access_token:string`, `user:AuthUser`, `accounts:AuthAccount[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Account`                   | `resource:string`, `id:string`, `name:string`, `primary_color:string / null`, `secondary_color:string / null`, `notification_sender_type:string`, `roles:string[]`, `is_delete_allowed:boolean`, `created_at:string`                                                                                                                                                                                                                                                                                                                                                                           |
| `AccountTheme`              | `account_name:string`, `primary_color:string`, `secondary_color:string / null`, `logo:string / null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `NotificationPreferences`   | Nine booleans: `DocumentCompleted`, `SignerDeclined`, `DocumentCancelled`, `DocumentAboutToExpire`, `DocumentExpired`, `DocumentExpirationReset`, `DocumentProcessingFailed`, `TemplateProcessingFailed`, `SignerWhatsappFailed`                                                                                                                                                                                                                                                                                                                                                               |
| `Signer`                    | `resource:string`, `id:string`, `full_name:string`, `email:string / null`, `whatsapp_phone_number:string / null`, `has_accepted_terms:boolean`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `SignerSelf`                | All `Signer` fields plus `has_signature:boolean`, `has_initial:boolean`, `is_signature_reusable:boolean`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `AssignmentSigner`          | All `Signer` fields plus `verification_method:string / null`, `notification_methods:string[] / null`, `step:integer / null`, `notified:boolean / null`, `completed:boolean / null`, `notification_history:NotificationHistoryEntry[] / null`                                                                                                                                                                                                                                                                                                                                                   |
| `NotificationHistoryEntry`  | `event:string`, `status:string`, `error_code:string / null`, `error_message:string / null`, `sent_at:string / null`, `failed_at:string / null`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `DocumentPage`              | `id:string`, `number:integer`, `height:integer`, `width:integer`, `download_url:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `DisplaySettings`           | `left:number`, `top:number`, `width:number`, `height:number`, `fontFamily:string`, `fontSize:number`, `backgroundColor:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `AssignmentItem`            | `id:string`, `page:DocumentPage / null`, `signer:object`, `field:object / null`, `display_settings:DisplaySettings or scalar value`, `value:any / null`, `completed:boolean`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `AssignmentSummary`         | `signer_count:integer`, `completed_count:integer`, `signers:object[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `SigningUrl`                | `signer_id:string`, `url:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Assignment`                | `resource:string`, `id:string`, `sender_email:string`, `method:string`, `expires_at:string / null`, `message:string / null`, `signers:AssignmentSigner[]`, `copy_receivers:object[]`, `items:AssignmentItem[]`, `summary:AssignmentSummary`, `signing_urls:SigningUrl[]`                                                                                                                                                                                                                                                                                                                       |
| `Document`                  | `resource:string`, `id:string`, `account_id:string`, `template_id:string / null`, `name:string`, `status:string`, `artifacts:object`, `is_closed:boolean`, `signing_url:string`, `decline_reason:string / null`, `declined_by:Signer / null`, `tags:{id,name}[]`, `assignment:Assignment / null`, `pages:DocumentPage[]`, `created_at:string`, `updated_at:string`                                                                                                                                                                                                                             |
| `DocumentStatus`            | `code:string`, `deletable:boolean`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `DocumentVerification`      | `hash:string`, `id:string / null`, `status:string / null`, `page_count:string / null`, `signer_count:string / null`, `completed_count:integer / null`, `completed_at:string / null`, `verified_at:string`, `is_valid:boolean`, `message:string`                                                                                                                                                                                                                                                                                                                                                |
| `DocumentActivity`          | `id:integer`, `event:string`, `message:string`, `payload:object / null`, `origin:{ip,user-agent} / null`, `created_at:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `DocumentStatsRow`          | `period:string`, `documents_uploaded:integer`, `documents_sent:integer`, `signature_requests:integer`, `signature_requests_notification_email:integer`, `signature_requests_notification_whatsapp:integer`, `signature_requests_notification_bypass:integer`, `signature_requests_verification_email:integer`, `signature_requests_verification_whatsapp:integer`, `signature_requests_verification_bypass:integer`, `signature_requests_verification_digital_certificate:integer`, `signature_requests_viewed:integer`, `signature_requests_completed:integer`, `documents_certified:integer` |
| `CostEstimateBreakdownItem` | `code:string`, `name:string`, `cost:number`, `quantity:integer`, `unit_cost:number`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `CostEstimate`              | `documents:integer`, `credits:number`, `needs_extra_document:boolean`, `extra_document_cost:number`, `total_credits:number`, `breakdown:CostEstimateBreakdownItem[]`, `document_balance:number`, `credit_balance:number`, `has_sufficient_resources:boolean`, `blocking_reason:string / null`, `message:string / null`                                                                                                                                                                                                                                                                         |
| `Field`                     | `resource:string`, `id:string`, `name:string`, `type:string`, `regex:string / null`, `is_pre_defined:boolean`, `is_active:boolean`, `is_required:boolean`, `is_standard:boolean`, `is_read_only:boolean`, `is_visible:boolean`                                                                                                                                                                                                                                                                                                                                                                 |
| `FieldType`                 | `type:string`, `name:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `FieldValidation`           | `type:string`, `success:boolean`, `error_message:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `FieldValidationResult`     | `field_id:string`, `type:string`, `success:boolean`, `error_message:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Tag`                       | `resource:string`, `id:string`, `name:string`, `color:string / null`, `created_at:string`, `updated_at:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `TemplateFieldPlacement`    | `id:string`, `field_id:string`, `role_id:string`, `label:string`, `display_settings:object`, `created_at:string`, `updated_at:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `TemplatePage`              | `id:string`, `number:integer`, `height:integer`, `width:integer`, `download_url:string`, `fields:TemplateFieldPlacement[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `TemplateRole`              | `id:string`, `name:string`, `assignment_type:string`, `created_at:string`, `updated_at:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Template`                  | `resource:string`, `id:string`, `name:string`, `document_name:string / null`, `message:string / null`, `status:string`, `pages:TemplatePage[]`, `roles:TemplateRole[]`, `tags:{id,name}[]`, `default_document_tags:{id,name}[]`, `created_at:string`, `updated_at:string`                                                                                                                                                                                                                                                                                                                      |
| `WebhookSubscription`       | `events:string[]`, `is_active:boolean`, `url:string / null`, `email:string / null`, `updated_at:string / null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `WebhookDispatch`           | `resource:string`, `id:string`, `event:string`, `activity_id:integer`, `endpoint:string / null`, `payload:object / null`, `delivered:boolean`, `http_status:integer / null`, `response_body:string / null`, `error:string / null`, `created_at:string`, `updated_at:string`                                                                                                                                                                                                                                                                                                                    |
| `WebhookEventType`          | `id:string`, `description:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `WhatsappNotification`      | `sent_at:integer` (Unix seconds), `header:string`, `body:string`, `buttons:{text}[]`, `phone_number:string`, `signer_id:string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Cross-operation behavior

Signer terms acceptance and OTP verification send `signer-access-code` in the query string. The OTP itself remains in the JSON body as `verification-code`. Field validation always retains the configured account authentication and can additionally send `signer-access-code`; it does not silently drop the API credential.

### Verification, notification, and digital-certificate rules

Assignment and template signer rows use `verification_method` (`Email`, `Whatsapp`, or `DigitalCertificate`) and `notification_methods` (`Email` or `Whatsapp`). If both are omitted, both default to `Email`. Assignment Create accepts any combination of Email and WhatsApp notification channels. Create From Template accepts exactly one notification channel per signer and infers the matching verification or notification method when only one is supplied. Cost-estimate operations can price either or both notification channels.

| Verification         | Requirements                                                                                                                  | Per-signer signature cost |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `Email`              | Signer has an email address.                                                                                                  | 0 credits                 |
| `Whatsapp`           | Signer has `whatsapp_phone_number`; paid subscription.                                                                        | 0 credits                 |
| `DigitalCertificate` | Digital Certificate feature (Standard/Pro), signer CPF/CNPJ in `government_id`, and no other signer in the same signing step. | 2 credits                 |

Email notifications cost 0 credits. WhatsApp notifications require a paid subscription and cost 0.45 credits per notification.

For `DigitalCertificate`, a CPF requires that person's e-CPF or an e-CNPJ naming that person as legal representative. A CNPJ requires an e-CNPJ for that company from any representative. Signing is completed through Assinafy's ICP-Brasil A1/A3 browser flow, not the ordinary signer **Sign** operation, and produces the optional `pades` artifact. The cost-estimate response reports the signature charge with breakdown code `SignatureDigitalCertificate`; an extra document costs 1 credit when the plan allowance is exhausted.

Create From Template validates its single-notification-channel rule before sending. Assignment Create forwards every selected notification channel.

## Resources

- [Document](#document)
- [Signer](#signer)
- [Assignment](#assignment)
- [Template](#template)
- [Tag](#tag)
- [Field Definition](#field-definition)
- [Webhook](#webhook)
- [Signer Document (signer-side)](#signer-document-signer-side)
- [Authentication](#authentication)
- [Workspace](#workspace)

---

### Document

#### Upload

Uploads a new PDF from an incoming binary item and creates a document in the workspace.

**Endpoint:** `POST /accounts/{accountId}/documents`

**Node parameters:**

- Binary Property — string — required — name of the binary property holding the PDF (default `data`).
- File Name — string — optional — name sent to Assinafy; defaults to the binary file name, or `document.pdf`. Must end in `.pdf`.

The node enforces PDF-only, non-empty, and the 25MB upload limit before sending. The API additionally limits a document to 2,000 pages. The node checks the PDF file signature as well as any specific declared MIME type; a missing or generic `application/octet-stream` MIME type is accepted only when the bytes identify an allowed PDF. The request contains one `file` part whose multipart filename is the configured File Name.

**Example request:**

```
multipart/form-data:
  file: <binary PDF>   (filename = File Name)
```

**Example response:**

```json
{
	"resource": "document",
	"id": "1031abf...",
	"account_id": "<account-id>",
	"template_id": null,
	"name": "contract.pdf",
	"status": "uploaded",
	"artifacts": {
		"original": "https://.../documents/1031abf.../download/original"
	},
	"is_closed": false,
	"signing_url": "https://app-sandbox.assinafy.com.br/sign/1031abf...",
	"decline_reason": null,
	"declined_by": null,
	"tags": [],
	"assignment": null,
	"pages": [],
	"created_at": "2026-06-05T12:00:00Z",
	"updated_at": "2026-06-05T12:00:00Z"
}
```

#### List workspace documents

Lists documents in the workspace, with optional filters; paginates via `X-Pagination-*` headers when Return All is set.

**Endpoint:** `GET /accounts/{accountId}/documents`

**Node parameters:**

- Return All — boolean — optional — return every page of results.
- Limit — number — optional — max results when Return All is off.
- Filters > Search — string — optional — partial match on document name, signer full name, signer email.
- Filters > Status — options — optional — filter by document status (e.g. `pending_signature`, `certificated`).
- Filters > Signature Method — options — optional — `virtual` or `collect`.
- Filters > Sort — options — optional — sort by `name` or `updated_at`.
- Filters > Tag IDs — string (multiple) — optional — tag IDs; returns documents having all listed tags (AND, comma-joined into `tags`).

**Example request:**

```json
{
	"search": "contract",
	"status": "pending_signature",
	"method": "virtual",
	"sort": "updated_at",
	"tags": "tagId1,tagId2"
}
```

**Example response:**

```json
[
	{
		"resource": "document",
		"id": "1031...",
		"account_id": "<account-id>",
		"template_id": null,
		"name": "document.pdf",
		"status": "metadata_ready",
		"artifacts": {
			"original": "https://.../download/original",
			"thumbnail": "https://.../thumbnail"
		},
		"is_closed": false,
		"signing_url": "https://app-sandbox.assinafy.com.br/sign/1031...",
		"decline_reason": null,
		"declined_by": null,
		"tags": [],
		"assignment": null,
		"pages": [
			{
				"id": "...",
				"number": 1,
				"height": 417,
				"width": 417,
				"download_url": "https://.../pages/<pid>/download"
			}
		],
		"created_at": "2026-05-12T18:05:11Z",
		"updated_at": "2026-05-12T18:05:11Z"
	}
]
```

#### Get a document

Fetches a single document by ID, including expanded `assignment` and `pages`.

**Endpoint:** `GET /documents/{documentId}`

**Node parameters:**

- Document ID — resourceLocator — required — the document to fetch.

`decline_reason` is returned only when the credential belongs to the document creator.

**Example response:**

```json
{
	"resource": "document",
	"id": "1016d5795af62e28c2161efcb7a6",
	"account_id": "<account-id>",
	"name": "3.pdf",
	"status": "pending_signature",
	"assignment": {
		"id": "1016d5a650dcb1e056eddd367bbd",
		"sender_email": "sender@example.com",
		"method": "virtual",
		"expires_at": null,
		"message": null,
		"signers": [
			{
				"id": "customid1",
				"full_name": "Signer 1",
				"email": "signer1@example.com",
				"whatsapp_phone_number": null,
				"has_accepted_terms": false,
				"completed": false,
				"notification_history": [],
				"verification_method": "Email",
				"notification_methods": ["Email"],
				"step": 1,
				"notified": true
			}
		],
		"copy_receivers": [],
		"items": [],
		"summary": {
			"signer_count": 2,
			"completed_count": 0,
			"signers": [{ "id": "customid1", "full_name": "Signer 1", "completed": false }]
		},
		"signing_urls": [{ "signer_id": "customid1", "url": "https://.../sign/..." }]
	},
	"tags": [],
	"pages": [],
	"is_closed": false,
	"created_at": "2026-05-12T18:05:11Z",
	"updated_at": "2026-05-12T18:05:11Z"
}
```

#### Rename a document

Changes a document's display name.

**Endpoint:** `PATCH /documents/{documentId}`

**Node parameters:**

- Document ID — resourceLocator — required — the document to rename.
- New Name — string — required — the new display name.

> Rename is allowed only while status is `uploaded` or `metadata_ready` and before an assignment exists. The API accepts at most 255 characters, removes diacritics, and replaces unsupported characters with dashes. If you rename immediately after upload, run **Wait Until Ready** first.

**Example request:**

```json
{ "name": "signed-contract.pdf" }
```

**Example response:**

```json
{
	"resource": "document",
	"id": "1016d5795af62e28c2161efcb7a6",
	"account_id": "<account-id>",
	"template_id": null,
	"name": "signed-contract.pdf",
	"status": "metadata_ready",
	"artifacts": {
		"original": "https://.../download/original",
		"thumbnail": "https://.../thumbnail"
	},
	"is_closed": false,
	"tags": [],
	"created_at": "2026-07-20T18:49:23Z",
	"updated_at": "2026-07-20T19:00:00Z"
}
```

#### Delete a document

Deletes a document by ID. The SDK returns a synthesized confirmation rather than the API's empty `data` array.

**Endpoint:** `DELETE /documents/{documentId}`

**Request body:** none.

**Node parameters:**

- Document ID — resourceLocator — required — the document to delete.

> A document can only be deleted from a deletable status (see **List Statuses** for the `deletable` flag per status).

**Example response:**

```json
{ "deleted": true, "documentId": "1016d5795af62e28c2161efcb7a6" }
```

#### Search documents (lightweight)

Searches workspace documents via the dedicated lightweight search endpoint. Unlike **List**, each record omits the expanded `pages`/`assignment` objects, so it is faster for name/status lookups. Honors **Return All** / **Limit** and paginates via `X-Pagination-*` headers.

**Endpoint:** `GET /accounts/{accountId}/documents/search`

**Node parameters:**

- Return All — boolean — return every page (default false).
- Limit — number — max records when Return All is off (default 50).
- Search Filters > Search — string — partial match on the document name.
- Search Filters > Status — string — filter by status code (e.g. `metadata_ready`, `pending_signature`).

**Example request (query):**

```json
{
	"search": "contract",
	"status": "metadata_ready"
}
```

**Example response (one item per document):**

```json
[
	{
		"id": "19f80dc86e3cce2d39d7edc9e28",
		"account_id": "<account-id>",
		"template_id": null,
		"name": "contract.pdf",
		"status": "metadata_ready",
		"artifacts": {
			"original": "https://.../download/original",
			"thumbnail": "https://.../thumbnail"
		},
		"is_closed": false,
		"signing_url": "https://app-sandbox.assinafy.com.br/sign/19f80dc86e3cce2d39d7edc9e28",
		"decline_reason": null,
		"declined_by": null,
		"tags": [],
		"created_at": "2026-07-20T18:49:23Z",
		"updated_at": "2026-07-20T18:49:26Z"
	}
]
```

#### Download a document artifact (PDF or ZIP)

Downloads a document artifact (`original`, certificated/signed PDF, certificate page, PAdES PDF, or ZIP bundle) into a binary property.

**Endpoint:** `GET /documents/{documentId}/download/{artifact}`

**Node parameters:**

- Document ID — resourceLocator — required — the document.
- Artifact — options — required — one of `original`, `certificated`, `certificate-page`, `pades`, or `bundle` (default `certificated`). `pades` contains the signers' ICP-Brasil signatures plus the platform certification box and is available only when the document had digital-certificate signers.
- Put Output In Field — string — optional — output binary property name (default `data`).

**Example response:** Output is a binary item (no JSON payload other than metadata). The binary is the raw `application/pdf` file (or `application/zip` when Artifact is `bundle`), with a suggested filename of `{documentId}-{artifact}.pdf` (or `{documentId}-bundle.zip`). The mime type is taken from the response `Content-Type` header. A bundle contains `original`, `certificated`, and `certificate-page`, plus `pades` when present. Accompanying JSON: `{ "documentId", "fileName", "mimeType", "size" }`.

#### Download the document thumbnail

Downloads the document's thumbnail image into a binary property.

**Endpoint:** `GET /documents/{documentId}/thumbnail`

**Node parameters:**

- Document ID — resourceLocator — required — the document.
- Put Output In Field — string — optional — output binary property name (default `data`).

**Example response:** Output is a binary item. The binary is the raw `image/jpeg` thumbnail with suggested filename `{documentId}-thumbnail.jpg`. Accompanying JSON: `{ "documentId", "fileName", "mimeType", "size" }`.

#### Download a single page as a JPEG

Downloads a single rendered page of the document as a JPEG into a binary property.

**Endpoint:** `GET /documents/{documentId}/pages/{pageId}/download`

**Node parameters:**

- Document ID — resourceLocator — required — the document.
- Page ID — string — required — the page to download (from Get > `pages` array).
- Put Output In Field — string — optional — output binary property name (default `data`).

**Example response:** Output is a binary item. The binary is the raw `image/jpeg` page image with suggested filename `{documentId}-page-{pageId}.jpg`. Accompanying JSON: `{ "documentId", "fileName", "mimeType", "size" }`.

#### List the activity log for a document

Returns the document's activity log. The SDK wraps the array under `documentId` + `activities`.

**Endpoint:** `GET /documents/{documentId}/activities`

**Node parameters:**

- Document ID — resourceLocator — required — the document.

**Example response:**

```json
{
	"documentId": "1016d5795af62e28c2161efcb7a6",
	"activities": [
		{
			"id": 8232,
			"event": "document_metadata_ready",
			"message": "Documento processado.",
			"payload": [],
			"origin": null,
			"created_at": "2026-05-12T18:05:11Z"
		}
	]
}
```

#### Return a signed total percentage summary

Convenience wrapper: it fetches the document and synthesizes a signing-progress summary from `assignment.summary` (no dedicated API endpoint).

**Endpoint:** `GET /documents/{documentId}` (used internally to compute the summary)

**Node parameters:**

- Document ID — resourceLocator — required — the document.

**Example response:** Synthesized JSON returned by the SDK (`signed`/`total` from `assignment.summary.completed_count`/`signer_count`; `percentage` rounded to 2 decimals; `isFullySigned` true when status is `certificated` or all signers completed):

```json
{
	"documentId": "1016d5795af62e28c2161efcb7a6",
	"status": "pending_signature",
	"available": true,
	"signed": 1,
	"total": 2,
	"pending": 1,
	"percentage": 50,
	"isFullySigned": false
}
```

If the document has no assignment object, `available` is `false`; `signed`, `total`, `pending`, and `percentage` are `null`. `isFullySigned` remains `true` when the document status is `certificated`.

#### Poll the document until it reaches a ready status

Convenience wrapper: repeatedly fetches the document until its status is one of `metadata_ready`, `pending_signature`, `certificated`, then returns the full document. Throws if the status becomes `failed`, `rejected_by_signer`, `rejected_by_user`, or `expired`, or if it times out.

**Endpoint:** `GET /documents/{documentId}` (polled internally)

**Node parameters:**

- Document ID — resourceLocator — required — the document.
- Max Wait (Ms) — number — optional — give up after this many ms (default 30000, min 1000).
- Poll Interval (Ms) — number — optional — delay between polls (default 2000, min 250).

**Example response:** The full document object once it reaches a ready status (same shape as Get a document), e.g. with `"status": "metadata_ready"`.

#### Create a document from a template

Creates a document from a template, mapping one signer entry per template role.

**Endpoint:** `POST /accounts/{accountId}/templates/{templateId}/documents`

**Node parameters:**

- Template ID — resourceLocator — required — the template to use, selected from a searchable list or entered by ID.
- Signers — fixedCollection (multiple) — required — one entry per template role, each with:
  - Role ID — string — required — template role ID.
  - Signer ID — string — required for Create — existing signer ID. The shared UI also serves Estimate Cost, where it may be omitted; Create validates every row and fails before sending if an ID is missing.
  - Verification Method — options — optional — `Email`, `Whatsapp`, or `DigitalCertificate` (default `Email`).
  - Notification Methods — multiOptions — optional — choose one of `Email` or `Whatsapp` (default `Email`). The Create contract permits only one method per signer; selecting both fails before a request is sent.
  - Step — number — optional — signing order; 0 = notify all at once, otherwise a contiguous sequence starting at 1.
- Additional Fields > Document Name — string — optional — overrides the template's default name.
- Additional Fields > Editor Fields (JSON) — json — optional — array of `{ "field_id", "value" }`.
- Additional Fields > Expires At — dateTime — optional — ISO 8601 assignment expiration.
- Additional Fields > Message — string — optional — message for the signing invitation.
- Additional Fields > Tag Names — string (multiple) — optional — tag names to attach (missing tags auto-created). Each value is kept as one tag even when it contains a comma; a scalar comma-delimited expression is split.

The node validates signing steps client-side. `step` is only sent when > 0; `verification_method` and `notification_methods` are only sent when present. A `DigitalCertificate` signer must meet the [shared digital-certificate requirements](#verification-notification-and-digital-certificate-rules), including being alone in its signing step.

**Example request:**

```json
{
	"name": "sample-contract.pdf",
	"message": "Please sign",
	"expires_at": "2026-07-30T23:59:00Z",
	"editor_fields": [{ "field_id": "fa8c14f3...", "value": "Field value" }],
	"tags": ["Onboarding"],
	"signers": [
		{
			"role_id": "fa8c14f32d732271e071998246e",
			"id": "fa8c140cb49b79f940aab95fddd",
			"verification_method": "Email",
			"notification_methods": ["Email"],
			"step": 1
		}
	]
}
```

**Example response:**

```json
{
	"resource": "document",
	"id": "fa8c140c614c928f7e7efa086b2",
	"account_id": "<account-id>",
	"template_id": "fa8c140b5ee344f8e48236ed284",
	"name": "sample-contract.pdf",
	"status": "uploaded",
	"assignment": {
		"id": "fa8c140ccd5781b079738d19e95",
		"sender_email": "sender@example.com",
		"method": "virtual",
		"expires_at": "2026-07-30T23:59:00Z",
		"signers": [
			{
				"id": "<signer-id>",
				"full_name": "Example Signer",
				"email": "signer@example.com",
				"has_accepted_terms": false
			}
		],
		"copy_receivers": [],
		"summary": {
			"signer_count": 1,
			"completed_count": 0,
			"signers": [{ "id": "fa8c140cb49b79f940aab95fddd", "completed": false }]
		},
		"signing_urls": [{ "signer_id": "fa8c140cb49b79f940aab95fddd", "url": "https://.../sign/..." }]
	},
	"tags": [{ "id": "ab12cd34...", "name": "Onboarding" }],
	"pages": [
		{
			"id": "fa8c140c9617a07be842995d4a1",
			"number": 1,
			"height": 2100,
			"width": 1275,
			"download_url": "https://.../download"
		}
	],
	"is_closed": false,
	"decline_reason": null,
	"declined_by": null,
	"created_at": "2026-06-05T15:05:17Z",
	"updated_at": "2026-06-05T15:05:17Z"
}
```

#### Estimate credit cost of creating a document from a template

Estimates the credit/document cost of a template-based document without creating it. Contact info is not required; only `role_id` (and optionally verification/notification method) per signer.

**Endpoint:** `POST /accounts/{accountId}/templates/{templateId}/documents/estimate-cost`

**Node parameters:**

- Template ID — resourceLocator — required — the template to use, selected from a searchable list or entered by ID.
- Signers — fixedCollection (multiple) — required — same row shape as Create From Template. Only `role_id`, `verification_method` (`Email`, `Whatsapp`, or `DigitalCertificate`), and `notification_methods` (`Email` or `Whatsapp`) matter for cost; the estimate may include one or both notification methods. The node accepts the shared UI's `id` and `step` values but deliberately omits them from the request.

The node requires at least one row and a `role_id` for each row. It sends only `signers`, strips create-only signer IDs and signing steps, and does not validate those ignored create-only values or send additional document fields. A `DigitalCertificate` estimate adds 2 credits per signer, plus 0 credits for Email or 0.45 credits for WhatsApp; the signature line uses breakdown code `SignatureDigitalCertificate`.

**Example request:**

```json
{
	"signers": [
		{
			"role_id": "fa8c14f32d732271e071998246e",
			"verification_method": "Whatsapp",
			"notification_methods": ["Whatsapp"]
		}
	]
}
```

**Example response:**

```json
{
	"documents": 1,
	"credits": 0.45,
	"needs_extra_document": false,
	"extra_document_cost": 0,
	"total_credits": 0.45,
	"breakdown": [
		{
			"code": "NotificationWhatsapp",
			"name": "Whatsapp Notification",
			"cost": 0.45,
			"quantity": 1,
			"unit_cost": 0.45
		}
	],
	"document_balance": 100,
	"credit_balance": 50,
	"has_sufficient_resources": true,
	"blocking_reason": null,
	"message": null
}
```

#### Verify a document by its signature hash

Verifies a signed document's authenticity by its signature hash. Public endpoint — no API key is sent.

**Endpoint:** `GET /documents/{signatureHash}/verify`

**Node parameters:**

- Signature Hash — string — required — the signature hash from the signed document.

**Example response:**

```json
{
	"hash": "FE32EDDADE7CBDDCBB934E7402047450B0E59C02",
	"id": null,
	"status": null,
	"page_count": null,
	"signer_count": null,
	"completed_count": null,
	"completed_at": null,
	"verified_at": "2026-06-05T19:30:15Z",
	"is_valid": false,
	"message": "Documento não assinado ou não encontrado."
}
```

#### Get unauthenticated public document basics

Fetches basic public document details (no authentication required). Public endpoint — no API key is sent.

**Endpoint:** `GET /public/documents/{publicDocumentId}`

**Node parameters:**

- Document ID — string — required — public document ID.

The node returns the unwrapped document information without reshaping it. The payload includes document identification and may include the complete [`Document`](#shared-schema-catalog) fields.

**Example response:**

```json
{
	"id": "doc1",
	"name": "1.pdf",
	"page_count": "1",
	"created_by": "Example User"
}
```

#### Send a 6 digit access token to a signer via email or whatsapp

Sends a 6-digit signing access token to a recipient via email or WhatsApp. Public endpoint — no API key is sent.

The recipient must already be assigned to the document. The node sends both `recipient` and `channel`.

**Endpoint:** `PUT /public/documents/{publicDocumentId}/send-token`

**Node parameters:**

- Document ID — string — required — public document ID.
- Recipient — string — required — email or WhatsApp phone number.
- Channel — options — required — `email` or `whatsapp` (default `email`).

**Example request:**

```json
{ "recipient": "signer@example.com", "channel": "email" }
```

**Example response:**

```json
{
	"document": {
		"resource": "document",
		"id": "doc1",
		"name": "1.pdf",
		"page_count": "1",
		"created_by": "Example User"
	},
	"channel": "email",
	"recipient": "signer@example.com"
}
```

#### List supported document statuses and deletability

Lists every supported document status code and whether a document in that status can be deleted. The SDK wraps the array under `statuses`.

**Endpoint:** `GET /documents/statuses`

**Node parameters:** none.

**Example response:**

```json
{
	"statuses": [
		{ "code": "uploading", "deletable": false },
		{ "code": "uploaded", "deletable": false },
		{ "code": "metadata_processing", "deletable": false },
		{ "code": "metadata_ready", "deletable": true },
		{ "code": "expired", "deletable": true },
		{ "code": "certificating", "deletable": false },
		{ "code": "certificated", "deletable": false },
		{ "code": "rejected_by_signer", "deletable": true },
		{ "code": "pending_signature", "deletable": true },
		{ "code": "rejected_by_user", "deletable": true },
		{ "code": "failed", "deletable": true }
	]
}
```

#### List tags attached to a document

Lists the tags currently attached to a document. Returns one output item per tag.

**Endpoint:** `GET /accounts/{accountId}/documents/{documentId}/tags`

**Node parameters:**

- Document ID — resourceLocator — required — the document.

**Example response:**

```json
[
	{
		"id": "fa8c09f3e709a8a1c82d69b1454",
		"name": "Contracts",
		"color": "ff0000",
		"created_at": "2026-05-14T12:00:00Z",
		"updated_at": "2026-05-14T12:00:00Z"
	}
]
```

#### Replace all tags on a document

Replaces the document's entire tag set with the provided list. Unknown tag names are auto-created; an empty list detaches all tags.

**Endpoint:** `PUT /accounts/{accountId}/documents/{documentId}/tags`

**Node parameters:**

- Document ID — resourceLocator — required — the document.
- Tag Names — string (multiple) — optional — tag names to set; leaving this empty removes all tags. Array entries are preserved whole, so `Example, Inc.` remains one tag; only a scalar comma-delimited expression is split.

**Example request:**

```json
{ "tags": ["Contracts", "2026-Q1"] }
```

**Example response:**

```json
{
	"data": [
		{ "id": "fa8c...", "name": "2026-Q1", "color": null, "created_at": "...", "updated_at": "..." },
		{
			"id": "ab12...",
			"name": "Contracts",
			"color": null,
			"created_at": "...",
			"updated_at": "..."
		}
	]
}
```

#### Append tags to a document

Attaches additional tags without removing existing ones (idempotent; unknown names auto-created). At least one tag name is required.

**Endpoint:** `POST /accounts/{accountId}/documents/{documentId}/tags`

**Node parameters:**

- Document ID — resourceLocator — required — the document.
- Tag Names — string (multiple) — required — tag names to attach (at least one). Array entries are preserved whole, including embedded commas; only a scalar comma-delimited expression is split.

**Example request:**

```json
{ "tags": ["Urgent"] }
```

**Example response:**

```json
{
	"data": [
		{
			"id": "ab12c09f3e709a8a1c82d69b145",
			"name": "Contracts",
			"color": "ff0000",
			"created_at": "2026-05-14T12:00:00Z",
			"updated_at": "2026-05-14T12:00:00Z"
		},
		{
			"id": "fa8c09f3e709a8a1c82d69b1454",
			"name": "Urgent",
			"color": null,
			"created_at": "2026-05-14T13:00:00Z",
			"updated_at": "2026-05-14T13:00:00Z"
		}
	]
}
```

#### Detach one tag from a document

Detaches a single tag from a document (the tag itself is not deleted; detaching an unattached tag is a no-op). The SDK returns a synthesized confirmation.

**Endpoint:** `DELETE /accounts/{accountId}/documents/{documentId}/tags/{tagId}`

**Request body:** none.

**Node parameters:**

- Document ID — resourceLocator — required — the document.
- Tag ID — resourceLocator — required — the tag to detach.

**Example response:**

```json
{
	"detached": true,
	"documentId": "60f720572d7fecf7c16c8463",
	"tagId": "fa8c09f3e709a8a1c82d69b1454"
}
```

---

### Signer

#### Create a signer

Creates a signer in the account. Only `full_name` is required; email and WhatsApp are optional and can be added later before requesting a remote signature. By default, if an email is supplied and a signer with that email already exists, the existing signer is returned instead of creating a duplicate.

**Endpoint:** `POST /accounts/{accountId}/signers`

**Node parameters:**

- Full Name — string — required — signer's full name.
- Email — string — optional — signer email.
- Additional Fields — collection — optional:
  - Reuse If Exists — boolean (default `true`) — when true and an email is provided, looks up an existing signer with that email and returns it instead of creating a duplicate.
  - WhatsApp Phone Number — string — E.164 format (e.g. `+5548999990000`).

Signer Create sends only `full_name`, `email`, and `whatsapp_phone_number`. CPF/CNPJ is set later through Signer Update as `government_id`; create-time `cpf` and `metadata` keys are not sent.

**Example request:**

```json
{
	"full_name": "Example Signer"
}
```

**Example response:**

```json
{
	"resource": "signer",
	"id": "1031...",
	"full_name": "Example Signer",
	"email": null,
	"whatsapp_phone_number": null,
	"has_accepted_terms": false
}
```

#### List signers

Lists signers in the account. Supports return-all or a capped limit and is paginated via `X-Pagination-*` headers. The node forwards `search` and an optional `sort` query value.

**Endpoint:** `GET /accounts/{accountId}/signers`

**Node parameters:**

- Return All — boolean — optional — return every result, paging through automatically.
- Limit — number — optional (shown when Return All is off) — max number of results.
- Filters — collection — optional:
  - Search — string — filter by `full_name` or email.
  - Sort — string — sort term.

**Example request:**

```json
{
	"search": "example"
}
```

`sort` is forwarded only when configured.

**Example response:**

```json
[
	{
		"id": "60f720577e30d2047d4f385f",
		"full_name": "Example Signer One",
		"email": "joan@example.com",
		"whatsapp_phone_number": "+5548999990000",
		"has_accepted_terms": false
	},
	{
		"id": "60f72057b865123687d56c3c",
		"full_name": "Example Signer Two",
		"email": "mary@example.com",
		"whatsapp_phone_number": null,
		"has_accepted_terms": true
	}
]
```

#### Get a signer

Retrieves a single signer by ID.

**Endpoint:** `GET /accounts/{accountId}/signers/{signerId}`

**Node parameters:**

- Signer — resourceLocator — required — the signer to fetch (by ID or list selection).

**Example response:**

```json
{
	"resource": "signer",
	"id": "62d6ee35c7741ca4006b9e11",
	"full_name": "Example Signer",
	"email": "john@example.com",
	"whatsapp_phone_number": "+5548999990000",
	"has_accepted_terms": false
}
```

#### Update a signer

Updates a signer's information. At least one update field must be provided. `email`/`whatsapp_phone_number` cannot be changed while the signer has verified, in-flight (non-certificated) documents using that channel — the API returns 400 naming the affected documents. Changing an unverified channel while requests are in flight rotates its access/verification codes, invalidating old links and OTPs; use **Resend Notification** to deliver the new code. Certificated documents do not block a change, and `full_name` can always be updated.

**Endpoint:** `PUT /accounts/{accountId}/signers/{signerId}`

**Node parameters:**

- Signer — resourceLocator — required — the signer to update.
- Update Fields — collection — optional (at least one required):
  - Email — string — new email address.
  - Full Name — string (`full_name`) — new full name.
  - Government ID — string (`government_id`) — signer's CPF or CNPJ; punctuation is stripped and digits are sent.
  - WhatsApp Phone Number — string (`whatsapp_phone_number`) — E.164 format.

**Example request:**

```json
{
	"full_name": "Example Signer",
	"email": "john.dove@example.com",
	"government_id": "<cpf-or-cnpj>",
	"whatsapp_phone_number": "+5548999990000"
}
```

**Example response:**

```json
{
	"resource": "signer",
	"id": "62d6ee35c7741ca4006b9e11",
	"full_name": "Example Signer",
	"email": "john.dove@example.com",
	"whatsapp_phone_number": "+5548999990000",
	"has_accepted_terms": false
}
```

#### Delete a signer

Deletes a signer. The SDK returns a synthesized confirmation object (the API itself returns an empty array).

**Endpoint:** `DELETE /accounts/{accountId}/signers/{signerId}`

**Request body:** none.

**Node parameters:**

- Signer — resourceLocator — required — the signer to delete.

**Example response:**

```json
{
	"deleted": true,
	"signerId": "62d6ee35c7741ca4006b9e11"
}
```

#### Look up a signer by email address

Convenience wrapper: searches account signers for an exact (case-insensitive) email match and returns the matching signer. If none is found, the SDK returns a synthesized `{ "found": false, "email": ... }` object instead of erroring.

**Endpoint:** `GET /accounts/{accountId}/signers` (called with `search` set to the email; matched client-side)

**Node parameters:**

- Email — string — required — email address to search for.

**Example request:**

```json
{
	"search": "signer@example.com",
	"per-page": 100
}
```

**Example response (match found):**

```json
{
	"resource": "signer",
	"id": "1031...",
	"full_name": "Example Signer",
	"email": "signer@example.com",
	"whatsapp_phone_number": null,
	"has_accepted_terms": false
}
```

**Example response (no match):**

```json
{
	"found": false,
	"email": "signer@example.com"
}
```

#### Signer retrieves their own info via access code

Signer-side flow: the signer obtains their own record using the per-signer access code from their email/WhatsApp link. Authenticated only by the access code (no API key).

**Endpoint:** `GET /signers/self`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer access code.

**Example request (query):**

```json
{
	"signer-access-code": "<signer-access-code>"
}
```

**Example response:**

```json
{
	"resource": "signer",
	"id": "uahkinwvg8tWJ2RC",
	"full_name": "Signer Name",
	"email": "signer@example.com",
	"whatsapp_phone_number": "+5548999990000",
	"has_accepted_terms": false,
	"has_signature": false,
	"has_initial": false,
	"is_signature_reusable": false
}
```

#### Signer accepts the terms of use

Signer-side flow: marks the terms of use as accepted for the signer identified by the access code. The corrected request puts the access code in the query string; it does not send an access-code JSON body.

**Endpoint:** `PUT /signers/accept-terms`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer access code.

**Example request (query):**

```json
{
	"signer-access-code": "<signer-access-code>"
}
```

**Example response:**

```json
{
	"full_name": "Signer Name",
	"email": "signer@example.com",
	"has_accepted_terms": true
}
```

#### Submit a six digit verification code

Signer-side flow: verifies the OTP delivered to the signer (via email or WhatsApp). The access code is a query parameter and the six-digit OTP is the `verification-code` JSON field.

**Endpoint:** `POST /verify`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer access code.
- Verification Code — string — required — the 6-digit code delivered to the signer.

**Example request (query + body):**

```json
{
	"query": { "signer-access-code": "<signer-access-code>" },
	"body": { "verification-code": "<verification-code>" }
}
```

**Example response:**

```json
{
	"message": "Code verified successfully"
}
```

#### Signer confirms identity data before signing

Signer-side flow: confirms the signer's identity data for a specific document before signing. The node can send full name, email, government ID, WhatsApp number, and `has_accepted_terms: true`. Digital-certificate signers must accept terms before opening the sign page. The access code is sent as a query parameter and only selected fields are included in the JSON body. The dedicated **Accept Terms** operation is also available.

**Endpoint:** `PUT /documents/{documentId}/signers/confirm-data`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer access code.
- Document ID — string — required — the document being confirmed for.
- Confirm Fields — collection — optional:
  - Full Name — string — optional — sent as `full_name`.
  - Email — string — optional — sent as `email`; must match an existing email if already set.
  - Government ID — string — optional — sent as `government_id`.
  - WhatsApp Phone Number — string — optional — sent as `whatsapp_phone_number` in E.164 format.
  - Accept Terms — boolean — optional — sends `has_accepted_terms: true` only when enabled.

**Example request:**

```json
{
	"query": { "signer-access-code": "<signer-access-code>" },
	"body": {
		"full_name": "Example Signer",
		"email": "signer@example.com",
		"government_id": "<government-id>"
	}
}
```

**Example response:**

```json
{
	"resource": "signer",
	"id": "<signer-id>",
	"full_name": "Example Signer",
	"email": "signer@example.com",
	"whatsapp_phone_number": "+5548999990000",
	"has_accepted_terms": false
}
```

#### Upload a signer signature or initial image

Signer-side flow: uploads the signer's signature or initials image as the raw request body. The node accepts a non-empty PNG or JPEG and rejects contradictory or unsupported MIME types. A missing or generic `application/octet-stream` MIME type is accepted only when PNG/JPEG magic bytes identify an allowed image. The access code, signature `type`, and optional `reuse` preference are query parameters.

**Endpoint:** `POST /signature`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer access code.
- Signature Type — options (`signature` | `initial`, default `signature`) — which image is being uploaded.
- Binary Property — string (default `data`) — required — name of the binary property on the incoming item holding the PNG/JPEG image.
- Signature Options > Reuse in Future Processes — boolean — optional — sends `reuse=true` or `reuse=false` when present; omit the option to preserve the existing preference.

**Example request (query + raw image body):**

```json
{
	"query": { "signer-access-code": "<signer-access-code>", "type": "signature", "reuse": true },
	"headers": { "Content-Type": "image/png" },
	"body": "<raw PNG/JPEG bytes>"
}
```

**Example response:**

```json
{ "data": [] }
```

#### Download a signer signature or initial image

Signer-side flow: downloads the signer's stored signature or initials image. The node outputs a binary item (no JSON payload from the API). Authenticated only by the access code.

**Endpoint:** `GET /signature/{type}` (where `{type}` is `signature` or `initial`)

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer access code.
- Signature Type — options (`signature` | `initial`, default `signature`) — which image to download.
- Put Output In Field — string (`binaryOutputProperty`, default `data`) — binary property to place the downloaded image in.

**Example request (query):**

```json
{
	"signer-access-code": "<signer-access-code>"
}
```

**Example response:** The output is a binary item, not JSON. The downloaded image (`image/png` or `image/jpeg`) is placed in the configured binary property (default `data`) as `signature.png` / `signature.jpg` (or `initial.*`). The item's JSON carries only metadata, e.g.:

```json
{
	"type": "signature",
	"fileName": "signature.png",
	"mimeType": "image/png",
	"size": 20480
}
```

---

### Assignment

Manages signature requests (assignments) on a document — creating them, estimating costs, resending notifications, resetting expiration, and signer-side sign/decline/read flows. All account-scoped operations target a document by ID; the document target is selected via a resource locator. Each assignment always consumes 1 document from the plan allowance.

#### List assignments for the credential workspace

Returns the assignments visible in the credential's default workspace.

**Endpoint:** `GET /assignments`

**Node parameters:**

- Return All — boolean — optional — fetch every response page.
- Limit — number — optional — maximum items when Return All is disabled.

**Effective query:**

```json
{
	"accountId": "<account-id>",
	"page": 1,
	"per-page": 50
}
```

`accountId` is supplied automatically from the credential. The transport adds `page` and `per-page` for pagination.

**Example response:**

```json
[
	{
		"resource": "assignment",
		"id": "<assignment-id>",
		"sender_email": "sender@example.com",
		"method": "virtual",
		"expires_at": null,
		"message": "Please review and sign",
		"signers": [],
		"copy_receivers": [],
		"items": [],
		"summary": { "signer_count": 0, "completed_count": 0, "signers": [] },
		"signing_urls": []
	}
]
```

#### Create an assignment

Creates a signature request on a document. Use `virtual` to collect signatures remotely (email/WhatsApp) or `collect` to place signer fields on specific pages.

**Endpoint:** `POST /documents/{documentId}/assignments`

**Node parameters:**

- Document — resource locator (ID/URL) — required — the target document.
- Method — options (`virtual` | `collect`) — required — assignment method (default `virtual`).
- Signers — fixedCollection (multiple) — required — at least one signer; each must supply a Signer ID for create.
  - Signer ID — string — required (for create).
  - Verification Method — options (`Email` | `Whatsapp` | `DigitalCertificate`) — optional (default `Email`).
  - Notification Methods — multiOptions (`Email` | `Whatsapp`) — optional (default `Email`); select either or both channels.
  - Step — number (≥0) — optional — signing order; set every signer to a contiguous sequence starting at 1, or leave all at 0 to notify everyone at once.
- Additional Fields — collection — optional:
  - Message — string — optional — invite message.
  - Expires At — dateTime — optional — ISO8601 expiration.
  - Copy Receivers — string (multiple) — optional — signer IDs that receive a copy without signing.
- Entries (JSON) — json — required only when Method is `collect` — array of `{ page_id, fields: [{ signer_id, field_id, display_settings }] }`. Each `display_settings` requires numeric `left`, `top`, `width`, `height`, and `fontSize`; `fontFamily` and `backgroundColor` are optional.

The API infers omitted verification/notification methods as described in the [shared rules](#verification-notification-and-digital-certificate-rules). `DigitalCertificate` additionally requires the account feature, the signer's CPF/CNPJ in `government_id`, and a signing step with no other signer. It costs 2 credits per signer on top of Email (0) or WhatsApp (0.45) notification credits.

**Example request:**

```json
{
	"method": "collect",
	"signers": [
		{
			"id": "61521202f665dffcef5f6b24",
			"verification_method": "Email",
			"notification_methods": ["Email"],
			"step": 1
		}
	],
	"message": "Please sign the contract",
	"expires_at": "2026-09-30T21:00:00Z",
	"entries": [
		{
			"page_id": "615213ed81b071f4293b2fc2",
			"fields": [
				{
					"signer_id": "61521202f665dffcef5f6b24",
					"field_id": "6152120297080d55bdd13197",
					"display_settings": {
						"top": 282,
						"left": 69,
						"width": 421,
						"height": 45.86,
						"fontSize": 18,
						"fontFamily": "Arial",
						"backgroundColor": "rgb(185, 218, 255)"
					}
				}
			]
		}
	]
}
```

**Example response:**

```json
{
	"resource": "assignment",
	"id": "615606ef81d199996981dbce",
	"sender_email": "sender@example.com",
	"method": "collect",
	"expires_at": "2026-09-30T21:00:00Z",
	"message": "Please sign the contract",
	"signers": [
		{
			"id": "61521202f665dffcef5f6b24",
			"full_name": "Example Signer",
			"email": "signer@example.com",
			"whatsapp_phone_number": null,
			"has_accepted_terms": false,
			"completed": false,
			"notification_history": [],
			"verification_method": "Email",
			"notification_methods": ["Email"],
			"step": 1,
			"notified": true
		}
	],
	"copy_receivers": [],
	"items": [
		{
			"id": "615606efbb67641186c12330",
			"page": {
				"id": "615213ed81b071f4293b2fc2",
				"number": 1,
				"height": 2100,
				"width": 1275,
				"download_url": "https://api.assinafy.com.br/v1/documents/615213edf8a58f132e1b2384/pages/615213ed81b071f4293b2fc2/download"
			},
			"signer": {
				"id": "<signer-id>",
				"full_name": "Example Signer",
				"email": "signer@example.com"
			},
			"field": { "id": "6152120297080d55bdd13197", "name": "Signature", "type": "signature" },
			"display_settings": {
				"top": 282,
				"left": 69,
				"width": 421,
				"height": 45.86,
				"fontSize": 18,
				"fontFamily": "Arial",
				"backgroundColor": "rgb(185, 218, 255)"
			},
			"value": null,
			"completed": false
		}
	],
	"summary": {
		"signer_count": 1,
		"completed_count": 0,
		"signers": [{ "id": "61521202f665dffcef5f6b24", "completed": false }]
	},
	"signing_urls": [
		{ "signer_id": "61521202f665dffcef5f6b24", "url": "https://api.assinafy.com.br/v1/sign/abc" }
	]
}
```

> Note: For a `virtual` assignment, the document may still be in `uploaded`/`metadata_processing`; it is promoted to `pending_signature` automatically once metadata processing completes. A `collect` assignment requires the document to be in `metadata_ready`.

#### Estimate the credit cost of an assignment

Estimates the credit/document cost of an assignment without creating it, returning a breakdown plus current account balances. Signer IDs are not required here — only the verification/notification method affects cost.

**Endpoint:** `POST /documents/{documentId}/assignments/estimate-cost`

**Node parameters:**

- Document — resource locator — required.
- Method — options (`virtual` | `collect`) — required (default `virtual`).
- Signers — fixedCollection (multiple) — required for `virtual`; optional for `collect`. Signer ID may be left empty here to estimate without a specific signer; an empty signer defaults to Email.
  - Signer ID — string — optional.
  - Verification Method — options (`Email` | `Whatsapp` | `DigitalCertificate`) — optional.
  - Notification Methods — multiOptions (`Email` | `Whatsapp`) — optional.
  - Step — number — optional (ignored for cost).
- Entries (JSON) — json — required only when Method is `collect`.

> Note: The Additional Fields (message / expires_at / copy_receivers) are not sent on this operation — they only show for Create.

Pricing is 1 credit for an extra document when the plan allowance is exhausted, 0 credits per Email notification, 0.45 credits per WhatsApp notification, and 2 credits per `DigitalCertificate` signer in addition to the notification. Digital-certificate charges appear under breakdown code `SignatureDigitalCertificate`.

`blocking_reason` is `PendingPayment`, `InsufficientDocuments`, `InsufficientCredits`, or `null`.

**Example request:**

```json
{
	"method": "virtual",
	"signers": [
		{ "verification_method": "Whatsapp", "notification_methods": ["Whatsapp"] },
		{ "verification_method": "Whatsapp", "notification_methods": ["Whatsapp"] }
	]
}
```

**Example response:**

```json
{
	"documents": 1,
	"credits": 0.9,
	"needs_extra_document": false,
	"extra_document_cost": 0,
	"total_credits": 0.9,
	"breakdown": [
		{
			"code": "NotificationWhatsapp",
			"name": "Whatsapp Notification",
			"cost": 0.9,
			"quantity": 2,
			"unit_cost": 0.45
		}
	],
	"document_balance": 68,
	"credit_balance": 0,
	"has_sufficient_resources": true,
	"blocking_reason": null,
	"message": null
}
```

#### Estimate the cost of resending a signer notification

Estimates the credit cost of resending a notification to one signer without resending it, plus the current credit balance.

**Endpoint:** `POST /documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/estimate-resend-cost`

**Node parameters:**

- Document — resource locator — required.
- Assignment ID — string — required.
- Signer ID — string — required.

**Request body:** none.

**Example response:**

```json
{
	"documents": 0,
	"credits": 0,
	"needs_extra_document": false,
	"extra_document_cost": 0,
	"total_credits": 0,
	"breakdown": [
		{
			"code": "NotificationEmailResend",
			"name": "Email Notification Resend",
			"cost": 0,
			"quantity": 1,
			"unit_cost": 0
		}
	],
	"document_balance": 68,
	"credit_balance": 0,
	"has_sufficient_resources": true,
	"blocking_reason": null,
	"message": null
}
```

#### Signer reads document data for the signing flow

Signer-side read: retrieves the document and embedded assignment details using only a per-signer access code (no account auth). The SDK calls this with `skipAuth`. For `DigitalCertificate`, first confirm the signer data and accept terms through **Confirm Data** with `has_accepted_terms: true`, or call **Accept Terms** separately; otherwise this route returns 400. Its own `has_accepted_terms` query parameter is processed too late to open that DC gate.

**Endpoint:** `GET /sign`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer code from the email/WhatsApp link.
- Accept Terms While Loading — boolean — optional (default `false`) — when enabled, adds `has_accepted_terms=true`; when disabled the parameter is omitted so the signer state is not changed. This does not satisfy the precondition for a `DigitalCertificate` signer; accept terms before this request.

**Example request (query):**

```json
{
	"signer-access-code": "<signer-access-code>",
	"has_accepted_terms": true
}
```

**Example response:**

```json
{
	"id": "615213edf8a58f132e1b2384",
	"account_id": "<account-id>",
	"name": "sample-contract-one-page.pdf",
	"status": "pending_signature",
	"assignment": {
		"id": "615606ef81d199996981dbce",
		"expires_at": "2026-09-30T23:59:59Z",
		"method": "collect",
		"signers": [
			{
				"id": "customid1",
				"full_name": "Signer 1",
				"email": "signer1@example.com",
				"has_accepted_terms": true,
				"verification_method": "Email",
				"notification_methods": ["Email"]
			}
		],
		"items": [
			{
				"id": "615606efcde1a39c9d21e30e",
				"page": {
					"id": "615213ed81b071f4293b2fc2",
					"number": 1,
					"height": 2100,
					"width": 1275,
					"download_url": "https://api.assinafy.com.br/v1/documents/615213edf8a58f132e1b2384/pages/615213ed81b071f4293b2fc2/download"
				},
				"signer": {
					"id": "<signer-id>",
					"full_name": "Example Signer",
					"email": "signer@example.com",
					"has_accepted_terms": true
				},
				"field": { "id": "6152120297080d55bdd13197", "name": "Signature", "type": "signature" },
				"display_settings": {
					"top": 285,
					"left": 639,
					"width": 501,
					"height": 27.34,
					"fontSize": 18,
					"fontFamily": "Arial",
					"backgroundColor": "rgb(195, 230, 203)"
				},
				"value": null,
				"completed": false
			}
		],
		"summary": {
			"signer_count": 2,
			"completed_count": 1,
			"signers": [{ "id": "customid1", "completed": true }]
		},
		"signing_urls": [{ "signer_id": "customid1", "url": "https://api.assinafy.com.br/v1/sign/abc" }]
	},
	"artifacts": {
		"original": "https://api.assinafy.com.br/v1/documents/3/download/original",
		"certificated": "https://api.assinafy.com.br/v1/documents/3/download/certificated",
		"certificate-page": "https://api.assinafy.com.br/v1/documents/3/download/certificate-page",
		"bundle": "https://api.assinafy.com.br/v1/documents/3/download/bundle"
	},
	"pages": [
		{
			"id": "615213ed81b071f4293b2fc2",
			"number": 1,
			"height": 2100,
			"width": 1275,
			"download_url": "https://api.assinafy.com.br/v1/documents/615213edf8a58f132e1b2384/pages/615213ed81b071f4293b2fc2/download"
		}
	],
	"created_at": "2026-08-20T12:00:00Z",
	"updated_at": "2026-08-20T12:00:00Z",
	"current_signer": {
		"id": "<signer-id>",
		"full_name": "Example Signer",
		"email": "signer@example.com",
		"has_accepted_terms": true,
		"verification_method": "Email",
		"notification_methods": ["Email"]
	}
}
```

> Note: May return `409 Conflict` ("The document is not ready to be viewed yet.") during the brief window before metadata processing finishes — retry with backoff.

#### List notifications sent for this assignment via WhatsApp

Lists the WhatsApp notification messages sent for an assignment, including the rendered header, body, and buttons. The SDK wraps the array under a `notifications` key.

**Endpoint:** `GET /documents/{documentId}/assignments/{assignmentId}/whatsapp-notifications`

**Node parameters:**

- Document — resource locator — required.
- Assignment ID — string — required.

**Example response:**

```json
{
	"notifications": [
		{
			"sent_at": 1710000000,
			"header": "Documento para assinatura: Contrato de Servico",
			"body": "Oi, Maria.\n\nJoao Silva enviou um documento para voce revisar e assinar.\n\nMensagem:\nPor favor assine o contrato\n\nPara acessar o documento, toque em \"Abrir documento\".",
			"buttons": [{ "text": "Abrir documento" }],
			"phone_number": "+5511999990001",
			"signer_id": "a51edaee68a7"
		}
	]
}
```

When no WhatsApp notifications have been sent, the node returns `{ "notifications": [] }`.

#### Resend the signing notification to a signer

Resends the signing-request notification (link) to one signer, using the notification methods configured when the assignment was created.

**Endpoint:** `PUT /documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/resend`

**Node parameters:**

- Document — resource locator — required.
- Assignment ID — string — required.
- Signer ID — string — required.

**Request body:** none.

**Example response:**

```json
{
	"is_sent": true,
	"document_id": "c57d51eaad68a7",
	"signer_id": "a51edaee68a7"
}
```

> Note: Notification pricing can change, so call **Estimate Resend Cost** immediately before resending instead of hard-coding a credit value. Resending to a signer in a not-yet-activated step is rejected with a `400`.

#### Update the expiration date of an assignment

Sets a new expiration date for an assignment.

**Endpoint:** `PUT /documents/{documentId}/assignments/{assignmentId}/reset-expiration`

**Node parameters:**

- Document — resource locator — required.
- Assignment ID — string — required.
- Expires At — dateTime — required — new ISO8601 expiration date.

**Example request:**

```json
{
	"expires_at": "2030-08-03T21:00:00Z"
}
```

**Example response:**

```json
{
	"resource": "assignment",
	"id": "1",
	"expires_at": "2030-08-03T21:00:00Z",
	"method": "virtual",
	"signers": [
		{
			"id": "customid1",
			"full_name": "Signer 1",
			"email": "signer1@example.com",
			"has_accepted_terms": false
		}
	],
	"items": [
		{
			"id": "1",
			"page": {
				"id": "1",
				"number": 1,
				"height": 1,
				"width": 1,
				"download_url": "https://api.assinafy.com.br/v1/documents/1/pages/1/download"
			},
			"signer": {
				"id": "customid1",
				"full_name": "Signer 1",
				"email": "signer1@example.com",
				"has_accepted_terms": false
			},
			"field": null,
			"display_settings": "",
			"value": "",
			"completed": true
		}
	],
	"summary": {
		"signer_count": 2,
		"completed_count": 1,
		"signers": [
			{
				"id": "customid1",
				"full_name": "Signer 1",
				"email": "signer1@example.com",
				"has_accepted_terms": false,
				"completed": true
			},
			{
				"id": "customid2",
				"full_name": "Signer 2",
				"email": "signer2@example.com",
				"has_accepted_terms": false,
				"completed": false
			}
		]
	}
}
```

#### Signer submits values for collect method input fields

Signer-side sign: submits values for the signer's collect-method input items, authenticated by the per-signer access code passed as a query param (no account auth; SDK uses `skipAuth`). The request body is the raw JSON array of items.

**Endpoint:** `POST /documents/{documentId}/assignments/{assignmentId}`

**Node parameters:**

- Signer Access Code — string (password) — required.
- Document — resource locator — required.
- Assignment ID — string — required.
- Items (JSON) — json — required — non-empty array of `{ itemId, fieldId, pageId, value }`.

**Example request (query + body):**

```json
{
	"query": { "signer-access-code": "<signer-access-code>" },
	"body": [
		{
			"itemId": "615606efcde1a39c9d21e30e",
			"fieldId": "6152120297080d55bdd13197",
			"pageId": "615213ed81b071f4293b2fc2",
			"value": "Signed by Example Signer"
		}
	]
}
```

**Example response:**

```json
{}
```

> Note: For virtual assignments the signer must first confirm their data (`PUT /documents/{documentId}/signers/confirm-data`) or signing fails with `400` ("Signer data must be confirmed before signing."). May also return `409` while the document is not yet ready to sign. A `DigitalCertificate` signer cannot use this operation and must finish through Assinafy's ICP-Brasil browser signing flow.

#### Signer declines to sign the document

Signer-side decline (reject): the signer declines the assignment with a reason, authenticated by the access code query param (no account auth; SDK uses `skipAuth`).

**Endpoint:** `PUT /documents/{documentId}/assignments/{assignmentId}/reject`

**Node parameters:**

- Signer Access Code — string (password) — required.
- Document — resource locator — required.
- Assignment ID — string — required.
- Decline Reason — string — required — descriptive reason for declining.

**Example request (query + body):**

```json
{
	"query": { "signer-access-code": "<signer-access-code>" },
	"body": { "decline_reason": "I do not agree with clause 2." }
}
```

**Example response:**

```json
{ "data": [] }
```

> Note: A working **cancel** operation does not exist in this API (all candidate paths return 404), so it is intentionally not exposed by this node.

---

### Template

#### List workspace templates

Lists templates in the workspace and supports pagination (return all or limited) via the shared list handler. The node exposes `search`, `status`, `tags`, and `sort` query controls.

**Endpoint:** `GET /accounts/{accountId}/templates`

**Node parameters:**

- Return All — boolean — optional — if true, paginates through every result; otherwise the Limit applies.
- Limit — number — optional (shown only when Return All is false) — max number of results to return.
- Filters — collection — optional, containing:
  - Search — string — optional — partial match on the template name.
  - Status — options — optional — one of `failed`, `processing`, `ready`, `uploaded`, `uploading`, or Any (empty = no filter).
  - Tag IDs — string (multiple values) — optional — tag IDs joined into a comma-separated `tags` query param.
  - Sort — string — optional — for example `name` or `updated_at`.

**Example request:**

```json
{
	"query": {
		"search": "contract"
	}
}
```

When selected, `status`, comma-joined `tags`, and `sort` are forwarded as query parameters.

**Example response:**

```json
[
	{
		"id": "fa7f3e524f3a2cc00a5ea4325e2",
		"name": "sample-contract-one-page.pdf",
		"document_name": "sample-contract-one-page.pdf",
		"message": null,
		"status": "ready",
		"pages": [
			{
				"id": "fa7f3e528d77f2b3ed786df2ce0",
				"number": 1,
				"height": 2100,
				"width": 1275,
				"download_url": "https://api.assinafy.com.br/v1/accounts/1a/templates/fa7f3e524f3a2cc00a5ea4325e2/pages/fa7f3e528d77f2b3ed786df2ce0/download",
				"fields": []
			}
		],
		"roles": [
			{
				"id": "fa7f3e525bfefc71df3701eac6f",
				"name": "Editor",
				"assignment_type": "Editor",
				"created_at": "2024-07-19T15:23:03Z",
				"updated_at": "2024-07-19T15:23:03Z"
			}
		],
		"tags": [{ "id": "fa8c09f3e709a8a1c82d69b1454", "name": "HR" }],
		"created_at": "2024-07-19T15:23:03Z",
		"updated_at": "2024-07-19T15:23:03Z"
	}
]
```

The list endpoint returns an array of template objects (paginated via `X-Pagination-*` headers, which the list handler follows when Return All is enabled). The `default_document_tags` field is omitted here to keep list responses compact; it appears only in the single-template Get response.

#### Get a template

Retrieves a single template by ID, including its pages, roles, field placements, and tags.

**Endpoint:** `GET /accounts/{accountId}/templates/{templateId}`

**Node parameters:**

- Template ID — resourceLocator — required — template selected from a searchable list or entered by ID.

**Example response:**

```json
{
	"resource": "template",
	"id": "fa7f3e524f3a2cc00a5ea4325e2",
	"name": "sample-contract-one-page.pdf",
	"document_name": "sample-contract-one-page.pdf",
	"message": null,
	"status": "ready",
	"pages": [
		{
			"id": "fa7f3e528d77f2b3ed786df2ce0",
			"number": 1,
			"height": 2100,
			"width": 1275,
			"download_url": "https://api.assinafy.com.br/v1/accounts/1a/templates/fa7f3e524f3a2cc00a5ea4325e2/pages/fa7f3e528d77f2b3ed786df2ce0/download",
			"fields": [
				{
					"id": "fa7f3e52aa11bb22cc33dd44ee5",
					"field_id": "fa7f3e52ff00112233445566778",
					"role_id": "fa7f3e525bfefc71df3701eac6f",
					"label": "Full Name",
					"display_settings": null,
					"created_at": "2024-07-19T15:23:03Z",
					"updated_at": "2024-07-19T15:23:03Z"
				}
			]
		}
	],
	"roles": [
		{
			"id": "fa7f3e525bfefc71df3701eac6f",
			"name": "Editor",
			"assignment_type": "Editor",
			"created_at": "2024-07-19T15:23:03Z",
			"updated_at": "2024-07-19T15:23:03Z"
		}
	],
	"tags": [{ "id": "fa8c09f3e709a8a1c82d69b1454", "name": "HR" }],
	"default_document_tags": [{ "id": "fa8c09f3e709a8a1c82d69b1454", "name": "HR" }],
	"created_at": "2024-07-19T15:23:03Z",
	"updated_at": "2024-07-19T15:23:03Z"
}
```

The single-template response additionally includes `default_document_tags` (tags automatically applied to every document created from this template), which is absent from the List response.

---

### Tag

#### Create a workspace tag

Creates a new workspace-scoped tag that can later be attached to documents and templates.

**Endpoint:** `POST /accounts/{accountId}/tags`

**Node parameters:**

- Name — string — required — Tag display name, max 64 characters; Assinafy trims and collapses whitespace. Commas are allowed and have no special meaning in this single-name body. Returns 409 if a tag with the same name (case-insensitive) already exists.
- Color — color (hex) — optional — 6-character hex color, with or without the leading `#`. Normalized by the SDK; omitted from the request body when empty.

**Example request:**

```json
{
	"name": "Contracts",
	"color": "ff8800"
}
```

**Example response:**

```json
{
	"resource": "tag",
	"id": "1031...",
	"name": "sdk-example-tag",
	"color": "ff8800",
	"created_at": "2026-05-14T12:00:00Z",
	"updated_at": "2026-05-14T12:00:00Z"
}
```

#### List workspace tags

Lists the tags in the workspace, ordered alphabetically by name.

**Endpoint:** `GET /accounts/{accountId}/tags`

**Node parameters:**

- Return All — boolean — optional — Return every tag (auto-paginates) instead of a limited page.
- Limit — number — optional (shown when Return All is off) — Max results to return, 1–100, default 50.
- Filters — collection — optional — Contains:
  - Search — string — optional — Case-insensitive substring filter applied to the tag name (sent as the `search` query param).

**Example request:**

```json
{
	"search": "contract"
}
```

**Example response:**

```json
[
	{
		"id": "1031...",
		"name": "sdk-example-tag",
		"color": "ff8800",
		"created_at": "2026-05-14T12:00:00Z",
		"updated_at": "2026-05-14T12:00:00Z"
	}
]
```

#### Update a workspace tag

Updates a tag's name and/or color. Existing document and template attachments are preserved; only the tag's own attributes change.

**Endpoint:** `PUT /accounts/{accountId}/tags/{tagId}`

**Node parameters:**

- Tag — resourceLocator — required — The tag to update, selected from a searchable list (`getTags`) or by ID.
- Update Fields — collection — optional — Contains:
  - Name — string — optional — New display name (trimmed). Commas are allowed. Omit to leave unchanged.
  - Color — color (hex) — optional — New 6-character hex color, with or without the leading `#`.
  - Clear Color — boolean — optional — When true, clears the existing color (sends `color: null`).

Notes: At least one update field must be provided or the node errors before calling the API. Setting both Color and Clear Color is rejected with a node error. Returns 409 if another tag already uses the new name (case-insensitive).

**Example request:**

```json
{
	"name": "Sales Contracts",
	"color": "112233"
}
```

To clear the color instead:

```json
{
	"name": "Sales Contracts",
	"color": null
}
```

**Example response:**

```json
{
	"resource": "tag",
	"id": "1031...",
	"name": "Sales Contracts",
	"color": "112233",
	"created_at": "2026-05-14T12:00:00Z",
	"updated_at": "2026-05-14T13:00:00Z"
}
```

#### Delete a workspace tag

Deletes a tag from the workspace. By default fails with 409 if the tag is still attached to any document or template.

**Endpoint:** `DELETE /accounts/{accountId}/tags/{tagId}`

**Node parameters:**

- Tag — resourceLocator — required — The tag to delete, selected from a searchable list (`getTags`) or by ID.
- Force — boolean — optional — When true, detaches the tag from all documents and templates before deleting it (sent as `force=true`); the documents and templates themselves are not deleted. Defaults to false.

**Example request:** (query params, no body)

```json
{
	"force": true
}
```

**Example response:** The SDK does not return the raw API body (`{ "deleted": true }`); it synthesizes and returns a confirmation object:

```json
{
	"deleted": true,
	"tagId": "1031...",
	"force": true
}
```

---

### Field Definition

#### Create a field definition

Creates a new workspace field definition (custom input field) in the account.

**Endpoint:** `POST /accounts/{accountId}/fields`

**Node parameters:**

- Type — string — required — Input type code (use List Types to discover allowed values).
- Name — string — required — Display label shown to signers.
- Additional Fields — collection — optional:
  - Regex — string — optional — Regular expression to validate text inputs (effective only for text types).
  - Is Required — boolean — optional — Defaults to true.
  - Is Active — boolean — optional — Defaults to true.

**Example request:**

```json
{
	"type": "text",
	"name": "sdk-example-field",
	"is_required": true,
	"is_active": true
}
```

**Example response:**

```json
{
	"resource": "field_definition",
	"id": "1031...",
	"name": "sdk-example-field",
	"type": "text",
	"regex": null,
	"is_pre_defined": false,
	"is_active": true,
	"is_required": true,
	"is_standard": false,
	"is_read_only": false,
	"is_visible": true
}
```

#### Delete a field definition

Deletes a field definition. A field definition already used in a document cannot be deleted.

**Endpoint:** `DELETE /accounts/{accountId}/fields/{fieldId}`

**Request body:** none.

**Node parameters:**

- Field ID — string — required — ID of the field definition to delete.

**Example response:**

```json
{
	"deleted": true,
	"fieldId": "1031..."
}
```

The API returns an empty `data: []`; the SDK synthesizes the `{ deleted, fieldId }` object shown above.

#### Get a field definition

Retrieves a single field definition by ID.

**Endpoint:** `GET /accounts/{accountId}/fields/{fieldId}`

**Node parameters:**

- Field ID — string — required — ID of the field definition to retrieve.

**Example response:**

```json
{
	"resource": "field_definition",
	"id": "63cfe123880b1ba571a97916",
	"name": "Field Name",
	"type": "text",
	"regex": null,
	"is_active": true,
	"is_required": true,
	"is_standard": false,
	"is_read_only": false,
	"is_visible": true
}
```

#### List workspace field definitions

Lists the field definitions in the workspace. The SDK returns them wrapped under a `fields` key.

**Endpoint:** `GET /accounts/{accountId}/fields`

**Node parameters:**

- Filters — collection — optional:
  - Include Inactive — boolean — optional — Return inactive records too (default false).
  - Include Standard — boolean — optional — Include standard fields (signature, initial, signatureDate); default false.

**Example request:**

```json
{
	"include_inactive": false,
	"include_standard": false
}
```

(Sent as query string; empty values are stripped, while explicit `false` values are forwarded.)

**Example response:**

```json
{
	"fields": [
		{
			"id": "64a7584106d7e3ded274da11",
			"name": "Name",
			"type": "personName",
			"regex": null,
			"is_pre_defined": true,
			"is_active": true,
			"is_required": false,
			"is_standard": false,
			"is_read_only": false,
			"is_visible": true
		},
		{
			"id": "64a758410c5a5df8d07256b5",
			"name": "CPF",
			"type": "cpf",
			"regex": null,
			"is_pre_defined": true,
			"is_active": true,
			"is_required": false,
			"is_standard": false,
			"is_read_only": false,
			"is_visible": true
		}
	]
}
```

#### List allowed input types

Lists the input type codes available for field definitions. This is a non-account-scoped endpoint. The SDK returns the list wrapped under a `types` key.

Validation rules include: `cpf` expects 11 digits; `cnpj` accepts 14 characters, with A–Z allowed in positions 1–12 and numeric check digits in positions 13–14. Punctuation is ignored during validation.

**Endpoint:** `GET /field-types`

**Node parameters:** none.

**Example response:**

```json
{
	"types": [
		{ "type": "personName", "name": "Nome" },
		{ "type": "cpf", "name": "CPF" },
		{ "type": "text", "name": "Texto" }
	]
}
```

#### Update a field definition

Updates one or more attributes of an existing field definition. At least one update field must be provided.

**Endpoint:** `PUT /accounts/{accountId}/fields/{fieldId}`

**Node parameters:**

- Field ID — string — required — ID of the field definition to update.
- Update Fields — collection — optional (at least one required):
  - Is Active — boolean — optional.
  - Is Required — boolean — optional.
  - Name — string — optional.
  - Regex — string — optional.
  - Type — string — optional.

**Example request:**

```json
{
	"name": "New Field Name"
}
```

**Example response:**

```json
{
	"resource": "field_definition",
	"id": "63cfe0e0fdc4e3aeb74783d7",
	"name": "New Field Name",
	"type": "text",
	"regex": null,
	"is_active": true,
	"is_required": true,
	"is_standard": false,
	"is_read_only": false,
	"is_visible": true
}
```

#### Validate a value against a field definition

Validates a single value against a field definition using the configured account authentication. A signer access code may additionally be sent as the `signer-access-code` query parameter; providing it does not remove the configured API authentication.

**Endpoint:** `POST /accounts/{accountId}/fields/{fieldId}/validate`

**Node parameters:**

- Field ID — string — required — ID of the field definition to validate against.
- Signer Access Code — string (password) — optional — adds signer context through the query string.
- Value — string — required — Value to validate against the field definition.

**Example request:**

```json
{
	"value": "400.676.228-36"
}
```

When supplied, the access code is appended as `?signer-access-code=<signer-access-code>` while account authentication is retained.

**Example response:**

```json
{
	"type": "text",
	"success": true,
	"error_message": ""
}
```

#### Validate multiple values at once

Validates multiple `{field_id, value}` pairs in a single request. It uses the same authenticated request plus optional `signer-access-code` behavior as Validate. The node returns the results wrapped under a `results` key.

**Endpoint:** `POST /accounts/{accountId}/fields/validate-multiple`

**Node parameters:**

- Signer Access Code — string (password) — optional — adds signer context through the query string.
- Items (JSON) — json — required — Array of `{ "field_id": "...", "value": "..." }` objects (must be a non-empty array).

**Example request:**

```json
[
	{ "field_id": "63488ffb7adf435aba319787", "value": "1111111111111" },
	{ "field_id": "63488ffb0461cebb70775497", "value": "user@example.com" }
]
```

When supplied, the access code is appended as `?signer-access-code=<signer-access-code>` and account authentication is retained. The request body is the bare JSON array (not wrapped in an object).

**Example response:**

```json
{
	"results": [
		{
			"field_id": "63488ffb7adf435aba319787",
			"type": "cpf",
			"success": false,
			"error_message": "Invalid CPF."
		},
		{
			"field_id": "63488ffb0461cebb70775497",
			"type": "email",
			"success": true,
			"error_message": ""
		}
	]
}
```

---

### Webhook

The Webhook resource manages the account's single webhook subscription (Assinafy allows exactly one subscription per account), inspects the available event catalog, and reviews/retries delivery history. All account-scoped paths use the Account ID from the credential.

#### Register Subscription

Registers or replaces the account's webhook subscription. Assinafy supports only one subscription per account, so this `PUT` always overwrites the existing one.

**Endpoint:** `PUT /accounts/{accountId}/webhooks/subscriptions`

**Node parameters:**

- URL — string — required — absolute HTTPS endpoint that will receive event POSTs (e.g. `https://example.com/hooks/assinafy`). HTTP is accepted only for `localhost`, `127.0.0.1`, or `::1`. The node rejects relative URLs, embedded user information, and fragments.
- Notification Email — string — required — address contacted if webhook deliveries start failing.
- Events — multiOptions — optional — event types to subscribe to. If left empty, the SDK falls back to the default set (`document_ready`, `document_prepared`, `signer_signed_document`, `signer_rejected_document`, `document_processing_failed`).
- Is Active — boolean — optional — whether delivery is active (default `true`).

Available event values: `assignment_created`, `document_metadata_ready`, `document_prepared`, `document_processing_failed`, `document_ready`, `document_uploaded`, `signature_requested`, `signer_created`, `signer_data_confirmed`, `signer_email_verified`, `signer_rejected_document`, `signer_signed_document`, `signer_viewed_document`, `signer_whatsapp_verified`, `template_created`, `template_processed`, `template_processing_failed`, `user_rejected_document`.

**Example request:**

```json
{
	"url": "https://example.com/hooks/assinafy",
	"email": "ops@example.com",
	"events": ["document_ready", "document_prepared"],
	"is_active": true
}
```

**Example response:**

```json
{
	"events": ["document_ready", "document_prepared"],
	"is_active": true,
	"url": "https://example.com/hooks/assinafy",
	"email": "ops@example.com",
	"updated_at": "2023-05-10T14:58:24Z"
}
```

#### Get Subscription

Retrieves the account's current webhook subscription.

**Endpoint:** `GET /accounts/{accountId}/webhooks/subscriptions`

**Node parameters:** none.

**Example response:**

```json
{
	"events": ["document_ready", "document_prepared"],
	"is_active": false,
	"url": "https://example.com/test",
	"email": "sdk@example.com",
	"updated_at": "2023-05-10T14:58:24Z"
}
```

If no subscription has ever been registered the API returns a sentinel (`{"events":[],"url":null,"email":null,"is_active":true}`); the SDK treats this (and a `404`) as "no subscription" and instead returns:

```json
{ "subscribed": false }
```

#### Inactivate Subscription

Pauses the webhook subscription without deleting it. While inactive, no events are delivered.

**Endpoint:** `PUT /accounts/{accountId}/webhooks/inactivate`

**Node parameters:** none.

**Request body:** none.

**Example response:**

```json
{
	"events": ["document_ready", "document_prepared"],
	"is_active": false,
	"url": "https://example.com/test",
	"email": "sdk@example.com",
	"updated_at": "2023-05-10T14:58:24Z"
}
```

> To stop receiving events, use **Inactivate Subscription**. There is no separate delete operation for the subscription.

#### List Event Types

Lists the webhook event types exposed by the API (catalog of subscribable events with descriptions). This is a global endpoint and not account-scoped.

**Endpoint:** `GET /webhooks/event-types`

**Node parameters:** none.

**Example response:** the SDK wraps the array under an `eventTypes` key:

```json
{
	"eventTypes": [
		{
			"id": "document_uploaded",
			"description": "Triggered when the User has uploaded a Document"
		},
		{
			"id": "document_prepared",
			"description": "Triggered when the User as subject prepares a Document."
		},
		{
			"id": "document_ready",
			"description": "Triggered when the last Signer of the assignment signs the Document, as a result, the document status becomes ready."
		}
	]
}
```

#### List Dispatches

Lists the webhook delivery history (each delivery attempt, its payload, and the outcome) for the account. Supports n8n pagination via Return All / Limit, and forwards filters as query params.

**Endpoint:** `GET /accounts/{accountId}/webhooks`

**Node parameters:**

- Return All — boolean — optional — return all results, paging automatically (default `false`).
- Limit — number — optional — max results when Return All is off (default 50).
- Filters — collection — optional, with options:
  - Event — options — optional — filter by event type (`Any` / one of the catalog values).
  - Delivered — options — optional — `Any`, `Delivered` (`true`), or `Not Delivered` (`false`).
  - From (Unix Timestamp) — number — optional — only dispatches after this time.
  - To (Unix Timestamp) — number — optional — only dispatches before this time.

Empty filter values are stripped; `from`/`to` are dropped when zero before being sent.

**Example request (query):**

```json
{
	"event": "document_ready",
	"delivered": "false",
	"from": 1705312000,
	"to": 1705320000
}
```

**Example response:**

```json
[
	{
		"id": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
		"event": "document_ready",
		"activity_id": 456,
		"endpoint": "https://example.com/webhook",
		"payload": {
			"id": 456,
			"event": "document_ready",
			"message": "The document is ready.",
			"payload": null,
			"origin": null,
			"created_at": 1787227200,
			"subject": {
				"resource": "account",
				"id": "<account-id>",
				"name": "Example Workspace",
				"type": "Account"
			},
			"object": {
				"resource": "document",
				"id": "abc123",
				"name": "contract.pdf",
				"type": "Document"
			},
			"account_id": "<account-id>"
		},
		"delivered": true,
		"http_status": 200,
		"response_body": "OK",
		"error": null,
		"created_at": "2026-08-20T12:30:00Z",
		"updated_at": "2026-08-20T12:30:00Z"
	}
]
```

When no delivery history exists, this operation returns no output items.

#### Retry Dispatch

Retries delivery of a specific webhook dispatch entry without waiting for automatic retries. Returns the newly created dispatch entry.

**Endpoint:** `POST /accounts/{accountId}/webhooks/{dispatchId}/retry`

**Node parameters:**

- Dispatch ID — string — required — the ID of the webhook dispatch entry to retry.

**Request body:** none.

**Example response:**

```json
{
	"resource": "activity_dispatching_history",
	"id": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
	"event": "document_ready",
	"activity_id": 456,
	"endpoint": "https://example.com/webhook",
	"payload": {
		"id": 456,
		"event": "document_ready",
		"message": "The document is ready.",
		"payload": null,
		"origin": null,
		"created_at": 1787227200,
		"subject": {
			"resource": "account",
			"id": "<account-id>",
			"name": "Example Workspace",
			"type": "Account"
		},
		"object": {
			"resource": "document",
			"id": "abc123",
			"name": "contract.pdf",
			"type": "Document"
		},
		"account_id": "<account-id>"
	},
	"delivered": true,
	"http_status": 200,
	"response_body": "OK",
	"error": null,
	"created_at": "2026-08-20T12:30:00Z",
	"updated_at": "2026-08-20T12:30:00Z"
}
```

Note: a retry fails with `404` if the entry does not belong to the account, or `400` if the subscription is inactive or the event type is not subscribed.

### Webhook delivery payloads

Assinafy sends each subscribed event to the registered URL with this delivery contract:

| Property              | Contract                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method and media type | `POST` with `Content-Type: application/json` and `Connection: close`                                                                                      |
| Success               | Any `2xx` response                                                                                                                                        |
| Attempts              | At most two per event: the initial attempt plus one retry                                                                                                 |
| Retry delay           | 3 seconds                                                                                                                                                 |
| Circuit breaker       | After 10 consecutive failed events, normal delivery pauses and about 5% of events are probed until one succeeds. **Retry Dispatch** can force redelivery. |
| Response capture      | The first 2,000 characters of the endpoint response body are stored in dispatch history.                                                                  |

Non-`2xx` responses, connection failures, and timeouts count as failed deliveries. Use the top-level integer `id` as a deduplication key because an event can be delivered more than once.

Every webhook body has this complete common envelope; only `payload`, `subject`, and `object` vary by event:

```json
{
	"id": 456,
	"event": "document_uploaded",
	"message": "A user uploaded a document.",
	"payload": null,
	"origin": {
		"ip": "203.0.113.10",
		"user-agent": "Assinafy"
	},
	"created_at": 1787227200,
	"subject": {
		"id": "<user-id>",
		"name": "Example User",
		"email": "user@example.com",
		"telephone": null,
		"government_id": null,
		"is_email_verified": true,
		"has_accepted_terms": true,
		"created_at": "2026-08-01T12:00:00Z",
		"to_be_deleted_at": null,
		"type": "User"
	},
	"object": {
		"resource": "document",
		"id": "<document-id>",
		"account_id": "<account-id>",
		"template_id": null,
		"name": "contract.pdf",
		"status": "uploaded",
		"artifacts": {},
		"is_closed": false,
		"signing_url": "https://app.assinafy.com.br/sign/<document-id>",
		"decline_reason": null,
		"declined_by": null,
		"tags": [],
		"assignment": null,
		"pages": [],
		"created_at": "2026-08-20T12:00:00Z",
		"updated_at": "2026-08-20T12:00:00Z",
		"type": "Document"
	},
	"account_id": "<account-id>"
}
```

`message`, `payload`, and `origin` may be `null`. `created_at` is Unix seconds, unlike the ISO 8601 timestamps on REST resources. `subject` and `object` are polymorphic: `type` is `User`, `Signer`, `Account`, `Document`, or `Template`; their remaining fields are the matching REST schema in the [shared catalog](#shared-schema-catalog). The object includes expanded relationships such as a document's assignment and pages, while the subject carries base fields. An Account's internal `integration` property is always removed. System processing events use the Account as subject.

The event-specific contract is:

| Event                        | Subject | Object   | `payload` keys                                                                                          |
| ---------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `document_uploaded`          | User    | Document | none                                                                                                    |
| `document_metadata_ready`    | User    | Document | none                                                                                                    |
| `document_prepared`          | User    | Document | none                                                                                                    |
| `assignment_created`         | User    | Document | `user_name`, `user_email`, `user_telephone`                                                             |
| `document_ready`             | Account | Document | none                                                                                                    |
| `document_processing_failed` | Account | Document | `error_message`                                                                                         |
| `signature_requested`        | User    | Document | `signer_email`, `signer_full_name`, or `signer_whatsapp_phone_number`, depending on notification method |
| `signer_created`             | User    | Signer   | `signer_full_name`                                                                                      |
| `signer_email_verified`      | Signer  | Document | `signer_email`                                                                                          |
| `signer_whatsapp_verified`   | Signer  | Document | `signer_whatsapp_phone_number`                                                                          |
| `signer_data_confirmed`      | Signer  | Document | `signer_email`                                                                                          |
| `signer_viewed_document`     | Signer  | Document | `signer_full_name`                                                                                      |
| `signer_signed_document`     | Signer  | Document | `signer_full_name`                                                                                      |
| `signer_rejected_document`   | Signer  | Document | `signer_full_name`                                                                                      |
| `user_rejected_document`     | User    | Document | `user_name`                                                                                             |
| `template_created`           | User    | Template | none                                                                                                    |
| `template_processed`         | User    | Template | none                                                                                                    |
| `template_processing_failed` | Account | Template | `error_message`                                                                                         |

`assignment_created` and `document_metadata_ready` have no guaranteed ordering: virtual assignments may emit `assignment_created` first. Treat unknown fields and events as forward-compatible additions.

The **Assinafy Trigger** registers an HTTPS delivery URL carrying a mandatory `assinafy-token` query parameter. HTTP is accepted only for loopback development hosts. The token is derived from the credential Webhook Secret, or from the API key when the Webhook Secret is empty; users do not enter it manually. Incoming requests without the matching token are rejected before workflow output is created.

On workflow deactivation, the trigger reads the current subscription and requests inactivation only after its secured URL, notification email, active state, and event set match. Assinafy's inactivate endpoint is unconditional, so do not replace the account subscription concurrently with workflow deactivation.

After token authentication, the trigger emits one n8n item and does not reshape the delivery body. This compact output example abbreviates `body`; its complete schema is the envelope above:

```json
{
	"event": "signer_signed_document",
	"headers": {
		"content-type": "application/json",
		"x-assinafy-signature": "[REDACTED]"
	},
	"body": { "event": "signer_signed_document", "payload": { "signer_full_name": "Example Signer" } }
}
```

The trigger resolves `event` from `body.event` (or `body.type`), redacts authentication, cookie, token, secret, API-key, and signature headers, and preserves the parsed `body`. Optional HMAC-SHA256 verification requires the credential Webhook Secret and validates `X-Assinafy-Signature` against the raw request body. It fails closed when the header, raw body, or matching secret is unavailable.

---

### Signer Document (signer-side)

Signer-link operations never send the workspace API key (`skipAuth`). Get Current, List, Search, Sign Multiple, and Decline Multiple require the per-signer access code from the email/WhatsApp link as the `signer-access-code` query parameter. Download is public; its optional access code is omitted when blank.

#### Signer reads the document tied to the active access code

Retrieves the single document bound to the signer's access code (page content omitted). Useful right after the signer opens the link, before code verification.

**Endpoint:** `GET /signers/{signerId}/document`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer access code from the email/WhatsApp link.
- Signer ID — string — required — the signer ID bound to the access code.

**Example request:** (query only)

```json
{
	"signer-access-code": "<signer-access-code>"
}
```

**Example response:**

```json
{
	"id": "6981dbd199996981d",
	"account_id": "<account-id>",
	"name": "my_document.pdf",
	"status": "metadata_ready",
	"artifacts": {
		"original": "https://api.assinafy.com.br/v1/documents/doc1/download/original",
		"thumbnail": "https://api.assinafy.com.br/v1/documents/doc1/thumbnail"
	},
	"is_closed": false,
	"signing_url": "%ui_base_url%/sign/doc1",
	"decline_reason": null,
	"declined_by": null,
	"created_at": "2023-07-21T13:43:17Z",
	"updated_at": "2023-07-21T13:43:17Z",
	"current_signer": {
		"id": "62d6ee35c7741ca4006b9e11",
		"full_name": "Signer Name",
		"email": "signer@example.com",
		"has_accepted_terms": false,
		"verification_method": "Email",
		"notification_methods": ["Email"]
	},
	"assignment": {
		"id": "1",
		"sender_email": "sender@example.com",
		"method": "virtual",
		"expires_at": null,
		"message": null,
		"items": [
			{
				"id": "dbd199996981d",
				"signer": {
					"id": "<signer-id>",
					"full_name": "Example Signer",
					"email": "signer@example.com",
					"has_accepted_terms": false
				},
				"field": { "id": "dbd199996981d", "name": "Assinatura", "type": "virtual" },
				"display_settings": "",
				"value": "",
				"completed": false
			}
		]
	}
}
```

#### Signer lists their visible documents

Lists the documents visible to the signer and returns one n8n item per document. The node supports pagination and forwards optional `status`, `method`, `search`, and `sort` query controls.

**Endpoint:** `GET /signers/{signerId}/documents`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer access code.
- Signer ID — string — required — the signer ID.
- Return All — boolean — optional — fetch every response page.
- Limit — number — optional (shown when Return All is off) — maximum documents to return.
- Filters — collection — optional; empty values are stripped before sending:
  - Status — string — optional — document status code to filter by (e.g. `pending_signature`).
  - Method — options (Any / `virtual` / `collect`) — optional — signature method filter.
  - Search — string — optional — partial match on `document.name`, `signer.full_name`, `signer.email`.
  - Sort — string — optional — sort by `name` or `updated_at`.

**Example request:** (query only)

```json
{
	"signer-access-code": "<signer-access-code>",
	"page": 1,
	"per-page": 50
}
```

**Example response:** (unwrapped `data` array; one document shown)

```json
[
	{
		"id": "6981dbd199996981d",
		"account_id": "<account-id>",
		"name": "my_document.pdf",
		"status": "metadata_ready",
		"assignment": {
			"id": "1",
			"sender_email": "sender@example.com",
			"method": "virtual",
			"expires_at": null,
			"message": null,
			"signers": [
				{
					"id": "<signer-id-1>",
					"full_name": "Example Signer One",
					"email": "signer-one@example.com",
					"has_accepted_terms": false
				},
				{
					"id": "<signer-id-2>",
					"full_name": "Example Signer Two",
					"email": "signer-two@example.com",
					"has_accepted_terms": false
				}
			],
			"summary": {
				"signer_count": 2,
				"completed_count": 1,
				"signers": [
					{
						"id": "<signer-id-1>",
						"full_name": "Example Signer One",
						"email": "signer-one@example.com",
						"has_accepted_terms": false,
						"completed": true
					},
					{
						"id": "<signer-id-2>",
						"full_name": "Example Signer Two",
						"email": "signer-two@example.com",
						"has_accepted_terms": false,
						"completed": false
					}
				]
			}
		},
		"artifacts": {
			"original": "https://api.assinafy.com.br/v1/documents/doc1/download/original",
			"thumbnail": "https://api.assinafy.com.br/v1/documents/doc1/thumbnail"
		},
		"is_closed": false,
		"decline_reason": null,
		"declined_by": null,
		"created_at": "2023-07-21T13:43:17Z",
		"updated_at": "2023-07-21T13:43:17Z"
	}
]
```

#### Search signer-visible documents

Performs the dedicated lightweight search for documents visible to one signer. The access code authorizes the signer-facing route; the search term is optional. The node emits one n8n item per result.

**Endpoint:** `GET /signers/{signerId}/documents/search`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer code from the email/WhatsApp link.
- Signer ID — string — required — signer whose visible documents are searched.
- Search — string — optional — text matched by the API against signer-visible documents.

**Example request (query):**

```json
{
	"signer-access-code": "<signer-access-code>",
	"search": "service agreement"
}
```

**Example response:**

```json
[
	{
		"resource": "document",
		"id": "<document-id>",
		"account_id": "<account-id>",
		"template_id": null,
		"name": "service-agreement.pdf",
		"status": "pending_signature",
		"artifacts": {
			"original": "https://api.assinafy.com.br/v1/documents/<document-id>/download/original",
			"thumbnail": "https://api.assinafy.com.br/v1/documents/<document-id>/thumbnail"
		},
		"is_closed": false,
		"signing_url": "https://api.assinafy.com.br/v1/sign/<document-id>",
		"assignment": null,
		"decline_reason": null,
		"declined_by": null,
		"tags": [],
		"pages": [],
		"created_at": "2026-08-01T12:00:00Z",
		"updated_at": "2026-08-01T12:00:00Z"
	}
]
```

#### Signer signs multiple virtual method documents at once

Signs several documents in one call. Each document must be prepared for the `virtual` signature method. This is a code-only path — no Signer ID is sent.

**Endpoint:** `PUT /signers/documents/sign-multiple`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer access code.
- Document IDs (CSV) — string — required — comma-separated list of document IDs (the SDK splits it into `document_ids`; an empty list errors before the request is sent).

**Example request:**

```json
{
	"document_ids": ["documentid1", "documentid2"]
}
```

Query: `?signer-access-code=<signer-access-code>`

**Example response:**

```json
{ "data": [] }
```

#### Signer declines multiple documents at once

Declines several documents in one call with a shared reason. This is a code-only path — no Signer ID is sent.

**Endpoint:** `PUT /signers/documents/decline-multiple`

**Node parameters:**

- Signer Access Code — string (password) — required — per-signer access code.
- Document IDs (CSV) — string — required — comma-separated list of document IDs (split into `document_ids`; an empty list errors before the request is sent).
- Decline Reason — string (multiline) — required — text explaining the reason for the decline (sent as `decline_reason`).

**Example request:**

```json
{
	"document_ids": ["documentid1", "documentid2"],
	"decline_reason": "Unfavorable terms."
}
```

Query: `?signer-access-code=<signer-access-code>`

**Example response:**

```json
{ "data": [] }
```

#### Signer downloads a document artifact

Downloads one artifact of a signer's document as a binary file. This public route has no required security parameter.

**Endpoint:** `GET /signers/{signerId}/documents/{documentId}/download/{artifact}`

**Node parameters:**

- Signer Access Code — string (password) — optional — sent as `signer-access-code` only when supplied.
- Signer ID — string — required — the signer ID.
- Document ID — string — required — the document ID.
- Artifact — options — optional — defaults to `certificated`. One of `original` (Original / Uploaded File), `certificated` (Certificated / Signed PDF), `certificate-page` (Certificate Page), `pades` (Digital Certificate PDF), or `bundle` (Bundle / ZIP). `pades` contains the signers' ICP-Brasil signatures plus the platform certification box and exists only for documents with digital-certificate signers.
- Put Output In Field — string — optional — name of the binary output property (defaults to `data`).

**Example request:** no query is required. An access code may be supplied:

```json
{
	"signer-access-code": "<signer-access-code>"
}
```

**Example response:** binary output (no JSON payload). The artifact bytes are placed in the configured binary property (default `data`). The MIME type is taken from the response `Content-Type`; the fallback is `application/zip` for `bundle` and `application/pdf` otherwise. A bundle contains `original`, `certificated`, and `certificate-page`, plus `pades` when present. The file is named `{documentId}-{artifact}.zip` for `bundle` or `{documentId}-{artifact}.pdf` otherwise. The item's `json` carries metadata only:

```json
{
	"documentId": "62d6ee35c7741ca4006b9e11",
	"signerId": "62d6ee35c7741ca4006b9e11",
	"artifact": "certificated",
	"fileName": "62d6ee35c7741ca4006b9e11-certificated.pdf",
	"mimeType": "application/pdf",
	"size": 51234
}
```

---

### Authentication

Login, Social Login, Request Password Reset, and Reset Password are public and do not send the configured API key. Link Social Login and the API-key/password management routes accept the configured API key or an Access Token when the node exposes that field. A Bearer-only call can run without an action credential, in which case it uses the production base URL; select a Sandbox credential to target sandbox.

#### Login

Exchanges an email and password for a JWT access token, returning the user profile and accessible accounts.

**Endpoint:** `POST /login`

**Node parameters:**

- Email (`authEmail`) — string — required — user's login email.
- Password (`authPassword`) — string (password) — required — user's password.

**Example request:**

```json
{
	"email": "name@example.com",
	"password": "<password>"
}
```

**Example response:**

```json
{
	"access_token": "<access-token>",
	"user": {
		"id": "bgjazeo5r9v2lq7l36dx48np",
		"name": "Example User",
		"email": "john.smith@example.com",
		"telephone": "<telephone>",
		"government_id": "<government-id>",
		"is_email_verified": false,
		"has_accepted_terms": true,
		"created_at": "2023-03-03T11:51:34Z",
		"to_be_deleted_at": null
	},
	"accounts": [
		{
			"id": "6401df46d6a6b0c692d9ec49",
			"name": "JS",
			"roles": ["owner"],
			"is_delete_allowed": true,
			"created_at": "2023-03-03T11:51:34Z"
		}
	]
}
```

#### Social Login

Trades a social provider access/ID token (currently Google only) for an Assinafy access token.

**Endpoint:** `POST /authentication/social-login`

**Node parameters:**

- Provider (`provider`) — options — optional — social provider; only `google` is available (defaults to `google`).
- Social Token (`socialToken`) — string (password) — required — access or ID token received from the social provider.
- Has Accepted Terms (`hasAcceptedTerms`) — boolean — optional — indicates the user accepted the terms (defaults to `true`).

**Example request:**

```json
{
	"provider": "google",
	"token": "<social-provider-token>",
	"has_accepted_terms": true
}
```

**Example response:**

```json
{
	"access_token": "<access-token>",
	"user": {
		"id": "bgjazeo5r9v2lq7l36dx48np",
		"name": "Example User",
		"email": "john.smith@example.com",
		"telephone": "<telephone>",
		"government_id": "<government-id>",
		"is_email_verified": false,
		"has_accepted_terms": true,
		"created_at": "2023-03-03T11:51:34Z",
		"to_be_deleted_at": null
	},
	"accounts": [
		{
			"id": "6401df46d6a6b0c692d9ec49",
			"name": "JS",
			"roles": ["owner"],
			"is_delete_allowed": true,
			"created_at": "2023-03-03T11:51:34Z"
		}
	]
}
```

#### Link Social Login

Links a social identity provider to an already authenticated Assinafy user. Google is the currently exposed provider. Authentication may use the configured `X-Api-Key`; when **Access Token** is provided, the node uses `Authorization: Bearer <access-token>` for this call instead.

**Endpoint:** `POST /auth/link-social-login`

**Node parameters:**

- Provider — options — optional — currently `google` (default).
- Social Token — string (password) — required — access or ID token received from the provider.
- Access Token — string (password) — optional — Assinafy JWT; leave empty to use the configured API key.

**Example request:**

```json
{
	"provider": "google",
	"token": "<social-provider-token>"
}
```

**Example response:**

```json
{}
```

The node returns the unwrapped `data` value unchanged. An invalid or expired provider token returns an authentication error.

#### Create API Key

Generates a new API key for the user. Authentication can use a Bearer access token from Login/Social Login or the configured API key. Generating a new key deletes the previous one. The returned key is shown in full only here — store it immediately and never use it from a frontend application.

**Endpoint:** `POST /users/api-keys`

**Node parameters:**

- Access Token (`accessToken`) — string (password) — optional — JWT from Login or Social Login. Leave empty to use the configured API key.
- Password (`authPassword`) — string (password) — required — user's password.

**Example request:**

```json
{
	"password": "<password>"
}
```

**Example response:**

```json
{
	"api_key": "<api-key>"
}
```

#### Get API Key (Masked)

Retrieves a masked view of the current API key. For security the full key is never returned; if no key has been generated yet, `null` is returned.

**Endpoint:** `GET /users/api-keys`

**Node parameters:**

- Access Token (`accessToken`) — string (password) — optional — JWT from Login or Social Login. Leave empty to use the configured API key.

**Example response:**

```json
{
	"api_key": "<masked-api-key>"
}
```

#### Delete API Key

Revokes the current API key using an optional Bearer access token or the configured API key. This can invalidate the credential running other workflows. The node returns a synthesized confirmation object for the API's empty response.

**Endpoint:** `DELETE /users/api-keys`

**Request body:** none.

**Node parameters:**

- Access Token (`accessToken`) — string (password) — optional — JWT from Login or Social Login. Leave empty to use the configured API key.

**Example response:**

```json
{
	"deleted": true
}
```

#### Change Password

Changes the authenticated user's password using an optional Bearer access token or the configured API key, plus the current and new passwords.

**Endpoint:** `PUT /authentication/change-password`

**Node parameters:**

- Email (`authEmail`) — string — required — user's email.
- Access Token (`accessToken`) — string (password) — optional — JWT from Login or Social Login. Leave empty to use the configured API key.
- Current Password (`currentPassword`) — string (password) — required — the current password.
- New Password (`newPassword`) — string (password) — required — the new password to set.

**Example request:**

```json
{
	"email": "john.smith@example.com",
	"password": "<current-password>",
	"new_password": "<new-password>"
}
```

**Example response:**

```json
{
	"email": "john.smith@example.com"
}
```

#### Request Password Reset

Emails password-reset instructions to a user. Typically used when the user forgot their password or has not set one yet. No authentication required.

**Endpoint:** `PUT /authentication/request-password-reset`

**Node parameters:**

- Email (`authEmail`) — string — required — user's email.

**Example request:**

```json
{
	"email": "john.smith@example.com"
}
```

**Example response:**

```json
{
	"email": "john.smith@example.com"
}
```

#### Reset Password

Sets a new password using the reset token received by email. No authentication required.

**Endpoint:** `PUT /authentication/reset-password`

**Node parameters:**

- Email (`authEmail`) — string — required — user's email.
- Reset Token (`resetToken`) — string (password) — optional — token received in the password-reset email; included in the body as `token` only when provided.
- New Password (`newPassword`) — string (password) — required — the new password to set.

**Example request:**

```json
{
	"email": "john.smith@example.com",
	"token": "<reset-token>",
	"new_password": "<new-password>"
}
```

**Example response:**

```json
{
	"email": "john.smith@example.com"
}
```

---

### Workspace

A workspace maps to an Assinafy "account". These operations manage the workspaces (accounts) accessible to your API key. Note that account-scoped resources elsewhere in the node use the **Account ID** from the credential; the Workspace resource instead targets accounts directly via the top-level `/accounts` collection and a per-workspace ID.

#### Create a workspace

Creates a new workspace (account).

**Endpoint:** `POST /accounts`

**Node parameters:**

- Name — string — required — Workspace name.
- Additional Fields — collection — optional — extra workspace attributes:
  - Notification Sender — options — optional — `User` (send as the acting user) or `Account` (show the workspace), sent as `notification_sender_type`.
  - Primary Color — color — optional — sent as `primary_color` only when set.
  - Secondary Color — color — optional — sent as `secondary_color` only when set.

**Example request:**

```json
{
	"name": "sdk-example-workspace",
	"notification_sender_type": "Account",
	"primary_color": "1a73e8",
	"secondary_color": "ff8800"
}
```

**Example response:**

```json
{
	"id": "<workspace-id>",
	"name": "sdk-example-workspace",
	"primary_color": "1a73e8",
	"secondary_color": "ff8800",
	"created_at": "2026-07-20T19:00:30Z"
}
```

#### Delete a workspace

Deletes a workspace by ID.

**Endpoint:** `DELETE /accounts/{workspaceId}`

**Node parameters:**

- Workspace ID — string — required — ID of the workspace to delete.
- Force — boolean — optional (default `false`) — when true, sends `{ "force": true }` to cancel an active paid subscription and delete immediately. Use only with a confirmed disposable workspace.

**Example request body when Force is enabled:**

```json
{ "force": true }
```

**Example response:**

The API returns an empty array (`data: []`); the SDK returns a synthesized confirmation object instead:

```json
{
	"deleted": true,
	"workspaceId": "<workspace-id>"
}
```

#### Get a workspace

Retrieves a single workspace by ID.

**Endpoint:** `GET /accounts/{workspaceId}`

**Node parameters:**

- Workspace ID — string — required — ID of the workspace to retrieve.

**Example response:**

```json
{
	"id": "<workspace-id>",
	"name": "Example Workspace",
	"primary_color": null,
	"secondary_color": null,
	"created_at": "2026-05-12T18:05:11Z"
}
```

#### List accessible workspaces

Lists the workspaces (accounts) accessible to the API key. Supports pagination via the standard `Return All` / `Limit` controls; the SDK reads the `X-Pagination-*` response headers.

**Endpoint:** `GET /accounts`

**Node parameters:**

- Return All — boolean — optional — when true, fetches every page; default false.
- Limit — number — optional — max results to return when Return All is false.

**Example response:**

```json
[
	{
		"id": "<workspace-id>",
		"name": "Example Workspace",
		"primary_color": null,
		"secondary_color": null,
		"created_at": "2026-05-12T18:05:11Z"
	}
]
```

#### Update a workspace

Updates an existing workspace. At least one update field is required — the node throws `At least one update field is required` if none are supplied.

**Endpoint:** `PUT /accounts/{workspaceId}`

**Node parameters:**

- Workspace ID — string — required — ID of the workspace to update.
- Update Fields — collection — required (at least one) — fields to change:
  - Name — string — optional — sent as `name`.
  - Notification Sender — options — optional — `User` or `Account`, sent as `notification_sender_type`.
  - Primary Color — color — optional — sent as `primary_color`.
  - Secondary Color — color — optional — sent as `secondary_color`.

**Example request:**

```json
{
	"name": "Renamed Example Workspace",
	"notification_sender_type": "User",
	"primary_color": "1a73e8"
}
```

**Example response:**

```json
{
	"id": "<workspace-id>",
	"name": "Renamed Example Workspace",
	"primary_color": "1a73e8",
	"secondary_color": "ff8800",
	"created_at": "2026-05-12T18:05:11Z"
}
```

#### Get Account Statistics

Returns document-funnel statistics for one workspace. The node emits one n8n item per statistics row.

**Endpoint:** `GET /accounts/{workspaceId}/stats`

**Node parameters:**

- Workspace ID — string — required — workspace to report.
- Granularity — options — optional — `monthly` (default, last twelve months) or `daily` (days in one month).
- Month — string — required only for daily granularity — strict `YYYY-MM` format.

**Example request (query):**

```json
{
	"granularity": "daily",
	"month": "2026-08"
}
```

**Example response:**

```json
[
	{
		"period": "2026-08-01",
		"documents_uploaded": 2,
		"documents_sent": 2,
		"signature_requests": 3,
		"signature_requests_notification_email": 2,
		"signature_requests_notification_whatsapp": 1,
		"signature_requests_notification_bypass": 0,
		"signature_requests_verification_email": 2,
		"signature_requests_verification_whatsapp": 1,
		"signature_requests_verification_bypass": 0,
		"signature_requests_verification_digital_certificate": 0,
		"signature_requests_viewed": 2,
		"signature_requests_completed": 1,
		"documents_certified": 1
	}
]
```

Monthly rows cover the last 12 months and daily rows cover every day of the requested month; both are zero-filled and ordered most recent first. Notification counters split requests by delivery channel, so a request sent through more than one channel counts once in each channel and those counters can total more than `signature_requests`. Verification counters split requests by their single verification method and therefore total exactly `signature_requests`.

#### Get User Statistics

Returns aggregate document-funnel statistics across workspaces accessible to the current user. The node emits one n8n item per row.

**Endpoint:** `GET /users/self/stats`

**Node parameters:**

- Granularity — options — optional — `monthly` (default) or `daily`.
- Month — string — required only for daily granularity — strict `YYYY-MM` format.

**Example request (query):**

```json
{ "granularity": "monthly" }
```

**Example response:**

```json
[
	{
		"period": "2026-08",
		"documents_uploaded": 20,
		"documents_sent": 18,
		"signature_requests": 24,
		"signature_requests_notification_email": 20,
		"signature_requests_notification_whatsapp": 4,
		"signature_requests_notification_bypass": 0,
		"signature_requests_verification_email": 18,
		"signature_requests_verification_whatsapp": 2,
		"signature_requests_verification_bypass": 0,
		"signature_requests_verification_digital_certificate": 4,
		"signature_requests_viewed": 17,
		"signature_requests_completed": 15,
		"documents_certified": 12
	}
]
```

As with account statistics, the series is zero-filled and ordered most recent first. Notification counters can overlap when a request uses multiple delivery channels; verification counters form a non-overlapping breakdown by verification method.

#### Get Notification Preferences

Returns the authenticated user's owner-facing document email preferences. Account and security messages such as password resets, workspace invitations, and account deletion are not configurable through this route.

**Endpoint:** `GET /users/self/notification-preferences`

**Node parameters:** none.

**Example response:**

```json
{
	"DocumentCompleted": true,
	"SignerDeclined": true,
	"DocumentCancelled": true,
	"DocumentAboutToExpire": true,
	"DocumentExpired": true,
	"DocumentExpirationReset": true,
	"DocumentProcessingFailed": true,
	"TemplateProcessingFailed": true,
	"SignerWhatsappFailed": true
}
```

All nine keys are always returned; `true` means that email is enabled.

#### Update Notification Preferences

Merges one or more owner-facing email preferences into the authenticated user's current map. Omitted keys keep their existing values, and the API returns all nine preferences. Setting a key to `false` disables that email for this user across every account they belong to. The node rejects an empty collection or a non-boolean expression value before sending the request.

**Endpoint:** `PUT /users/self/notification-preferences`

**Node parameters:**

- Preferences — collection — required (at least one) — any partial selection of:
  - Document About to Expire (`DocumentAboutToExpire`) — boolean.
  - Document Cancelled (`DocumentCancelled`) — boolean.
  - Document Completed (`DocumentCompleted`) — boolean.
  - Document Expiration Reset (`DocumentExpirationReset`) — boolean.
  - Document Expired (`DocumentExpired`) — boolean.
  - Document Processing Failed (`DocumentProcessingFailed`) — boolean.
  - Signer Declined (`SignerDeclined`) — boolean.
  - Signer WhatsApp Failed (`SignerWhatsappFailed`) — boolean.
  - Template Processing Failed (`TemplateProcessingFailed`) — boolean.

**Example request:**

```json
{
	"DocumentCompleted": false,
	"SignerDeclined": true
}
```

**Example response:**

```json
{
	"DocumentCompleted": false,
	"SignerDeclined": true,
	"DocumentCancelled": true,
	"DocumentAboutToExpire": true,
	"DocumentExpired": true,
	"DocumentExpirationReset": true,
	"DocumentProcessingFailed": true,
	"TemplateProcessingFailed": true,
	"SignerWhatsappFailed": true
}
```

#### Get Current User

Returns the authenticated user (the owner of the API key) as the direct `AuthUser` object shown below. This operation is not account-scoped.

**Endpoint:** `GET /users/self`

**Node parameters:** none.

**Example response:**

```json
{
	"id": "<user-id>",
	"name": "Example User",
	"email": "user@example.com",
	"telephone": null,
	"government_id": null,
	"is_email_verified": true,
	"has_accepted_terms": true,
	"created_at": "2026-05-12T18:05:11Z",
	"to_be_deleted_at": null
}
```

The node unwraps the standard `{ status, message, data }` envelope and otherwise leaves `data` unchanged.

#### Get Theme

Returns the workspace branding (display name, hex colors, and logo URL if any).

**Endpoint:** `GET /accounts/{workspaceId}/theme`

**Node parameters:**

- Workspace ID — string — required — the workspace whose theme to fetch.

**Example response:**

```json
{
	"account_name": "Example Workspace",
	"primary_color": "2072b9",
	"secondary_color": "ffffff",
	"logo": null
}
```

#### Upload Logo

Uploads (or replaces) the workspace logo from an incoming binary item. Sent as `multipart/form-data` with a single `file` part (PNG or JPEG).

**Endpoint:** `POST /accounts/{workspaceId}/logo`

**Node parameters:**

- Workspace ID — string — required — the workspace to set the logo on.
- Binary Property — string — required — name of the binary property holding the logo image (PNG or JPEG; default `data`). A missing or generic `application/octet-stream` MIME type is accepted only when PNG/JPEG magic bytes identify an allowed image.

**Example request:**

```text
multipart/form-data:
  file: <binary PNG or JPEG>
```

**Example response:**

```json
{ "mime_type": "image/png", "version": 1784574086, "updated_at": "2026-07-20T19:01:26Z" }
```

#### Download Logo

Downloads the current workspace logo as a binary image on the output item. Returns HTTP 404 if no logo is set.

**Endpoint:** `GET /accounts/{workspaceId}/logo`

**Node parameters:**

- Workspace ID — string — required — the workspace whose logo to download.
- Put Output In Field — string — the binary property to write the image into (default `data`).

**Example output item:**

```json
{
	"json": {
		"workspaceId": "<workspace-id>",
		"fileName": "<workspace-id>-logo.png",
		"mimeType": "image/png",
		"size": 69
	},
	"binary": {
		"data": { "fileName": "<workspace-id>-logo.png", "mimeType": "image/png", "data": "<base64>" }
	}
}
```

#### Delete Logo

Removes the workspace logo.

**Endpoint:** `DELETE /accounts/{workspaceId}/logo`

**Request body:** none.

**Node parameters:**

- Workspace ID — string — required — the workspace to clear the logo on.

**Example response:** the API returns an empty array (`data: []`); the SDK returns a synthesized confirmation:

```json
{ "deleted": true, "workspaceId": "<workspace-id>" }
```
