import { Assinafy } from '../nodes/Assinafy/Assinafy.node';
import { executeAssignment } from '../nodes/Assinafy/resources/assignment';
import { executeDocument } from '../nodes/Assinafy/resources/document';
import { executeSigner } from '../nodes/Assinafy/resources/signer';
import { lastAuth, lastPublic, makeCtx } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';
const target = { documentId: 'doc/1', assignmentId: 'assignment/1', signerId: 'signer/1' };
const reviewPath = `${BASE}/documents/doc%2F1/assignments/assignment%2F1/signers/signer%2F1/identity-verification`;

describe('biometric identity verification', () => {
	it.each(['create', 'estimateCost'])(
		'sends biometric verification in assignment %s',
		async (operation) => {
			const signer = {
				id: 'signer_1',
				verification_method: 'IdDocumentFaceMatchBasic',
				notification_methods: ['Whatsapp'],
			};
			const { ctx, requests } = makeCtx({ documentId: 'doc_1', signers: { signer: [signer] } });
			await executeAssignment.call(ctx, 0, operation);
			expect(lastAuth(requests).body).toEqual({
				method: 'virtual',
				signers: [
					operation === 'create'
						? signer
						: {
								verification_method: signer.verification_method,
								notification_methods: ['Whatsapp'],
							},
				],
			});
		},
	);

	it.each(['createFromTemplate', 'estimateCostFromTemplate'])(
		'sends biometric verification in %s',
		async (operation) => {
			const signer = {
				role_id: 'role_1',
				id: 'signer_1',
				verification_method: 'IdDocumentFaceMatchBasic',
				notification_methods: ['Email'],
			};
			const { ctx, requests } = makeCtx({
				templateId: 'template_1',
				templateSigners: { signer: [signer] },
			});
			await executeDocument.call(ctx, 0, operation);
			expect(lastAuth(requests).body.signers).toEqual([
				operation === 'createFromTemplate'
					? signer
					: {
							role_id: 'role_1',
							verification_method: signer.verification_method,
							notification_methods: ['Email'],
						},
			]);
		},
	);

	it.each([
		['getIdentityVerification', 'GET'],
		['startIdentityVerification', 'POST'],
	])('uses only the signer access code for %s', async (operation, method) => {
		const state = {
			can_start: false,
			status: 'Pending',
			url: 'https://verify.example.com/c/session#t=synthetic',
		};
		const { ctx, requests } = makeCtx(
			{ signerAccessCode: ' code ', biometricConsent: true },
			{ response: state },
		);
		const result = await executeSigner.call(ctx, 0, operation);
		expect(requests).toHaveLength(1);
		expect(lastPublic(requests)).toMatchObject({
			method,
			url: `${BASE}/signers/identity-verification`,
			qs: { 'signer-access-code': 'code' },
		});
		expect(lastPublic(requests).body).toEqual(method === 'POST' ? { consent: true } : undefined);
		expect(result).toEqual({ json: state });
	});

	it.each([false, undefined, 'true', 1])(
		'requires explicit boolean consent (%s)',
		async (consent) => {
			const { ctx, requests } = makeCtx({ signerAccessCode: 'code', biometricConsent: consent });
			await expect(executeSigner.call(ctx, 0, 'startIdentityVerification')).rejects.toThrow(
				'explicitly consent',
			);
			expect(requests).toHaveLength(0);
		},
	);

	it.each(['getIdentityVerification', 'startIdentityVerification'])(
		'rejects an empty access code for %s',
		async (operation) => {
			const { ctx, requests } = makeCtx({ signerAccessCode: ' ', biometricConsent: true });
			await expect(executeSigner.call(ctx, 0, operation)).rejects.toThrow(
				'Signer Access Code is required',
			);
			expect(requests).toHaveLength(0);
		},
	);

	it('can read signer verification without workspace credentials', async () => {
		const { ctx, requests } = makeCtx({ signerAccessCode: 'code' });
		ctx.getCredentials.mockRejectedValue(new Error('No credential selected'));
		await executeSigner.call(ctx, 0, 'getIdentityVerification');
		expect(lastPublic(requests).url).toBe(`${BASE}/signers/identity-verification`);
	});

	it('reads the complete account review with encoded target IDs and OAuth', async () => {
		const review = {
			id: 'review_1',
			status: 'InReview',
			evidence_available: true,
			images: ['face'],
			matches: { cpf: true, name: 0.6 },
		};
		const { ctx, requests, httpRequestWithAuthentication } = makeCtx(
			{ ...target, authentication: 'oAuth2' },
			{ response: review },
		);
		expect(await executeAssignment.call(ctx, 0, 'getIdentityReview')).toEqual({ json: review });
		expect(lastAuth(requests)).toMatchObject({ method: 'GET', url: reviewPath });
		expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
			'assinafyOAuth2Api',
			expect.any(Object),
		);
	});

	it.each(['Approved', 'Rejected'])(
		'submits the %s decision and optional note',
		async (decision) => {
			const { ctx, requests } = makeCtx({
				...target,
				identityDecision: decision,
				identityReviewNote: decision === 'Approved' ? ' Reviewed ' : '',
			});
			await executeAssignment.call(ctx, 0, 'decideIdentityReview');
			expect(lastAuth(requests)).toMatchObject({
				method: 'POST',
				url: `${reviewPath}/review`,
				body: { decision, ...(decision === 'Approved' ? { note: 'Reviewed' } : {}) },
			});
		},
	);

	it.each([
		[{ identityDecision: 'approved' }, 'Decision must be'],
		[{ identityDecision: 'Approved', identityReviewNote: 'x'.repeat(2001) }, 'at most 2000'],
		[{ signerId: ' ', identityDecision: 'Approved' }, 'Signer ID is required'],
	])('rejects invalid review input before a request', async (params, error) => {
		const { ctx, requests } = makeCtx({ ...target, ...params });
		await expect(executeAssignment.call(ctx, 0, 'decideIdentityReview')).rejects.toThrow(error);
		expect(requests).toHaveLength(0);
	});

	it('accepts a 2000-code-point review note', async () => {
		const note = '😀'.repeat(2000);
		const { ctx, requests } = makeCtx({
			...target,
			identityDecision: 'Approved',
			identityReviewNote: note,
		});
		await executeAssignment.call(ctx, 0, 'decideIdentityReview');
		expect(lastAuth(requests).body.note).toBe(note);
	});

	it.each([
		['document_front', 'image/jpeg', 'jpg'],
		['document_back', 'image/png', 'png'],
		['document_pdf', 'application/pdf', 'pdf'],
		['face', 'image/jpeg', 'jpg'],
	])('returns %s as n8n binary data', async (name, mimeType, extension) => {
		const { ctx, requests } = makeCtx(
			{
				...target,
				resource: 'assignment',
				operation: 'downloadIdentityReviewImage',
				identityImageName: name,
				binaryOutputProperty: 'evidence',
			},
			{ binaryBuffer: Buffer.from('evidence'), headers: { 'content-type': mimeType } },
		);
		const [[result]] = await new Assinafy().execute.call(ctx);
		expect(lastAuth(requests)).toMatchObject({
			method: 'GET',
			url: `${reviewPath}/images/${name}`,
			encoding: 'arraybuffer',
			returnFullResponse: true,
		});
		expect(result.pairedItem).toEqual({ item: 0 });
		expect(result.binary?.evidence).toMatchObject({
			mimeType,
			fileName: `signer%2F1-${name}.${extension}`,
		});
		expect(result.json).toMatchObject({ name, size: 8 });
	});

	it('rejects an unknown image name before a request', async () => {
		const { ctx, requests } = makeCtx({ ...target, identityImageName: '../secret' });
		await expect(executeAssignment.call(ctx, 0, 'downloadIdentityReviewImage')).rejects.toThrow(
			'Invalid identity review image name',
		);
		expect(requests).toHaveLength(0);
	});

	it('rejects an empty evidence download', async () => {
		const { ctx } = makeCtx(target, { binaryBuffer: Buffer.alloc(0) });
		await expect(executeAssignment.call(ctx, 0, 'downloadIdentityReviewImage')).rejects.toThrow(
			'response was empty',
		);
	});

	it.each(['pending_identity_review', 'certificating'])(
		'recognizes processed metadata while status is %s',
		async (status) => {
			const { ctx, requests } = makeCtx(
				{ documentId: 'doc_1' },
				{ response: { id: 'doc_1', status } },
			);
			expect(await executeDocument.call(ctx, 0, 'waitUntilReady')).toEqual({
				json: { id: 'doc_1', status },
			});
			expect(requests).toHaveLength(1);
		},
	);
});
