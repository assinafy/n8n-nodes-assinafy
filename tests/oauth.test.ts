import { AssinafyOAuth2Api } from '../credentials/AssinafyOAuth2Api.credentials';
import { Assinafy } from '../nodes/Assinafy/Assinafy.node';
import { executeOAuth } from '../nodes/Assinafy/resources/oauth';
import {
	getAccountId,
	assinafyApiRequest,
	getBaseUrl,
	DELEGATED_CREDENTIAL_TYPE,
} from '../nodes/Assinafy/shared/transport';
import { makeCtx, lastAuth, lastPublic } from './helpers';

const codeParams = {
	clientId: 'example-client',
	authorizationCode: 'example-code',
	codeVerifier: 'a'.repeat(43),
	redirectUri: 'https://n8n.example.com/rest/oauth2-credential/callback',
};

/** Token and revocation requests are form-encoded, never JSON. */
function formFields(request: { body: unknown; json?: boolean }): Record<string, string> {
	expect(request.body).toBeInstanceOf(URLSearchParams);
	expect(request.json).toBeUndefined();
	return Object.fromEntries(request.body as URLSearchParams);
}

describe('OAuth connection and protocol', () => {
	it('uses n8n PKCE and body authentication with production endpoints', () => {
		const credential = new AssinafyOAuth2Api();
		const defaults = Object.fromEntries(credential.properties.map((p) => [p.name, p.default]));
		expect(credential.extends).toEqual(['oAuth2Api']);
		expect(defaults).toMatchObject({
			grantType: 'pkce',
			authentication: 'body',
			authUrl: 'https://auth.assinafy.com.br/oauth/authorize',
			accessTokenUrl: 'https://api.assinafy.com.br/v1/oauth/token',
		});
		expect(defaults.scope).toContain('offline_access');
		expect(credential.properties.find((p) => p.name === 'clientSecret')?.required).not.toBe(true);
		expect(credential.test.request.url).toBe('https://api.assinafy.com.br/v1/accounts');
	});

	it('preserves API-key authentication as the default for saved workflows', () => {
		const node = new Assinafy();
		expect(node.description.properties.find((p) => p.name === 'authentication')?.default).toBe(
			'apiKey',
		);
		expect(node.description.credentials).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: DELEGATED_CREDENTIAL_TYPE, required: true }),
			]),
		);
	});

	it('dispatches authenticated requests through n8n OAuth with no API key or token query', async () => {
		const { ctx, requests, httpRequestWithAuthentication } = makeCtx({ authentication: 'oAuth2' });
		await assinafyApiRequest(ctx, { method: 'GET', path: '/documents/example-document' });
		expect(ctx.getCredentials).toHaveBeenCalledWith(DELEGATED_CREDENTIAL_TYPE);
		expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
			DELEGATED_CREDENTIAL_TYPE,
			expect.any(Object),
		);
		expect(lastAuth(requests).headers).toEqual({ Accept: 'application/json' });
		expect(lastAuth(requests).qs).toBeUndefined();
	});

	it('discovers the consented workspace when Account ID is omitted', async () => {
		const { ctx, requests } = makeCtx(
			{ authentication: 'oAuth2' },
			{
				credentials: {},
				response: [{ id: 'example-account' }],
			},
		);
		await expect(getAccountId(ctx)).resolves.toBe('example-account');
		expect(lastAuth(requests).url).toBe('https://api.assinafy.com.br/v1/accounts');
	});

	it.each(
		[[], [{ id: '' }], [{ id: 123 }], [{ id: 'one' }, { id: 'two' }]].map((response) => ({
			response,
		})),
	)('rejects ambiguous workspace discovery: %j', async ({ response }) => {
		const { ctx } = makeCtx({ authentication: 'oAuth2' }, { credentials: {}, response });
		await expect(getAccountId(ctx)).rejects.toThrow('exactly one workspace');
	});

	it('does not fall back when a selected OAuth credential cannot be loaded', async () => {
		const { ctx } = makeCtx({ authentication: 'oAuth2' });
		ctx.getNode.mockReturnValue({
			name: 'Assinafy',
			parameters: { authentication: 'oAuth2' },
			credentials: { assinafyOAuth2Api: { id: 'example-credential', name: 'OAuth' } },
		});
		ctx.getCredentials.mockRejectedValue(new Error('Unavailable'));
		await expect(getBaseUrl(ctx, true)).rejects.toThrow('Selected Assinafy credentials');
	});

	it('keeps public calls unauthenticated with an OAuth credential selected', async () => {
		const { ctx, requests } = makeCtx({ authentication: 'oAuth2' });
		await executeOAuth.call(ctx, 0, 'getMetadata');
		expect(requests).toHaveLength(1);
		expect(lastPublic(requests).url).toBe(
			'https://api.assinafy.com.br/.well-known/oauth-protected-resource',
		);
	});

	it('preserves the flat token response and sends the complete PKCE code exchange', async () => {
		const response = {
			access_token: 'example-access',
			refresh_token: 'example-refresh',
			token_type: 'Bearer',
			expires_in: 3600,
			scope: 'documents:read',
		};
		const { ctx, httpRequest } = makeCtx({ ...codeParams, clientSecret: 'example-secret' });
		httpRequest.mockResolvedValue(response);
		await expect(executeOAuth.call(ctx, 0, 'exchangeCode')).resolves.toEqual({ json: response });
		const request = httpRequest.mock.calls[0][0];
		expect(request).toMatchObject({
			method: 'POST',
			url: 'https://api.assinafy.com.br/v1/oauth/token',
		});
		expect(formFields(request)).toEqual({
			grant_type: 'authorization_code',
			client_id: 'example-client',
			client_secret: 'example-secret',
			code: 'example-code',
			code_verifier: 'a'.repeat(43),
			redirect_uri: codeParams.redirectUri,
		});
	});

	it('omits the client secret for public clients', async () => {
		const { ctx, requests } = makeCtx(codeParams);
		await executeOAuth.call(ctx, 0, 'exchangeCode');
		const fields = formFields(lastPublic(requests));
		expect(fields.client_id).toBe('example-client');
		expect(fields).not.toHaveProperty('client_secret');
	});

	it('exchanges the current refresh token without owner authentication', async () => {
		const { ctx, requests } = makeCtx(
			{
				clientId: 'example-client',
				refreshToken: 'example-refresh',
				resourceIndicator: 'https://api.assinafy.com.br',
			},
			{ response: { access_token: 'next-access', refresh_token: 'next-refresh' } },
		);
		await executeOAuth.call(ctx, 0, 'refreshToken');
		expect(formFields(lastPublic(requests))).toEqual({
			grant_type: 'refresh_token',
			client_id: 'example-client',
			refresh_token: 'example-refresh',
			resource: 'https://api.assinafy.com.br',
		});
	});

	it.each([undefined, '', '  ', 'example-refresh'])(
		'rejects a refresh success without a new refresh token: %j',
		async (refreshToken) => {
			const { ctx, httpRequest } = makeCtx(
				{ clientId: 'example-client', refreshToken: 'example-refresh' },
				{ response: { access_token: 'next-access', refresh_token: refreshToken } },
			);
			const failure = executeOAuth.call(ctx, 0, 'refreshToken');
			await expect(failure).rejects.toThrow('did not return a new refresh token');
			await expect(failure).rejects.not.toThrow('next-access');
			expect(httpRequest).toHaveBeenCalledTimes(1);
		},
	);

	it('handles empty revocation responses and the token type hint', async () => {
		const { ctx, requests } = makeCtx(
			{ clientId: 'example-client', oauthToken: 'example-token', tokenTypeHint: 'refresh_token' },
			{ response: undefined },
		);
		await expect(executeOAuth.call(ctx, 0, 'revokeToken')).resolves.toEqual({
			json: { revoked: true },
		});
		expect(lastPublic(requests)).toMatchObject({
			method: 'POST',
			url: 'https://api.assinafy.com.br/v1/oauth/revoke',
		});
		expect(formFields(lastPublic(requests))).toEqual({
			token: 'example-token',
			client_id: 'example-client',
			token_type_hint: 'refresh_token',
		});
	});

	it('requests UserInfo with either a provided Bearer token or the connected credential', async () => {
		const explicit = makeCtx({ accessToken: ' example-access ' });
		await executeOAuth.call(explicit.ctx, 0, 'getUserInfo');
		expect(lastPublic(explicit.requests)).toMatchObject({
			method: 'GET',
			url: 'https://api.assinafy.com.br/v1/oauth/userinfo',
			headers: { Authorization: 'Bearer example-access' },
		});
		const connected = makeCtx({ authentication: 'oAuth2' });
		await executeOAuth.call(connected.ctx, 0, 'getUserInfo');
		expect(connected.httpRequestWithAuthentication).toHaveBeenCalledWith(
			DELEGATED_CREDENTIAL_TYPE,
			expect.any(Object),
		);
	});

	it.each(['exchangeCode', 'refreshToken', 'revokeToken'])(
		'never retries a single-use OAuth request: %s',
		async (operation) => {
			const { ctx, httpRequest } = makeCtx(
				{ ...codeParams, refreshToken: 'example-refresh', oauthToken: 'example-token' },
				{
					rejectWith: { httpCode: 429, response: { headers: { 'retry-after': '0' } } },
				},
			);
			await expect(executeOAuth.call(ctx, 0, operation)).rejects.toThrow('Assinafy API POST');
			expect(httpRequest).toHaveBeenCalledTimes(1);
		},
	);

	it.each([
		{ clientId: '' },
		{ clientId: null },
		{ authorizationCode: '' },
		{ codeVerifier: 'too-short' },
		{ codeVerifier: 'a'.repeat(129) },
		{ codeVerifier: '!'.repeat(43) },
		{ redirectUri: 'http://localhost/callback' },
		{ redirectUri: 'not-a-url' },
		{ redirectUri: 'https://user:pass@example.com/callback' },
		{ redirectUri: 'https://example.com/callback#fragment' },
	])('validates code exchange before sending: %j', async (invalid) => {
		const { ctx, requests } = makeCtx({ ...codeParams, ...invalid });
		await expect(executeOAuth.call(ctx, 0, 'exchangeCode')).rejects.toThrow();
		expect(requests).toHaveLength(0);
	});

	it('rejects unknown operations and token hints', async () => {
		const { ctx, requests } = makeCtx({
			clientId: 'example-client',
			oauthToken: 'example-token',
			tokenTypeHint: 'invalid',
		});
		await expect(executeOAuth.call(ctx, 0, 'not-an-operation')).rejects.toThrow('Unknown OAuth');
		await expect(executeOAuth.call(ctx, 0, 'revokeToken')).rejects.toThrow('Token Type Hint');
		expect(requests).toHaveLength(0);
	});
});
