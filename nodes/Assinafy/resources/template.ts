import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation, getAccountId } from '../shared/transport';
import { limitField, returnAllField, searchField, sortField } from '../shared/descriptions';
import { cleanQs, normalizeTagFilter, showOnly as showOnlyFor, wrap } from '../shared/utils';

const showOnly = showOnlyFor('template');

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
			{
				displayName: 'Tag IDs',
				name: 'tags',
				type: 'string',
				typeOptions: { multipleValues: true },
				default: [],
				description: 'Tag IDs to filter by. Assinafy returns templates that have all listed tags.',
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
			throw new NodeOperationError(this.getNode(), `Unknown template operation: ${operation}`, {
				itemIndex,
			});
	}
}

async function listTemplates(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const accountId = await getAccountId(this);
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	return executeListOperation(this, itemIndex, {
		path: `/accounts/${accountId}/templates`,
		qs: normalizeTagFilter(cleanQs(filters)),
	});
}

async function getTemplate(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
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
