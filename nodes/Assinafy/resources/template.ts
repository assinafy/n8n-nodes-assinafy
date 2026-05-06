import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	assinafyApiRequest,
	assinafyApiRequestAllItems,
	getAccountId,
} from '../shared/transport';
import { limitField, returnAllField, searchField, sortField } from '../shared/descriptions';

const showOnly = (operation: string[]) => ({
	resource: ['template'],
	operation,
});

export const templateDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['template'] } },
		default: 'list',
		options: [
			{ name: 'Get', value: 'get', action: 'Get a template' },
			{ name: 'List', value: 'list', action: 'List workspace templates' },
		],
	},

	// --- list ---
	{ ...returnAllField, displayOptions: { show: showOnly(['list']) } },
	{
		...limitField,
		displayOptions: { show: { ...showOnly(['list']), returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showOnly(['list']) },
		options: [
			{ ...searchField },
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: '',
				description: 'Filter by template status',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Processing', value: 'processing' },
					{ name: 'Ready', value: 'ready' },
					{ name: 'Uploaded', value: 'uploaded' },
					{ name: 'Uploading', value: 'uploading' },
				],
			},
			{ ...sortField },
		],
	},

	// --- get ---
	{
		displayName: 'Template ID',
		name: 'templateId',
		type: 'string',
		default: '',
		required: true,
		description: 'ID of the template to retrieve',
		displayOptions: { show: showOnly(['get']) },
	},
];

export async function executeTemplate(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	switch (operation) {
		case 'list':
			return listTemplates.call(this, itemIndex);
		case 'get':
			return wrap(await getTemplate.call(this, itemIndex));
		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unknown template operation: ${operation}`,
				{ itemIndex },
			);
	}
}

function wrap(data: unknown): INodeExecutionData {
	return { json: (data ?? {}) as IDataObject };
}

async function listTemplates(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const accountId = await getAccountId(this);
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const path = `/accounts/${accountId}/templates`;
	const qs = cleanQs(filters);

	if (returnAll) {
		const items = await assinafyApiRequestAllItems<IDataObject>(this, {
			method: 'GET',
			path,
			qs,
		});
		return items.map((item) => ({ json: item }));
	}

	const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
	const response = await assinafyApiRequest<IDataObject[] | { data?: IDataObject[] }>(this, {
		method: 'GET',
		path,
		qs: { ...qs, 'per-page': limit },
	});
	const items = Array.isArray(response)
		? response
		: ((response as { data?: IDataObject[] }).data ?? []);
	return items.map((item) => ({ json: item }));
}

async function getTemplate(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const templateId = this.getNodeParameter('templateId', itemIndex) as string;
	if (!templateId) {
		throw new NodeOperationError(this.getNode(), 'Template ID is required', { itemIndex });
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/accounts/${accountId}/templates/${templateId}`,
	});
}

function cleanQs(filters: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== null && value !== '') {
			out[key] = value as IDataObject[keyof IDataObject];
		}
	}
	return out;
}
