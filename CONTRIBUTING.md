# Contributing

Contributions are welcome through [GitHub issues](https://github.com/assinafy/n8n-nodes-assinafy/issues) and [pull requests](https://github.com/assinafy/n8n-nodes-assinafy/pulls). Fork the repository, create a branch from `main`, and open a pull request against `main`. Describe the problem, the resulting behavior, and how you verified the change.

Use Node.js 24.21.0 LTS for development and GitHub Actions. With nvm, run `nvm install` and `nvm use` to select the version in `.nvmrc`. The official n8n container supplies its own supported Node.js runtime.

```bash
npm ci --strict-peer-deps
npm run verify:dependencies
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

Prepare a versioned main commit and matching Git tag for releases. The GitHub tag workflow performs package verification, sandbox tests, and provenance publishing. Direct `npm publish` is blocked; the n8n CLI's local `npm run release` command is not used for this repository's release path.

Successful signer, social-login, password-reset, and verification flows require external tokens or inbox access. When those are unavailable, document the limitation and test request construction; do not describe an expected 401/404 route check as end-to-end success.

Signer-side operations authenticate with a `signer-access-code` delivered in the signer's notification email or WhatsApp message. No endpoint returns this code, and an assignment's `signing_urls` do not contain it. Set `ASSINAFY_TEST_SIGNER_ACCESS_CODE` to the code received in a sandbox inbox to run the signer-side assertions; without it they skip.

## Dependency updates

Include both `package.json` and `package-lock.json` when updating dependencies, and run the verification commands above. Dependency updates, including Dependabot pull requests, follow the same GitHub review process as other contributions.

## Community package verification

Use the unmodified n8n lint preset and test inside the supported official n8n runtime. Keep the marketplace-facing README and node UI text in English, and maintain the complete [Brazilian Portuguese guide](README.pt-BR.md) for the primary user audience. Update both guides together when installation, authentication, operations, or document flows change; retain the exact UI labels and API identifiers in translated examples. The node package uses n8n's helpers for HTTP requests and binary storage and does not access the host environment or filesystem. Consult n8n's [verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines) when preparing a submission.

After publishing through the GitHub release workflow, run the official registry check with the same pinned scanner used by `verify:package` and confirm that its reported result passes:

```bash
npm exec --yes --ignore-scripts --strict-peer-deps --package=@n8n/scan-community-package@0.28.1 -- scan-community-package @assinafy/n8n-nodes-assinafy
```

This command checks the published artifact and the source recorded in its npm provenance. A local build cannot supply release provenance. Catalog availability still requires n8n's community-node review.

## Documentation privacy

Examples must use `example.com` email addresses and unmistakable placeholders such as `<account-id>` and `<signer-access-code>`. Never paste live credentials, access codes, personal names, account IDs, or document URLs into tests, fixtures, commits, issues, or pull requests.

## Local n8n and HTTPS OAuth

The repository's Compose service loads only the built `dist` directory and package manifest into an isolated n8n instance. It binds to loopback port 5679 and keeps credentials/workflows in the `n8n_data` volume.

```bash
npm ci --strict-peer-deps
npm run build
docker compose up -d
```

Open `http://localhost:5679` and complete owner setup before exposing the editor. Rebuild after source changes and run `docker compose restart n8n` to copy the new package into the instance. Keep the Compose project name consistent when using `-p`; it determines which data volume is used.

For a temporary callback, run the official Cloudflare client in a separate terminal:

```bash
cloudflared tunnel --url http://127.0.0.1:5679 --no-autoupdate
```

Create `.local` with `mkdir -p .local`, then copy the HTTPS origin into `.local/n8n.env`:

```dotenv
N8N_EDITOR_BASE_URL=https://your-temporary-host.trycloudflare.com
WEBHOOK_URL=https://your-temporary-host.trycloudflare.com/
N8N_SECURE_COOKIE=true
```

Save the file as `.local/n8n.env` with mode `0600`, then recreate the service:

```bash
chmod 600 .local/n8n.env
docker compose --env-file .local/n8n.env up -d
```

Use the HTTPS editor URL throughout OAuth setup. Register exactly the **OAuth Redirect URL** shown by n8n in **Assinafy → Integrações → Apps OAuth**. Keep Client Secret in the n8n credential and complete authorization in the same browser session that started it. A new tunnel hostname requires an updated callback and reconnection. A tunnel is temporary infrastructure; deployed installations need their own stable HTTPS hostname and registered callback. n8n Cloud uses its displayed callback and requires the package to be available in its community-node catalog.

For production OAuth checks, use a dedicated application/connection and clearly named disposable documents. Start with metadata, workspace discovery, and read operations, then explicitly select the document and recipients for signing tests. Keep API-key administration separate because OAuth excludes those endpoints. Do not run the sandbox mutation suite against production or replace an existing production webhook subscription as part of connection setup. Tokens, authorization codes, signer links and real payloads belong only in protected local files or encrypted n8n credentials/execution storage.

To execute an imported workflow from the CLI while the editor is running, give the CLI task broker a separate port. Replace `WORKFLOW_ID` with the workflow's ID and keep execution output in the ignored local directory:

```bash
umask 077
docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5681 n8n \
  n8n execute --id=WORKFLOW_ID --rawOutput > .local/execution.log
```

Use separate sending and completion workflows when a person must sign between steps. Before sending, require an unassigned document and an acceptable cost estimate. The completion workflow should read the current status and download only when `status` is `certificated` and `artifacts.certificated` is available. Repeating the completion workflow then performs only reads and downloads.

`docker compose down` stops the instance while retaining its volume. Stop the tunnel process separately. Removing the volume destroys saved workflows and credentials and should be done only when that test instance is no longer needed.
