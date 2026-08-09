import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation } from '../shared/transport';
import { limitField, returnAllField } from '../shared/descriptions';
import {
	asArray,
	assertBinaryFormat,
	parseBinaryResponse,
	showOnly as showOnlyFor,
	wrap,
} from '../shared/utils';

const showOnly = showOnlyFor('workspace');

export const workspaceDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['workspace'] } },
		default: 'list',
		options: [
			{ name: 'Create', value: 'create', action: 'Create a workspace' },
			{ name: 'Delete', value: 'delete', action: 'Delete a workspace' },
			{ name: 'Delete Logo', value: 'deleteLogo', action: 'Delete the workspace logo' },
			{ name: 'Download Logo', value: 'downloadLogo', action: 'Download the workspace logo' },
			{ name: 'Get', value: 'get', action: 'Get a workspace' },
			{
				name: 'Get Account Statistics',
				value: 'getAccountStats',
				action: 'Get document statistics for a workspace',
			},
			{
				name: 'Get Current User',
				value: 'getCurrentUser',
				action: 'Get the authenticated user and accessible workspaces',
			},
			{ name: 'Get Theme', value: 'getTheme', action: 'Get the workspace theme' },
			{
				name: 'Get User Statistics',
				value: 'getUserStats',
				action: 'Get document statistics across the current user workspaces',
			},
			{ name: 'List', value: 'list', action: 'List accessible workspaces' },
			{ name: 'Update', value: 'update', action: 'Update a workspace' },
			{ name: 'Upload Logo', value: 'uploadLogo', action: 'Upload or replace the workspace logo' },
		],
	},

	// --- create ---
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'Workspace name',
		displayOptions: { show: showOnly(['create']) },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnly(['create']) },
		options: [
			{
				displayName: 'Notification Sender',
				name: 'notification_sender_type',
				type: 'options',
				default: 'User',
				description: 'Name signers see as the sender of document notifications',
				options: [
					{ name: 'User', value: 'User' },
					{ name: 'Workspace', value: 'Account' },
				],
			},
			{ displayName: 'Primary Color', name: 'primary_color', type: 'color', default: '' },
			{ displayName: 'Secondary Color', name: 'secondary_color', type: 'color', default: '' },
		],
	},

	// --- operations needing a workspace id ---
	{
		displayName: 'Workspace ID',
		name: 'workspaceId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: showOnly([
				'get',
				'getAccountStats',
				'update',
				'delete',
				'getTheme',
				'uploadLogo',
				'downloadLogo',
				'deleteLogo',
			]),
		},
		description: 'ID of the workspace to operate on',
	},
	{
		displayName: 'Granularity',
		name: 'granularity',
		type: 'options',
		default: 'monthly',
		description: 'Whether to return the last 12 months or each day in one month',
		options: [
			{ name: 'Monthly', value: 'monthly' },
			{ name: 'Daily', value: 'daily' },
		],
		displayOptions: { show: showOnly(['getAccountStats', 'getUserStats']) },
	},
	{
		displayName: 'Month',
		name: 'statsMonth',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 2026-08',
		description: 'Target month in YYYY-MM format',
		displayOptions: {
			show: { ...showOnly(['getAccountStats', 'getUserStats']), granularity: ['daily'] },
		},
	},

	// --- update / delete ---
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnly(['update']) },
		options: [
			{
				displayName: 'Notification Sender',
				name: 'notification_sender_type',
				type: 'options',
				default: 'User',
				options: [
					{ name: 'User', value: 'User' },
					{ name: 'Workspace', value: 'Account' },
				],
			},
			{ displayName: 'Name', name: 'name', type: 'string', default: '' },
			{ displayName: 'Primary Color', name: 'primary_color', type: 'color', default: '' },
			{ displayName: 'Secondary Color', name: 'secondary_color', type: 'color', default: '' },
		],
	},
	{
		displayName: 'Force',
		name: 'force',
		type: 'boolean',
		default: false,
		description:
			'Whether to cancel an active paid subscription and delete immediately. Use only with a disposable workspace.',
		displayOptions: { show: showOnly(['delete']) },
	},

	// --- uploadLogo / downloadLogo ---
	{
		displayName: 'Binary Property',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description: 'Name of the binary property holding the logo image (PNG or JPEG)',
		displayOptions: { show: showOnly(['uploadLogo']) },
	},
	{
		displayName: 'Put Output In Field',
		name: 'binaryOutputProperty',
		type: 'string',
		default: 'data',
		description: 'Name of the binary property on the output item to write the logo into',
		displayOptions: { show: showOnly(['downloadLogo']) },
	},

	// --- list ---
	{ ...returnAllField, displayOptions: { show: showOnly(['list']) } },
	{
		...limitField,
		displayOptions: { show: { ...showOnly(['list']), returnAll: [false] } },
	},
];

export async function executeWorkspace(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	switch (operation) {
		case 'create':
			return wrap(await createWorkspace.call(this, itemIndex));
		case 'list':
			return listWorkspaces.call(this, itemIndex);
		case 'get':
			return wrap(await getWorkspace.call(this, itemIndex));
		case 'update':
			return wrap(await updateWorkspace.call(this, itemIndex));
		case 'delete':
			return wrap(await deleteWorkspace.call(this, itemIndex));
		case 'getCurrentUser':
			return wrap(await getCurrentUser.call(this));
		case 'getAccountStats':
			return getAccountStats.call(this, itemIndex);
		case 'getUserStats':
			return getUserStats.call(this, itemIndex);
		case 'getTheme':
			return wrap(await getTheme.call(this, itemIndex));
		case 'uploadLogo':
			return wrap(await uploadLogo.call(this, itemIndex));
		case 'downloadLogo':
			return downloadLogo.call(this, itemIndex);
		case 'deleteLogo':
			return wrap(await deleteLogo.call(this, itemIndex));
		default:
			throw new NodeOperationError(this.getNode(), `Unknown workspace operation: ${operation}`, {
				itemIndex,
			});
	}
}

async function getAccountStats(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	return getStats.call(this, itemIndex, `/accounts/${id}/stats`);
}

async function getUserStats(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	return getStats.call(this, itemIndex, '/users/self/stats');
}

async function getStats(
	this: IExecuteFunctions,
	itemIndex: number,
	path: string,
): Promise<INodeExecutionData[]> {
	const granularity = this.getNodeParameter('granularity', itemIndex, 'monthly') as string;
	const qs: IDataObject = { granularity };
	if (granularity === 'daily') {
		const month = (this.getNodeParameter('statsMonth', itemIndex, '') as string).trim();
		if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
			throw new NodeOperationError(this.getNode(), 'Month must use YYYY-MM format', { itemIndex });
		}
		qs.month = month;
	}
	const response = await assinafyApiRequest<IDataObject[] | { data?: IDataObject[] }>(this, {
		method: 'GET',
		path,
		qs,
	});
	return asArray<IDataObject>(response).map((row) => ({ json: row }));
}

async function createWorkspace(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const name = this.getNodeParameter('name', itemIndex) as string;
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const body: IDataObject = { name };
	if (additional.notification_sender_type) {
		body.notification_sender_type = additional.notification_sender_type;
	}
	if (additional.primary_color) body.primary_color = additional.primary_color;
	if (additional.secondary_color) body.secondary_color = additional.secondary_color;
	return assinafyApiRequest<IDataObject>(this, { method: 'POST', path: '/accounts', body });
}

async function listWorkspaces(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	return executeListOperation(this, itemIndex, { path: '/accounts' });
}

async function getWorkspace(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, { method: 'GET', path: `/accounts/${id}` });
}

async function updateWorkspace(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	const updates = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
	if (Object.keys(updates).length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one update field is required', {
			itemIndex,
		});
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/accounts/${id}`,
		body: updates,
	});
}

async function deleteWorkspace(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	const force = this.getNodeParameter('force', itemIndex, false) as boolean;
	await assinafyApiRequest(this, {
		method: 'DELETE',
		path: `/accounts/${id}`,
		body: force ? { force: true } : undefined,
	});
	return { deleted: true, workspaceId: id };
}

/** GET /users/self — the authenticated user plus the workspaces they can access. */
async function getCurrentUser(this: IExecuteFunctions): Promise<IDataObject> {
	return assinafyApiRequest<IDataObject>(this, { method: 'GET', path: '/users/self' });
}

/** GET /accounts/{id}/theme — branding (name, colors, logo URL) for a workspace. */
async function getTheme(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, { method: 'GET', path: `/accounts/${id}/theme` });
}

async function uploadLogo(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	const binaryPropertyName = this.getNodeParameter(
		'binaryPropertyName',
		itemIndex,
		'data',
	) as string;
	const binary = this.helpers.assertBinaryData(itemIndex, binaryPropertyName) as IBinaryData;
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	if (buffer.byteLength === 0) {
		throw new NodeOperationError(this.getNode(), 'The logo image is empty', { itemIndex });
	}
	const mimeType = assertBinaryFormat(
		this,
		buffer,
		binary.mimeType || 'application/octet-stream',
		['png', 'jpeg'],
		'Workspace logo',
		itemIndex,
	);

	const form = new FormData();
	const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	form.append('file', new Blob([view], { type: mimeType }), binary.fileName || 'logo.png');
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${id}/logo`,
		body: form,
	});
}

async function downloadLogo(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	const outputProperty = this.getNodeParameter('binaryOutputProperty', itemIndex, 'data') as string;
	const response = (await assinafyApiRequest<unknown>(this, {
		method: 'GET',
		path: `/accounts/${id}/logo`,
		returnBinary: true,
	})) as { body?: Buffer | ArrayBuffer; headers?: IDataObject };

	const { buffer, mimeType } = parseBinaryResponse(
		this,
		response,
		'image/png',
		'Workspace logo download',
		itemIndex,
	);
	const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
	const fileName = `${id}-logo.${extension}`;

	const binary = await this.helpers.prepareBinaryData(buffer, fileName, mimeType);
	return {
		json: { workspaceId: id, fileName, mimeType, size: buffer.byteLength },
		binary: { [outputProperty]: binary },
	};
}

async function deleteLogo(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	await assinafyApiRequest(this, { method: 'DELETE', path: `/accounts/${id}/logo` });
	return { deleted: true, workspaceId: id };
}
