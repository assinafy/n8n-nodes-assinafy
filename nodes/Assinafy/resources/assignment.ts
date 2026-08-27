import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation, getAccountId } from '../shared/transport';
import {
	assignmentIdField,
	documentResourceLocator,
	limitField,
	returnAllField,
} from '../shared/descriptions';
import {
	asArray,
	extractRequiredId,
	parseJsonParam,
	requireAccessCode,
	showOnly as showOnlyFor,
	validateDigitalCertificateSteps,
	validateSigningSteps,
	wrap,
} from '../shared/utils';

const showOnly = showOnlyFor('assignment');

export const assignmentDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['assignment'] } },
		default: 'create',
		options: [
			{ name: 'Create', value: 'create', action: 'Create an assignment' },
			{
				name: 'Decline (Signer Side)',
				value: 'decline',
				action: 'Signer declines to sign the document',
			},
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
				name: 'Get Sign Page',
				value: 'getSignPage',
				action: 'Signer reads document data for the signing flow',
			},
			{ name: 'List', value: 'list', action: 'List assignments for the current workspace' },
			{
				name: 'List WhatsApp Notifications',
				value: 'listWhatsapp',
				action: 'List notifications sent for this assignment via whatsapp',
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
			{
				name: 'Sign (Signer Side)',
				value: 'sign',
				action: 'Signer submits values for collect method input fields',
			},
		],
	},
	{ ...returnAllField, displayOptions: { show: showOnly(['list']) } },
	{
		...limitField,
		displayOptions: { show: { ...showOnly(['list']), returnAll: [false] } },
	},

	// Document target (all document-scoped operations)
	{
		...documentResourceLocator,
		displayOptions: {
			show: showOnly([
				'create',
				'estimateCost',
				'resetExpiration',
				'resendNotification',
				'estimateResendCost',
				'listWhatsapp',
				'sign',
				'decline',
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
							{ name: 'Digital Certificate', value: 'DigitalCertificate' },
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
					{
						displayName: 'Step',
						name: 'step',
						type: 'number',
						default: 0,
						typeOptions: { minValue: 0 },
						description:
							'Optional signing order. Set every signer to a contiguous sequence starting at 1, or leave every signer at 0 to notify all at once.',
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

	// --- listWhatsapp ---
	{ ...assignmentIdField, displayOptions: { show: showOnly(['listWhatsapp']) } },

	// --- sign / decline / getSignPage ---
	{
		displayName: 'Signer Access Code',
		name: 'signerAccessCode',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description: 'Per-signer access code (from the email/WhatsApp link)',
		displayOptions: { show: showOnly(['sign', 'decline', 'getSignPage']) },
	},
	{
		displayName: 'Accept Terms While Loading',
		name: 'hasAcceptedTerms',
		type: 'boolean',
		default: false,
		description:
			"Whether to accept the Assinafy terms while loading the sign page. Leave disabled to preserve the signer's current state.",
		displayOptions: { show: showOnly(['getSignPage']) },
	},
	{ ...assignmentIdField, displayOptions: { show: showOnly(['sign', 'decline']) } },
	{
		displayName: 'Items (JSON)',
		name: 'signItems',
		type: 'json',
		default: '[]',
		required: true,
		description:
			'Array of items to sign: [{ "itemId": "...", "fieldId": "...", "pageId": "...", "value": "..." }]',
		displayOptions: { show: showOnly(['sign']) },
	},
	{
		displayName: 'Decline Reason',
		name: 'declineReason',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		displayOptions: { show: showOnly(['decline']) },
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
		case 'listWhatsapp':
			return wrap({ notifications: await listWhatsappNotifications.call(this, itemIndex) });
		case 'getSignPage':
			return wrap(await getSignPage.call(this, itemIndex));
		case 'list':
			return listAssignments.call(this, itemIndex);
		case 'sign':
			return wrap(await signAssignment.call(this, itemIndex));
		case 'decline':
			return wrap(await declineAssignment.call(this, itemIndex));
		default:
			throw new NodeOperationError(this.getNode(), `Unknown assignment operation: ${operation}`, {
				itemIndex,
			});
	}
}

async function listAssignments(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	// The running API requires this camelCase account context even though the
	// published OpenAPI operation currently documents only page/per-page.
	const accountId = await getAccountId(this, false);
	return executeListOperation(this, itemIndex, { path: '/assignments', qs: { accountId } });
}

interface SignerEntry {
	id?: string;
	verification_method?: string;
	notification_methods?: string[];
	step?: number;
}

function buildAssignmentBody(
	this: IExecuteFunctions,
	itemIndex: number,
	options: { forEstimate?: boolean } = {},
): IDataObject {
	const method = this.getNodeParameter('method', itemIndex, 'virtual') as string;
	const signersParam = this.getNodeParameter('signers', itemIndex, {}) as {
		signer?: SignerEntry[];
	};
	const signerEntries = signersParam.signer ?? [];
	if (signerEntries.length === 0 && (!options.forEstimate || method === 'virtual')) {
		throw new NodeOperationError(this.getNode(), 'At least one signer is required', {
			itemIndex,
		});
	}
	if (!options.forEstimate) {
		validateSigningSteps(
			this,
			signerEntries.map((entry) => entry.step),
			itemIndex,
		);
		validateDigitalCertificateSteps(this, signerEntries, itemIndex);
	}
	const signers: IDataObject[] = [];
	for (const entry of signerEntries) {
		const ref: IDataObject = {};
		if (entry.verification_method) ref.verification_method = entry.verification_method;
		if (entry.notification_methods && entry.notification_methods.length > 0) {
			ref.notification_methods = entry.notification_methods;
		}
		if (!options.forEstimate && entry.id) ref.id = entry.id;
		if (!options.forEstimate && entry.step && entry.step > 0) ref.step = entry.step;
		if (!options.forEstimate && !ref.id) {
			throw new NodeOperationError(
				this.getNode(),
				'Each signer requires an ID for this operation',
				{ itemIndex },
			);
		}
		signers.push(ref);
	}

	const body: IDataObject = { method };
	if (signers.length > 0) body.signers = signers;

	if (!options.forEstimate) {
		const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
		if (additional.message) body.message = additional.message;
		if (additional.expires_at) body.expires_at = additional.expires_at;
		if (
			Array.isArray(additional.copy_receivers) &&
			(additional.copy_receivers as unknown[]).length > 0
		) {
			body.copy_receivers = additional.copy_receivers;
		}
	}

	if (method === 'collect') {
		const entriesParam = this.getNodeParameter('entries', itemIndex, '[]') as unknown;
		const collectEntries = parseJsonParam(this, entriesParam, 'Entries', itemIndex);
		if (!Array.isArray(collectEntries) || collectEntries.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Collect assignments require a non-empty Entries JSON array',
				{ itemIndex },
			);
		}
		body.entries = collectEntries as IDataObject[];
	}

	return body;
}

async function createAssignment(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const body = buildAssignmentBody.call(this, itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/documents/${documentId}/assignments`,
		body,
	});
}

async function estimateCost(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const body = buildAssignmentBody.call(this, itemIndex, { forEstimate: true });
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/documents/${documentId}/assignments/estimate-cost`,
		body,
	});
}

async function resetExpiration(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const assignmentId = extractRequiredId(this, 'assignmentId', 'Assignment ID', itemIndex);
	const expiresAt = (this.getNodeParameter('expiresAt', itemIndex) as string).trim();
	if (!expiresAt) {
		throw new NodeOperationError(this.getNode(), 'Expires At is required', { itemIndex });
	}
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
	const assignmentId = extractRequiredId(this, 'assignmentId', 'Assignment ID', itemIndex);
	const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
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
	const assignmentId = extractRequiredId(this, 'assignmentId', 'Assignment ID', itemIndex);
	const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/documents/${documentId}/assignments/${assignmentId}/signers/${signerId}/estimate-resend-cost`,
	});
}

function extractDocumentId(this: IExecuteFunctions, itemIndex: number): string {
	return extractRequiredId(this, 'documentId', 'Document ID', itemIndex);
}

async function listWhatsappNotifications(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const assignmentId = extractRequiredId(this, 'assignmentId', 'Assignment ID', itemIndex);
	const response = await assinafyApiRequest<IDataObject[]>(this, {
		method: 'GET',
		path: `/documents/${documentId}/assignments/${assignmentId}/whatsapp-notifications`,
	});
	return asArray<IDataObject>(response);
}

async function getSignPage(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const code = requireAccessCode(this, itemIndex);
	const hasAcceptedTerms = this.getNodeParameter('hasAcceptedTerms', itemIndex, false) as boolean;
	const qs: IDataObject = { 'signer-access-code': code };
	if (hasAcceptedTerms) qs.has_accepted_terms = true;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: '/sign',
		qs,
		skipAuth: true,
	});
}

async function signAssignment(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const assignmentId = extractRequiredId(this, 'assignmentId', 'Assignment ID', itemIndex);
	const code = requireAccessCode(this, itemIndex);
	const raw = this.getNodeParameter('signItems', itemIndex, '[]') as unknown;
	const items = parseJsonParam(this, raw, 'Items', itemIndex);
	if (!Array.isArray(items) || items.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Items must be a non-empty JSON array', {
			itemIndex,
		});
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/documents/${documentId}/assignments/${assignmentId}`,
		qs: { 'signer-access-code': code },
		body: items as IDataObject[],
		skipAuth: true,
	});
}

async function declineAssignment(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const assignmentId = extractRequiredId(this, 'assignmentId', 'Assignment ID', itemIndex);
	const code = requireAccessCode(this, itemIndex);
	const reason = (this.getNodeParameter('declineReason', itemIndex) as string).trim();
	if (!reason) {
		throw new NodeOperationError(this.getNode(), 'Decline Reason is required', { itemIndex });
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/documents/${documentId}/assignments/${assignmentId}/reject`,
		qs: { 'signer-access-code': code },
		body: { decline_reason: reason },
		skipAuth: true,
	});
}
