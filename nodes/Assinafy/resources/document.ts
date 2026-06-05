import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation, getAccountId } from '../shared/transport';
import {
	documentResourceLocator,
	limitField,
	returnAllField,
	searchField,
	sortField,
	tagResourceLocator,
} from '../shared/descriptions';
import {
	cleanQs,
	extractRequiredId,
	normalizeTagFilter,
	parseStringList,
	showOnly as showOnlyFor,
	validateSigningSteps,
	wrap,
} from '../shared/utils';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const READY_STATUSES = new Set(['metadata_ready', 'pending_signature', 'certificated']);
const FAILED_STATUSES = new Set(['failed', 'rejected_by_signer', 'rejected_by_user', 'expired']);

const showOnly = showOnlyFor('document');

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
				name: 'Append Tags',
				value: 'appendTags',
				action: 'Append tags to a document',
			},
			{
				name: 'Create From Template',
				value: 'createFromTemplate',
				action: 'Create a document from a template',
			},
			{ name: 'Delete', value: 'delete', action: 'Delete a document' },
			{
				name: 'Detach Tag',
				value: 'detachTag',
				action: 'Detach one tag from a document',
			},
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
				name: 'Get Public Info',
				value: 'getPublicInfo',
				action: 'Get unauthenticated public document basics',
			},
			{
				name: 'Get Signing Progress',
				value: 'getSigningProgress',
				action: 'Return a signed total percentage summary',
			},
			{ name: 'List', value: 'list', action: 'List workspace documents' },
			{
				name: 'List Statuses',
				value: 'listStatuses',
				action: 'List supported document statuses and deletability',
			},
			{
				name: 'List Tags',
				value: 'listTags',
				action: 'List tags attached to a document',
			},
			{
				name: 'Replace Tags',
				value: 'replaceTags',
				action: 'Replace all tags on a document',
			},
			{
				name: 'Send Public Token',
				value: 'sendPublicToken',
				action: 'Send a 6 digit access token to a signer via email or whatsapp',
			},
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
			{
				displayName: 'Tag IDs',
				name: 'tags',
				type: 'string',
				typeOptions: { multipleValues: true },
				default: [],
				description: 'Tag IDs to filter by. Assinafy returns documents that have all listed tags.',
			},
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
				'listTags',
				'replaceTags',
				'appendTags',
				'detachTag',
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
						description: 'Existing signer ID. Can be omitted for Estimate Cost.',
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
				displayName: 'Editor Fields (JSON)',
				name: 'editor_fields',
				type: 'json',
				default: '[]',
				description: 'Array of editor field values: [{ "field_id": "...", "value": "..." }]',
			},
			{
				displayName: 'Expires At',
				name: 'expires_at',
				type: 'dateTime',
				default: '',
				description: 'ISO 8601 expiration date for the assignment',
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
				displayName: 'Tag Names',
				name: 'tags',
				type: 'string',
				typeOptions: { multipleValues: true },
				default: [],
				description:
					'Tag names to attach to the new document. Missing tags are created by Assinafy.',
			},
		],
	},

	// --- document tags ---
	{
		displayName: 'Tag Names',
		name: 'tagNames',
		type: 'string',
		typeOptions: { multipleValues: true },
		default: [],
		description:
			'Tag names to attach. For Replace Tags, leaving this empty removes all document tags.',
		displayOptions: { show: showOnly(['replaceTags', 'appendTags']) },
	},
	{
		...tagResourceLocator,
		displayOptions: { show: showOnly(['detachTag']) },
	},

	// --- verify ---
	{
		displayName: 'Signature Hash',
		name: 'signatureHash',
		type: 'string',
		default: '',
		required: true,
		description: 'The signature hash from the signed document (used to verify its authenticity)',
		displayOptions: { show: showOnly(['verify']) },
	},

	// --- getPublicInfo / sendPublicToken ---
	{
		displayName: 'Document ID',
		name: 'publicDocumentId',
		type: 'string',
		default: '',
		required: true,
		description: 'Public document ID (no authentication required for these endpoints)',
		displayOptions: { show: showOnly(['getPublicInfo', 'sendPublicToken']) },
	},
	{
		displayName: 'Recipient',
		name: 'recipient',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'name@example.com or +5511999990001',
		description: 'Email or WhatsApp phone number to send the token to',
		displayOptions: { show: showOnly(['sendPublicToken']) },
	},
	{
		displayName: 'Channel',
		name: 'channel',
		type: 'options',
		default: 'email',
		options: [
			{ name: 'Email', value: 'email' },
			{ name: 'WhatsApp', value: 'whatsapp' },
		],
		displayOptions: { show: showOnly(['sendPublicToken']) },
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
		case 'getPublicInfo':
			return wrap(await getPublicInfo.call(this, itemIndex));
		case 'sendPublicToken':
			return wrap(await sendPublicToken.call(this, itemIndex));
		case 'listStatuses':
			return wrap({ statuses: await listStatuses.call(this) });
		case 'listTags':
			return listDocumentTags.call(this, itemIndex);
		case 'replaceTags':
			return wrap(await replaceDocumentTags.call(this, itemIndex));
		case 'appendTags':
			return wrap(await appendDocumentTags.call(this, itemIndex));
		case 'detachTag':
			return wrap(await detachDocumentTag.call(this, itemIndex));
		default:
			throw new NodeOperationError(this.getNode(), `Unknown document operation: ${operation}`, {
				itemIndex,
			});
	}
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
		throw new NodeOperationError(this.getNode(), "File size exceeds Assinafy's 25MB upload limit", {
			itemIndex,
		});
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
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const accountId = await getAccountId(this);
	return executeListOperation(this, itemIndex, {
		path: `/accounts/${accountId}/documents`,
		qs: normalizeTagFilter(cleanQs(filters)),
	});
}

async function getDocument(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const documentId = extractDocumentId.call(this, itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/documents/${documentId}`,
	});
}

async function deleteDocument(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
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
	const outputProperty = this.getNodeParameter('binaryOutputProperty', itemIndex, 'data') as string;

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

async function getActivities(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
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
		(assignment.signers as unknown[] | undefined)?.length ??
		0;
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

async function waitUntilReady(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
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
	return extractRequiredId(this, 'documentId', 'Document ID', itemIndex);
}

/** Map the fixedCollection template-signer rows into the documented `signers[]` payload. */
function buildTemplateSigners(signersRaw: IDataObject[]): IDataObject[] {
	return signersRaw.map((s) => {
		const entry: IDataObject = { role_id: s.role_id };
		if (s.id) entry.id = s.id;
		if (s.verification_method) entry.verification_method = s.verification_method;
		if (Array.isArray(s.notification_methods) && (s.notification_methods as unknown[]).length > 0) {
			entry.notification_methods = s.notification_methods;
		}
		const step = Number(s.step ?? 0);
		if (step > 0) entry.step = step;
		return entry;
	});
}

/** Read + validate the shared template-signer rows for create/estimate operations. */
function readTemplateSigners(this: IExecuteFunctions, itemIndex: number): IDataObject[] {
	const signersRaw =
		(this.getNodeParameter('templateSigners', itemIndex, {}) as { signer?: IDataObject[] })
			.signer ?? [];
	validateSigningSteps(
		this,
		signersRaw.map((signer) => signer.step as number | string | undefined),
		itemIndex,
	);
	return signersRaw;
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
	const signersRaw = readTemplateSigners.call(this, itemIndex);

	if (signersRaw.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			'At least one signer is required to create a document from a template',
			{ itemIndex },
		);
	}

	const body: IDataObject = { signers: buildTemplateSigners(signersRaw) };

	if (additional.name) body.name = additional.name;
	if (additional.message) body.message = additional.message;
	if (additional.expires_at) body.expires_at = additional.expires_at;
	if (additional.editor_fields && (additional.editor_fields as string) !== '[]') {
		const raw = additional.editor_fields as string;
		try {
			body.editor_fields = typeof raw === 'string' ? JSON.parse(raw) : raw;
		} catch {
			throw new NodeOperationError(this.getNode(), 'Editor Fields must be a valid JSON array', {
				itemIndex,
			});
		}
	}
	const tags = parseStringList(additional.tags);
	if (tags.length > 0) body.tags = tags;

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
	const signersRaw = readTemplateSigners.call(this, itemIndex);

	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/templates/${templateId}/documents/estimate-cost`,
		body: { signers: buildTemplateSigners(signersRaw) },
	});
}

async function verifyDocument(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const hash = (this.getNodeParameter('signatureHash', itemIndex) as string).trim();
	if (!hash) {
		throw new NodeOperationError(this.getNode(), 'Signature Hash is required', { itemIndex });
	}
	// Public endpoint — no API key required (consistent with getPublicInfo/sendPublicToken).
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/documents/${hash}/verify`,
		skipAuth: true,
	});
}

async function getPublicInfo(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const id = (this.getNodeParameter('publicDocumentId', itemIndex) as string).trim();
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'Document ID is required', { itemIndex });
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'GET',
		path: `/public/documents/${id}`,
		skipAuth: true,
	});
}

async function sendPublicToken(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const id = (this.getNodeParameter('publicDocumentId', itemIndex) as string).trim();
	const recipient = (this.getNodeParameter('recipient', itemIndex) as string).trim();
	const channel = this.getNodeParameter('channel', itemIndex, 'email') as string;
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'Document ID is required', { itemIndex });
	}
	if (!recipient) {
		throw new NodeOperationError(this.getNode(), 'Recipient is required', { itemIndex });
	}
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/public/documents/${id}/send-token`,
		body: { recipient, channel },
		skipAuth: true,
	});
}

async function listStatuses(this: IExecuteFunctions): Promise<IDataObject[]> {
	const response = await assinafyApiRequest<IDataObject[]>(this, {
		method: 'GET',
		path: '/documents/statuses',
	});
	return Array.isArray(response) ? response : [];
}

async function listDocumentTags(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const accountId = await getAccountId(this);
	const documentId = extractDocumentId.call(this, itemIndex);
	const response = await assinafyApiRequest<IDataObject[]>(this, {
		method: 'GET',
		path: `/accounts/${accountId}/documents/${documentId}/tags`,
	});
	const tags = Array.isArray(response) ? response : [];
	return tags.map((tag) => ({ json: tag }));
}

async function replaceDocumentTags(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const documentId = extractDocumentId.call(this, itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/accounts/${accountId}/documents/${documentId}/tags`,
		body: { tags: parseStringList(this.getNodeParameter('tagNames', itemIndex, [])) },
	});
}

async function appendDocumentTags(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const tags = parseStringList(this.getNodeParameter('tagNames', itemIndex, []));
	if (tags.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one tag name is required', {
			itemIndex,
		});
	}

	const accountId = await getAccountId(this);
	const documentId = extractDocumentId.call(this, itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/documents/${documentId}/tags`,
		body: { tags },
	});
}

async function detachDocumentTag(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const documentId = extractDocumentId.call(this, itemIndex);
	const tagId = extractRequiredId(this, 'tagId', 'Tag ID', itemIndex);
	await assinafyApiRequest(this, {
		method: 'DELETE',
		path: `/accounts/${accountId}/documents/${documentId}/tags/${tagId}`,
	});
	return { detached: true, documentId, tagId };
}
