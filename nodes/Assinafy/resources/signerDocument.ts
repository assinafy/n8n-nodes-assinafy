import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation } from '../shared/transport';
import { authenticateWithField, limitField, returnAllField } from '../shared/descriptions';
import {
	asArray,
	cleanQs,
	extractRequiredId,
	parseBinaryResponse,
	parseStringList,
	requireAccessCode,
	requireDeclineReason,
	resolveSignerRouteAuth,
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
				name: 'Download Certified Copy',
				value: 'downloadCertifiedCopy',
				action: 'Download a certified copy using its link token',
			},
			{
				name: 'Download Signing Logo',
				value: 'downloadSigningLogo',
				action: 'Download workspace logo using a signer code',
			},
			{
				name: 'Get Current',
				value: 'getCurrent',
				action: 'Signer reads the document tied to the active access code',
			},
			{
				name: 'Get Signing Theme',
				value: 'getSigningTheme',
				action: 'Get workspace branding using a signer code',
			},
			{
				name: 'List',
				value: 'list',
				action: 'Signer lists their visible documents',
			},
			{
				name: 'Resend Certified Copy',
				value: 'resendCertifiedCopy',
				action: 'Resend the certified copy using an expired link token',
			},
			{
				name: 'Search',
				value: 'search',
				action: 'Search visible signer documents',
			},
			{
				name: 'Send Certified Copy',
				value: 'sendCertifiedCopy',
				action: 'Send the certified copy using a signer code',
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

	// list/search accept either a signer access code or the workspace credentials
	{
		...authenticateWithField('signerAccessCode'),
		displayOptions: { show: showOnly(['list', 'search']) },
	},
	{
		displayName: 'Signer Access Code',
		name: 'signerAccessCode',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description:
			'Per-signer access code (from the signer notification). Sent as the signer-access-code query parameter, without the API key or OAuth token.',
		displayOptions: {
			show: showOnly([
				'getCurrent',
				'signMultiple',
				'declineMultiple',
				'getSigningTheme',
				'downloadSigningLogo',
				'sendCertifiedCopy',
			]),
		},
	},
	{
		displayName: 'Signer Access Code',
		name: 'signerAccessCode',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description:
			'Per-signer access code (from the signer notification). Sent as the signer-access-code query parameter, without the API key or OAuth token.',
		displayOptions: {
			show: { ...showOnly(['list', 'search']), authenticateWith: ['signerAccessCode'] },
		},
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

	{
		displayName: 'Expand Envelope',
		name: 'expandEnvelope',
		type: 'boolean',
		default: false,
		description: 'Whether to include the envelope ID and name',
		displayOptions: { show: showOnly(['getCurrent']) },
	},
	{
		displayName: 'Envelope ID',
		name: 'envelopeId',
		type: 'string',
		default: '',
		description: 'Optional: restrict results to this envelope',
		displayOptions: { show: showOnly(['list', 'search']) },
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
			{ name: 'Bundle (ZIP)', value: 'bundle' },
			{ name: 'Certificate Page', value: 'certificate-page' },
			{ name: 'Certificated (Signed PDF)', value: 'certificated' },
			{ name: 'Original (Uploaded File)', value: 'original' },
			{ name: 'PAdES (Digital Certificate PDF)', value: 'pades' },
		],
	},
	{
		displayName: 'Put Output In Field',
		name: 'binaryOutputProperty',
		type: 'string',
		default: 'data',
		displayOptions: {
			show: showOnly(['download', 'downloadCertifiedCopy', 'downloadSigningLogo']),
		},
	},
	{
		displayName: 'Download Token',
		name: 'downloadToken',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		description: 'Token from the certified-copy notification link; not a signer access code',
		displayOptions: { show: showOnly(['downloadCertifiedCopy', 'resendCertifiedCopy']) },
	},
	{
		displayName: 'PAdES',
		name: 'pades',
		type: 'boolean',
		default: false,
		description: 'Whether to request the digital-certificate PDF version',
		displayOptions: { show: showOnly(['downloadCertifiedCopy']) },
	},
	{
		displayName: 'Document ID',
		name: 'certifiedCopyDocumentId',
		type: 'string',
		default: '',
		description: 'Optional: another document of the same envelope this signer is on',
		displayOptions: { show: showOnly(['sendCertifiedCopy']) },
	},
];

export async function executeSignerDocument(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	switch (operation) {
		case 'downloadCertifiedCopy':
		case 'resendCertifiedCopy':
		case 'sendCertifiedCopy':
		case 'getSigningTheme':
		case 'downloadSigningLogo':
			return signingAsset.call(this, itemIndex, operation);
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
	const { qs, skipAuth } = resolveSignerRouteAuth(this, itemIndex, 'signerAccessCode');
	const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
	const search = (this.getNodeParameter('search', itemIndex, '') as string).trim();
	const response = await assinafyApiRequest<IDataObject[]>(this, {
		method: 'GET',
		path: `/signers/${signerId}/documents/search`,
		qs: {
			...qs,
			...cleanQs({
				search,
				envelope_id: this.getNodeParameter('envelopeId', itemIndex, '') as string,
			}),
		},
		skipAuth,
	});
	return asArray<IDataObject>(response);
}

async function getCurrent(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const code = requireAccessCode(this, itemIndex);
	const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/signers/${signerId}/document`,
		qs: {
			'signer-access-code': code,
			...(this.getNodeParameter('expandEnvelope', itemIndex, false) ? { expand: 'envelope' } : {}),
		},
		skipAuth: true,
	});
}

async function listDocuments(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const { qs, skipAuth } = resolveSignerRouteAuth(this, itemIndex, 'signerAccessCode');
	const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	return executeListOperation(this, itemIndex, {
		path: `/signers/${signerId}/documents`,
		qs: {
			...qs,
			...cleanQs({
				...filters,
				envelope_id: this.getNodeParameter('envelopeId', itemIndex, '') as string,
			}),
		},
		skipAuth,
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
	const ids = parseStringList(csv);
	if (ids.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one document ID is required', {
			itemIndex,
		});
	}
	const reason = requireDeclineReason(this, itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: '/signers/documents/decline-multiple',
		qs: { 'signer-access-code': code },
		body: { document_ids: ids, decline_reason: reason },
		skipAuth: true,
	});
}

async function download(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData> {
	const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
	const documentId = extractRequiredId(this, 'documentId', 'Document ID', itemIndex);
	const artifact = extractRequiredId(this, 'artifact', 'Artifact', itemIndex, 'certificated');
	const outputProperty = this.getNodeParameter('binaryOutputProperty', itemIndex, 'data') as string;
	const response = (await assinafyApiRequest<unknown>(this, {
		method: 'GET',
		path: `/signers/${signerId}/documents/${documentId}/download/${artifact}`,
		returnBinary: true,
		skipAuth: true,
	})) as { body?: Buffer | ArrayBuffer; headers?: IDataObject };
	const { buffer, mimeType: mime } = parseBinaryResponse(
		this,
		response,
		artifact === 'bundle' ? 'application/zip' : 'application/pdf',
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

async function signingAsset(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData> {
	const tokenRoute = operation === 'downloadCertifiedCopy' || operation === 'resendCertifiedCopy';
	const token = tokenRoute
		? extractRequiredId(this, 'downloadToken', 'Download Token', itemIndex)
		: '';
	const qs = tokenRoute ? undefined : { 'signer-access-code': requireAccessCode(this, itemIndex) };
	const download = operation === 'downloadCertifiedCopy' || operation === 'downloadSigningLogo';
	const logo = operation === 'downloadSigningLogo';
	const pades =
		operation === 'downloadCertifiedCopy' && this.getNodeParameter('pades', itemIndex, false);
	const path = tokenRoute
		? `/signers/downloads/${token}${operation === 'resendCertifiedCopy' ? '/resend' : pades ? '/pades' : ''}`
		: operation === 'sendCertifiedCopy'
			? '/sign/certified-copy'
			: logo
				? '/sign/logo'
				: '/sign/theme';
	const documentId =
		operation === 'sendCertifiedCopy'
			? (this.getNodeParameter('certifiedCopyDocumentId', itemIndex, '') as string)
			: '';
	const response = await assinafyApiRequest(this, {
		method: download || operation === 'getSigningTheme' ? 'GET' : 'POST',
		path,
		qs,
		body: documentId ? { document_id: documentId } : undefined,
		skipAuth: true,
		returnBinary: download,
		disableFollowRedirect: download,
	});
	if (!download) return wrap(response);
	const { buffer, mimeType } = parseBinaryResponse(
		this,
		response,
		logo ? 'image/png' : 'application/pdf',
		'Signing download',
		itemIndex,
	);
	if ((!logo && mimeType !== 'application/pdf') || (logo && !mimeType.startsWith('image/'))) {
		throw new NodeOperationError(
			this.getNode(),
			'Signing download did not return the requested file; the link may have expired',
			{ itemIndex },
		);
	}
	const fileName = logo
		? `logo.${mimeType.includes('jpeg') ? 'jpg' : 'png'}`
		: `${pades ? 'pades' : 'certificated'}.pdf`;
	const output = this.getNodeParameter('binaryOutputProperty', itemIndex, 'data') as string;
	return {
		json: { fileName, mimeType, size: buffer.byteLength },
		binary: { [output]: await this.helpers.prepareBinaryData(buffer, fileName, mimeType) },
	};
}
