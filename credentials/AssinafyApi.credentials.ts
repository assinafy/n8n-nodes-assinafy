import type {
	IAuthenticate,
	Icon,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';
import {
	DEFAULT_BASE_URL,
	SANDBOX_BASE_URL,
	validateAssinafyBaseUrl,
} from '../nodes/Assinafy/shared/baseUrl';

export class AssinafyApi implements ICredentialType {
	name = 'assinafyApi';

	displayName = 'Assinafy API';

	icon: Icon = { light: 'file:../icons/assinafy.svg', dark: 'file:../icons/assinafy.dark.svg' };

	documentationUrl = 'https://api.assinafy.com.br/v1/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			default: 'production',
			description: 'Which Assinafy environment to target',
			options: [
				{
					name: 'Production',
					value: 'production',
				},
				{
					name: 'Sandbox',
					value: 'sandbox',
				},
				{
					name: 'Custom',
					value: 'custom',
				},
			],
		},
		{
			displayName: 'Custom Base URL',
			name: 'customBaseUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://api.assinafy.com.br/v1',
			displayOptions: {
				show: {
					environment: ['custom'],
				},
			},
			description:
				'Override the API base URL. Must be an absolute HTTPS URL ending in /v1, without user info, query, or fragment. HTTP is allowed only for loopback development hosts.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default:
				'={{$self.environment === "sandbox" ? "https://sandbox.assinafy.com.br/v1" : $self.environment === "custom" ? $self.customBaseUrl : "https://api.assinafy.com.br/v1"}}',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Assinafy API key. Generate one from the Assinafy dashboard (sent as the X-Api-Key header).',
		},
		{
			displayName: 'Account ID',
			name: 'accountId',
			type: 'string',
			default: '',
			required: true,
			description:
				'Workspace (account) ID used by account-scoped endpoints such as /accounts/{id}/documents',
		},
		{
			displayName: 'Webhook Secret',
			name: 'webhookSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Optional shared secret used by the Trigger node to verify the HMAC-SHA256 signature on incoming webhook deliveries',
		},
	];

	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		const validation = validateAssinafyBaseUrl(resolveCredentialBaseUrl(credentials));
		if (!validation.valid) {
			// Authentication runs for both normal node requests and the credential
			// Test button, so reject before the API key is attached to either path.
			throw new ApplicationError(validation.error);
		}

		if (requestOptions.baseURL !== undefined) {
			requestOptions.baseURL = validation.url;
		}
		requestOptions.headers = {
			...(requestOptions.headers ?? {}),
			Accept: 'application/json',
			'X-Api-Key': String(credentials.apiKey ?? ''),
		};
		return requestOptions;
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '=/accounts/{{$credentials.accountId}}',
			method: 'GET',
		},
	};
}

function resolveCredentialBaseUrl(credentials: ICredentialDataDecryptedObject): string {
	const environment = String(credentials.environment ?? '').trim();
	if (environment === 'sandbox') return SANDBOX_BASE_URL;
	if (environment === 'custom') {
		return String(credentials.customBaseUrl ?? '').trim();
	}
	if (environment === 'production') return DEFAULT_BASE_URL;

	const computed = String(credentials.baseUrl ?? '').trim();
	if (computed && !computed.startsWith('=')) return computed;
	return DEFAULT_BASE_URL;
}
