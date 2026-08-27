/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeDocument } from '../nodes/Assinafy/resources/document';
import { makeCtx, lastAuth, lastPublic } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('document request construction', () => {
	it('uploads a PDF as multipart to the account documents endpoint', async () => {
		const { ctx, requests } = makeCtx(
			{ binaryPropertyName: 'data', fileName: 'contract.pdf', additionalFields: {} },
			{ binaryMeta: { fileName: 'contract.pdf', mimeType: 'application/pdf' } },
		);
		await executeDocument.call(ctx as any, 0, 'upload');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/documents`);
		expect(req.body).toBeInstanceOf(FormData);
		const entries = [...(req.body as FormData).entries()];
		expect(entries.map(([name]) => name)).toEqual(['file']);
		expect((entries[0][1] as { name: string }).name).toBe('contract.pdf');
	});

	it('rejects a non-PDF upload', async () => {
		const { ctx } = makeCtx(
			{ binaryPropertyName: 'data', fileName: 'note.txt', additionalFields: {} },
			{ binaryMeta: { fileName: 'note.txt', mimeType: 'text/plain' } },
		);
		await expect(executeDocument.call(ctx as any, 0, 'upload')).rejects.toThrow(
			'Only PDF files are supported',
		);
	});

	it('rejects a PDF filename whose content is not a PDF', async () => {
		const { ctx, requests } = makeCtx(
			{ binaryPropertyName: 'data', fileName: 'spoofed.pdf', additionalFields: {} },
			{
				binaryMeta: { fileName: 'spoofed.pdf', mimeType: 'application/pdf' },
				binaryBuffer: Buffer.from('not a pdf'),
			},
		);
		await expect(executeDocument.call(ctx as any, 0, 'upload')).rejects.toThrow(
			'content does not match',
		);
		expect(requests).toHaveLength(0);
	});

	it('gets a document by id', async () => {
		const { ctx, requests } = makeCtx({ documentId: 'doc_123' });
		await executeDocument.call(ctx as any, 0, 'get');
		const req = lastAuth(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/documents/doc_123`);
	});

	it('renames a document via PATCH', async () => {
		const { ctx, requests } = makeCtx({ documentId: 'doc_123', newName: 'signed.pdf' });
		await executeDocument.call(ctx as any, 0, 'rename');
		const req = lastAuth(requests);
		expect(req.method).toBe('PATCH');
		expect(req.url).toBe(`${BASE}/documents/doc_123`);
		expect(req.body).toEqual({ name: 'signed.pdf' });
	});

	it('rejects a rename with an empty new name', async () => {
		const { ctx } = makeCtx({ documentId: 'doc_123', newName: '  ' });
		await expect(executeDocument.call(ctx as any, 0, 'rename')).rejects.toThrow(
			'New Name is required',
		);
	});

	it('searches documents via the lightweight search endpoint', async () => {
		const { ctx, requests } = makeCtx(
			{
				returnAll: false,
				limit: 15,
				searchFilters: { search: 'contract', status: 'metadata_ready' },
			},
			{ response: [{ id: 'doc_1' }] },
		);
		await executeDocument.call(ctx as any, 0, 'search');
		const req = lastAuth(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/documents/search`);
		expect(req.qs).toEqual({ search: 'contract', status: 'metadata_ready', 'per-page': 15 });
	});

	it('deletes a document by id', async () => {
		const { ctx, requests } = makeCtx({ documentId: 'doc_123' });
		const result = (await executeDocument.call(ctx as any, 0, 'delete')) as any;
		expect(lastAuth(requests).method).toBe('DELETE');
		expect(lastAuth(requests).url).toBe(`${BASE}/documents/doc_123`);
		expect(result.json).toEqual({ deleted: true, documentId: 'doc_123' });
	});

	it('downloads the certificated artifact as binary (authenticated)', async () => {
		const { ctx, requests } = makeCtx(
			{ documentId: 'doc_123', artifact: 'certificated', binaryOutputProperty: 'data' },
			{ binaryBuffer: Buffer.from('PDF'), headers: { 'content-type': 'application/pdf' } },
		);
		const result = (await executeDocument.call(ctx as any, 0, 'download')) as any;
		const req = lastAuth(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/documents/doc_123/download/certificated`);
		expect(req.encoding).toBe('arraybuffer');
		expect(result.binary.data).toBeDefined();
	});

	it('downloads the PAdES digital-certificate artifact', async () => {
		const { ctx, requests } = makeCtx(
			{ documentId: 'doc_123', artifact: 'pades', binaryOutputProperty: 'data' },
			{ binaryBuffer: Buffer.from('PDF'), headers: { 'content-type': 'application/pdf' } },
		);
		const result = (await executeDocument.call(ctx as any, 0, 'download')) as any;
		expect(lastAuth(requests).url).toBe(`${BASE}/documents/doc_123/download/pades`);
		expect(result.json.fileName).toBe('doc_123-pades.pdf');
	});

	it('downloads a page image', async () => {
		const { ctx, requests } = makeCtx(
			{ documentId: 'doc_123', pageId: 'pg_1', binaryOutputProperty: 'data' },
			{ binaryBuffer: Buffer.from('JPG'), headers: { 'content-type': 'image/jpeg' } },
		);
		await executeDocument.call(ctx as any, 0, 'downloadPage');
		expect(lastAuth(requests).url).toBe(`${BASE}/documents/doc_123/pages/pg_1/download`);
	});

	it('downloads a document thumbnail', async () => {
		const { ctx, requests } = makeCtx(
			{ documentId: 'doc_123', binaryOutputProperty: 'thumbnail' },
			{ binaryBuffer: Buffer.from('JPEG'), headers: { 'content-type': 'image/jpeg' } },
		);
		const result = (await executeDocument.call(ctx as any, 0, 'downloadThumbnail')) as any;
		expect(lastAuth(requests).url).toBe(`${BASE}/documents/doc_123/thumbnail`);
		expect(result.binary.thumbnail).toBeDefined();
	});

	it('gets document activities', async () => {
		const { ctx, requests } = makeCtx(
			{ documentId: 'doc_123' },
			{ response: [{ event: 'document_created' }] },
		);
		const result = (await executeDocument.call(ctx as any, 0, 'getActivities')) as any;
		expect(lastAuth(requests).url).toBe(`${BASE}/documents/doc_123/activities`);
		expect(result.json.activities).toEqual([{ event: 'document_created' }]);
	});

	it('waits until the document is already ready', async () => {
		const { ctx, requests } = makeCtx(
			{ documentId: 'doc_123', maxWaitMs: 1000, pollIntervalMs: 250 },
			{ response: { id: 'doc_123', status: 'metadata_ready' } },
		);
		const result = (await executeDocument.call(ctx as any, 0, 'waitUntilReady')) as any;
		expect(lastAuth(requests).url).toBe(`${BASE}/documents/doc_123`);
		expect(result.json.status).toBe('metadata_ready');
	});

	it('does not sleep past the configured maximum wait', async () => {
		jest.useFakeTimers();
		try {
			const { ctx, requests } = makeCtx(
				{ documentId: 'doc_123', maxWaitMs: 20, pollIntervalMs: 1000 },
				{ response: { id: 'doc_123', status: 'metadata_processing' } },
			);
			const assertion = expect(
				executeDocument.call(ctx as any, 0, 'waitUntilReady'),
			).rejects.toThrow('Timed out after 20ms');

			await jest.advanceTimersByTimeAsync(20);
			await assertion;
			expect(requests).toHaveLength(1);
		} finally {
			jest.useRealTimers();
		}
	});

	it.each([
		[{ maxWaitMs: 0, pollIntervalMs: 100 }, 'Max Wait must be a positive number'],
		[{ maxWaitMs: 100, pollIntervalMs: 0 }, 'Poll Interval must be a positive number'],
	])('rejects invalid wait timing before making a request', async (timing, message) => {
		const { ctx, requests } = makeCtx({ documentId: 'doc_123', ...timing });
		await expect(executeDocument.call(ctx as any, 0, 'waitUntilReady')).rejects.toThrow(message);
		expect(requests).toHaveLength(0);
	});

	it('summarizes signing progress from assignment.summary', async () => {
		const { ctx } = makeCtx(
			{ documentId: 'doc_123' },
			{
				response: {
					status: 'pending_signature',
					assignment: { summary: { signer_count: 2, completed_count: 1 } },
				},
			},
		);
		const result = (await executeDocument.call(ctx as any, 0, 'getSigningProgress')) as any;
		expect(result.json).toMatchObject({
			available: true,
			signed: 1,
			total: 2,
			pending: 1,
			percentage: 50,
		});
	});

	it('marks signing progress unavailable when the document omits assignment details', async () => {
		const { ctx } = makeCtx(
			{ documentId: 'doc_123' },
			{ response: { status: 'pending_signature', assignment: null } },
		);
		const result = (await executeDocument.call(ctx as any, 0, 'getSigningProgress')) as any;
		expect(result.json).toMatchObject({
			available: false,
			signed: null,
			total: null,
			pending: null,
			percentage: null,
		});
	});

	it('normalizes numeric signing-summary strings', async () => {
		const { ctx } = makeCtx(
			{ documentId: 'doc_123' },
			{
				response: {
					status: 'pending_signature',
					assignment: { summary: { signer_count: '2', completed_count: '2' } },
				},
			},
		);
		const result = (await executeDocument.call(ctx as any, 0, 'getSigningProgress')) as any;
		expect(result.json).toMatchObject({ signed: 2, total: 2, pending: 0, percentage: 100 });
		expect(result.json.isFullySigned).toBe(true);
	});

	it.each([
		{ signer_count: 'many', completed_count: 1 },
		{ signer_count: true, completed_count: 1 },
		{ signer_count: 2, completed_count: -1 },
		{ signer_count: 1, completed_count: 2 },
	])('rejects invalid signing-summary counts: %j', async (summary) => {
		const { ctx } = makeCtx(
			{ documentId: 'doc_123' },
			{ response: { status: 'pending_signature', assignment: { summary } } },
		);
		await expect(executeDocument.call(ctx as any, 0, 'getSigningProgress')).rejects.toThrow(
			'Document signing summary contains invalid counts',
		);
	});

	it('creates a document from a template with signers', async () => {
		const { ctx, requests } = makeCtx({
			templateId: 'tpl_1',
			templateSigners: { signer: [{ role_id: 'role_1', id: 'sig_1', step: 0 }] },
			additionalFields: { name: 'Contract' },
		});
		await executeDocument.call(ctx as any, 0, 'createFromTemplate');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/templates/tpl_1/documents`);
		expect(req.body.signers).toEqual([{ role_id: 'role_1', id: 'sig_1' }]);
		expect(req.body.name).toBe('Contract');
	});

	it('requires signer IDs when creating a document from a template', async () => {
		const { ctx, requests } = makeCtx({
			templateId: 'tpl_1',
			templateSigners: { signer: [{ role_id: 'role_1' }] },
			additionalFields: {},
		});
		await expect(executeDocument.call(ctx as any, 0, 'createFromTemplate')).rejects.toThrow(
			'Each template signer requires a Signer ID',
		);
		expect(requests).toHaveLength(0);
	});

	it('requires Editor Fields to be a JSON array', async () => {
		const { ctx, requests } = makeCtx({
			templateId: 'tpl_1',
			templateSigners: { signer: [{ role_id: 'role_1', id: 'sig_1' }] },
			additionalFields: { editor_fields: '{"field_id":"field_1","value":"not-an-array"}' },
		});

		await expect(executeDocument.call(ctx as any, 0, 'createFromTemplate')).rejects.toThrow(
			'Editor Fields must be a valid JSON array',
		);
		expect(requests).toHaveLength(0);
	});

	it('estimates cost from a template (signers may omit ids)', async () => {
		const { ctx, requests } = makeCtx({
			templateId: 'tpl_1',
			templateSigners: { signer: [{ role_id: 'role_1' }] },
		});
		await executeDocument.call(ctx as any, 0, 'estimateCostFromTemplate');
		const req = lastAuth(requests);
		expect(req.url).toBe(`${BASE}/accounts/acc_123/templates/tpl_1/documents/estimate-cost`);
		expect(req.body.signers).toEqual([{ role_id: 'role_1' }]);
	});

	it('estimates Digital Certificate cost from a template', async () => {
		const { ctx, requests } = makeCtx({
			templateId: 'tpl_1',
			templateSigners: {
				signer: [{ role_id: 'role_1', verification_method: 'DigitalCertificate' }],
			},
		});
		await executeDocument.call(ctx as any, 0, 'estimateCostFromTemplate');
		expect(lastAuth(requests).body.signers).toEqual([
			{ role_id: 'role_1', verification_method: 'DigitalCertificate' },
		]);
	});

	it('rejects a Digital Certificate template signer sharing a signing step', async () => {
		const { ctx, requests } = makeCtx({
			templateId: 'tpl_1',
			templateSigners: {
				signer: [
					{
						role_id: 'role_1',
						id: 'sig_1',
						verification_method: 'DigitalCertificate',
						step: 1,
					},
					{ role_id: 'role_2', id: 'sig_2', verification_method: 'Email', step: 1 },
				],
			},
			additionalFields: {},
		});
		await expect(executeDocument.call(ctx as any, 0, 'createFromTemplate')).rejects.toThrow(
			'must be alone in their signing step',
		);
		expect(requests).toHaveLength(0);
	});

	it('omits signer IDs and signing steps from a template cost estimate', async () => {
		const { ctx, requests } = makeCtx({
			templateId: 'tpl_1',
			templateSigners: {
				signer: [
					{
						role_id: 'role_1',
						id: 'sig_1',
						verification_method: 'Email',
						notification_methods: ['Email'],
						step: 4,
					},
				],
			},
		});
		await executeDocument.call(ctx as any, 0, 'estimateCostFromTemplate');
		expect(lastAuth(requests).body.signers).toEqual([
			{
				role_id: 'role_1',
				verification_method: 'Email',
				notification_methods: ['Email'],
			},
		]);
	});

	it('rejects multiple notification methods for one template signer', async () => {
		const { ctx, requests } = makeCtx({
			templateId: 'tpl_1',
			templateSigners: {
				signer: [
					{
						role_id: 'role_1',
						id: 'sig_1',
						notification_methods: ['Email', 'Whatsapp'],
					},
				],
			},
			additionalFields: {},
		});
		await expect(executeDocument.call(ctx as any, 0, 'createFromTemplate')).rejects.toThrow(
			'at most one Notification Method',
		);
		expect(requests).toHaveLength(0);
	});

	it('allows multiple notification methods when estimating template cost', async () => {
		const { ctx, requests } = makeCtx({
			templateId: 'tpl_1',
			templateSigners: {
				signer: [
					{
						role_id: 'role_1',
						notification_methods: ['Email', 'Whatsapp'],
					},
				],
			},
		});

		await executeDocument.call(ctx as any, 0, 'estimateCostFromTemplate');

		expect(lastAuth(requests).body.signers).toEqual([
			{ role_id: 'role_1', notification_methods: ['Email', 'Whatsapp'] },
		]);
	});

	it('verifies a document by hash without authentication', async () => {
		const { ctx, requests } = makeCtx({ signatureHash: ' hash/123?value ' });
		await executeDocument.call(ctx as any, 0, 'verify');
		const req = lastPublic(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/documents/hash%2F123%3Fvalue/verify`);
	});

	it('reads public info without authentication', async () => {
		const { ctx, requests } = makeCtx({ publicDocumentId: 'doc_pub' });
		await executeDocument.call(ctx as any, 0, 'getPublicInfo');
		expect(lastPublic(requests).url).toBe(`${BASE}/public/documents/doc_pub`);
	});

	it('sends a public token via the public endpoint', async () => {
		const { ctx, requests } = makeCtx({
			publicDocumentId: 'doc_pub',
			recipient: ' user@example.com ',
			channel: 'email',
		});
		await executeDocument.call(ctx as any, 0, 'sendPublicToken');
		const req = lastPublic(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/public/documents/doc_pub/send-token`);
		expect(req.body).toEqual({ recipient: 'user@example.com', channel: 'email' });
	});

	it('rejects an invalid email-channel public token recipient', async () => {
		const { ctx, requests } = makeCtx({
			publicDocumentId: 'doc_pub',
			recipient: 'not-an-email',
			channel: 'email',
		});
		await expect(executeDocument.call(ctx as any, 0, 'sendPublicToken')).rejects.toThrow(
			'Invalid recipient email address',
		);
		expect(requests).toHaveLength(0);
	});

	it('accepts a WhatsApp public token recipient', async () => {
		const { ctx, requests } = makeCtx({
			publicDocumentId: 'doc_pub',
			recipient: '+5511999990001',
			channel: 'whatsapp',
		});
		await executeDocument.call(ctx as any, 0, 'sendPublicToken');
		expect(lastPublic(requests).body).toEqual({
			recipient: '+5511999990001',
			channel: 'whatsapp',
		});
	});

	it('lists document statuses', async () => {
		const { ctx, requests } = makeCtx({}, { response: [{ code: 'metadata_ready' }] });
		await executeDocument.call(ctx as any, 0, 'listStatuses');
		expect(lastAuth(requests).url).toBe(`${BASE}/documents/statuses`);
	});

	it('lists tags attached to a document', async () => {
		const { ctx, requests } = makeCtx(
			{ documentId: 'doc_123' },
			{ response: [{ id: 'tag_1', name: 'Legal' }] },
		);
		const result = (await executeDocument.call(ctx as any, 0, 'listTags')) as any[];
		expect(lastAuth(requests).url).toBe(`${BASE}/accounts/acc_123/documents/doc_123/tags`);
		expect(result[0].json.name).toBe('Legal');
	});

	it('replaces document tags', async () => {
		const { ctx, requests } = makeCtx(
			{ documentId: 'doc_123', tagNames: ['A', 'B'] },
			{ response: [{ id: 'tag_1', name: 'A' }] },
		);
		const result = (await executeDocument.call(ctx as any, 0, 'replaceTags')) as any;
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/documents/doc_123/tags`);
		expect(req.body).toEqual({ tags: ['A', 'B'] });
		expect(result.json).toEqual({ data: [{ id: 'tag_1', name: 'A' }] });
	});

	it('detaches a single tag', async () => {
		const { ctx, requests } = makeCtx({ documentId: 'doc_123', tagId: 'tag_1' });
		await executeDocument.call(ctx as any, 0, 'detachTag');
		const req = lastAuth(requests);
		expect(req.method).toBe('DELETE');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/documents/doc_123/tags/tag_1`);
	});
});
