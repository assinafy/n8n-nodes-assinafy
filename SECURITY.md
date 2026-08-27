# Security Policy

## Reporting a vulnerability

Do not open a public issue containing credentials, signer access codes, personal data, document contents, or an unpatched vulnerability. Report security concerns privately through the repository's GitHub Security Advisory interface when available, or through Assinafy's official support channel linked from [assinafy.com.br](https://assinafy.com.br).

Include the affected version, impact, reproduction steps, and the smallest sanitized request/response needed to demonstrate the issue. Replace all keys, tokens, account IDs, signer codes, emails, and document data with placeholders.

## Credential handling

- Store API keys and webhook secrets in n8n credentials or a managed secret store, never in workflow JSON, source control, screenshots, or logs.
- Use the Sandbox environment for integration tests. The live suite rejects any host other than `https://sandbox.assinafy.com.br/v1`.
- Treat signer access codes, verification codes, password-reset tokens, and OAuth tokens as secrets.
- Rotate a credential immediately if it is disclosed. Creating or deleting an Assinafy API key can revoke the key used by running workflows, so test those flows only with a disposable user/account.

## Supported versions

Security fixes target the default branch and the newest published release. Upgrade to the newest available release before reporting a problem already fixed upstream.
