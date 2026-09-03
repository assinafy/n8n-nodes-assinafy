# Contributing

Use Node.js 24 LTS for development, runtime, and CI parity.

```bash
npm ci
npm run lint
npm run test:ci
npm run build
npm run audit:dev
npm run audit:prod
npm run verify:package
```

Keep resources small and operation-specific, reuse shared validation/transport helpers, and add request-shape tests for every changed method, path, query, header, body, response-envelope, pagination, and binary behavior. Update [docs/OPERATIONS.md](docs/OPERATIONS.md) in the same change.

## Live sandbox checks

The default Jest suite is hermetic and does not contact Assinafy. Live tests are opt-in:

```bash
ASSINAFY_LIVE=1 \
ASSINAFY_API_KEY=<sandbox-api-key> \
ASSINAFY_ACCOUNT_ID=<sandbox-account-id> \
ASSINAFY_TEST_EMAIL_PRIMARY=<sandbox-test-email> \
ASSINAFY_TEST_EMAIL_SECONDARY=<second-sandbox-test-email> \
ASSINAFY_BASE_URL=https://sandbox.assinafy.com.br/v1 \
npx jest tests/live.integration.test.ts --runInBand
```

Mutation tests additionally require `ASSINAFY_LIVE_DESTRUCTIVE=1`. Assignment and notification checks that consume account credits also require `ASSINAFY_LIVE_CREDIT_MUTATIONS=1` and both test-email variables. Workspace create/logo/webhook/delete checks require the separate `ASSINAFY_LIVE_WORKSPACE_MUTATIONS=1` safety gate. Use disposable records, confirm cleanup in `finally`, and never point the suite at production. Do not mutate a primary logo, API key, subscription, or account.

The release workflow enables the destructive and credit-consuming document/signing gates and fails when their protected sandbox secrets or account credits are unavailable. Workspace/logo administration remains outside that release gate.

Successful signer, social-login, password-reset, and verification flows require external tokens or inbox access. When those are unavailable, document the limitation and test request construction; do not describe an expected 401/404 route check as end-to-end success.

Signer-side operations authenticate with a `signer-access-code` that no endpoint returns — it arrives only in the signer's notification email or WhatsApp message, and the `signing_urls` on an assignment do not contain one. Set `ASSINAFY_TEST_SIGNER_ACCESS_CODE` to a code pasted from a real sandbox inbox to run the signer-side assertions; without it they skip. Never derive a stand-in code from a URL and assert it is truthy: that passes while proving nothing, and the next call fails with `401 Credenciais inválidas.` [`docs/OPERATIONS.md`](docs/OPERATIONS.md#live-verification-coverage) tracks which operations the live suite reaches and why the rest cannot run unattended; update it whenever that changes.

## Dependency updates

GitLab is the source repository and GitHub is its release mirror. Treat GitHub Dependabot pull requests as update notifications: reproduce the locked dependency change on a GitLab branch, run the full verification set, and merge it in GitLab so the next mirror update does not overwrite the change.

## Documentation privacy

Examples must use `example.com` email addresses and unmistakable placeholders such as `<account-id>` and `<signer-access-code>`. Never paste live credentials, access codes, personal names, account IDs, or document URLs into tests, fixtures, commits, issues, or pull requests.
