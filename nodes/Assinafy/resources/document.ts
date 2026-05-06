import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';
import {
	assinafyApiRequest,
	assinafyApiRequestAllItems,
	getAccountId,
} from '../shared/transport';
import {
	documentResourceLocator,
	limitField,
	returnAllField,
	searchField,
	sortField,
} from '../shared/descriptions';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const READY_STATUSES = new Set(['metadata_ready', 'pending_signature', 'certificated']);
const FAILED_STATUSES = new Set(['failed', 'rejected_by_signer', 'rejected_by_user', 'expired']);

const showOnly = (operation: string[]) => ({
	resource: ['document'],
	operation,
});

export const documentDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['document'] } },
		default: 'upload',
		options: [
			{
				name: 'Create From Template',
				value: 'createFromTemplate',
				action: 'Create a document from a template',
			},
			{ name: 'Delete', value: 'delete', action: 'Delete a document' },
			{
				name: 'Download Artifact',
				value: 'download',
				action: 'Download a document artifact (PDF or ZIP)',
			},
			{
				name: 'Download Page',
				value: 'downloadPage',
				action: 'Download a single page as a JPEG',
			},
			{
				name: 'Download Thumbnail',
				value: 'downloadThumbnail',
				action: 'Download the document thumbnail',
			},
			{
				name: 'Estimate Cost From Template',
				value: 'estimateCostFromTemplate',
				action: 'Estimate credit cost of creating a document from a template',
			},
			{ name: 'Get', value: 'get', action: 'Get a document' },
			{
				name: 'Get Activities',
				value: 'getActivities',
				action: 'List the activity log for a document',
			},
			{
				name: 'Get Signing Progress',
				value: 'getSigningProgress',
				action: 'Return a signed total percentage summary',
			},
			{ name: 'List', value: 'list', action: 'List workspace documents' },
			{ name: 'Upload', value: 'upload', action: 'Upload a new document' },
			{ name: 'Verify', value: 'verify', action: 'Verify a document by its signature hash' },
			{
				name: 'Wait Until Ready',
				value: 'waitUntilReady',
				action: 'Poll the document until it reaches a ready status',
			},
		],
	},

	// --- upload ---
	{
		displayName: 'Binary Property',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description:
			'Name of the binary property on the incoming item that contains the PDF file to upload',
		displayOptions: { show: showOnly(['upload']) },
	},
	{
		displayName: 'File Name',
		name: 'fileName',
		type: 'string',
		default: '',
		placeholder: 'contract.pdf',
		description:
			'Optional name to send to Assinafy. Defaults to the binary file name, or `document.pdf` as a last resort.',
		displayOptions: { show: showOnly(['upload']) },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnly(['upload']) },
		options: [
			{
				displayName: 'Metadata (JSON)',
				name: 'metadata',
				type: 'json',
				default: '{}',
				description: 'Arbitrary metadata object sent alongside the file',
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
		options: [
			{ ...searchField },
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: '',
				description: 'Filter by document status',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Certificated', value: 'certificated' },
					{ name: 'Certificating', value: 'certificating' },
					{ name: 'Expired', value: 'expired' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Metadata Processing', value: 'metadata_processing' },
					{ name: 'Metadata Ready', value: 'metadata_ready' },
					{ name: 'Pending Signature', value: 'pending_signature' },
					{ name: 'Rejected by Signer', value: 'rejected_by_signer' },
					{ name: 'Rejected by User', value: 'rejected_by_user' },
					{ name: 'Uploaded', value: 'uploaded' },
					{ name: 'Uploading', value: 'uploading' },
				],
			},
			{
				displayName: 'Signature Method',
				name: 'method',
				type: 'options',
				default: '',
				description: 'Filter by assignment method',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Virtual', value: 'virtual' },
					{ name: 'Collect', value: 'collect' },
				],
			},
			{ ...sortField },
		],
	},

	// --- operations needing a document id ---
	{
		...documentResourceLocator,
		displayOptions: {
			show: showOnly([
				'get',
				'delete',
				'download',
				'downloadThumbnail',
				'downloadPage',
				'getActivities',
				'getSigningProgress',
				'waitUntilReady',
			]),
		},
	},

	// --- createFromTemplate / estimateCostFromTemplate ---
	{
		displayName: 'Template ID',
		name: 'templateId',
		type: 'string',
		default: '',
		required: true,
		description: 'ID of the template to use (from Template > List)',
		displayOptions: { show: showOnly(['createFromTemplate', 'estimateCostFromTemplate']) },
	},
	{
		displayName: 'Signers',
		name: 'templateSigners',
		placeholder: 'Add Signer',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		required: true,
		description:
			'One entry per template role. Use Template &gt; Get to retrieve role IDs and signer IDs.',
		displayOptions: { show: showOnly(['createFromTemplate', 'estimateCostFromTemplate']) },
		options: [
			{
				displayName: 'Signer',
				name: 'signer',
				values: [
					{
						displayName: 'Role ID',
						name: 'role_id',
						type: 'string',
						default: '',
						required: true,
						description: 'Template role ID this signer is assigned to',
					},
					{
						displayName: 'Signer ID',
						name: 'id',
						type: 'string',
						default: '',
						description:
							'Existing signer ID. Can be omitted for Estimate Cost.',
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
		displayOptions: { show: showOnly(['createFromTemplate']) },
		options: [
			{
				displayName: 'Document Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Override the default document name set on the template',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Message to include in the signing invitation',
			},
			{
				displayName: 'Expires At',
				name: 'expires_at',
				type: 'dateTime',
				default: '',
				description: 'ISO 8601 expiration date for the assignment',
			},
			{
				displayName: 'Editor Fields (JSON)',
				name: 'editor_fields',
				type: 'json',
				default: '[]',
				description:
					'Array of editor field values: [{ "field_id": "...", "value": "..." }]',
			},
		],
	},

	// --- verify ---
	{
		displayName: 'Signature Hash',
		name: 'signatureHash',
		type: 'string',
		default: '',
		required: true,
		description:
			'The signature hash from the signed document (used to verify its authenticity)',
		displayOptions: { show: showOnly(['verify']) },
	},

	// --- download ---
	{
		displayName: 'Artifact',
		name: 'artifact',
		type: 'options',
		default: 'certificated',
		description: 'Which artifact file to download',
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
		description: 'Name of the binary property on the output item to write the file into',
		displayOptions: {
			show: showOnly(['download', 'downloadThumbnail', 'downloadPage']),
		},
	},

	// --- downloadPage ---
	{
		displayName: 'Page ID',
		name: 'pageId',
		type: 'string',
		default: '',
		required: true,
		description: 'ID of the page to download (from Get > pages array)',
		displayOptions: { show: showOnly(['downloadPage']) },
	},

	// --- waitUntilReady ---
	{
		displayName: 'Max Wait (Ms)',
		name: 'maxWaitMs',
		type: 'number',
		default: 30000,
		typeOptions: { minValue: 1000 },
		description: 'Give up if the document has not reached a ready status after this many ms',
		displayOptions: { show: showOnly(['waitUntilReady']) },
	},
	{
		displayName: 'Poll Interval (Ms)',
		name: 'pollIntervalMs',
		type: 'number',
		default: 2000,
		typeOptions: { minValue: 250 },
		displayOptions: { show: showOnly(['waitUntilReady']) },
	},
];

export async function executeDocument(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	switch (operation) {
		case 'upload':
			return uploadDocument.call(this, itemIndex);
		case 'list':
			return listDocuments.call(this, itemIndex);
		case 'get':
			return wrap(await getDocument.call(this, itemIndex));
		case 'delete':
			return wrap(await deleteDocument.call(this, itemIndex));
		case 'download':
			return downloadArtifact.call(this, itemIndex, 'artifact');
		case 'downloadThumbnail':
			return downloadArtifact.call(this, itemIndex, 'thumbnail');
		case 'downloadPage':
			return downloadArtifact.call(this, itemIndex, 'page');
		case 'getActivities':
			return wrap(await getActivities.call(this, itemIndex));
		case 'getSigningProgress':
			return wrap(await getSigningProgress.call(this, itemIndex));
		case 'waitUntilReady':
			return wrap(await waitUntilReady.call(this, itemIndex));
		case 'createFromTemplate':
			return wrap(await createFromTemplate.call(this, itemIndex));
		case 'estimateCostFromTemplate':
			return wrap(await estimateCostFromTemplate.call(this, itemIndex));
		case 'verify':
			return wrap(await verifyDocument.call(this, itemIndex));
		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unknown document operation: ${operation}`,
				{ itemIndex },
			);
	}
}

function wrap(data: unknown): INodeExecutionData {
	return { json: (data ?? {}) as IDataObject };
}

async function uploadDocument(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter(
		'binaryPropertyName',
		itemIndex,
		'data',
	) as string;
	const fileNameParam = this.getNodeParameter('fileName', itemIndex, '') as string;
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as {
		metadata?: string | IDataObject;
	};

	const binary = this.helpers.assertBinaryData(itemIndex, binaryPropertyName) as IBinaryData;
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const fileName = fileNameParam || binary.fileName || 'document.pdf';

	if (buffer.byteLength === 0) {
		throw new NodeOperationError(this.getNode(), 'The uploaded PDF is empty', {
			itemIndex,
		});
	}

	if (!fileName.toLowerCase().endsWith('.pdf')) {
		throw new NodeOperationError(this.getNode(), 'Only PDF files are supported by Assinafy', {
			itemIndex,
		});
	}

	if (buffer.byteLength > MAX_UPLOAD_BYTES) {
		throw new NodeOperationError(
			this.getNode(),
			"File size exceeds Assinafy's 25MB upload limit",
			{ itemIndex },
		);
	}

	const form = new FormData();
	const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	form.append('file', new Blob([view], { type: binary.mimeType || 'application/pdf' }), fileName);
	form.append('name', fileName);
	if (additional.metadata !== undefined && additional.metadata !== '') {
		const metadataValue =
			typeof additional.metadata === 'string'
				? additional.metadata
				: JSON.stringify(additional.metadata);
		form.append('metadata', metadataValue);
	}

	const accountId = await getAccountId(this);
	const response = await assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/documents`,
		body: form,
	});

	return { json: response };
}

async function listDocuments(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const accountId = await getAccountId(this);
	const path = `/accounts/${accountId}/documents`;
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

async function getDocument(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/documents/${documentId}`,
	});
}

async function deleteDocument(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	await assinafyApiRequest(this, { method: 'DELETE', path: `/documents/${documentId}` });
	return { deleted: true, documentId };
}

async function downloadArtifact(
	this: IExecuteFunctions,
	itemIndex: number,
	kind: 'artifact' | 'thumbnail' | 'page',
): Promise<INodeExecutionData> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const outputProperty = this.getNodeParameter(
		'binaryOutputProperty',
		itemIndex,
		'data',
	) as string;

	let path: string;
	let suggestedFileName: string;
	let mimeType = 'application/pdf';

	if (kind === 'artifact') {
		const artifact = this.getNodeParameter('artifact', itemIndex, 'certificated') as string;
		path = `/documents/${documentId}/download/${artifact}`;
		suggestedFileName = `${documentId}-${artifact}.pdf`;
		if (artifact === 'bundle') {
			mimeType = 'application/zip';
			suggestedFileName = `${documentId}-bundle.zip`;
		}
	} else if (kind === 'thumbnail') {
		path = `/documents/${documentId}/thumbnail`;
		suggestedFileName = `${documentId}-thumbnail.jpg`;
		mimeType = 'image/jpeg';
	} else {
		const pageId = this.getNodeParameter('pageId', itemIndex) as string;
		path = `/documents/${documentId}/pages/${pageId}/download`;
		suggestedFileName = `${documentId}-page-${pageId}.jpg`;
		mimeType = 'image/jpeg';
	}

	const response = (await assinafyApiRequest<unknown>(this, {
		method: 'GET',
		path,
		returnBinary: true,
	})) as { body?: Buffer | ArrayBuffer; headers?: IDataObject };

	const raw = response.body;
	const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw ?? new ArrayBuffer(0));
	const headerType = (response.headers?.['content-type'] ?? response.headers?.['Content-Type']) as
		| string
		| undefined;
	if (headerType) mimeType = headerType.split(';')[0].trim();

	const binary = await this.helpers.prepareBinaryData(buffer, suggestedFileName, mimeType);
	return {
		json: { documentId, fileName: suggestedFileName, mimeType, size: buffer.byteLength },
		binary: { [outputProperty]: binary },
	};
}

async function getActivities(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const activities = await assinafyApiRequest<IDataObject[] | null>(this, {
		method: 'GET',
		path: `/documents/${documentId}/activities`,
	});
	return { documentId, activities: activities ?? [] };
}

async function getSigningProgress(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const details = await assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/documents/${documentId}`,
	});

	const assignment = (details.assignment ?? {}) as IDataObject;
	const summary = (assignment.summary ?? {}) as IDataObject;
	const total =
		(summary.signer_count as number | undefined) ??
		((assignment.signers as unknown[] | undefined)?.length ?? 0);
	const signed = (summary.completed_count as number | undefined) ?? 0;
	const pending = Math.max(total - signed, 0);
	const percentage = total > 0 ? Math.round((signed / total) * 10000) / 100 : 0;
	const status = details.status as string | undefined;
	const isFullySigned = status === 'certificated' || (total > 0 && signed === total);

	return {
		documentId,
		status,
		signed,
		total,
		pending,
		percentage,
		isFullySigned,
	};
}

async function waitUntilReady(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	const maxWaitMs = this.getNodeParameter('maxWaitMs', itemIndex, 30000) as number;
	const pollIntervalMs = this.getNodeParameter('pollIntervalMs', itemIndex, 2000) as number;

	const start = Date.now();
	let attempts = 0;

	while (Date.now() - start < maxWaitMs) {
		attempts += 1;
		const details = await assinafyApiRequest<IDataObject>(this, {
			method: 'GET',
			path: `/documents/${documentId}`,
		});
		const status = (details.status as string) ?? 'unknown';
		if (READY_STATUSES.has(status)) return details;
		if (FAILED_STATUSES.has(status)) {
			throw new NodeOperationError(
				this.getNode(),
				`Document processing failed with status: ${status}`,
				{ itemIndex },
			);
		}
		await sleep(pollIntervalMs);
	}

	throw new NodeOperationError(
		this.getNode(),
		`Timed out after ${maxWaitMs}ms waiting for document ${documentId} (${attempts} polls)`,
		{ itemIndex },
	);
}

function extractDocumentId(this: IExecuteFunctions, itemIndex: number): string {
	const id = this.getNodeParameter('documentId', itemIndex, '', { extractValue: true }) as string;
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'Document ID is required', { itemIndex });
	}
	return id;
}

async function createFromTemplate(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const templateId = this.getNodeParameter('templateId', itemIndex) as string;
	if (!templateId) {
		throw new NodeOperationError(this.getNode(), 'Template ID is required', { itemIndex });
	}
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const signersRaw = (
		this.getNodeParameter('templateSigners', itemIndex, {}) as { signer?: IDataObject[] }
	).signer ?? [];

	if (signersRaw.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			'At least one signer is required to create a document from a template',
			{ itemIndex },
		);
	}

	const body: IDataObject = {
		signers: signersRaw.map((s) => {
			const entry: IDataObject = { role_id: s.role_id };
			if (s.id) entry.id = s.id;
			if (s.verification_method) entry.verification_method = s.verification_method;
			if (Array.isArray(s.notification_methods) && (s.notification_methods as unknown[]).length > 0) {
				entry.notification_methods = s.notification_methods;
			}
			return entry;
		}),
	};

	if (additional.name) body.name = additional.name;
	if (additional.message) body.message = additional.message;
	if (additional.expires_at) body.expires_at = additional.expires_at;
	if (additional.editor_fields && (additional.editor_fields as string) !== '[]') {
		const raw = additional.editor_fields as string;
		try {
			body.editor_fields = typeof raw === 'string' ? JSON.parse(raw) : raw;
		} catch {
			throw new NodeOperationError(
				this.getNode(),
				'Editor Fields must be a valid JSON array',
				{ itemIndex },
			);
		}
	}

	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/templates/${templateId}/documents`,
		body,
	});
}

async function estimateCostFromTemplate(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const templateId = this.getNodeParameter('templateId', itemIndex) as string;
	if (!templateId) {
		throw new NodeOperationError(this.getNode(), 'Template ID is required', { itemIndex });
	}
	const signersRaw = (
		this.getNodeParameter('templateSigners', itemIndex, {}) as { signer?: IDataObject[] }
	).signer ?? [];

	const body: IDataObject = {
		signers: signersRaw.map((s) => {
			const entry: IDataObject = { role_id: s.role_id };
			if (s.id) entry.id = s.id;
			if (s.verification_method) entry.verification_method = s.verification_method;
			if (Array.isArray(s.notification_methods) && (s.notification_methods as unknown[]).length > 0) {
				entry.notification_methods = s.notification_methods;
			}
			return entry;
		}),
	};

	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/templates/${templateId}/documents/estimate-cost`,
		body,
	});
}

async function verifyDocument(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const hash = (this.getNodeParameter('signatureHash', itemIndex) as string).trim();
	if (!hash) {
		throw new NodeOperationError(this.getNode(), 'Signature Hash is required', { itemIndex });
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/documents/${hash}/verify`,
	});
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
