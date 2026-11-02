# @assinafy/n8n-nodes-assinafy

[Português (Brasil)](README.pt-BR.md) · **English**

Community n8n nodes for [Assinafy](https://assinafy.com.br): documents, contracts, signers, assignments, templates, tags, fields, workspaces, authentication, OAuth and webhooks. The package includes the **Assinafy** action node, **Assinafy Trigger**, **Assinafy API** credential and native **Assinafy OAuth2 API** credential.

## Installation

In self-hosted n8n, open **Settings → Community Nodes → Install**, enter `@assinafy/n8n-nodes-assinafy`, and restart n8n if prompted. npmjs is the primary registry; GitHub Packages is only a mirror. n8n Cloud availability depends on n8n catalog approval.

Use Node.js 26.13.0 LTS for development. The package runtime minimum is Node.js 24.21.0; the local runtime is pinned to n8n 2.42.4. Assinafy requires HTTPS with TLS 1.2 or newer.

## Credentials

### OAuth2

Use OAuth2 for applications acting in one consented workspace.

1. In the action node choose **Authentication → OAuth2** and create an **Assinafy OAuth2 API** credential.
2. Copy n8n's exact HTTPS callback URL. In Assinafy open **Integrações → Apps OAuth**, create an application, and register that callback.
3. A confidential server app uses its Client ID and private Client Secret. A public client omits the secret. n8n handles Authorization Code, PKCE S256, encrypted token storage and refresh.
4. Request only allowed scopes. Document flows use `documents:read documents:write account:read`; templates add `templates:read`; webhook changes add `webhooks:write`. Add `offline_access` for rotation and `openid profile email` only when identity claims are needed.
5. Leave **Account ID** empty to discover the one workspace selected during consent, or enter that workspace ID. OAuth cannot switch workspaces or perform owner-only administration.
6. Test with **Workspace → List**. Access tokens last one hour; each refresh rotates the refresh token for another 30 days. A credential idle for 30 days must reconnect.

The OAuth resource exposes raw exchange, refresh, revocation, UserInfo and protected-resource metadata for integrations that manage their own tokens. Raw token output is sensitive and token mutations are never retried automatically.

### API key

Use **Assinafy API** for owner/admin routes, the Trigger, signing-secret reads, biometric review evidence/decisions, sandbox access or custom loopback fixtures. Configure the API key, default Account ID and Production, Sandbox or a validated custom `/v1` URL. The key is sent only as `X-Api-Key`. Store returned API keys, OAuth tokens, signer codes, capture URLs and webhook secrets only in protected credential storage.

## Signing methods and notifications

| Verification method | Required signer data | Notification | Notes |
| --- | --- | --- | --- |
| `Email` | Email | `Email` | No notification credit |
| `Whatsapp` | `whatsapp_phone_number`; paid plan | `Whatsapp` | 0.45 credits per notification |
| `IdDocumentFaceMatchBasic` | Valid CPF; biometric feature | Email or WhatsApp | Explicit signer consent; estimate the per-signer fee |
| `DigitalCertificate` | CPF or alphanumeric CNPJ; certificate feature | Email or WhatsApp | ICP-Brasil A1/A3 in the signer browser; virtual assignment; signer alone in its step |

One notification method is allowed per signer. Estimate cost and confirm available resources before creating an assignment. Signer access codes arrive in notifications; document URLs do not contain them, and workflows must never derive or fabricate them.

## Complete document flow

1. **Document → Upload** a non-empty PDF up to 25 MB and persist its ID.
2. **Document → Wait Until Ready** until metadata is ready. This does not promise that a certified artifact exists.
3. **Signer → Create** or reuse a signer. Add email/WhatsApp and `government_id` required by the chosen method.
4. **Assignment → Estimate Cost**; stop when resources or plan features are insufficient.
5. **Assignment → Create** once, then persist the assignment and signer IDs. Use contiguous signing steps or omit all steps.
6. The signer receives a code, confirms data/terms, completes OTP or biometric capture when required, and signs. Digital-certificate signing stays in Assinafy's browser flow.
7. Run **Assinafy Trigger** in a separate workflow. Deduplicate on `webhook-id`, route by event, and treat `document_processing_failed`, rejection and expiry as terminal failures.
8. After all signatures, read **Document → Get** until status is `certificated` and the requested artifact is available. `document_metadata_ready` and all signers completed are not artifact-readiness signals.
9. **Document → Download Artifact** (`certificated`, `pades`, `certificate-page`, `original` or `bundle`) and store the binary.

For templates, **Create From Template** may initially return `uploaded` with `assignment: null`; persist the document ID and wait for `pending_signature` plus an assignment. For contract tracking, upload first, then use **Contract → Set Terms**; preserve the document ID if terms fail. Renew and terminate with the `updated_at` precondition read from Get.

## Assinafy Trigger

Activation creates or updates only this workflow's endpoint; deactivation deletes only that endpoint. A workspace supports one endpoint, or up to three on paid plans. On older environments the Trigger falls back to the single subscription.

The URL always carries a credential-derived token. **Verify Signature** also enables Standard Webhooks HMAC-SHA256 verification over the exact raw body, with a five-minute timestamp window and a signing-secret cache of at most 60 seconds. Credential-bearing incoming headers are redacted. Protect the endpoint signing secret and deduplicate deliveries by `webhook-id`.

## Supported operations

| Resource | Operations |
| --- | --- |
| Document | Append Tags, Create From Template, Delete, Detach Tag, Download Artifact, Download Page, Download Thumbnail, Estimate Cost From Template, Get, Get Activities, Get Public Info, Get Signing Progress, List, List Statuses, List Tags, Rename, Replace Tags, Search, Send Public Token, Upload, Verify, Wait Until Ready |
| Contract | List, Get, Get Related, Set Terms, Renew, Terminate |
| Signer | Accept Terms (Signer Side), Confirm Data (Signer Side), Create, Delete, Download Signature (Signer Side), Find by Email, Get, Get Identity Verification (Signer Side), Get Self (Signer Side), List, Start Identity Verification (Signer Side), Update, Upload Signature (Signer Side), Verify Code (Signer Side) |
| Assignment | Create, Decide Identity Review, Decline (Signer Side), Download Identity Review Image, Estimate Cost, Estimate Resend Cost, Get Identity Review, Get Sign Page, List, List WhatsApp Notifications, Resend Notification, Reset Expiration, Sign (Signer Side) |
| Template | List, Get |
| Tag | Create, List, Update, Delete |
| Field Definition | Create, List, Get, Update, Delete, Validate, Validate Multiple, List Types |
| Signer Document | Get Current, List, Search, Sign Multiple, Decline Multiple, Download |
| OAuth | Exchange Code, Refresh Token, Revoke Token, Get User Info, Get Metadata |
| Authentication | Change Password, Complete Two-Factor Login, Confirm Authenticator Enrollment, Create API Key, Delete API Key, Get API Key (Masked), Link Social Login, List Two-Factor Methods, Login, Regenerate Recovery Codes, Remove Two-Factor Method, Request Password Reset, Reset Password, Social Login, Start Authenticator Enrollment |
| Workspace | Create, Delete, Delete Logo, Download Logo, Get, Get Account Statistics, Get Current User, Get Notification Preferences, Get Theme, Get User Statistics, List, Update, Update Notification Preferences, Upload Logo |
| Webhook | Create Endpoint, Delete Endpoint, Delete Endpoint by URL, Get Endpoint, Get Endpoint Signing Secret, Get Subscription, Inactivate Subscription, List Dispatches, List Endpoints, List Event Types, Register Subscription, Retry Dispatch, Rotate Endpoint Signing Secret, Update Endpoint |

The complete parameter, authentication, endpoint, media-type, request, response, error and webhook-payload contract is in [docs/OPERATIONS.md](docs/OPERATIONS.md). Lists emit one n8n item per record; mutations returning arrays use `{ "data": [...] }`; successful Assinafy envelopes are unwrapped; binary outputs include metadata; every output remains paired to its input item. HTTP 429 is retried at most three times; other failures and raw OAuth token mutations are single-shot.

## Development

```bash
npm ci --strict-peer-deps
npm run verify:dependencies
npm run build
npm run lint
npm run test:ci
npm run audit:dev
npm run audit:prod
npm run verify:package
```

Run `npm run build && docker compose up -d` for the isolated n8n instance at `http://localhost:5679`. See [CONTRIBUTING.md](CONTRIBUTING.md) for HTTPS OAuth, runtime fixtures, sandbox gates and release verification. Report vulnerabilities through [SECURITY.md](SECURITY.md); never put credentials, real identities or document data in public issues, tests or examples.

## License

[MIT](LICENSE.md)
