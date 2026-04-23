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
import {
	limitField,
	returnAllField,
	searchField,
	signerResourceLocator,
	sortField,
} from '../shared/descriptions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const showOnly = (operation: string[]) => ({
	resource: ['signer'],
	operation,
});

export const signerDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['signer'] } },
		default: 'create',
		options: [
			{ name: 'Create', value: 'create', action: 'Create a signer' },
			{ name: 'Delete', value: 'delete', action: 'Delete a signer' },
			{
				name: 'Find by Email',
				value: 'findByEmail',
				action: 'Look up a signer by email address',
			},
			{ name: 'Get', value: 'get', action: 'Get a signer' },
			{ name: 'List', value: 'list', action: 'List signers' },
			{ name: 'Update', value: 'update', action: 'Update a signer' },
		],
	},

	// --- create / update shared body fields ---
	{
		displayName: 'Full Name',
		name: 'fullName',
		type: 'string',
		default: '',
		required: true,
		description: 'Signer full name',
		displayOptions: { show: showOnly(['create']) },
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@example.com',
		default: '',
		required: true,
		description: 'Signer email address',
		displayOptions: { show: showOnly(['create', 'findByEmail']) },
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
				displayName: 'Reuse If Exists',
				name: 'reuseIfExists',
				type: 'boolean',
				default: true,
				description:
					'Whether to look up an existing signer with this email first and return it instead of creating a duplicate (mirrors the official SDK behavior)',
			},
			{
				displayName: 'WhatsApp Phone Number',
				name: 'whatsapp_phone_number',
				type: 'string',
				default: '',
				placeholder: '+5511999999999',
				description: 'WhatsApp number (for WhatsApp verification/notification)',
			},
			{
				displayName: 'Metadata (JSON)',
				name: 'metadata',
				type: 'json',
				default: '{}',
			},
		],
	},

	// --- operations that need a signer id ---
	{
		...signerResourceLocator,
		displayOptions: { show: showOnly(['get', 'update', 'delete']) },
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
			{ displayName: 'Full Name', name: 'full_name', type: 'string', default: '' },
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
			},
			{
				displayName: 'WhatsApp Phone Number',
				name: 'whatsapp_phone_number',
				type: 'string',
				default: '',
			},
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
		options: [{ ...searchField }, { ...sortField }],
	},
];

export async function executeSigner(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	const accountId = await getAccountId(this);

	switch (operation) {
		case 'create':
			return wrap(await createSigner.call(this, itemIndex, accountId));
		case 'list':
			return listSigners.call(this, itemIndex, accountId);
		case 'get':
			return wrap(await getSigner.call(this, itemIndex, accountId));
		case 'update':
			return wrap(await updateSigner.call(this, itemIndex, accountId));
		case 'delete':
			return wrap(await deleteSigner.call(this, itemIndex, accountId));
		case 'findByEmail':
			return wrap(await findByEmail.call(this, itemIndex, accountId));
		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unknown signer operation: ${operation}`,
				{ itemIndex },
			);
	}
}

function wrap(data: unknown): INodeExecutionData {
	return { json: (data ?? {}) as IDataObject };
}

async function createSigner(
	this: IExecuteFunctions,
	itemIndex: number,
	accountId: string,
): Promise<IDataObject> {
	const fullName = this.getNodeParameter('fullName', itemIndex) as string;
	const email = this.getNodeParameter('email', itemIndex) as string;
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const reuseIfExists = additional.reuseIfExists !== false;

	assertEmail.call(this, email, itemIndex);

	if (reuseIfExists) {
		const existing = await lookupSignerByEmail.call(this, accountId, email);
		if (existing) return existing;
	}

	const body: IDataObject = {
		full_name: fullName,
		email,
	};
	if (additional.whatsapp_phone_number) body.whatsapp_phone_number = additional.whatsapp_phone_number;
	if (additional.metadata !== undefined && additional.metadata !== '') {
		const metadata =
			typeof additional.metadata === 'string'
				? safeJsonParse(additional.metadata)
				: additional.metadata;
		body.metadata = metadata as IDataObject;
	}

	try {
		return await assinafyApiRequest<IDataObject>(this, {
			method: 'POST',
			path: `/accounts/${accountId}/signers`,
			body,
		});
	} catch (error) {
		const code = (error as { httpCode?: string | number }).httpCode;
		if (reuseIfExists && (code === 409 || code === '409')) {
			const existing = await lookupSignerByEmail.call(this, accountId, email);
			if (existing) return existing;
		}
		throw error;
	}
}

async function listSigners(
	this: IExecuteFunctions,
	itemIndex: number,
	accountId: string,
): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const path = `/accounts/${accountId}/signers`;
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

async function getSigner(
	this: IExecuteFunctions,
	itemIndex: number,
	accountId: string,
): Promise<IDataObject> {
	const signerId = extractSignerId.call(this, itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/accounts/${accountId}/signers/${signerId}`,
	});
}

async function updateSigner(
	this: IExecuteFunctions,
	itemIndex: number,
	accountId: string,
): Promise<IDataObject> {
	const signerId = extractSignerId.call(this, itemIndex);
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
		path: `/accounts/${accountId}/signers/${signerId}`,
		body: updates,
	});
}

async function deleteSigner(
	this: IExecuteFunctions,
	itemIndex: number,
	accountId: string,
): Promise<IDataObject> {
	const signerId = extractSignerId.call(this, itemIndex);
	await assinafyApiRequest(this, {
		method: 'DELETE',
		path: `/accounts/${accountId}/signers/${signerId}`,
	});
	return { deleted: true, signerId };
}

async function findByEmail(
	this: IExecuteFunctions,
	itemIndex: number,
	accountId: string,
): Promise<IDataObject> {
	const email = this.getNodeParameter('email', itemIndex) as string;
	assertEmail.call(this, email, itemIndex);
	const match = await lookupSignerByEmail.call(this, accountId, email);
	return match ?? { found: false, email };
}

async function lookupSignerByEmail(
	this: IExecuteFunctions,
	accountId: string,
	email: string,
): Promise<IDataObject | null> {
	try {
		const response = await assinafyApiRequest<IDataObject[] | { data?: IDataObject[] }>(this, {
			method: 'GET',
			path: `/accounts/${accountId}/signers`,
			qs: { search: email, 'per-page': 100 },
		});
		const signers = Array.isArray(response)
			? response
			: ((response as { data?: IDataObject[] }).data ?? []);
		return (
			signers.find((s) => String(s.email ?? '').toLowerCase() === email.toLowerCase()) ?? null
		);
	} catch (error) {
		const code = (error as { httpCode?: string | number }).httpCode;
		if (code === 404 || code === '404') return null;
		throw error;
	}
}

function extractSignerId(this: IExecuteFunctions, itemIndex: number): string {
	const id = this.getNodeParameter('signerId', itemIndex, '', { extractValue: true }) as string;
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'Signer ID is required', { itemIndex });
	}
	return id;
}

function assertEmail(this: IExecuteFunctions, email: string, itemIndex: number): void {
	if (!EMAIL_RE.test(email)) {
		throw new NodeOperationError(this.getNode(), 'Invalid email address', { itemIndex });
	}
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

function safeJsonParse(value: string | IDataObject): IDataObject {
	if (typeof value === 'object' && value !== null) return value;
	try {
		const parsed = JSON.parse(value);
		return typeof parsed === 'object' && parsed !== null ? (parsed as IDataObject) : {};
	} catch {
		return {};
	}
}
