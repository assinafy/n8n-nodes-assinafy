# Contributing

Use Node.js 24 LTS for development and CI parity. The package declares Node.js 22.22 as its minimum supported build runtime.

```bash
npm ci
npm run lint
npm run test:ci
npm run build
npm run audit:prod
npm pack --dry-run
```

Keep resources small and operation-specific, reuse shared validation/transport helpers, and add request-shape tests for every changed method, path, query, header, body, response-envelope, pagination, and binary behavior. Update [docs/OPERATIONS.md](docs/OPERATIONS.md) in the same change.

## Live sandbox checks

The default Jest suite is hermetic and does not contact Assinafy. Live tests are opt-in:

```bash
ASSINAFY_LIVE=1 \
ASSINAFY_API_KEY=<sandbox-api-key> \
ASSINAFY_ACCOUNT_ID=<sandbox-account-id> \
ASSINAFY_BASE_URL=https://sandbox.assinafy.com.br/v1 \
npx jest tests/live.integration.test.ts --runInBand
```

Mutation tests additionally require `ASSINAFY_LIVE_DESTRUCTIVE=1`. Workspace create/logo/webhook/delete checks require the separate `ASSINAFY_LIVE_WORKSPACE_MUTATIONS=1` safety gate. Use disposable records, confirm cleanup in `finally`, and never point the suite at production. Do not mutate a primary logo, API key, subscription, or account.

Successful signer, social-login, password-reset, and verification flows require external tokens or inbox access. When those are unavailable, document the limitation and test request construction; do not describe an expected 401/404 route check as end-to-end success.

## Documentation privacy

Examples must use `example.com` email addresses and unmistakable placeholders such as `<account-id>` and `<signer-access-code>`. Never paste live credentials, access codes, personal names, account IDs, or document URLs into tests, fixtures, commits, issues, or pull requests.
