import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation, getAccountId } from '../shared/transport';
import {
	documentResourceLocator,
	idempotencyKeyField,
	limitField,
	returnAllField,
	signerResourceLocator,
} from '../shared/descriptions';
import {
	cleanQs,
	extractRequiredId,
	parseBinaryResponse,
	parseJsonObject,
	showOnly as showOnlyFor,
	wrap,
} from '../shared/utils';

const showOnly = showOnlyFor('envelope');
const existingOperations = [
	'get',
	'update',
	'delete',
	'cancel',
	'addDocument',
	'removeDocument',
	'resendNotification',
	'getActivities',
	'download',
];

export const envelopeDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['envelope'] } },
		default: 'list',
		options: [
			{ name: 'Add Document', value: 'addDocument', action: 'Add a document to an envelope' },
			{ name: 'Cancel', value: 'cancel', action: 'Cancel the open documents of an envelope' },
			{ name: 'Create', value: 'create', action: 'Create an envelope and request signatures' },
			{ name: 'Delete', value: 'delete', action: 'Delete a closed envelope' },
			{ name: 'Download', value: 'download', action: 'Download envelope artifacts as a ZIP' },
			{
				name: 'Estimate Cost',
				value: 'estimateCost',
				action: 'Estimate envelope cost without sending',
			},
			{ name: 'Get', value: 'get', action: 'Get an envelope' },
			{
				name: 'Get Activities',
				value: 'getActivities',
				action: 'List envelope document activities',
			},
			{ name: 'List', value: 'list', action: 'List envelopes' },
			{
				name: 'Remove Document',
				value: 'removeDocument',
				action: 'Cancel and remove a document from an envelope',
			},
			{
				name: 'Resend Notification',
				value: 'resendNotification',
				action: 'Remind an envelope signer',
			},
			{ name: 'Update', value: 'update', action: 'Update envelope name message or document order' },
		],
	},
	{
		displayName: 'Envelope ID',
		name: 'envelopeId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnly(existingOperations) },
	},
	{ ...documentResourceLocator, displayOptions: { show: showOnly(['removeDocument']) } },
	{ ...signerResourceLocator, displayOptions: { show: showOnly(['resendNotification']) } },
	{ ...idempotencyKeyField, displayOptions: { show: showOnly(['create']) } },
	{
		displayName: 'Envelope (JSON)',
		name: 'envelopeBody',
		type: 'json',
		default: '{}',
		required: true,
		description:
			'Creation and estimate: name, signers and documents; optional message and max_total_credits. Add Document: ID, signer_ids, optional method, entries, expires_at, copy_receiver_ids and max_total_credits. Update: name, message (null clears), document_ids in full order. See the operation reference for payloads.',
		displayOptions: { show: showOnly(['create', 'estimateCost', 'addDocument', 'update']) },
	},
	{ ...returnAllField, displayOptions: { show: showOnly(['list', 'getActivities']) } },
	{
		...limitField,
		displayOptions: { show: { ...showOnly(['list', 'getActivities']), returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		default: {},
		placeholder: 'Add Filter',
		displayOptions: { show: showOnly(['list']) },
		options: [
			{ displayName: 'Search', name: 'search', type: 'string', default: '' },
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: '',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Closed', value: 'closed' },
					{ name: 'Open', value: 'open' },
				],
			},
		],
	},
	{
		displayName: 'Sort',
		name: 'sort',
		type: 'options',
		default: '-id',
		options: [
			{ name: 'Newest First', value: '-id' },
			{ name: 'Oldest First', value: 'id' },
		],
		displayOptions: { show: showOnly(['getActivities']) },
	},
	{
		displayName: 'Artifact',
		name: 'artifact',
		type: 'options',
		default: 'certificated',
		options: [
			{ name: 'Bundle', value: 'bundle' },
			{ name: 'Certificate Page', value: 'certificate-page' },
			{ name: 'Certificated', value: 'certificated' },
			{ name: 'Original', value: 'original' },
			{ name: 'PAdES', value: 'pades' },
		],
		description:
			'The ZIP contains the available artifacts in document order; certified artifacts include only documents already certified',
		displayOptions: { show: showOnly(['download']) },
	},
	{
		displayName: 'Put Output In Field',
		name: 'binaryOutputProperty',
		type: 'string',
		default: 'data',
		displayOptions: { show: showOnly(['download']) },
	},
];

export async function executeEnvelope(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	if (!['list', 'create', 'estimateCost', ...existingOperations].includes(operation)) {
		throw new NodeOperationError(this.getNode(), `Unknown envelope operation: ${operation}`, {
			itemIndex,
		});
	}
	const accountId = await getAccountId(this);
	const root = `/accounts/${accountId}/envelopes`;
	if (operation === 'list') {
		return executeListOperation(this, itemIndex, {
			path: root,
			qs: cleanQs(this.getNodeParameter('filters', itemIndex, {}) as IDataObject),
		});
	}
	const envelopeId = existingOperations.includes(operation)
		? extractRequiredId(this, 'envelopeId', 'Envelope ID', itemIndex)
		: '';
	const path = envelopeId ? `${root}/${envelopeId}` : root;
	if (operation === 'getActivities') {
		return executeListOperation(this, itemIndex, {
			path: `${path}/activities`,
			qs: { sort: this.getNodeParameter('sort', itemIndex, '-id') as string },
		});
	}
	if (operation === 'download') {
		const artifact = extractRequiredId(this, 'artifact', 'Artifact', itemIndex, 'certificated');
		const response = await assinafyApiRequest<{ body?: Buffer; headers?: IDataObject }>(this, {
			method: 'GET',
			path: `${path}/download/${artifact}`,
			returnBinary: true,
		});
		const { buffer, mimeType } = parseBinaryResponse(
			this,
			response,
			'application/zip',
			'Envelope download',
			itemIndex,
		);
		const fileName = `${envelopeId}-${artifact}.zip`;
		const output = this.getNodeParameter('binaryOutputProperty', itemIndex, 'data') as string;
		return {
			json: { envelopeId, fileName, mimeType, size: buffer.byteLength },
			binary: { [output]: await this.helpers.prepareBinaryData(buffer, fileName, mimeType) },
		};
	}
	if (['create', 'estimateCost', 'addDocument', 'update'].includes(operation)) {
		const body = parseJsonObject(
			this,
			this.getNodeParameter('envelopeBody', itemIndex, '{}'),
			'Envelope',
			itemIndex,
		);
		const key =
			operation === 'create'
				? (this.getNodeParameter('idempotencyKey', itemIndex, '') as string)
				: '';
		const suffix =
			operation === 'estimateCost'
				? '/estimate-cost'
				: operation === 'addDocument'
					? '/documents'
					: '';
		return wrap(
			await assinafyApiRequest(this, {
				method: operation === 'update' ? 'PATCH' : 'POST',
				path: path + suffix,
				body,
				headers: key ? { 'Idempotency-Key': key } : undefined,
			}),
		);
	}
	if (operation === 'removeDocument') {
		const documentId = extractRequiredId(this, 'documentId', 'Document ID', itemIndex);
		return wrap(
			await assinafyApiRequest(this, { method: 'DELETE', path: `${path}/documents/${documentId}` }),
		);
	}
	if (operation === 'resendNotification') {
		const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
		return wrap(
			await assinafyApiRequest(this, { method: 'PUT', path: `${path}/signers/${signerId}/resend` }),
		);
	}
	return wrap(
		await assinafyApiRequest(this, {
			method: operation === 'get' ? 'GET' : operation === 'delete' ? 'DELETE' : 'PUT',
			path: operation === 'cancel' ? `${path}/cancel` : path,
		}),
	);
}
