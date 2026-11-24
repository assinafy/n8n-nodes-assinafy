import { executeScheduledSend } from '../nodes/Assinafy/resources/scheduledSend';
import { Assinafy } from '../nodes/Assinafy/Assinafy.node';
import { lastAuth, makeCtx } from './helpers';

const base = 'https://api.assinafy.com.br/v1';

it.each([
	['scheduleAssignment', '/documents/doc%2Fa%3F/scheduled-sends'],
	['scheduleEnvelope', '/accounts/acc_123/scheduled-sends'],
])('%s preserves the entire creation body', async (operation, path) => {
	const body = {
		send_at: '2027-01-02T12:00:00-03:00',
		expires_at: null,
		max_total_credits: 0,
		signers: [{ id: 'signer', embedded: false, sign_as: 'Witness' }],
		documents: [{ id: 'doc/a?', signer_ids: ['signer'] }],
	};
	const { ctx, requests } = makeCtx({
		documentId: 'doc/a?',
		scheduledSendBody: JSON.stringify(body),
		idempotencyKey: 'ignored',
	});
	await executeScheduledSend.call(ctx, 0, operation);
	expect(lastAuth(requests)).toMatchObject({ method: 'POST', url: base + path, body });
	expect(lastAuth(requests).headers['Idempotency-Key']).toBeUndefined();
});

it.each([
	['cancel', 'cancel'],
	['sendNow', 'send'],
])('%s encodes the send ID', async (operation, suffix) => {
	const { ctx, requests } = makeCtx({ scheduledSendId: 'send/a?' });
	await executeScheduledSend.call(ctx, 0, operation);
	expect(lastAuth(requests)).toMatchObject({
		method: 'PUT',
		url: `${base}/accounts/acc_123/scheduled-sends/send%2Fa%3F/${suffix}`,
	});
	expect(lastAuth(requests).body).toBeUndefined();
});

it.each([true, false])(
	'lists sends with filtering and pairing (returnAll=%s)',
	async (returnAll) => {
		const { ctx, requests } = makeCtx(
			{
				resource: 'scheduledSend',
				operation: 'list',
				returnAll,
				filters: { document_id: 'doc/a?' },
			},
			{ response: [{ id: 'send', status: 'pending' }] },
		);
		const result = await Assinafy.prototype.execute.call(ctx);
		expect(result).toEqual([
			[{ json: { id: 'send', status: 'pending' }, pairedItem: { item: 0 } }],
		]);
		expect(lastAuth(requests).qs.document_id).toBe('doc/a?');
	},
);

it.each(['[]', 'null', 'false', 'bad'])(
	'rejects invalid creation JSON %s before HTTP',
	async (scheduledSendBody) => {
		const { ctx, requests } = makeCtx({ scheduledSendBody });
		await expect(executeScheduledSend.call(ctx, 0, 'scheduleAssignment')).rejects.toThrow(
			'Send must be',
		);
		expect(requests).toHaveLength(0);
	},
);

it('rejects unknown operations and missing identifiers before HTTP', async () => {
	const { ctx, requests } = makeCtx({});
	await expect(executeScheduledSend.call(ctx, 0, 'bad')).rejects.toThrow(
		'Unknown scheduled send operation',
	);
	await expect(executeScheduledSend.call(ctx, 0, 'cancel')).rejects.toThrow(
		'Scheduled Send ID is required',
	);
	await expect(executeScheduledSend.call(ctx, 0, 'scheduleAssignment')).rejects.toThrow(
		'Document ID is required',
	);
	expect(requests).toHaveLength(0);
});

it('does not replay an ambiguous send failure', async () => {
	const { ctx, requests } = makeCtx(
		{ scheduledSendId: 'send' },
		{ rejectWith: { statusCode: 500 } },
	);
	await expect(executeScheduledSend.call(ctx, 0, 'sendNow')).rejects.toThrow();
	expect(requests).toHaveLength(1);
});
