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
		const { ctx } = makeCtx(
			{ signerAccessCode: 'code123', signerId: 'sig_1', filters: { method: 'virtual' } },
			{ response: [{ id: 'd1' }, { id: 'd2' }] },
		);
		const result = (await executeSignerDocument.call(ctx as any, 0, 'list')) as any;
		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(2);
		expect(result[0].json).toEqual({ id: 'd1' });
	});

	it('signs multiple documents', async () => {
		const { ctx, requests } = makeCtx({
			signerAccessCode: 'code123',
			documentIds: 'd1, d2 ,d3',
		});
		await executeSignerDocument.call(ctx as any, 0, 'signMultiple');
		const req = lastPublic(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/signers/documents/sign-multiple`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
		expect(req.body).toEqual({ document_ids: ['d1', 'd2', 'd3'] });
	});

	it('declines multiple documents with a reason', async () => {
		const { ctx, requests } = makeCtx({
			signerAccessCode: 'code123',
			documentIds: 'd1,d2',
			declineReason: 'No',
		});
		await executeSignerDocument.call(ctx as any, 0, 'declineMultiple');
		const req = lastPublic(requests);
		expect(req.url).toBe(`${BASE}/signers/documents/decline-multiple`);
		expect(req.body).toEqual({ document_ids: ['d1', 'd2'], decline_reason: 'No' });
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
});
