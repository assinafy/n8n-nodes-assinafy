/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeAssignment } from '../nodes/Assinafy/resources/assignment';
import { makeCtx, lastAuth, lastPublic } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('assignment request construction', () => {
	it('creates a virtual assignment with signer refs', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			method: 'virtual',
			signers: {
				signer: [
					{ id: 'sig_1', verification_method: 'Email', notification_methods: ['Email'], step: 0 },
				],
			},
			additionalFields: { message: 'Please sign' },
		});
		await executeAssignment.call(ctx as any, 0, 'create');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/documents/doc_1/assignments`);
		expect(req.body).toEqual({
			method: 'virtual',
			signers: [{ id: 'sig_1', verification_method: 'Email', notification_methods: ['Email'] }],
			message: 'Please sign',
		});
	});

	it('creates a collect assignment with entries JSON', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			method: 'collect',
			signers: { signer: [{ id: 'sig_1' }] },
			additionalFields: {},
			entries: '[{"page_id":"p1","fields":[{"signer_id":"sig_1","field_id":"f1"}]}]',
		});
		await executeAssignment.call(ctx as any, 0, 'create');
		const req = lastAuth(requests);
		expect(req.body.method).toBe('collect');
		expect(req.body.entries).toEqual([
			{ page_id: 'p1', fields: [{ signer_id: 'sig_1', field_id: 'f1' }] },
		]);
	});

	it('estimates cost allowing signers without ids', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			method: 'virtual',
			signers: { signer: [{ verification_method: 'Email' }] },
			additionalFields: {},
		});
		await executeAssignment.call(ctx as any, 0, 'estimateCost');
		const req = lastAuth(requests);
		expect(req.url).toBe(`${BASE}/documents/doc_1/assignments/estimate-cost`);
		expect(req.body.signers).toEqual([{ verification_method: 'Email' }]);
	});

	it('resets the expiration date', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			assignmentId: 'asg_1',
			expiresAt: '2027-01-01T00:00:00Z',
		});
		await executeAssignment.call(ctx as any, 0, 'resetExpiration');
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/documents/doc_1/assignments/asg_1/reset-expiration`);
		expect(req.body).toEqual({ expires_at: '2027-01-01T00:00:00Z' });
	});

	it('resends a notification to a signer', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			assignmentId: 'asg_1',
			signerId: 'sig_1',
		});
		await executeAssignment.call(ctx as any, 0, 'resendNotification');
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/documents/doc_1/assignments/asg_1/signers/sig_1/resend`);
	});

	it('estimates resend cost', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			assignmentId: 'asg_1',
			signerId: 'sig_1',
		});
		await executeAssignment.call(ctx as any, 0, 'estimateResendCost');
		expect(lastAuth(requests).url).toBe(
			`${BASE}/documents/doc_1/assignments/asg_1/signers/sig_1/estimate-resend-cost`,
		);
	});

	it('lists whatsapp notifications', async () => {
		const { ctx, requests } = makeCtx(
			{ documentId: 'doc_1', assignmentId: 'asg_1' },
			{ response: [] },
		);
		await executeAssignment.call(ctx as any, 0, 'listWhatsapp');
		expect(lastAuth(requests).url).toBe(
			`${BASE}/documents/doc_1/assignments/asg_1/whatsapp-notifications`,
		);
	});

	it('reads the sign page with the access code (no auth)', async () => {
		const { ctx, requests } = makeCtx({ signerAccessCode: 'code123' });
		await executeAssignment.call(ctx as any, 0, 'getSignPage');
		const req = lastPublic(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/sign`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
	});

	it('signs an assignment with a raw items array (no auth)', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			assignmentId: 'asg_1',
			signerAccessCode: 'code123',
			signItems: '[{"itemId":"i1","fieldId":"f1","pageId":"p1","value":"X"}]',
		});
		await executeAssignment.call(ctx as any, 0, 'sign');
		const req = lastPublic(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/documents/doc_1/assignments/asg_1`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
		expect(req.body).toEqual([{ itemId: 'i1', fieldId: 'f1', pageId: 'p1', value: 'X' }]);
	});

	it('declines an assignment via reject (no auth)', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			assignmentId: 'asg_1',
			signerAccessCode: 'code123',
			declineReason: 'No thanks',
		});
		await executeAssignment.call(ctx as any, 0, 'decline');
		const req = lastPublic(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/documents/doc_1/assignments/asg_1/reject`);
		expect(req.body).toEqual({ decline_reason: 'No thanks' });
	});

	it('no longer exposes the removed cancel operation', async () => {
		const { ctx } = makeCtx({ documentId: 'doc_1' });
		await expect(executeAssignment.call(ctx as any, 0, 'cancel')).rejects.toThrow(
			'Unknown assignment operation: cancel',
		);
	});
});
