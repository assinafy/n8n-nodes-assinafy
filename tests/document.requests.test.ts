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

	it('gets a document by id', async () => {
		const { ctx, requests } = makeCtx({ documentId: 'doc_123' });
		await executeDocument.call(ctx as any, 0, 'get');
		const req = lastAuth(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/documents/doc_123`);
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

	it('downloads a page image', async () => {
		const { ctx, requests } = makeCtx(
			{ documentId: 'doc_123', pageId: 'pg_1', binaryOutputProperty: 'data' },
			{ binaryBuffer: Buffer.from('JPG'), headers: { 'content-type': 'image/jpeg' } },
		);
		await executeDocument.call(ctx as any, 0, 'downloadPage');
		expect(lastAuth(requests).url).toBe(`${BASE}/documents/doc_123/pages/pg_1/download`);
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
		expect(result.json).toMatchObject({ signed: 1, total: 2, pending: 1, percentage: 50 });
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

	it('verifies a document by hash without authentication', async () => {
		const { ctx, requests } = makeCtx({ signatureHash: 'hash123' });
		await executeDocument.call(ctx as any, 0, 'verify');
		const req = lastPublic(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/documents/hash123/verify`);
	});

	it('reads public info without authentication', async () => {
		const { ctx, requests } = makeCtx({ publicDocumentId: 'doc_pub' });
		await executeDocument.call(ctx as any, 0, 'getPublicInfo');
		expect(lastPublic(requests).url).toBe(`${BASE}/public/documents/doc_pub`);
	});

	it('sends a public token via the public endpoint', async () => {
		const { ctx, requests } = makeCtx({
			publicDocumentId: 'doc_pub',
			recipient: 'a@b.com',
			channel: 'email',
		});
		await executeDocument.call(ctx as any, 0, 'sendPublicToken');
		const req = lastPublic(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/public/documents/doc_pub/send-token`);
		expect(req.body).toEqual({ recipient: 'a@b.com', channel: 'email' });
	});

	it('lists document statuses', async () => {
		const { ctx, requests } = makeCtx({}, { response: [{ code: 'metadata_ready' }] });
		await executeDocument.call(ctx as any, 0, 'listStatuses');
		expect(lastAuth(requests).url).toBe(`${BASE}/documents/statuses`);
	});

	it('replaces document tags', async () => {
		const { ctx, requests } = makeCtx({ documentId: 'doc_123', tagNames: ['A', 'B'] });
		await executeDocument.call(ctx as any, 0, 'replaceTags');
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/documents/doc_123/tags`);
		expect(req.body).toEqual({ tags: ['A', 'B'] });
	});

	it('detaches a single tag', async () => {
		const { ctx, requests } = makeCtx({ documentId: 'doc_123', tagId: 'tag_1' });
		await executeDocument.call(ctx as any, 0, 'detachTag');
		const req = lastAuth(requests);
		expect(req.method).toBe('DELETE');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/documents/doc_123/tags/tag_1`);
	});
});
