/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeWebhook } from '../nodes/Assinafy/resources/webhook';
import { DEFAULT_WEBHOOK_EVENTS } from '../nodes/Assinafy/resources/webhookEvents';
import { makeCtx, lastAuth } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('webhook request construction', () => {
	it('registers (PUT) a subscription, falling back to default events when empty', async () => {
		const { ctx, requests } = makeCtx({
			url: ' https://example.com/hook ',
			email: ' ops@example.com ',
			events: [],
			isActive: true,
		});
		await executeWebhook.call(ctx as any, 0, 'register');
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/webhooks/subscriptions`);
		expect(req.body).toEqual({
			url: 'https://example.com/hook',
			email: 'ops@example.com',
			events: DEFAULT_WEBHOOK_EVENTS,
			is_active: true,
		});
	});

	it('accepts HTTP only for a loopback development webhook', async () => {
		const { ctx, requests } = makeCtx({
			url: 'http://127.0.0.1:5678/hook?source=n8n',
			email: 'ops@example.com',
			events: ['document_ready'],
			isActive: true,
		});
		await executeWebhook.call(ctx as any, 0, 'register');
		expect(lastAuth(requests).body.url).toBe('http://127.0.0.1:5678/hook?source=n8n');
	});

	it.each([
		'/hook',
		'not a URL',
		'http://example.com/hook',
		'https://user:password@example.com/hook',
		'https://example.com/hook#fragment',
	])(
		'rejects an invalid absolute webhook URL: %s',
		async (url) => {
			const { ctx, requests } = makeCtx({
				url,
				email: 'ops@example.com',
				events: [],
			});
			await expect(executeWebhook.call(ctx as any, 0, 'register')).rejects.toThrow(
				'valid HTTPS URL',
			);
			expect(requests).toHaveLength(0);
		},
	);

	it('rejects an invalid notification email', async () => {
		const { ctx, requests } = makeCtx({
			url: 'https://example.com/hook',
			email: 'not-an-email',
			events: [],
		});
		await expect(executeWebhook.call(ctx as any, 0, 'register')).rejects.toThrow(
			'Invalid email address',
		);
		expect(requests).toHaveLength(0);
	});

	it('gets the subscription and normalizes the empty sentinel', async () => {
		const { ctx } = makeCtx(
			{},
			{ response: { events: [], url: null, email: null, is_active: true } },
		);
		const result = (await executeWebhook.call(ctx as any, 0, 'get')) as any;
		expect(result.json).toEqual({ subscribed: false });
	});

	it('inactivates the subscription', async () => {
		const { ctx, requests } = makeCtx({});
		await executeWebhook.call(ctx as any, 0, 'inactivate');
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/webhooks/inactivate`);
	});

	it('lists event types from the global endpoint', async () => {
		const { ctx, requests } = makeCtx({}, { response: [{ id: 'document_ready' }] });
		await executeWebhook.call(ctx as any, 0, 'listEventTypes');
		expect(lastAuth(requests).url).toBe(`${BASE}/webhooks/event-types`);
	});

	it('lists dispatches dropping zero from/to timestamps', async () => {
		const { ctx, requests } = makeCtx(
			{
				returnAll: false,
				limit: 25,
				filters: { event: 'document_ready', from: 0, to: 1700000000 },
			},
			{ response: [{ id: 'disp_1' }] },
		);
		await executeWebhook.call(ctx as any, 0, 'listDispatches');
		const req = lastAuth(requests);
		expect(req.url).toBe(`${BASE}/accounts/acc_123/webhooks`);
		expect(req.qs).toEqual({ event: 'document_ready', to: 1700000000, 'per-page': 25 });
	});

	it('retries a dispatch by id', async () => {
		const { ctx, requests } = makeCtx({ dispatchId: 'disp_1' });
		await executeWebhook.call(ctx as any, 0, 'retryDispatch');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/webhooks/disp_1/retry`);
	});
});
