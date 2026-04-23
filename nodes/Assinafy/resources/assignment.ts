import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, getAccountId } from '../shared/transport';
import { assignmentIdField, documentResourceLocator } from '../shared/descriptions';

const showOnly = (operation: string[]) => ({
	resource: ['assignment'],
	operation,
});

export const assignmentDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['assignment'] } },
		default: 'create',
		options: [
			{
				name: 'Cancel Signature Request',
				value: 'cancel',
				action: 'Cancel an active signature request',
			},
			{ name: 'Create', value: 'create', action: 'Create an assignment' },
			{
				name: 'Estimate Cost',
				value: 'estimateCost',
				action: 'Estimate the credit cost of an assignment',
			},
			{
				name: 'Estimate Resend Cost',
				value: 'estimateResendCost',
				action: 'Estimate the cost of resending a signer notification',
			},
			{
				name: 'Resend Notification',
				value: 'resendNotification',
				action: 'Resend the signing notification to a signer',
			},
			{
				name: 'Reset Expiration',
				value: 'resetExpiration',
				action: 'Update the expiration date of an assignment',
			},
		],
	},

	// Document target (used by every operation)
	{
		...documentResourceLocator,
		displayOptions: {
			show: showOnly([
				'create',
				'estimateCost',
				'resetExpiration',
				'resendNotification',
				'estimateResendCost',
				'cancel',
			]),
		},
	},

	// --- create / estimateCost payload ---
	{
		displayName: 'Method',
		name: 'method',
		type: 'options',
		default: 'virtual',
		description: 'Assignment method to use',
		displayOptions: { show: showOnly(['create', 'estimateCost']) },
		options: [
			{
				name: 'Virtual',
				value: 'virtual',
				description: 'Collect signatures remotely via email/WhatsApp',
			},
			{
				name: 'Collect',
				value: 'collect',
				description: 'Place signers directly on the document with field entries',
			},
		],
	},
	{
		displayName: 'Signers',
		name: 'signers',
		placeholder: 'Add Signer',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		description: 'Signers to add to the assignment',
		displayOptions: { show: showOnly(['create', 'estimateCost']) },
		options: [
			{
				displayName: 'Signer',
				name: 'signer',
				values: [
					{
						displayName: 'Signer ID',
						name: 'id',
						type: 'string',
						default: '',
						description:
							'Existing signer ID. Leave empty on "Estimate Cost" to estimate without a specific signer.',
					},
					{
						displayName: 'Verification Method',
						name: 'verification_method',
						type: 'options',
						default: 'Email',
						options: [
							{ name: 'Email', value: 'Email' },
							{ name: 'WhatsApp', value: 'Whatsapp' },
						],
					},
					{
						displayName: 'Notification Methods',
						name: 'notification_methods',
						type: 'multiOptions',
						default: ['Email'],
						options: [
							{ name: 'Email', value: 'Email' },
							{ name: 'WhatsApp', value: 'Whatsapp' },
						],
					},
				],
			},
		],
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
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Message shown to the signer(s) in the invite',
			},
			{
				displayName: 'Expires At',
				name: 'expires_at',
				type: 'dateTime',
				default: '',
				description: 'ISO8601 date at which the assignment expires',
			},
			{
				displayName: 'Copy Receivers',
				name: 'copy_receivers',
				type: 'string',
				typeOptions: { multipleValues: true, multipleValueButtonText: 'Add Signer ID' },
				default: [],
				description: 'Signer IDs that should receive a copy of the document without signing',
			},
		],
	},
	{
		displayName: 'Entries (JSON)',
		name: 'entries',
		type: 'json',
		default: '[]',
		required: true,
		description:
			'For collect assignments, provide an array like [{ "page_id": "...", "fields": [{ "signer_id": "...", "field_id": "...", "display_settings": { ... } }] }].',
		displayOptions: {
			show: {
				...showOnly(['create', 'estimateCost']),
				method: ['collect'],
			},
		},
	},

	// --- resetExpiration ---
	{ ...assignmentIdField, displayOptions: { show: showOnly(['resetExpiration']) } },
	{
		displayName: 'Expires At',
		name: 'expiresAt',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'New ISO8601 expiration date',
		displayOptions: { show: showOnly(['resetExpiration']) },
	},

	// --- resendNotification / estimateResendCost ---
	{
		...assignmentIdField,
		displayOptions: { show: showOnly(['resendNotification', 'estimateResendCost']) },
	},
	{
		displayName: 'Signer ID',
		name: 'signerId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnly(['resendNotification', 'estimateResendCost']) },
	},

	// --- cancel ---
	{
		displayName: 'Reason',
		name: 'reason',
		type: 'string',
		default: '',
		required: true,
		typeOptions: { rows: 3 },
		description: 'Reason for cancelling the signature request (shown in activity log)',
		displayOptions: { show: showOnly(['cancel']) },
	},
];

export async function executeAssignment(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	switch (operation) {
		case 'create':
			return wrap(await createAssignment.call(this, itemIndex));
		case 'estimateCost':
			return wrap(await estimateCost.call(this, itemIndex));
		case 'resetExpiration':
			return wrap(await resetExpiration.call(this, itemIndex));
		case 'resendNotification':
			return wrap(await resendNotification.call(this, itemIndex));
		case 'estimateResendCost':
			return wrap(await estimateResendCost.call(this, itemIndex));
		case 'cancel':
			return wrap(await cancelSignatureRequest.call(this, itemIndex));
		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unknown assignment operation: ${operation}`,
				{ itemIndex },
			);
	}
}

function wrap(data: unknown): INodeExecutionData {
	return { json: (data ?? {}) as IDataObject };
}

interface SignerEntry {
	id?: string;
	verification_method?: string;
	notification_methods?: string[];
}

function buildAssignmentBody(
	this: IExecuteFunctions,
	itemIndex: number,
	options: { allowSignersWithoutId?: boolean } = {},
): IDataObject {
	const method = this.getNodeParameter('method', itemIndex, 'virtual') as string;
	const signersParam = this.getNodeParameter('signers', itemIndex, {}) as {
		signer?: SignerEntry[];
	};
	const entries = signersParam.signer ?? [];
	if (entries.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one signer is required', {
			itemIndex,
		});
	}
	const signers: IDataObject[] = [];
	for (const entry of entries) {
		const ref: IDataObject = {};
		if (entry.id) ref.id = entry.id;
		if (entry.verification_method) ref.verification_method = entry.verification_method;
		if (entry.notification_methods && entry.notification_methods.length > 0) {
			ref.notification_methods = entry.notification_methods;
		}
		if (!ref.id && !options.allowSignersWithoutId) {
			throw new NodeOperationError(
				this.getNode(),
				'Each signer requires an ID for this operation',
				{ itemIndex },
			);
		}
		signers.push(ref);
	}

	const body: IDataObject = { method, signers };

	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	if (additional.message) body.message = additional.message;
	if (additional.expires_at) body.expires_at = additional.expires_at;
	if (
		Array.isArray(additional.copy_receivers) &&
		(additional.copy_receivers as unknown[]).length > 0
	) {
		body.copy_receivers = additional.copy_receivers;
	}

	if (method === 'collect') {
		const entriesParam = this.getNodeParameter('entries', itemIndex, '[]') as unknown;
		const entries = parseJsonValue.call(this, entriesParam, 'Entries', itemIndex);
		if (!Array.isArray(entries) || entries.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Collect assignments require a non-empty Entries JSON array',
				{ itemIndex },
			);
		}
		body.entries = entries as IDataObject[];
	}

	return body;
}

async function createAssignment(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const body = buildAssignmentBody.call(this, itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/documents/${documentId}/assignments`,
		body,
	});
}

async function estimateCost(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const body = buildAssignmentBody.call(this, itemIndex, { allowSignersWithoutId: true });
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/documents/${documentId}/assignments/estimate-cost`,
		body,
	});
}

async function resetExpiration(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const assignmentId = this.getNodeParameter('assignmentId', itemIndex) as string;
	const expiresAt = this.getNodeParameter('expiresAt', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/documents/${documentId}/assignments/${assignmentId}/reset-expiration`,
		body: { expires_at: expiresAt },
	});
}

async function resendNotification(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const assignmentId = this.getNodeParameter('assignmentId', itemIndex) as string;
	const signerId = this.getNodeParameter('signerId', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/documents/${documentId}/assignments/${assignmentId}/signers/${signerId}/resend`,
	});
}

async function estimateResendCost(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const assignmentId = this.getNodeParameter('assignmentId', itemIndex) as string;
	const signerId = this.getNodeParameter('signerId', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/documents/${documentId}/assignments/${assignmentId}/signers/${signerId}/estimate-resend-cost`,
	});
}

async function cancelSignatureRequest(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const documentId = extractDocumentId.call(this, itemIndex);
	const reason = this.getNodeParameter('reason', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/signature-requests/${documentId}/cancel`,
		body: { document_id: documentId, reason },
	});
}

function extractDocumentId(this: IExecuteFunctions, itemIndex: number): string {
	const id = this.getNodeParameter('documentId', itemIndex, '', { extractValue: true }) as string;
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'Document ID is required', { itemIndex });
	}
	return id;
}

function parseJsonValue(
	this: IExecuteFunctions,
	value: unknown,
	fieldName: string,
	itemIndex: number,
): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch {
		throw new NodeOperationError(this.getNode(), `${fieldName} must be valid JSON`, {
			itemIndex,
		});
	}
}
