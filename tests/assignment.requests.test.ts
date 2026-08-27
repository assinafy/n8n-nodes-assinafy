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

	it('estimates Digital Certificate verification cost', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			method: 'virtual',
			signers: { signer: [{ verification_method: 'DigitalCertificate' }] },
		});
		await executeAssignment.call(ctx as any, 0, 'estimateCost');
		expect(lastAuth(requests).body.signers).toEqual([
			{ verification_method: 'DigitalCertificate' },
		]);
	});

	it('creates a standalone Digital Certificate signing step', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			method: 'virtual',
			signers: {
				signer: [
					{
						id: 'sig_1',
						verification_method: 'DigitalCertificate',
						notification_methods: ['Email'],
						step: 1,
					},
				],
			},
		});
		await executeAssignment.call(ctx as any, 0, 'create');
		expect(lastAuth(requests).body.signers).toEqual([
			{
				id: 'sig_1',
				verification_method: 'DigitalCertificate',
				notification_methods: ['Email'],
				step: 1,
			},
		]);
	});

	it('rejects a Digital Certificate signer sharing a signing step', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			method: 'virtual',
			signers: {
				signer: [
					{ id: 'sig_1', verification_method: 'DigitalCertificate', step: 1 },
					{ id: 'sig_2', verification_method: 'Email', step: 1 },
				],
			},
		});
		await expect(executeAssignment.call(ctx as any, 0, 'create')).rejects.toThrow(
			'must be alone in their signing step',
		);
		expect(requests).toHaveLength(0);
	});

	it('omits create-only signer IDs and steps from cost estimates', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			method: 'virtual',
			signers: {
				signer: [
					{
						id: 'sig_1',
						verification_method: 'Whatsapp',
						notification_methods: ['Whatsapp'],
						step: 3,
					},
				],
			},
		});
		await executeAssignment.call(ctx as any, 0, 'estimateCost');
		expect(lastAuth(requests).body).toEqual({
			method: 'virtual',
			signers: [{ verification_method: 'Whatsapp', notification_methods: ['Whatsapp'] }],
		});
	});

	it('estimates collect cost from entries without requiring signers', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			method: 'collect',
			signers: {},
			entries: '[{"page_id":"p1","fields":[]}]',
		});
		await executeAssignment.call(ctx as any, 0, 'estimateCost');
		expect(lastAuth(requests).body).toEqual({
			method: 'collect',
			entries: [{ page_id: 'p1', fields: [] }],
		});
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

	it('rejects a blank expiration date before making a request', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			assignmentId: 'asg_1',
			expiresAt: '   ',
		});
		await expect(executeAssignment.call(ctx as any, 0, 'resetExpiration')).rejects.toThrow(
			'Expires At is required',
		);
		expect(requests).toHaveLength(0);
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

	it('lists assignments with the required live account context', async () => {
		const { ctx, requests } = makeCtx(
			{ returnAll: false, limit: 25 },
			{ response: [{ id: 'asg_1' }] },
		);
		const result = (await executeAssignment.call(ctx as any, 0, 'list')) as any[];
		const req = lastAuth(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/assignments`);
		expect(req.qs).toEqual({ accountId: 'acc_123', 'per-page': 25 });
		expect(result[0].json).toEqual({ id: 'asg_1' });
	});

	it('reads the sign page with the access code (no auth)', async () => {
		const { ctx, requests } = makeCtx({ signerAccessCode: 'code123' });
		await executeAssignment.call(ctx as any, 0, 'getSignPage');
		const req = lastPublic(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/sign`);
		expect(req.qs).toEqual({ 'signer-access-code': 'code123' });
	});

	it('can accept terms while reading the sign page', async () => {
		const { ctx, requests } = makeCtx({
			signerAccessCode: 'code123',
			hasAcceptedTerms: true,
		});
		await executeAssignment.call(ctx as any, 0, 'getSignPage');
		expect(lastPublic(requests).qs).toEqual({
			'signer-access-code': 'code123',
			has_accepted_terms: true,
		});
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

	it('rejects an empty sign-items array before making a request', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			assignmentId: 'asg_1',
			signerAccessCode: 'code123',
			signItems: '[]',
		});
		await expect(executeAssignment.call(ctx as any, 0, 'sign')).rejects.toThrow(
			'Items must be a non-empty JSON array',
		);
		expect(requests).toHaveLength(0);
	});

	it('declines an assignment via reject (no auth)', async () => {
		const { ctx, requests } = makeCtx(
			{
				documentId: 'doc_1',
				assignmentId: 'asg_1',
				signerAccessCode: 'code123',
				declineReason: 'No thanks',
			},
			{ response: [] },
		);
		const result = (await executeAssignment.call(ctx as any, 0, 'decline')) as any;
		const req = lastPublic(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/documents/doc_1/assignments/asg_1/reject`);
		expect(req.body).toEqual({ decline_reason: 'No thanks' });
		expect(result.json).toEqual({ data: [] });
	});

	it('rejects a blank decline reason before making a request', async () => {
		const { ctx, requests } = makeCtx({
			documentId: 'doc_1',
			assignmentId: 'asg_1',
			signerAccessCode: 'code123',
			declineReason: '   ',
		});
		await expect(executeAssignment.call(ctx as any, 0, 'decline')).rejects.toThrow(
			'Decline Reason is required',
		);
		expect(requests).toHaveLength(0);
	});

	it.each([
		['getSignPage', { signerAccessCode: '' }],
		[
			'sign',
			{
				documentId: 'doc_1',
				assignmentId: 'asg_1',
				signerAccessCode: '   ',
				signItems: '[{"itemId":"i1"}]',
			},
		],
		[
			'decline',
			{
				documentId: 'doc_1',
				assignmentId: 'asg_1',
				signerAccessCode: '',
				declineReason: 'No thanks',
			},
		],
	])('rejects a blank access code for %s', async (operation, params) => {
		const { ctx, requests } = makeCtx(params);
		await expect(executeAssignment.call(ctx as any, 0, operation)).rejects.toThrow(
			'Signer Access Code is required',
		);
		expect(requests).toHaveLength(0);
	});

	it('no longer exposes the removed cancel operation', async () => {
		const { ctx } = makeCtx({ documentId: 'doc_1' });
		await expect(executeAssignment.call(ctx as any, 0, 'cancel')).rejects.toThrow(
			'Unknown assignment operation: cancel',
		);
	});
});
