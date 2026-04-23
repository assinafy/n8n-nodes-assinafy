import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

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
			placeholder: 'https://api.assinafy.com.br/v1',
			displayOptions: {
				show: {
					environment: ['custom'],
				},
			},
			description: 'Override the API base URL. Must include the /v1 path.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default:
				'={{$self.environment === "sandbox" ? "https://sandbox.assinafy.com.br/v1" : $self.environment === "custom" ? ($self.customBaseUrl || "https://api.assinafy.com.br/v1") : "https://api.assinafy.com.br/v1"}}',
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

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-Api-Key': '={{$credentials.apiKey}}',
				Accept: 'application/json',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '=/accounts/{{$credentials.accountId}}',
			method: 'GET',
		},
	};
}
