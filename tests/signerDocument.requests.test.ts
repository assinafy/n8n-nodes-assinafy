/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeSignerDocument } from '../nodes/Assinafy/resources/signerDocument';
import { makeCtx, lastPublic } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('signerDocument request construction (signer-side, no auth)', () => {
	it('gets the current document', async () => {
		const { ctx, requests } = makeCtx({ signerAccessCode: 'code123', signerId: 'sig_1' });
		await executeSignerDocument.call(ctx as any, 0, 'getCurrent');
		const req = lastPublic(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/signers/sig_1/document`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
	});

	it('lists documents emitting one item per record', async () => {
		const { ctx, requests } = makeCtx(
			{
				signerAccessCode: 'code123',
				signerId: 'sig_1',
				filters: { method: 'virtual' },
				returnAll: false,
				limit: 25,
			},
			{ response: [{ id: 'd1' }, { id: 'd2' }] },
		);
		const result = (await executeSignerDocument.call(ctx as any, 0, 'list')) as any;
		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(2);
		expect(result[0].json).toEqual({ id: 'd1' });
		expect(lastPublic(requests).qs).toEqual({
			'signer-access-code': 'code123',
			method: 'virtual',
			'per-page': 25,
		});
	});

	it('searches visible signer documents', async () => {
		const { ctx, requests } = makeCtx(
			{ signerAccessCode: 'code123', signerId: 'sig_1', search: 'contract' },
			{ response: [{ id: 'd1' }] },
		);
		const result = (await executeSignerDocument.call(ctx as any, 0, 'search')) as any[];
		const req = lastPublic(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/signers/sig_1/documents/search`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123', search: 'contract' });
		expect(result[0].json).toEqual({ id: 'd1' });
	});

	it('signs multiple documents', async () => {
		const { ctx, requests } = makeCtx(
			{
				signerAccessCode: 'code123',
				documentIds: 'd1, d2 ,d3',
			},
			{ response: [] },
		);
		const result = (await executeSignerDocument.call(ctx as any, 0, 'signMultiple')) as any;
		const req = lastPublic(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/signers/documents/sign-multiple`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
		expect(req.body).toEqual({ document_ids: ['d1', 'd2', 'd3'] });
		expect(result.json).toEqual({ data: [] });
	});

	it('declines multiple documents with a reason', async () => {
		const { ctx, requests } = makeCtx({
			signerAccessCode: 'code123',
			documentIds: 'd1,d2',
			declineReason: ' No ',
		});
		await executeSignerDocument.call(ctx as any, 0, 'declineMultiple');
		const req = lastPublic(requests);
		expect(req.url).toBe(`${BASE}/signers/documents/decline-multiple`);
		expect(req.body).toEqual({ document_ids: ['d1', 'd2'], decline_reason: 'No' });
	});

	it('rejects a blank multiple-decline reason before making a request', async () => {
		const { ctx, requests } = makeCtx({
			signerAccessCode: 'code123',
			documentIds: 'd1,d2',
			declineReason: '   ',
		});
		await expect(executeSignerDocument.call(ctx as any, 0, 'declineMultiple')).rejects.toThrow(
			'Decline Reason is required',
		);
		expect(requests).toHaveLength(0);
	});

	it('downloads a signer document artifact', async () => {
		const { ctx, requests } = makeCtx(
			{
				signerAccessCode: 'code123',
				signerId: 'sig_1',
				documentId: 'doc_1',
				artifact: 'certificated',
				binaryOutputProperty: 'data',
			},
			{ binaryBuffer: Buffer.from('PDF'), headers: { 'content-type': 'application/pdf' } },
		);
		const result = (await executeSignerDocument.call(ctx as any, 0, 'download')) as any;
		const req = lastPublic(requests);
		expect(req.url).toBe(`${BASE}/signers/sig_1/documents/doc_1/download/certificated`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
		expect(result.binary.data).toBeDefined();
	});

	it('downloads the public PAdES artifact without requiring an access code', async () => {
		const { ctx, requests } = makeCtx(
			{
				signerAccessCode: '',
				signerId: 'sig_1',
				documentId: 'doc_1',
				artifact: 'pades',
				binaryOutputProperty: 'data',
			},
			{ binaryBuffer: Buffer.from('PDF'), headers: { 'content-type': 'application/pdf' } },
		);
		await executeSignerDocument.call(ctx as any, 0, 'download');
		const req = lastPublic(requests);
		expect(req.url).toBe(`${BASE}/signers/sig_1/documents/doc_1/download/pades`);
		expect(req.qs).toBeUndefined();
	});

	it('uses a ZIP fallback MIME type for a bundle without a content-type header', async () => {
		const { ctx } = makeCtx(
			{
				signerAccessCode: '',
				signerId: 'sig_1',
				documentId: 'doc_1',
				artifact: 'bundle',
				binaryOutputProperty: 'data',
			},
			{ binaryBuffer: Buffer.from('ZIP'), headers: {} },
		);
		const result = (await executeSignerDocument.call(ctx as any, 0, 'download')) as any;
		expect(result.json.mimeType).toBe('application/zip');
		expect(result.json.fileName).toBe('doc_1-bundle.zip');
	});
});
