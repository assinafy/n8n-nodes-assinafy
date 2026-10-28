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
			isActive: false,
		});
		await executeWebhook.call(ctx as any, 0, 'register');
		expect(lastAuth(requests).body.url).toBe('http://127.0.0.1:5678/hook?source=n8n');
		expect(lastAuth(requests).body.is_active).toBe(false);
	});

	it.each([
		'/hook',
		'not a URL',
		'http://example.com/hook',
		'https://user:password@example.com/hook',
		'https://example.com/hook#fragment',
		'https://example.com/ho\nok',
	])('rejects an invalid absolute webhook URL: %s', async (url) => {
		const { ctx, requests } = makeCtx({
			url,
			email: 'ops@example.com',
			events: [],
		});
		await expect(executeWebhook.call(ctx as any, 0, 'register')).rejects.toThrow('valid HTTPS URL');
		expect(requests).toHaveLength(0);
	});

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

	it.each([
		[{ events: 'document_ready' }, 'Events must be an array'],
		[{ events: ['document_ready', ' '] }, 'Events must be an array'],
		[{ isActive: 'false' }, 'Is Active must be a boolean'],
	])('rejects malformed subscription fields before sending: %j', async (override, message) => {
		const { ctx, requests } = makeCtx({
			url: 'https://example.com/hook',
			email: 'ops@example.com',
			events: [],
			isActive: true,
			...override,
		});
		await expect(executeWebhook.call(ctx as any, 0, 'register')).rejects.toThrow(message);
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

	it('treats a missing subscription as unsubscribed but preserves other API errors', async () => {
		const missing = makeCtx({}, { rejectWith: { httpCode: 404 } });
		const result = (await executeWebhook.call(missing.ctx as any, 0, 'get')) as any;
		expect(result.json).toEqual({ subscribed: false });

		const failed = makeCtx({}, { rejectWith: { httpCode: 503 } });
		await expect(executeWebhook.call(failed.ctx as any, 0, 'get')).rejects.toMatchObject({
			httpCode: 503,
		});
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

	describe('webhook endpoints', () => {
		const ENDPOINTS = `${BASE}/accounts/acc_123/webhooks/endpoints`;

		it('lists endpoints as one item each', async () => {
			const { ctx, requests } = makeCtx({}, { response: [{ id: 'ep_1' }, { id: 'ep_2' }] });
			const result = (await executeWebhook.call(ctx as any, 0, 'listEndpoints')) as any[];
			expect(lastAuth(requests)).toMatchObject({ method: 'GET', url: ENDPOINTS });
			expect(result.map((item) => item.json.id)).toEqual(['ep_1', 'ep_2']);
		});

		it('filters endpoints by exact URL', async () => {
			const url = 'https://example.com/hook?app=n8n';
			const { ctx, requests } = makeCtx({ endpointFilters: { url } }, { response: [] });
			await executeWebhook.call(ctx, 0, 'listEndpoints');
			expect(lastAuth(requests)).toMatchObject({ method: 'GET', url: ENDPOINTS, qs: { url } });
		});

		it('deletes an endpoint by exact URL using OAuth', async () => {
			const url = 'https://example.com/hook?app=n8n';
			const { ctx, requests, httpRequestWithAuthentication } = makeCtx({
				url,
				authentication: 'oAuth2',
			});
			expect(await executeWebhook.call(ctx, 0, 'deleteEndpointByUrl')).toEqual({
				json: { deleted: true, url },
			});
			expect(lastAuth(requests)).toMatchObject({ method: 'DELETE', url: ENDPOINTS, qs: { url } });
			expect(lastAuth(requests).body).toBeUndefined();
			expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
				'assinafyOAuth2Api',
				expect.any(Object),
			);
		});

		it('deletes an existing legacy HTTP endpoint by its exact URL', async () => {
			const url = 'http://receiver.example.com/hook?source=n8n&key=a%2Fb';
			const { ctx, requests } = makeCtx({ url });
			await executeWebhook.call(ctx, 0, 'deleteEndpointByUrl');
			expect(lastAuth(requests)).toMatchObject({ method: 'DELETE', url: ENDPOINTS, qs: { url } });
		});

		it.each([
			'',
			'/hook',
			'ftp://example.com/hook',
			'http://user:password@example.com/hook',
			'http://example.com/hook#fragment',
		])('rejects an invalid delete URL before making a request: %s', async (url) => {
			const { ctx, requests } = makeCtx({ url });
			await expect(executeWebhook.call(ctx, 0, 'deleteEndpointByUrl')).rejects.toThrow(
				'valid absolute HTTP or HTTPS URL',
			);
			expect(requests).toHaveLength(0);
		});

		it('creates an endpoint with name and signing', async () => {
			const { ctx, requests } = makeCtx({
				url: 'https://example.com/hook',
				email: 'ops@example.com',
				events: ['document_ready'],
				isActive: false,
				additionalFields: { name: ' CRM ', signingEnabled: true },
			});
			await executeWebhook.call(ctx as any, 0, 'createEndpoint');
			expect(lastAuth(requests)).toMatchObject({
				method: 'POST',
				url: ENDPOINTS,
				body: {
					url: 'https://example.com/hook',
					email: 'ops@example.com',
					events: ['document_ready'],
					is_active: false,
					name: 'CRM',
					signing_enabled: true,
				},
			});
		});

		it('sends only the fields set when updating, keeping false values', async () => {
			const { ctx, requests } = makeCtx({
				endpointId: 'ep/1',
				updateFields: { signingEnabled: false, isActive: false, events: ['document_ready'] },
			});
			await executeWebhook.call(ctx as any, 0, 'updateEndpoint');
			const req = lastAuth(requests);
			expect(req.method).toBe('PUT');
			expect(req.url).toBe(`${ENDPOINTS}/ep%2F1`);
			expect(req.body).toEqual({
				events: ['document_ready'],
				is_active: false,
				signing_enabled: false,
			});
		});

		it.each(['true', 1, null])(
			'rejects a malformed signing flag on create: %j',
			async (signingEnabled) => {
				const { ctx, requests } = makeCtx({
					url: 'https://example.com/hook',
					email: 'ops@example.com',
					additionalFields: { signingEnabled },
				});
				await expect(executeWebhook.call(ctx, 0, 'createEndpoint')).rejects.toThrow(
					'Signing Enabled must be a boolean',
				);
				expect(requests).toHaveLength(0);
			},
		);

		it.each([
			[{}, 'Add at least one field to update'],
			[{ url: 'http://example.com/hook' }, 'valid HTTPS URL'],
			[{ email: 'nope' }, 'Invalid email address'],
			[{ events: [] }, 'Select at least one event'],
			[{ name: 'CRM', signingEnabled: 'true' }, 'Signing Enabled must be a boolean'],
			[{ name: 'CRM', isActive: 'false' }, 'Is Active must be a boolean'],
			[{ signingEnabled: null }, 'Signing Enabled must be a boolean'],
			[{ isActive: 0 }, 'Is Active must be a boolean'],
		])('rejects an invalid update before sending: %j', async (updateFields, message) => {
			const { ctx, requests } = makeCtx({ endpointId: 'ep_1', updateFields });
			await expect(executeWebhook.call(ctx as any, 0, 'updateEndpoint')).rejects.toThrow(message);
			expect(requests).toHaveLength(0);
		});

		it.each([
			['getEndpoint', 'GET', ''],
			['getEndpointSecret', 'GET', '/secret'],
			['rotateEndpointSecret', 'POST', '/secret/rotate'],
		])('%s calls %s on the endpoint', async (operation, method, suffix) => {
			const { ctx, requests } = makeCtx({ endpointId: 'ep_1' });
			await executeWebhook.call(ctx as any, 0, operation);
			expect(lastAuth(requests)).toMatchObject({ method, url: `${ENDPOINTS}/ep_1${suffix}` });
		});

		it('getEndpointSecret refuses OAuth authentication before calling the API', async () => {
			const { ctx, requests } = makeCtx({ authentication: 'oAuth2', endpointId: 'ep_1' });
			await expect(executeWebhook.call(ctx as any, 0, 'getEndpointSecret')).rejects.toThrow(
				'not available to OAuth applications',
			);
			expect(requests).toHaveLength(0);
		});

		it('rotates the endpoint secret using OAuth and preserves the returned secret', async () => {
			const secret = 'synthetic-endpoint-secret';
			const { ctx, requests, httpRequestWithAuthentication } = makeCtx(
				{ authentication: 'oAuth2', endpointId: 'ep/1' },
				{ response: { secret } },
			);
			expect(await executeWebhook.call(ctx, 0, 'rotateEndpointSecret')).toEqual({
				json: { secret },
			});
			expect(lastAuth(requests)).toMatchObject({
				method: 'POST',
				url: `${ENDPOINTS}/ep%2F1/secret/rotate`,
			});
			expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
				'assinafyOAuth2Api',
				expect.any(Object),
			);
		});

		it('deletes an endpoint and reports its ID', async () => {
			const { ctx, requests } = makeCtx({ endpointId: 'ep_1' }, { response: [] });
			const result = (await executeWebhook.call(ctx as any, 0, 'deleteEndpoint')) as any;
			expect(lastAuth(requests)).toMatchObject({ method: 'DELETE', url: `${ENDPOINTS}/ep_1` });
			expect(result.json).toEqual({ deleted: true, id: 'ep_1' });
		});

		it('requires an endpoint ID', async () => {
			const { ctx } = makeCtx({ endpointId: ' ' });
			await expect(executeWebhook.call(ctx as any, 0, 'getEndpoint')).rejects.toThrow(
				'Endpoint ID is required',
			);
		});

		it('filters dispatches by endpoint', async () => {
			const { ctx, requests } = makeCtx(
				{ returnAll: false, limit: 10, filters: { endpoint_id: 'ep_1' } },
				{ response: [] },
			);
			await executeWebhook.call(ctx as any, 0, 'listDispatches');
			expect(lastAuth(requests).qs).toEqual({ endpoint_id: 'ep_1', 'per-page': 10 });
		});
	});
});
