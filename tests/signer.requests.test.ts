/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeSigner } from '../nodes/Assinafy/resources/signer';
import { makeCtx, lastAuth, lastPublic } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('signer request construction', () => {
	it('creates a signer (reuse disabled) with sanitized cpf', async () => {
		const { ctx, requests } = makeCtx({
			fullName: 'Jane Doe',
			email: 'jane@example.com',
			additionalFields: { reuseIfExists: false, cpf: '123.456.789-00' },
		});
		await executeSigner.call(ctx as any, 0, 'create');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/signers`);
		expect(req.body).toEqual({
			full_name: 'Jane Doe',
			email: 'jane@example.com',
			cpf: '12345678900',
		});
	});

	it('requires email or whatsapp to create a signer', async () => {
		const { ctx } = makeCtx({ fullName: 'No Contact', email: '', additionalFields: {} });
		await expect(executeSigner.call(ctx as any, 0, 'create')).rejects.toThrow(
			'At least one of Email or WhatsApp',
		);
	});

	it('rejects invalid signer metadata instead of silently replacing it', async () => {
		const { ctx, requests } = makeCtx({
			fullName: 'Jane Doe',
			email: 'jane@example.com',
			additionalFields: { reuseIfExists: false, metadata: '{invalid' },
		});
		await expect(executeSigner.call(ctx as any, 0, 'create')).rejects.toThrow(
			'Metadata must be valid JSON',
		);
		expect(requests).toHaveLength(0);
	});

	it('reuses an existing signer by email before creating', async () => {
		const { ctx, requests } = makeCtx(
			{ fullName: 'Jane', email: 'jane@example.com', additionalFields: {} },
			{ response: [{ id: 'sig_existing', email: 'jane@example.com' }] },
		);
		const result = (await executeSigner.call(ctx as any, 0, 'create')) as any;
		// Only the lookup GET should have happened — no POST.
		expect(requests.every((r) => r.options.method === 'GET')).toBe(true);
		expect(result.json.id).toBe('sig_existing');
	});

	it('gets a signer', async () => {
		const { ctx, requests } = makeCtx({ signerId: 'sig_1' });
		await executeSigner.call(ctx as any, 0, 'get');
		expect(lastAuth(requests).url).toBe(`${BASE}/accounts/acc_123/signers/sig_1`);
	});

	it('updates a signer with sanitized cpf', async () => {
		const { ctx, requests } = makeCtx({
			signerId: 'sig_1',
			updateFields: { full_name: 'New Name', cpf: '111.222.333-44' },
		});
		await executeSigner.call(ctx as any, 0, 'update');
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/signers/sig_1`);
		expect(req.body).toEqual({ full_name: 'New Name', cpf: '11122233344' });
	});

	it('deletes a signer', async () => {
		const { ctx, requests } = makeCtx({ signerId: 'sig_1' });
		const result = (await executeSigner.call(ctx as any, 0, 'delete')) as any;
		expect(lastAuth(requests).method).toBe('DELETE');
		expect(result.json).toEqual({ deleted: true, signerId: 'sig_1' });
	});

	it('finds a signer by email via search', async () => {
		const { ctx, requests } = makeCtx(
			{ email: 'jane@example.com' },
			{ response: [{ id: 'sig_1', email: 'jane@example.com' }] },
		);
		await executeSigner.call(ctx as any, 0, 'findByEmail');
		const req = lastAuth(requests);
		expect(req.url).toBe(`${BASE}/accounts/acc_123/signers`);
		expect(req.qs).toEqual({ search: 'jane@example.com', 'per-page': 100 });
	});

	it('getSelf sends the access code as a query param without auth', async () => {
		const { ctx, requests } = makeCtx({ signerAccessCode: 'code123' });
		await executeSigner.call(ctx as any, 0, 'getSelf');
		const req = lastPublic(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/signers/self`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
	});

	it('acceptTerms sends the access code as query authentication', async () => {
		const { ctx, requests } = makeCtx({ signerAccessCode: 'code123' });
		await executeSigner.call(ctx as any, 0, 'acceptTerms');
		const req = lastPublic(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/signers/accept-terms`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
		expect(req.body).toBeUndefined();
	});

	it('verifyCode authenticates by query and posts only the verification code', async () => {
		const { ctx, requests } = makeCtx({ signerAccessCode: 'code123', verificationCode: '654321' });
		await executeSigner.call(ctx as any, 0, 'verifyCode');
		const req = lastPublic(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/verify`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
		expect(req.body).toEqual({ 'verification-code': '654321' });
	});

	it('confirmData sends code in query and fields in body', async () => {
		const { ctx, requests } = makeCtx({
			signerAccessCode: 'code123',
			confirmDocumentId: 'doc_1',
			confirmFields: {
				full_name: 'Jane Doe',
				email: 'jane@example.com',
				government_id: '12345678900',
				has_accepted_terms: true,
			},
		});
		await executeSigner.call(ctx as any, 0, 'confirmData');
		const req = lastPublic(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/documents/doc_1/signers/confirm-data`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
		expect(req.body).toEqual({
			full_name: 'Jane Doe',
			email: 'jane@example.com',
			government_id: '12345678900',
			has_accepted_terms: true,
		});
	});

	it('uploadSignature posts the image buffer with code, type, and reuse query', async () => {
		const { ctx, requests } = makeCtx(
			{
				signerAccessCode: 'code123',
				signatureType: 'signature',
				binaryPropertyName: 'data',
				signatureOptions: { reuse: true },
			},
			{
				binaryMeta: { mimeType: 'image/png' },
				binaryBuffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
			},
		);
		await executeSigner.call(ctx as any, 0, 'uploadSignature');
		const req = lastPublic(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/signature`);
		expect(req.qs).toEqual({
			'signer-access-code': 'code123',
			type: 'signature',
			reuse: true,
		});
		expect(Buffer.isBuffer(req.body)).toBe(true);
		expect(req.headers['Content-Type']).toBe('image/png');
	});

	it('uploadSignature rejects an empty image before making a request', async () => {
		const { ctx, requests } = makeCtx(
			{ signerAccessCode: 'code123', signatureType: 'signature', binaryPropertyName: 'data' },
			{ binaryMeta: { mimeType: 'image/png' }, binaryBuffer: Buffer.alloc(0) },
		);
		await expect(executeSigner.call(ctx as any, 0, 'uploadSignature')).rejects.toThrow(
			'Signature image cannot be empty',
		);
		expect(requests).toHaveLength(0);
	});

	it('uploadSignature rejects bytes that do not match the declared image type', async () => {
		const { ctx, requests } = makeCtx(
			{ signerAccessCode: 'code123', signatureType: 'signature', binaryPropertyName: 'data' },
			{ binaryMeta: { mimeType: 'image/png' }, binaryBuffer: Buffer.from('not png') },
		);
		await expect(executeSigner.call(ctx as any, 0, 'uploadSignature')).rejects.toThrow(
			'content does not match',
		);
		expect(requests).toHaveLength(0);
	});

	it('downloadSignature gets the image binary without auth', async () => {
		const { ctx, requests } = makeCtx(
			{ signerAccessCode: 'code123', signatureType: 'initial', binaryOutputProperty: 'data' },
			{ binaryBuffer: Buffer.from('PNG'), headers: { 'content-type': 'image/png' } },
		);
		const result = (await executeSigner.call(ctx as any, 0, 'downloadSignature')) as any;
		const req = lastPublic(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/signature/initial`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
		expect(result.binary.data).toBeDefined();
	});
});
