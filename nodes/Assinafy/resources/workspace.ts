import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, assinafyApiRequestAllItems } from '../shared/transport';
import { limitField, returnAllField } from '../shared/descriptions';

const showOnly = (operation: string[]) => ({
	resource: ['workspace'],
	operation,
});

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
			{ name: 'Get', value: 'get', action: 'Get a workspace' },
			{ name: 'List', value: 'list', action: 'List accessible workspaces' },
			{ name: 'Update', value: 'update', action: 'Update a workspace' },
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
				displayName: 'Primary Color',
				name: 'primary_color',
				type: 'color',
				default: '',
			},
			{
				displayName: 'Secondary Color',
				name: 'secondary_color',
				type: 'color',
				default: '',
			},
		],
	},

	// --- update/get/delete need id ---
	{
		displayName: 'Workspace ID',
		name: 'workspaceId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnly(['get', 'update', 'delete']) },
		description: 'ID of the workspace to operate on',
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnly(['update']) },
		options: [
			{ displayName: 'Name', name: 'name', type: 'string', default: '' },
			{ displayName: 'Primary Color', name: 'primary_color', type: 'color', default: '' },
			{ displayName: 'Secondary Color', name: 'secondary_color', type: 'color', default: '' },
		],
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
		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unknown workspace operation: ${operation}`,
				{ itemIndex },
			);
	}
}

function wrap(data: unknown): INodeExecutionData {
	return { json: (data ?? {}) as IDataObject };
}

async function createWorkspace(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const name = this.getNodeParameter('name', itemIndex) as string;
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const body: IDataObject = { name };
	if (additional.primary_color) body.primary_color = additional.primary_color;
	if (additional.secondary_color) body.secondary_color = additional.secondary_color;
	return assinafyApiRequest<IDataObject>(this, { method: 'POST', path: '/accounts', body });
}

async function listWorkspaces(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;

	if (returnAll) {
		const items = await assinafyApiRequestAllItems<IDataObject>(this, {
			method: 'GET',
			path: '/accounts',
		});
		return items.map((item) => ({ json: item }));
	}

	const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
	const response = await assinafyApiRequest<IDataObject[] | { data?: IDataObject[] }>(this, {
		method: 'GET',
		path: '/accounts',
		qs: { 'per-page': limit },
	});
	const items = Array.isArray(response)
		? response
		: ((response as { data?: IDataObject[] }).data ?? []);
	return items.map((item) => ({ json: item }));
}

async function getWorkspace(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, { method: 'GET', path: `/accounts/${id}` });
}

async function updateWorkspace(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	const updates = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
	if (Object.keys(updates).length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			'At least one update field is required',
			{ itemIndex },
		);
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/accounts/${id}`,
		body: updates,
	});
}

async function deleteWorkspace(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = this.getNodeParameter('workspaceId', itemIndex) as string;
	await assinafyApiRequest(this, { method: 'DELETE', path: `/accounts/${id}` });
	return { deleted: true, workspaceId: id };
}
