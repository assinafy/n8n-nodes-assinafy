import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation, getAccountId } from '../shared/transport';
import {
	limitField,
	returnAllField,
	searchField,
	signerResourceLocator,
	sortField,
} from '../shared/descriptions';
import {
	asArray,
	assertBinaryFormat,
	assertEmail,
	cleanQs,
	extractRequiredId,
	parseBinaryResponse,
	parseJsonParam,
	requireAccessCode,
	sanitizeCpf,
	showOnly as showOnlyFor,
	wrap,
} from '../shared/utils';

const showOnly = showOnlyFor('signer');

const SELF_OPS = new Set([
	'getSelf',
	'acceptTerms',
	'verifyCode',
	'confirmData',
	'uploadSignature',
	'downloadSignature',
]);

export const signerDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['signer'] } },
		default: 'create',
		options: [
			{
				name: 'Accept Terms (Signer Side)',
				value: 'acceptTerms',
				action: 'Signer accepts the terms of use',
			},
			{
				name: 'Confirm Data (Signer Side)',
				value: 'confirmData',
				action: 'Signer confirms email or whatsapp before signing',
			},
			{ name: 'Create', value: 'create', action: 'Create a signer' },
			{ name: 'Delete', value: 'delete', action: 'Delete a signer' },
			{
				name: 'Download Signature (Signer Side)',
				value: 'downloadSignature',
				action: 'Download a signer signature or initial image',
			},
			{
				name: 'Find by Email',
				value: 'findByEmail',
				action: 'Look up a signer by email address',
			},
			{ name: 'Get', value: 'get', action: 'Get a signer' },
			{
				name: 'Get Self (Signer Side)',
				value: 'getSelf',
				action: 'Signer retrieves their own info via access code',
			},
			{ name: 'List', value: 'list', action: 'List signers' },
			{ name: 'Update', value: 'update', action: 'Update a signer' },
			{
				name: 'Upload Signature (Signer Side)',
				value: 'uploadSignature',
				action: 'Upload a signer signature or initial image',
			},
			{
				name: 'Verify Code (Signer Side)',
				value: 'verifyCode',
				action: 'Submit a six digit verification code',
			},
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
		description:
			'Signer email address. Optional when using WhatsApp-only verification/notification. At least one of Email or WhatsApp Phone Number must be provided.',
		displayOptions: { show: showOnly(['create']) },
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@example.com',
		default: '',
		required: true,
		description: 'Email address to search for',
		displayOptions: { show: showOnly(['findByEmail']) },
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
				displayName: 'CPF',
				name: 'cpf',
				type: 'string',
				default: '',
				placeholder: '123.456.789-00',
				description: 'Brazilian tax ID (CPF). Non-digit characters are stripped before sending.',
			},
			{
				displayName: 'Metadata (JSON)',
				name: 'metadata',
				type: 'json',
				default: '{}',
			},
			{
				displayName: 'Reuse If Exists',
				name: 'reuseIfExists',
				type: 'boolean',
				default: true,
				description:
					'Whether to look up an existing signer with this email first and return it instead of creating a duplicate. Only applies when an email is provided.',
			},
			{
				displayName: 'WhatsApp Phone Number',
				name: 'whatsapp_phone_number',
				type: 'string',
				default: '',
				placeholder: '+5511999999999',
				description:
					'WhatsApp phone number in E.164 format (e.g. +5548999990000). Required when using WhatsApp verification or notification.',
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
			{
				displayName: 'CPF',
				name: 'cpf',
				type: 'string',
				default: '',
				placeholder: '123.456.789-00',
				description: 'Brazilian tax ID (CPF). Non-digit characters are stripped before sending.',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@example.com',
				default: '',
			},
			{ displayName: 'Full Name', name: 'full_name', type: 'string', default: '' },
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

	// --- signer-side operations: shared access code ---
	{
		displayName: 'Signer Access Code',
		name: 'signerAccessCode',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description: 'Per-signer access code (from the email/WhatsApp link)',
		displayOptions: {
			show: showOnly([
				'getSelf',
				'acceptTerms',
				'verifyCode',
				'confirmData',
				'uploadSignature',
				'downloadSignature',
			]),
		},
	},

	// --- verifyCode ---
	{
		displayName: 'Verification Code',
		name: 'verificationCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: '123456',
		description: '6-digit code delivered to the signer via email or WhatsApp',
		displayOptions: { show: showOnly(['verifyCode']) },
	},

	// --- confirmData ---
	{
		displayName: 'Document ID',
		name: 'confirmDocumentId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnly(['confirmData']) },
	},
	{
		displayName: 'Confirm Fields',
		name: 'confirmFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnly(['confirmData']) },
		options: [
			{
				displayName: 'Accept Terms',
				name: 'has_accepted_terms',
				type: 'boolean',
				default: false,
				description:
					'Whether to accept terms through this legacy runtime-compatible field. Prefer the dedicated Accept Terms operation.',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@example.com',
				default: '',
			},
			{ displayName: 'Full Name', name: 'full_name', type: 'string', default: '' },
			{
				displayName: 'Government ID',
				name: 'government_id',
				type: 'string',
				default: '',
				description: 'Government-issued identifier to confirm for this signer',
			},
			{
				displayName: 'WhatsApp Phone Number',
				name: 'whatsapp_phone_number',
				type: 'string',
				default: '',
				placeholder: '+5548999990000',
				description: 'Legacy runtime-compatible field; not listed in the current OpenAPI schema',
			},
		],
	},

	// --- uploadSignature / downloadSignature ---
	{
		displayName: 'Signature Type',
		name: 'signatureType',
		type: 'options',
		default: 'signature',
		options: [
			{ name: 'Signature', value: 'signature' },
			{ name: 'Initial', value: 'initial' },
		],
		displayOptions: { show: showOnly(['uploadSignature', 'downloadSignature']) },
	},
	{
		displayName: 'Binary Property',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description: 'PNG/JPEG image binary on the incoming item (uploadSignature)',
		displayOptions: { show: showOnly(['uploadSignature']) },
	},
	{
		displayName: 'Signature Options',
		name: 'signatureOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showOnly(['uploadSignature']) },
		options: [
			{
				displayName: 'Reuse in Future Processes',
				name: 'reuse',
				type: 'boolean',
				default: false,
				description:
					'Whether the signer opted to reuse this signature later. Leave this option unset to preserve the existing preference.',
			},
		],
	},
	{
		displayName: 'Put Output In Field',
		name: 'binaryOutputProperty',
		type: 'string',
		default: 'data',
		displayOptions: { show: showOnly(['downloadSignature']) },
	},
];

export async function executeSigner(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	const needsAccount = !SELF_OPS.has(operation);
	const accountId = needsAccount ? await getAccountId(this) : '';

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
		case 'getSelf':
			return wrap(await getSelf.call(this, itemIndex));
		case 'acceptTerms':
			return wrap(await acceptTerms.call(this, itemIndex));
		case 'verifyCode':
			return wrap(await verifyCode.call(this, itemIndex));
		case 'confirmData':
			return wrap(await confirmData.call(this, itemIndex));
		case 'uploadSignature':
			return wrap(await uploadSignature.call(this, itemIndex));
		case 'downloadSignature':
			return downloadSignature.call(this, itemIndex);
		default:
			throw new NodeOperationError(this.getNode(), `Unknown signer operation: ${operation}`, {
				itemIndex,
			});
	}
}

async function createSigner(
	this: IExecuteFunctions,
	itemIndex: number,
	accountId: string,
): Promise<IDataObject> {
	const fullName = this.getNodeParameter('fullName', itemIndex) as string;
	const email = (this.getNodeParameter('email', itemIndex, '') as string).trim();
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const reuseIfExists = additional.reuseIfExists !== false;

	if (email && !assertEmail(email)) {
		throw new NodeOperationError(this.getNode(), 'Invalid email address', { itemIndex });
	}

	if (!email && !additional.whatsapp_phone_number) {
		throw new NodeOperationError(
			this.getNode(),
			'At least one of Email or WhatsApp Phone Number is required to create a signer',
			{ itemIndex },
		);
	}

	if (email && reuseIfExists) {
		const existing = await lookupSignerByEmail.call(this, accountId, email);
		if (existing) return existing;
	}

	const body: IDataObject = { full_name: fullName };
	if (email) body.email = email;
	if (additional.whatsapp_phone_number)
		body.whatsapp_phone_number = additional.whatsapp_phone_number;
	if (additional.cpf) body.cpf = sanitizeCpf(additional.cpf as string);
	if (additional.metadata !== undefined && additional.metadata !== '') {
		const metadata = parseJsonParam(this, additional.metadata, 'Metadata', itemIndex);
		if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
			throw new NodeOperationError(this.getNode(), 'Metadata must be a JSON object', {
				itemIndex,
			});
		}
		body.metadata = metadata as IDataObject;
	}

	try {
		return await assinafyApiRequest<IDataObject>(this, {
			method: 'POST',
			path: `/accounts/${accountId}/signers`,
			body,
		});
	} catch (error) {
		// A duplicate email loses the lookup→create race; the API rejects it with
		// HTTP 400 ("Um signatário com este e-mail já existe."), not 409 (verified
		// live). On any duplicate-style failure, re-resolve and return the existing
		// signer rather than surfacing the conflict.
		const code = String((error as { httpCode?: string | number }).httpCode ?? '');
		if (email && reuseIfExists && (code === '400' || code === '409')) {
			const existing = await lookupSignerByEmail.call(this, accountId, email);
			if (existing) return existing;
		}
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

async function listSigners(
	this: IExecuteFunctions,
	itemIndex: number,
	accountId: string,
): Promise<INodeExecutionData[]> {
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	return executeListOperation(this, itemIndex, {
		path: `/accounts/${accountId}/signers`,
		qs: cleanQs(filters),
	});
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
		throw new NodeOperationError(this.getNode(), 'At least one update field is required', {
			itemIndex,
		});
	}
	const body: IDataObject = { ...updates };
	if (body.cpf) body.cpf = sanitizeCpf(body.cpf as string);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/accounts/${accountId}/signers/${signerId}`,
		body,
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
	if (!assertEmail(email)) {
		throw new NodeOperationError(this.getNode(), 'Invalid email address', { itemIndex });
	}
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
		const signers = asArray<IDataObject>(response);
		return signers.find((s) => String(s.email ?? '').toLowerCase() === email.toLowerCase()) ?? null;
	} catch (error) {
		const code = (error as { httpCode?: string | number }).httpCode;
		if (code === 404 || code === '404') return null;
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

function extractSignerId(this: IExecuteFunctions, itemIndex: number): string {
	return extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
}

async function getSelf(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const code = requireAccessCode(this, itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: '/signers/self',
		qs: { 'signer-access-code': code },
		skipAuth: true,
	});
}

async function acceptTerms(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const code = requireAccessCode(this, itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: '/signers/accept-terms',
		qs: { 'signer-access-code': code },
		skipAuth: true,
	});
}

async function verifyCode(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const code = requireAccessCode(this, itemIndex);
	const verification = (this.getNodeParameter('verificationCode', itemIndex) as string).trim();
	if (!verification) {
		throw new NodeOperationError(this.getNode(), 'Verification Code is required', { itemIndex });
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: '/verify',
		qs: { 'signer-access-code': code },
		body: { 'verification-code': verification },
		skipAuth: true,
	});
}

async function confirmData(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const code = requireAccessCode(this, itemIndex);
	const documentId = (this.getNodeParameter('confirmDocumentId', itemIndex) as string).trim();
	if (!documentId) {
		throw new NodeOperationError(this.getNode(), 'Document ID is required', { itemIndex });
	}
	const fields = this.getNodeParameter('confirmFields', itemIndex, {}) as IDataObject;
	const body: IDataObject = {};
	if (fields.full_name) body.full_name = fields.full_name;
	if (fields.email) body.email = fields.email;
	if (fields.government_id) body.government_id = fields.government_id;
	if (fields.whatsapp_phone_number) body.whatsapp_phone_number = fields.whatsapp_phone_number;
	if (fields.has_accepted_terms) body.has_accepted_terms = true;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/documents/${documentId}/signers/confirm-data`,
		qs: { 'signer-access-code': code },
		body,
		skipAuth: true,
	});
}

async function uploadSignature(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const code = requireAccessCode(this, itemIndex);
	const type = this.getNodeParameter('signatureType', itemIndex, 'signature') as string;
	const binaryProperty = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const binary = this.helpers.assertBinaryData(itemIndex, binaryProperty) as IBinaryData;
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryProperty);
	if (buffer.byteLength === 0) {
		throw new NodeOperationError(this.getNode(), 'Signature image cannot be empty', { itemIndex });
	}
	const mime = assertBinaryFormat(
		this,
		buffer,
		binary.mimeType || 'application/octet-stream',
		['png', 'jpeg'],
		'Signature image',
		itemIndex,
	);
	const options = this.getNodeParameter('signatureOptions', itemIndex, {}) as IDataObject;
	const qs: IDataObject = { 'signer-access-code': code, type };
	if (typeof options.reuse === 'boolean') qs.reuse = options.reuse;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: '/signature',
		qs,
		body: buffer,
		headers: { 'Content-Type': mime },
		skipAuth: true,
	});
}

async function downloadSignature(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const code = requireAccessCode(this, itemIndex);
	const type = this.getNodeParameter('signatureType', itemIndex, 'signature') as string;
	const outputProperty = this.getNodeParameter('binaryOutputProperty', itemIndex, 'data') as string;
	const response = (await assinafyApiRequest<unknown>(this, {
		method: 'GET',
		path: `/signature/${type}`,
		qs: { 'signer-access-code': code },
		returnBinary: true,
		skipAuth: true,
	})) as { body?: Buffer | ArrayBuffer; headers?: IDataObject };
	const { buffer, mimeType: mime } = parseBinaryResponse(
		this,
		response,
		'image/png',
		'Signature download',
		itemIndex,
	);
	const ext = mime.includes('jpeg') ? 'jpg' : 'png';
	const fileName = `${type}.${ext}`;
	const data = await this.helpers.prepareBinaryData(buffer, fileName, mime);
	return {
		json: { type, fileName, mimeType: mime, size: buffer.byteLength },
		binary: { [outputProperty]: data },
	};
}
