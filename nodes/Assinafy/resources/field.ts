import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, getAccountId } from '../shared/transport';
import {
	asArray,
	cleanQs,
	extractRequiredId,
	parseJsonParam,
	showOnly as showOnlyFor,
	wrap,
} from '../shared/utils';

const showOnly = showOnlyFor('field');

export const fieldDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['field'] } },
		default: 'list',
		options: [
			{ name: 'Create', value: 'create', action: 'Create a field definition' },
			{ name: 'Delete', value: 'delete', action: 'Delete a field definition' },
			{ name: 'Get', value: 'get', action: 'Get a field definition' },
			{ name: 'List', value: 'list', action: 'List workspace field definitions' },
			{ name: 'List Types', value: 'listTypes', action: 'List allowed input types' },
			{ name: 'Update', value: 'update', action: 'Update a field definition' },
			{
				name: 'Validate',
				value: 'validate',
				action: 'Validate a value against a field definition',
			},
			{
				name: 'Validate Multiple',
				value: 'validateMultiple',
				action: 'Validate multiple values at once',
			},
		],
	},

	// --- create ---
	{
		displayName: 'Type',
		name: 'fieldType',
		type: 'string',
		default: '',
		required: true,
		description: 'Input type code (use List Types to discover allowed values)',
		displayOptions: { show: showOnly(['create']) },
	},
	{
		displayName: 'Name',
		name: 'fieldName',
		type: 'string',
		default: '',
		required: true,
		description: 'Display label shown to signers',
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
				displayName: 'Regex',
				name: 'regex',
				type: 'string',
				default: '',
				placeholder: '/[0-9]{2}-[0-9]{4}/',
				description: 'Regular expression used to validate text inputs',
			},
			{
				displayName: 'Is Required',
				name: 'is_required',
				type: 'boolean',
				default: true,
			},
			{
				displayName: 'Is Active',
				name: 'is_active',
				type: 'boolean',
				default: true,
			},
		],
	},

	// --- list ---
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showOnly(['list']) },
		options: [
			{
				displayName: 'Include Inactive',
				name: 'include_inactive',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Include Standard',
				name: 'include_standard',
				type: 'boolean',
				default: false,
				description: 'Whether to include standard fields (signature, initial, signatureDate)',
			},
		],
	},

	// --- get / update / delete / validate ---
	{
		displayName: 'Field ID',
		name: 'fieldId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: showOnly(['get', 'update', 'delete', 'validate']),
		},
	},

	// --- update ---
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnly(['update']) },
		options: [
			{ displayName: 'Is Active', name: 'is_active', type: 'boolean', default: true },
			{ displayName: 'Is Required', name: 'is_required', type: 'boolean', default: true },
			{ displayName: 'Name', name: 'name', type: 'string', default: '' },
			{ displayName: 'Regex', name: 'regex', type: 'string', default: '' },
			{ displayName: 'Type', name: 'type', type: 'string', default: '' },
		],
	},

	// --- validate / validateMultiple shared ---
	{
		displayName: 'Signer Access Code',
		name: 'signerAccessCode',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description: 'Required when validating as a signer instead of an authenticated user',
		displayOptions: { show: showOnly(['validate', 'validateMultiple']) },
	},

	// --- validate ---
	{
		displayName: 'Value',
		name: 'validateValue',
		type: 'string',
		default: '',
		required: true,
		description: 'Value to validate against the field definition',
		displayOptions: { show: showOnly(['validate']) },
	},

	// --- validateMultiple ---
	{
		displayName: 'Items (JSON)',
		name: 'validateItems',
		type: 'json',
		default: '[]',
		required: true,
		description: 'Array of {field_id, value} objects: [{ "field_id": "...", "value": "..." }, ...]',
		displayOptions: { show: showOnly(['validateMultiple']) },
	},
];

export async function executeField(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	switch (operation) {
		case 'create':
			return wrap(await createField.call(this, itemIndex));
		case 'list':
			return wrap({ fields: await listFields.call(this, itemIndex) });
		case 'get':
			return wrap(await getField.call(this, itemIndex));
		case 'update':
			return wrap(await updateField.call(this, itemIndex));
		case 'delete':
			return wrap(await deleteField.call(this, itemIndex));
		case 'validate':
			return wrap(await validateField.call(this, itemIndex));
		case 'validateMultiple':
			return wrap({ results: await validateMultiple.call(this, itemIndex) });
		case 'listTypes':
			return wrap({ types: await listFieldTypes.call(this) });
		default:
			throw new NodeOperationError(this.getNode(), `Unknown field operation: ${operation}`, {
				itemIndex,
			});
	}
}

async function createField(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const type = (this.getNodeParameter('fieldType', itemIndex) as string).trim();
	const name = (this.getNodeParameter('fieldName', itemIndex) as string).trim();
	if (!type || !name) {
		throw new NodeOperationError(this.getNode(), 'Type and Name are required', { itemIndex });
	}
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const body: IDataObject = { type, name, ...cleanQs(additional) };
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/fields`,
		body,
	});
}

async function listFields(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	const accountId = await getAccountId(this);
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const qs = cleanQs(filters);
	const response = await assinafyApiRequest<IDataObject[] | { data?: IDataObject[] }>(this, {
		method: 'GET',
		path: `/accounts/${accountId}/fields`,
		qs,
	});
	return asArray<IDataObject>(response);
}

async function getField(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const fieldId = extractRequiredId(this, 'fieldId', 'Field ID', itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/accounts/${accountId}/fields/${fieldId}`,
	});
}

async function updateField(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const fieldId = extractRequiredId(this, 'fieldId', 'Field ID', itemIndex);
	const updates = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
	if (Object.keys(updates).length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one update field is required', {
			itemIndex,
		});
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/accounts/${accountId}/fields/${fieldId}`,
		body: updates,
	});
}

async function deleteField(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const fieldId = extractRequiredId(this, 'fieldId', 'Field ID', itemIndex);
	await assinafyApiRequest(this, {
		method: 'DELETE',
		path: `/accounts/${accountId}/fields/${fieldId}`,
	});
	return { deleted: true, fieldId };
}

async function validateField(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const fieldId = extractRequiredId(this, 'fieldId', 'Field ID', itemIndex);
	const value = this.getNodeParameter('validateValue', itemIndex) as string;
	const signerCode = (this.getNodeParameter('signerAccessCode', itemIndex, '') as string).trim();
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/fields/${fieldId}/validate`,
		qs: signerCode ? { 'signer-access-code': signerCode } : undefined,
		body: { value },
	});
}

async function validateMultiple(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const accountId = await getAccountId(this);
	const signerCode = (this.getNodeParameter('signerAccessCode', itemIndex, '') as string).trim();
	const raw = this.getNodeParameter('validateItems', itemIndex, '[]') as unknown;
	const items = parseJsonParam(this, raw, 'Items', itemIndex);
	if (!Array.isArray(items) || items.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Items must be a non-empty JSON array', {
			itemIndex,
		});
	}
	const response = await assinafyApiRequest<IDataObject[]>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/fields/validate-multiple`,
		qs: signerCode ? { 'signer-access-code': signerCode } : undefined,
		body: items as unknown as IDataObject,
	});
	return asArray<IDataObject>(response);
}

async function listFieldTypes(this: IExecuteFunctions): Promise<IDataObject[]> {
	const response = await assinafyApiRequest<IDataObject[]>(this, {
		method: 'GET',
		path: '/field-types',
	});
	return Array.isArray(response) ? response : [];
}
