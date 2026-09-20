import type { ICredentialTestRequest, ICredentialType, INodeProperties, Icon } from 'n8n-workflow';
import { DEFAULT_BASE_URL } from '../nodes/Assinafy/shared/baseUrl';

export class AssinafyOAuth2Api implements ICredentialType {
	name = 'assinafyOAuth2Api';
	displayName = 'Assinafy OAuth2 API';
	extends = ['oAuth2Api'];
	icon: Icon = { light: 'file:../icons/assinafy.svg', dark: 'file:../icons/assinafy.dark.svg' };
	documentationUrl = 'https://api.assinafy.com.br/v1/docs';
	properties: INodeProperties[] = [
		{ displayName: 'Grant Type', name: 'grantType', type: 'hidden', default: 'pkce' },
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://auth.assinafy.com.br/oauth/authorize',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: `${DEFAULT_BASE_URL}/oauth/token`,
		},
		{ displayName: 'Authentication', name: 'authentication', type: 'hidden', default: 'body' },
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Required for confidential applications. Leave empty for a public application.',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			default: 'documents:read documents:write templates:read account:read offline_access',
			description:
				'Space-separated permissions registered for your application. Request offline_access for automatic refresh. Add openid, profile or email only when needed.',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: 'resource=https%3A%2F%2Fapi.assinafy.com.br',
		},
		{
			displayName: 'Account ID',
			name: 'accountId',
			type: 'string',
			default: '',
			description:
				'Optional workspace ID. Leave empty to discover the single workspace selected during consent. A connection cannot access another workspace.',
		},
		{
			displayName:
				'OAuth is available in Production. Register the exact HTTPS OAuth Redirect URL shown above in your Assinafy application. Webhook administration, passwords and API keys require an Assinafy API credential.',
			name: 'oauthNotice',
			type: 'notice',
			default: '',
		},
	];

	test: ICredentialTestRequest = {
		request: { method: 'GET', url: `${DEFAULT_BASE_URL}/accounts` },
	};
}
