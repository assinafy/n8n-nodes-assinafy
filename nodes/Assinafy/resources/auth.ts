import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest } from '../shared/transport';
import { showOnly as showOnlyFor, wrap } from '../shared/utils';

const showOnly = showOnlyFor('auth');

export const authDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['auth'] } },
		default: 'login',
		options: [
			{
				name: 'Change Password',
				value: 'changePassword',
				action: 'Change the authenticated user password',
			},
			{ name: 'Create API Key', value: 'createApiKey', action: 'Generate a new API key' },
			{ name: 'Delete API Key', value: 'deleteApiKey', action: 'Revoke the current API key' },
			{
				name: 'Get API Key (Masked)',
				value: 'getApiKey',
				action: 'Retrieve a masked view of the current API key',
			},
			{
				name: 'Link Social Login',
				value: 'linkSocialLogin',
				action: 'Link a social provider to the authenticated user',
			},
			{ name: 'Login', value: 'login', action: 'Exchange email and password for an access token' },
			{
				name: 'Request Password Reset',
				value: 'requestPasswordReset',
				action: 'Email password reset instructions to a user',
			},
			{
				name: 'Reset Password',
				value: 'resetPassword',
				action: 'Set a new password using the reset token',
			},
			{
				name: 'Social Login',
				value: 'socialLogin',
				action: 'Trade a social provider token for an access token',
			},
		],
	},

	// login
	{
		displayName: 'Email',
		name: 'authEmail',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'name@example.com',
		displayOptions: {
			show: showOnly(['login', 'changePassword', 'requestPasswordReset', 'resetPassword']),
		},
	},
	{
		displayName: 'Password',
		name: 'authPassword',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		displayOptions: { show: showOnly(['login', 'createApiKey']) },
	},

	// social
	{
		displayName: 'Provider',
		name: 'provider',
		type: 'options',
		default: 'google',
		options: [{ name: 'Google', value: 'google' }],
		displayOptions: { show: showOnly(['socialLogin', 'linkSocialLogin']) },
	},
	{
		displayName: 'Social Token',
		name: 'socialToken',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description: 'Access or ID token received from the social provider',
		displayOptions: { show: showOnly(['socialLogin', 'linkSocialLogin']) },
	},
	{
		displayName: 'Has Accepted Terms',
		name: 'hasAcceptedTerms',
		type: 'boolean',
		default: true,
		displayOptions: { show: showOnly(['socialLogin']) },
	},

	// API key ops require an access token (Bearer)
	{
		displayName: 'Access Token',
		name: 'accessToken',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description:
			'Optional JWT from Login or Social Login. Leave empty to authenticate with the configured API key.',
		displayOptions: {
			show: showOnly([
				'linkSocialLogin',
				'createApiKey',
				'getApiKey',
				'deleteApiKey',
				'changePassword',
			]),
		},
	},

	// change password
	{
		displayName: 'Current Password',
		name: 'currentPassword',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		displayOptions: { show: showOnly(['changePassword']) },
	},
	{
		displayName: 'New Password',
		name: 'newPassword',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		displayOptions: { show: showOnly(['changePassword', 'resetPassword']) },
	},

	// reset password
	{
		displayName: 'Reset Token',
		name: 'resetToken',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description: 'Token received in the password-reset email',
		displayOptions: { show: showOnly(['resetPassword']) },
	},
];

export async function executeAuth(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	switch (operation) {
		case 'login':
			return wrap(await login.call(this, itemIndex));
		case 'socialLogin':
			return wrap(await socialLogin.call(this, itemIndex));
		case 'linkSocialLogin':
			return wrap(await linkSocialLogin.call(this, itemIndex));
		case 'createApiKey':
			return wrap(await createApiKey.call(this, itemIndex));
		case 'getApiKey':
			return wrap(await getApiKey.call(this, itemIndex));
		case 'deleteApiKey':
			return wrap(await deleteApiKey.call(this, itemIndex));
		case 'changePassword':
			return wrap(await changePassword.call(this, itemIndex));
		case 'requestPasswordReset':
			return wrap(await requestPasswordReset.call(this, itemIndex));
		case 'resetPassword':
			return wrap(await resetPassword.call(this, itemIndex));
		default:
			throw new NodeOperationError(this.getNode(), `Unknown auth operation: ${operation}`, {
				itemIndex,
			});
	}
}

async function linkSocialLogin(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const provider = this.getNodeParameter('provider', itemIndex, 'google') as string;
	const token = this.getNodeParameter('socialToken', itemIndex) as string;
	const accessToken = this.getNodeParameter('accessToken', itemIndex, '') as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: '/auth/link-social-login',
		body: { provider, token },
		...optionalBearer(accessToken),
	});
}

function bearerHeader(token: string): IDataObject {
	return { Authorization: `Bearer ${token}` };
}

function optionalBearer(token: string): { headers?: IDataObject; skipAuth?: boolean } {
	const trimmed = token.trim();
	return trimmed ? { headers: bearerHeader(trimmed), skipAuth: true } : {};
}

async function login(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const email = this.getNodeParameter('authEmail', itemIndex) as string;
	const password = this.getNodeParameter('authPassword', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: '/login',
		body: { email, password },
		skipAuth: true,
	});
}

async function socialLogin(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const provider = this.getNodeParameter('provider', itemIndex, 'google') as string;
	const token = this.getNodeParameter('socialToken', itemIndex) as string;
	const hasAcceptedTerms = this.getNodeParameter('hasAcceptedTerms', itemIndex, true) as boolean;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: '/authentication/social-login',
		body: { provider, token, has_accepted_terms: hasAcceptedTerms },
		skipAuth: true,
	});
}

async function createApiKey(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accessToken = this.getNodeParameter('accessToken', itemIndex, '') as string;
	const password = this.getNodeParameter('authPassword', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: '/users/api-keys',
		body: { password },
		...optionalBearer(accessToken),
	});
}

async function getApiKey(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accessToken = this.getNodeParameter('accessToken', itemIndex, '') as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: '/users/api-keys',
		...optionalBearer(accessToken),
	});
}

async function deleteApiKey(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accessToken = this.getNodeParameter('accessToken', itemIndex, '') as string;
	await assinafyApiRequest(this, {
		method: 'DELETE',
		path: '/users/api-keys',
		...optionalBearer(accessToken),
	});
	return { deleted: true };
}

async function changePassword(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accessToken = this.getNodeParameter('accessToken', itemIndex, '') as string;
	const email = this.getNodeParameter('authEmail', itemIndex) as string;
	const password = this.getNodeParameter('currentPassword', itemIndex) as string;
	const newPassword = this.getNodeParameter('newPassword', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: '/authentication/change-password',
		body: { email, password, new_password: newPassword },
		...optionalBearer(accessToken),
	});
}

async function requestPasswordReset(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const email = this.getNodeParameter('authEmail', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: '/authentication/request-password-reset',
		body: { email },
		skipAuth: true,
	});
}

async function resetPassword(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const email = this.getNodeParameter('authEmail', itemIndex) as string;
	const token = this.getNodeParameter('resetToken', itemIndex, '') as string;
	const newPassword = this.getNodeParameter('newPassword', itemIndex) as string;
	const body: IDataObject = { email, new_password: newPassword };
	if (token) body.token = token;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: '/authentication/reset-password',
		body,
		skipAuth: true,
	});
}
