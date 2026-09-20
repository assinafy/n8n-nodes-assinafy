import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest } from '../shared/transport';
import { showOnly as showOnlyFor, wrap } from '../shared/utils';

const showOnly = showOnlyFor('oauth');

export const oauthDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['oauth'] } },
		default: 'getMetadata',
		options: [
			{
				name: 'Exchange Code',
				value: 'exchangeCode',
				action: 'Exchange a PKCE authorization code for tokens',
			},
			{
				name: 'Get Metadata',
				value: 'getMetadata',
				action: 'Get o auth protected resource metadata',
			},
			{
				name: 'Get User Info',
				value: 'getUserInfo',
				action: 'Get the authorized user open id connect claims',
			},
			{ name: 'Refresh Token', value: 'refreshToken', action: 'Exchange a rotating refresh token' },
			{
				name: 'Revoke Token',
				value: 'revokeToken',
				action: 'Revoke an o auth access or refresh token',
			},
		],
	},
	{
		displayName:
			'Use the Assinafy OAuth2 API credential for normal workflows: n8n manages consent, PKCE, encrypted token storage and refresh. These token operations are for integrations that manage their own OAuth connection; token output is sensitive execution data.',
		name: 'tokenNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnly(['exchangeCode', 'refreshToken', 'revokeToken']) },
	},
	{
		displayName: 'Client ID',
		name: 'clientId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnly(['exchangeCode', 'refreshToken', 'revokeToken']) },
	},
	{
		displayName: 'Client Secret',
		name: 'clientSecret',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description: 'Required for a confidential application. Omit for a public application.',
		displayOptions: { show: showOnly(['exchangeCode', 'refreshToken', 'revokeToken']) },
	},
	{
		displayName: 'Authorization Code',
		name: 'authorizationCode',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description: 'Single-use code returned after consent. Expires after 60 seconds.',
		displayOptions: { show: showOnly(['exchangeCode']) },
	},
	{
		displayName: 'Redirect URI',
		name: 'redirectUri',
		type: 'string',
		default: '',
		required: true,
		description: 'Exact registered HTTPS callback URI used in the authorization request',
		displayOptions: { show: showOnly(['exchangeCode']) },
	},
	{
		displayName: 'Code Verifier',
		name: 'codeVerifier',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description: 'Original PKCE verifier, 43–128 characters from A–Z, a–z, 0–9, -, ., _, ~',
		displayOptions: { show: showOnly(['exchangeCode']) },
	},
	{
		displayName: 'Refresh Token',
		name: 'refreshToken',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description:
			'Current refresh token. Save the replacement before another refresh; reuse revokes the connection.',
		displayOptions: { show: showOnly(['refreshToken']) },
	},
	{
		displayName: 'Resource Indicator',
		name: 'resourceIndicator',
		type: 'string',
		default: '',
		description:
			'Optional resource value from protected-resource metadata. Must match the value used during authorization.',
		displayOptions: { show: showOnly(['exchangeCode', 'refreshToken']) },
	},
	{
		displayName: 'Token',
		name: 'oauthToken',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		displayOptions: { show: showOnly(['revokeToken']) },
	},
	{
		displayName: 'Token Type Hint',
		name: 'tokenTypeHint',
		type: 'options',
		default: '',
		options: [
			{ name: 'Automatic', value: '' },
			{ name: 'Access Token', value: 'access_token' },
			{ name: 'Refresh Token', value: 'refresh_token' },
		],
		displayOptions: { show: showOnly(['revokeToken']) },
	},
	{
		displayName: 'Access Token',
		name: 'accessToken',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description:
			'Optional OAuth Bearer token with openid scope. Leave empty to use the connected OAuth credential.',
		displayOptions: { show: showOnly(['getUserInfo']) },
	},
];

export async function executeOAuth(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData> {
	if (operation === 'getMetadata') {
		return wrap(
			await assinafyApiRequest(this, {
				method: 'GET',
				path: '/.well-known/oauth-protected-resource',
				basePath: 'origin',
				skipAuth: true,
			}),
		);
	}
	if (operation === 'getUserInfo') {
		const token = String(this.getNodeParameter('accessToken', itemIndex, '')).trim();
		return wrap(
			await assinafyApiRequest(this, {
				method: 'GET',
				path: '/oauth/userinfo',
				...(token ? { headers: { Authorization: `Bearer ${token}` }, skipAuth: true } : {}),
			}),
		);
	}
	if (!['exchangeCode', 'refreshToken', 'revokeToken'].includes(operation)) {
		throw new NodeOperationError(this.getNode(), `Unknown OAuth operation: ${operation}`, {
			itemIndex,
		});
	}
	const required = (name: string, label: string): string => {
		const input = this.getNodeParameter(name, itemIndex, '');
		const value = typeof input === 'string' ? input.trim() : '';
		if (!value) throw new NodeOperationError(this.getNode(), `${label} is required`, { itemIndex });
		return value;
	};
	const body: IDataObject = { client_id: required('clientId', 'Client ID') };
	const secret = String(this.getNodeParameter('clientSecret', itemIndex, '')).trim();
	if (secret) body.client_secret = secret;
	if (operation !== 'revokeToken') {
		const resource = String(this.getNodeParameter('resourceIndicator', itemIndex, '')).trim();
		if (resource) body.resource = resource;
	}
	if (operation === 'exchangeCode') {
		body.grant_type = 'authorization_code';
		body.code = required('authorizationCode', 'Authorization Code');
		body.code_verifier = required('codeVerifier', 'Code Verifier');
		if (!/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier)) {
			throw new NodeOperationError(
				this.getNode(),
				'Code Verifier must be a valid 43–128 character PKCE verifier',
				{ itemIndex },
			);
		}
		body.redirect_uri = required('redirectUri', 'Redirect URI');
		let redirect: URL;
		try {
			redirect = new URL(body.redirect_uri);
		} catch {
			throw new NodeOperationError(this.getNode(), 'Redirect URI must be an absolute HTTPS URL', {
				itemIndex,
			});
		}
		if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash) {
			throw new NodeOperationError(
				this.getNode(),
				'Redirect URI must use HTTPS without user information or a fragment',
				{ itemIndex },
			);
		}
	} else if (operation === 'refreshToken') {
		body.grant_type = 'refresh_token';
		body.refresh_token = required('refreshToken', 'Refresh Token');
	} else {
		body.token = required('oauthToken', 'Token');
		const hint = String(this.getNodeParameter('tokenTypeHint', itemIndex, '')).trim();
		if (hint && !['access_token', 'refresh_token'].includes(hint)) {
			throw new NodeOperationError(
				this.getNode(),
				'Token Type Hint must be access_token or refresh_token',
				{ itemIndex },
			);
		}
		if (hint) body.token_type_hint = hint;
	}
	const result = await assinafyApiRequest(this, {
		method: 'POST',
		path: operation === 'revokeToken' ? '/oauth/revoke' : '/oauth/token',
		body,
		skipAuth: true,
		retry: false,
	});
	return wrap(operation === 'revokeToken' ? { revoked: true } : result);
}
