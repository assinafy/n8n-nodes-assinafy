import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation, getAccountId } from '../shared/transport';
import {
	limitField,
	returnAllField,
	searchField,
	tagResourceLocator,
} from '../shared/descriptions';
import {
	cleanQs,
	extractRequiredId,
	normalizeHexColor,
	showOnly as showOnlyFor,
	wrap,
} from '../shared/utils';

const showOnly = showOnlyFor('tag');

export const tagDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['tag'] } },
		default: 'list',
		options: [
			{ name: 'Create', value: 'create', action: 'Create a workspace tag' },
			{ name: 'Delete', value: 'delete', action: 'Delete a workspace tag' },
			{ name: 'List', value: 'list', action: 'List workspace tags' },
			{ name: 'Update', value: 'update', action: 'Update a workspace tag' },
		],
	},

	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		typeOptions: { maxLength: 64 },
		description: 'Tag display name (max 64 characters). Assinafy trims and normalizes whitespace.',
		displayOptions: { show: showOnly(['create']) },
	},
	{
		displayName: 'Color',
		name: 'color',
		type: 'color',
		default: '',
		placeholder: 'ff8800',
		description: 'Optional 6-character hex color, with or without the leading #',
		displayOptions: { show: showOnly(['create']) },
	},

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
		options: [{ ...searchField }],
	},

	{
		...tagResourceLocator,
		displayOptions: { show: showOnly(['update', 'delete']) },
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnly(['update']) },
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'New tag display name',
			},
			{
				displayName: 'Color',
				name: 'color',
				type: 'color',
				default: '',
				placeholder: '112233',
				description: 'New 6-character hex color, with or without the leading #',
			},
			{
				displayName: 'Clear Color',
				name: 'clearColor',
				type: 'boolean',
				default: false,
				description: 'Whether to clear the existing tag color',
			},
		],
	},
	{
		displayName: 'Force',
		name: 'force',
		type: 'boolean',
		default: false,
		description: 'Whether to detach the tag from all documents and templates before deleting it',
		displayOptions: { show: showOnly(['delete']) },
	},
];

export async function executeTag(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	switch (operation) {
		case 'create':
			return wrap(await createTag.call(this, itemIndex));
		case 'list':
			return listTags.call(this, itemIndex);
		case 'update':
			return wrap(await updateTag.call(this, itemIndex));
		case 'delete':
			return wrap(await deleteTag.call(this, itemIndex));
		default:
			throw new NodeOperationError(this.getNode(), `Unknown tag operation: ${operation}`, {
				itemIndex,
			});
	}
}

async function createTag(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const name = (this.getNodeParameter('name', itemIndex) as string).trim();
	if (!name) {
		throw new NodeOperationError(this.getNode(), 'Name is required', { itemIndex });
	}

	const body: IDataObject = { name };
	const color = normalizeHexColor(this, this.getNodeParameter('color', itemIndex, ''), itemIndex);
	if (color) body.color = color;

	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/tags`,
		body,
	});
}

async function listTags(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData[]> {
	const accountId = await getAccountId(this);
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	return executeListOperation(this, itemIndex, {
		path: `/accounts/${accountId}/tags`,
		qs: cleanQs(filters),
	});
}

async function updateTag(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const tagId = extractRequiredId(this, 'tagId', 'Tag ID', itemIndex);
	const updates = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;

	const hasColor = updates.color !== undefined && updates.color !== '';
	if (updates.clearColor && hasColor) {
		throw new NodeOperationError(
			this.getNode(),
			'Set either Color or Clear Color, not both',
			{ itemIndex },
		);
	}

	const body: IDataObject = {};
	if (updates.name) body.name = String(updates.name).trim();
	if (updates.clearColor) {
		body.color = null;
	} else if (hasColor) {
		body.color = normalizeHexColor(this, updates.color, itemIndex);
	}

	if (Object.keys(body).length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one update field is required', {
			itemIndex,
		});
	}

	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/accounts/${accountId}/tags/${tagId}`,
		body,
	});
}

async function deleteTag(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const tagId = extractRequiredId(this, 'tagId', 'Tag ID', itemIndex);
	const force = this.getNodeParameter('force', itemIndex, false) as boolean;

	await assinafyApiRequest(this, {
		method: 'DELETE',
		path: `/accounts/${accountId}/tags/${tagId}`,
		qs: force ? { force: true } : undefined,
	});
	return { deleted: true, tagId, force };
}
