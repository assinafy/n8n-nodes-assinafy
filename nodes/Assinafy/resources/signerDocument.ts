import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation } from '../shared/transport';
import { limitField, returnAllField } from '../shared/descriptions';
import {
	asArray,
	cleanQs,
	extractRequiredId,
	parseBinaryResponse,
	parseStringList,
	requireAccessCode,
	showOnly as showOnlyFor,
	wrap,
} from '../shared/utils';

const showOnly = showOnlyFor('signerDocument');

export const signerDocumentDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['signerDocument'] } },
		default: 'getCurrent',
		options: [
			{
				name: 'Decline Multiple',
				value: 'declineMultiple',
				action: 'Signer declines multiple documents at once',
			},
			{
				name: 'Download',
				value: 'download',
				action: 'Signer downloads a document artifact',
			},
			{
				name: 'Get Current',
				value: 'getCurrent',
				action: 'Signer reads the document tied to the active access code',
			},
			{
				name: 'List',
				value: 'list',
				action: 'Signer lists their visible documents',
			},
			{
				name: 'Search',
				value: 'search',
				action: 'Search visible signer documents',
			},
			{
				name: 'Sign Multiple',
				value: 'signMultiple',
				action: 'Signer signs multiple virtual method documents at once',
			},
		],
	},
	{ ...returnAllField, displayOptions: { show: showOnly(['list']) } },
	{
		...limitField,
		displayOptions: { show: { ...showOnly(['list']), returnAll: [false] } },
	},

	// shared access code
	{
		displayName: 'Signer Access Code',
		name: 'signerAccessCode',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description: 'Per-signer access code (from the email/WhatsApp link)',
	},

	// shared signer id (except for sign/decline multiple which use a code-only path)
	{
		displayName: 'Signer ID',
		name: 'signerId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnly(['getCurrent', 'list', 'search', 'download']) },
	},
	{
		displayName: 'Search',
		name: 'search',
		type: 'string',
		default: '',
		description: "Search term matched against the signer's documents",
		displayOptions: { show: showOnly(['search']) },
	},

	// list filters
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showOnly(['list']) },
		options: [
			{ displayName: 'Status', name: 'status', type: 'string', default: '' },
			{
				displayName: 'Method',
				name: 'method',
				type: 'options',
				default: '',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Virtual', value: 'virtual' },
					{ name: 'Collect', value: 'collect' },
				],
			},
			{ displayName: 'Search', name: 'search', type: 'string', default: '' },
			{ displayName: 'Sort', name: 'sort', type: 'string', default: '' },
		],
	},

	// signMultiple / declineMultiple
	{
		displayName: 'Document IDs (CSV)',
		name: 'documentIds',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated list of document IDs',
		displayOptions: { show: showOnly(['signMultiple', 'declineMultiple']) },
	},
	{
		displayName: 'Decline Reason',
		name: 'declineReason',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		displayOptions: { show: showOnly(['declineMultiple']) },
	},

	// download
	{
		displayName: 'Document ID',
		name: 'documentId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnly(['download']) },
	},
	{
		displayName: 'Artifact',
		name: 'artifact',
		type: 'options',
		default: 'certificated',
		displayOptions: { show: showOnly(['download']) },
		options: [
			{ name: 'Original (Uploaded File)', value: 'original' },
			{ name: 'Certificated (Signed PDF)', value: 'certificated' },
			{ name: 'Certificate Page', value: 'certificate-page' },
			{ name: 'Bundle (ZIP)', value: 'bundle' },
		],
	},
	{
		displayName: 'Put Output In Field',
		name: 'binaryOutputProperty',
		type: 'string',
		default: 'data',
		displayOptions: { show: showOnly(['download']) },
	},
];

export async function executeSignerDocument(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	switch (operation) {
		case 'getCurrent':
			return wrap(await getCurrent.call(this, itemIndex));
		case 'list':
			return listDocuments.call(this, itemIndex);
		case 'search':
			return (await searchDocuments.call(this, itemIndex)).map((doc) => ({ json: doc }));
		case 'signMultiple':
			return wrap(await signMultiple.call(this, itemIndex));
		case 'declineMultiple':
			return wrap(await declineMultiple.call(this, itemIndex));
		case 'download':
			return download.call(this, itemIndex);
		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unknown signer-document operation: ${operation}`,
				{ itemIndex },
			);
	}
}

async function searchDocuments(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	const code = requireAccessCode(this, itemIndex);
	const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
	const search = (this.getNodeParameter('search', itemIndex, '') as string).trim();
	const response = await assinafyApiRequest<IDataObject[] | { data?: IDataObject[] }>(this, {
		method: 'GET',
		path: `/signers/${signerId}/documents/search`,
		qs: { 'signer-access-code': code, ...(search ? { search } : {}) },
		skipAuth: true,
	});
	return asArray<IDataObject>(response);
}

async function getCurrent(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const code = requireAccessCode(this, itemIndex);
	const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/signers/${signerId}/document`,
		qs: { 'signer-access-code': code },
		skipAuth: true,
	});
}

async function listDocuments(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const code = requireAccessCode(this, itemIndex);
	const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const qs = { 'signer-access-code': code, ...cleanQs(filters) };
	return executeListOperation(this, itemIndex, {
		path: `/signers/${signerId}/documents`,
		qs,
		skipAuth: true,
	});
}

async function signMultiple(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const code = requireAccessCode(this, itemIndex);
	const csv = this.getNodeParameter('documentIds', itemIndex) as string;
	const ids = parseStringList(csv);
	if (ids.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one document ID is required', {
			itemIndex,
		});
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: '/signers/documents/sign-multiple',
		qs: { 'signer-access-code': code },
		body: { document_ids: ids },
		skipAuth: true,
	});
}

async function declineMultiple(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const code = requireAccessCode(this, itemIndex);
	const csv = this.getNodeParameter('documentIds', itemIndex) as string;
	const reason = this.getNodeParameter('declineReason', itemIndex) as string;
	const ids = parseStringList(csv);
	if (ids.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one document ID is required', {
			itemIndex,
		});
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: '/signers/documents/decline-multiple',
		qs: { 'signer-access-code': code },
		body: { document_ids: ids, decline_reason: reason },
		skipAuth: true,
	});
}

async function download(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData> {
	const code = requireAccessCode(this, itemIndex);
	const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
	const documentId = extractRequiredId(this, 'documentId', 'Document ID', itemIndex);
	const artifact = this.getNodeParameter('artifact', itemIndex, 'certificated') as string;
	const outputProperty = this.getNodeParameter('binaryOutputProperty', itemIndex, 'data') as string;
	const response = (await assinafyApiRequest<unknown>(this, {
		method: 'GET',
		path: `/signers/${signerId}/documents/${documentId}/download/${artifact}`,
		qs: { 'signer-access-code': code },
		returnBinary: true,
		skipAuth: true,
	})) as { body?: Buffer | ArrayBuffer; headers?: IDataObject };
	const { buffer, mimeType: mime } = parseBinaryResponse(
		this,
		response,
		'application/pdf',
		'Signer document download',
		itemIndex,
	);
	const fileName = `${documentId}-${artifact}${artifact === 'bundle' ? '.zip' : '.pdf'}`;
	const binary = await this.helpers.prepareBinaryData(buffer, fileName, mime);
	return {
		json: { documentId, signerId, artifact, fileName, mimeType: mime, size: buffer.byteLength },
		binary: { [outputProperty]: binary },
	};
}
