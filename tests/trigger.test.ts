/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from 'node:crypto';
import {
	AssinafyTrigger,
	verifyStandardWebhook,
} from '../nodes/AssinafyTrigger/AssinafyTrigger.node';
import { DEFAULT_WEBHOOK_EVENTS } from '../nodes/Assinafy/resources/webhookEvents';

const SECRET = 'shh-secret';
const API_KEY = 'api-key';
const WEBHOOK_HMAC_MESSAGE = 'assinafy-n8n-webhook-v1';
// Standard Webhooks reference test vector (public, not a credential).
const REFERENCE_VECTOR_KEY = ['whsec', 'MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'].join('_');

function webhookToken(secret: string): string {
	return createHmac('sha256', secret).update(WEBHOOK_HMAC_MESSAGE).digest('hex');
}

function securedUrl(url = 'https://n8n.example.com/webhook/abc'): string {
	const parsed = new URL(url);
	parsed.searchParams.set('assinafy-token', webhookToken(API_KEY));
	return parsed.toString();
}

function now(): string {
	return String(Math.floor(Date.now() / 1000));
}

function signedHeaders(raw: string, timestamp = now(), id = 'msg_1'): Record<string, string> {
	const signature = createHmac('sha256', Buffer.from(REFERENCE_VECTOR_KEY.slice(6), 'base64'))
		.update(`${id}.${timestamp}.${raw}`)
		.digest('base64');
	return {
		'webhook-id': id,
		'webhook-timestamp': timestamp,
		'webhook-signature': `v1,bm90LXRoaXMtb25l v1,${signature}`,
	};
}

let webhookPath = 0;

function webhookCtx(opts: {
	verify: boolean;
	body: unknown;
	headers?: Record<string, string | string[]>;
	rawBody?: Buffer | string;
	secret?: string;
	token?: string;
	endpoints?: any[];
	calls?: any[];
	/** Delivery URL path; reuse one to share the in-process secret cache. */
	path?: string;
	/** Signing secret the mocked API returns. */
	serverSecret?: string;
}) {
	const raw = opts.rawBody ?? Buffer.from(JSON.stringify(opts.body), 'utf8');
	const secret = 'secret' in opts ? opts.secret : SECRET;
	const nodeUrl = `https://n8n.example.com/webhook/${opts.path ?? `path-${++webhookPath}`}`;
	const ownUrl = new URL(nodeUrl);
	ownUrl.searchParams.set('assinafy-token', webhookToken(secret || API_KEY));
	return {
		getRequestObject: () => ({ rawBody: raw }),
		getQueryData: () => ({
			'assinafy-token': opts.token ?? webhookToken(secret || API_KEY),
		}),
		getHeaderData: () => opts.headers ?? {},
		getBodyData: () => opts.body,
		getNodeParameter: (name: string, def?: unknown) =>
			name === 'verifySignature' ? opts.verify : def,
		getNodeWebhookUrl: () => nodeUrl,
		getCredentials: async () => ({
			apiKey: API_KEY,
			webhookSecret: secret,
			accountId: 'acc_123',
			baseUrl: 'https://api.assinafy.com.br/v1',
		}),
		getNode: () => ({ name: 'AssinafyTrigger' }),
		helpers: {
			httpRequestWithAuthentication: async (_t: string, options: any) => {
				opts.calls?.push(options);
				const data = options.url.endsWith('/secret')
					? { secret: opts.serverSecret ?? REFERENCE_VECTOR_KEY }
					: (opts.endpoints ?? [{ id: 'ep_1', url: ownUrl.toString() }]);
				return { status: 200, data };
			},
		},
	} as any;
}

describe('verifyStandardWebhook()', () => {
	it('accepts the Standard Webhooks reference vector', () => {
		const headers = {
			'webhook-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
			'webhook-timestamp': '1614265330',
			'webhook-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
		};
		expect(
			verifyStandardWebhook(
				REFERENCE_VECTOR_KEY,
				headers,
				Buffer.from('{"test": 2432232314}'),
				1614265330,
			),
		).toBeUndefined();
	});

	it('rejects a timestamp outside the five-minute window', () => {
		const raw = '{"event":"document_ready"}';
		const headers = signedHeaders(raw, String(Number(now()) - 301));
		expect(verifyStandardWebhook(REFERENCE_VECTOR_KEY, headers, Buffer.from(raw))).toBe(
			'Assinafy webhook timestamp is outside the accepted window',
		);
	});
});

describe('AssinafyTrigger webhook()', () => {
	const node = new AssinafyTrigger();
	const body = { event: 'document_ready', document: { id: 'd1' } };
	const raw = JSON.stringify(body);

	it('passes through and surfaces the event when verification is off', async () => {
		const result = await node.webhook.call(
			webhookCtx({ verify: false, body, headers: { 'x-request-id': 'req_123' } }),
		);
		expect(result.workflowData![0][0].json.event).toBe('document_ready');
		expect(result.workflowData![0][0].json.body).toEqual(body);
		expect(result.workflowData![0][0].json.headers).toEqual({ 'x-request-id': 'req_123' });
	});

	it.each(['', 'invalid-token'])('rejects a missing or invalid URL token: %s', async (token) => {
		await expect(node.webhook.call(webhookCtx({ verify: false, body, token }))).rejects.toThrow(
			'Invalid Assinafy webhook token',
		);
	});

	it('redacts authentication, cookie, API-key and signature headers from workflow output', async () => {
		const result = await node.webhook.call(
			webhookCtx({
				verify: false,
				body,
				headers: {
					Authorization: 'Bearer secret',
					Cookie: 'session=secret',
					'Set-Cookie': ['session=secret', 'csrf=secret'],
					'X-Api-Key': 'api-key',
					'X-Forwarded-Authorization': 'Bearer forwarded-secret',
					'X-Client-Jwt-Assertion': 'jwt-secret',
					'X-Webhook-Secret': 'webhook-secret',
					'webhook-id': 'msg_1',
					'webhook-signature': 'v1,signature-value',
					'x-request-id': 'req_123',
				},
			}),
		);
		const outputHeaders = result.workflowData![0][0].json.headers as Record<string, unknown>;
		expect(outputHeaders).toEqual({
			Authorization: '[REDACTED]',
			Cookie: '[REDACTED]',
			'Set-Cookie': '[REDACTED]',
			'X-Api-Key': '[REDACTED]',
			'X-Client-Jwt-Assertion': '[REDACTED]',
			'X-Forwarded-Authorization': '[REDACTED]',
			'X-Webhook-Secret': '[REDACTED]',
			'webhook-id': 'msg_1',
			'webhook-signature': '[REDACTED]',
			'x-request-id': 'req_123',
		});
	});

	it('accepts a valid Standard Webhooks signature over the raw body', async () => {
		const result = await node.webhook.call(
			webhookCtx({ verify: true, body, rawBody: raw, headers: signedHeaders(raw) }),
		);
		expect(result.workflowData![0][0].json.event).toBe('document_ready');
	});

	it('rejects a signature computed over different bytes', async () => {
		await expect(
			node.webhook.call(
				webhookCtx({ verify: true, body, rawBody: raw, headers: signedHeaders(`${raw} `) }),
			),
		).rejects.toThrow('Invalid Assinafy webhook signature');
	});

	it('rejects when the signature headers are missing', async () => {
		await expect(node.webhook.call(webhookCtx({ verify: true, body }))).rejects.toThrow(
			'Missing webhook signature headers',
		);
	});

	it('fails closed when the raw body is unavailable', async () => {
		await expect(
			node.webhook.call(
				webhookCtx({ verify: true, body, rawBody: '', headers: signedHeaders(raw) }),
			),
		).rejects.toThrow('raw request body is not available');
	});

	it('fetches the endpoint secret once and then uses the cache', async () => {
		const calls: any[] = [];
		const delivery = () =>
			webhookCtx({
				verify: true,
				body,
				rawBody: raw,
				headers: signedHeaders(raw),
				calls,
				path: 'cached',
			});
		await node.webhook.call(delivery());
		expect(calls.map((c) => c.url)).toEqual([
			'https://api.assinafy.com.br/v1/accounts/acc_123/webhooks/endpoints',
			'https://api.assinafy.com.br/v1/accounts/acc_123/webhooks/endpoints/ep_1/secret',
		]);
		await node.webhook.call(delivery());
		expect(calls).toHaveLength(2);
	});

	it('refetches a rotated secret when the cached one no longer matches', async () => {
		const oldSecret = ['whsec', Buffer.from('previous-key').toString('base64')].join('_');
		const oldSignature = createHmac('sha256', Buffer.from('previous-key'))
			.update(`msg_1.${now()}.${raw}`)
			.digest('base64');
		await node.webhook.call(
			webhookCtx({
				verify: true,
				body,
				rawBody: raw,
				headers: { ...signedHeaders(raw), 'webhook-signature': `v1,${oldSignature}` },
				path: 'rotated',
				serverSecret: oldSecret,
			}),
		);
		const calls: any[] = [];
		await node.webhook.call(
			webhookCtx({
				verify: true,
				body,
				rawBody: raw,
				headers: signedHeaders(raw),
				path: 'rotated',
				calls,
			}),
		);
		expect(calls).toHaveLength(2);
	});

	it('does not refetch the secret for a stale timestamp', async () => {
		const calls: any[] = [];
		const ctx = (headers: Record<string, string>) =>
			webhookCtx({ verify: true, body, rawBody: raw, headers, calls, path: 'stale' });
		await node.webhook.call(ctx(signedHeaders(raw)));
		const stale = String(Number(now()) - 600);
		await expect(node.webhook.call(ctx(signedHeaders(raw, stale)))).rejects.toThrow(
			'outside the accepted window',
		);
		expect(calls).toHaveLength(2);
	});

	it('rejects signed deliveries when no endpoint is registered for the workflow', async () => {
		await expect(
			node.webhook.call(
				webhookCtx({
					verify: true,
					body,
					rawBody: raw,
					headers: signedHeaders(raw),
					endpoints: [],
				}),
			),
		).rejects.toThrow('No Assinafy webhook endpoint is registered for this workflow');
	});
});

describe('AssinafyTrigger lifecycle', () => {
	const node = new AssinafyTrigger();
	const BASE = 'https://api.assinafy.com.br/v1/accounts/acc_123/webhooks';

	function notFound() {
		return Object.assign(new Error('Not Found'), { httpCode: '404' });
	}

	/**
	 * `endpoints` null simulates an environment without webhook endpoints (404),
	 * where the trigger falls back to the single legacy subscription.
	 */
	function hookCtx(
		state: { endpoints?: any[] | null; subscription?: unknown; secret?: string },
		calls: any[],
		overrides: {
			webhookUrl?: string;
			email?: string;
			events?: unknown;
			verify?: boolean;
		} = {},
	) {
		const respond = (options: any): unknown => {
			const url: string = options.url;
			if (url.endsWith('/webhooks/endpoints') && options.method === 'GET') {
				if (state.endpoints === null) throw notFound();
				return state.endpoints ?? [];
			}
			if (url.endsWith('/secret')) return { secret: state.secret ?? REFERENCE_VECTOR_KEY };
			if (url.includes('/webhooks/endpoints')) {
				return { id: url.split('/endpoints/')[1] ?? 'ep_new', ...(options.body ?? {}) };
			}
			if (url.endsWith('/webhooks/subscriptions')) return state.subscription ?? null;
			return {};
		};
		return {
			getNodeWebhookUrl: () => overrides.webhookUrl ?? 'https://n8n.example.com/webhook/abc',
			getNodeParameter: (name: string, def?: unknown) =>
				name === 'email'
					? (overrides.email ?? 'ops@example.com')
					: name === 'events'
						? (overrides.events ?? [])
						: name === 'verifySignature'
							? (overrides.verify ?? false)
							: def,
			getCredentials: async () => ({
				accountId: 'acc_123',
				apiKey: API_KEY,
				baseUrl: 'https://api.assinafy.com.br/v1',
			}),
			getNode: () => ({ name: 'AssinafyTrigger' }),
			helpers: {
				httpRequestWithAuthentication: async (_t: string, options: any) => {
					calls.push(options);
					return { status: 200, data: respond(options) };
				},
			},
		} as any;
	}

	const ownEndpoint = (extra: Record<string, unknown> = {}) => ({
		id: 'ep_1',
		url: securedUrl(),
		email: 'ops@example.com',
		events: DEFAULT_WEBHOOK_EVENTS,
		is_active: true,
		signing_enabled: false,
		...extra,
	});

	it('create() registers a new webhook endpoint for the workflow', async () => {
		const calls: any[] = [];
		const ctx = hookCtx({ endpoints: [] }, calls, {
			webhookUrl: ' https://n8n.example.com/webhook/abc ',
			email: ' ops@example.com ',
		});
		expect(await node.webhookMethods.default.create.call(ctx)).toBe(true);
		const post = calls.find((c) => c.method === 'POST');
		expect(post.url).toBe(`${BASE}/endpoints`);
		expect(post.body).toEqual({
			url: securedUrl(),
			email: 'ops@example.com',
			events: DEFAULT_WEBHOOK_EVENTS,
			is_active: true,
			signing_enabled: false,
			name: 'n8n Assinafy Trigger',
		});
	});

	it('create() enables signing on the endpoint', async () => {
		const calls: any[] = [];
		const ctx = hookCtx({ endpoints: [] }, calls, { verify: true });
		await node.webhookMethods.default.create.call(ctx);
		expect(calls.find((c) => c.method === 'POST').body.signing_enabled).toBe(true);
		expect(calls.some((c) => c.url.endsWith('/secret'))).toBe(false);
	});

	it('create() updates the endpoint already registered for this URL', async () => {
		const calls: any[] = [];
		await node.webhookMethods.default.create.call(
			hookCtx({ endpoints: [ownEndpoint({ events: ['document_ready'] })] }, calls),
		);
		const put = calls.find((c) => c.method === 'PUT');
		expect(put.url).toBe(`${BASE}/endpoints/ep_1`);
		expect(put.body.events).toEqual(DEFAULT_WEBHOOK_EVENTS);
		expect(calls.some((c) => c.method === 'POST')).toBe(false);
	});

	it('create() falls back to the legacy subscription where endpoints are unavailable', async () => {
		const calls: any[] = [];
		await node.webhookMethods.default.create.call(hookCtx({ endpoints: null }, calls));
		const put = calls.find((c) => c.method === 'PUT');
		expect(put.url).toBe(`${BASE}/subscriptions`);
		expect(put.body).toEqual({
			url: securedUrl(),
			email: 'ops@example.com',
			events: DEFAULT_WEBHOOK_EVENTS,
			is_active: true,
		});
	});

	it('create() refuses signature verification without webhook endpoints', async () => {
		const calls: any[] = [];
		await expect(
			node.webhookMethods.default.create.call(
				hookCtx({ endpoints: null }, calls, { verify: true }),
			),
		).rejects.toThrow('Verify Signature requires webhook endpoints');
		expect(calls.some((c) => c.method === 'PUT')).toBe(false);
	});

	it.each([
		'/webhook/abc',
		'http://n8n.example.com/webhook/abc',
		'https://user:password@n8n.example.com/webhook/abc',
	])('create() rejects an invalid webhook URL: %s', async (webhookUrl) => {
		const calls: any[] = [];
		await expect(
			node.webhookMethods.default.create.call(hookCtx({}, calls, { webhookUrl })),
		).rejects.toThrow('valid HTTPS URL');
		expect(calls).toHaveLength(0);
	});

	it('create() accepts HTTP for a loopback development webhook URL', async () => {
		const calls: any[] = [];
		await node.webhookMethods.default.create.call(
			hookCtx({}, calls, { webhookUrl: 'http://127.0.0.1:5678/webhook/abc' }),
		);
		expect(calls.find((c) => c.method === 'POST').body.url).toBe(
			securedUrl('http://127.0.0.1:5678/webhook/abc'),
		);
	});

	it('create() rejects an invalid notification email', async () => {
		const calls: any[] = [];
		await expect(
			node.webhookMethods.default.create.call(hookCtx({}, calls, { email: 'not-an-email' })),
		).rejects.toThrow('Invalid email address');
		expect(calls).toHaveLength(0);
	});

	it.each(['document_ready', ['document_ready', '']])(
		'create() rejects malformed event selections before making a request',
		async (events) => {
			const calls: any[] = [];
			await expect(
				node.webhookMethods.default.create.call(hookCtx({}, calls, { events })),
			).rejects.toThrow('Events must be a list');
			expect(calls).toHaveLength(0);
		},
	);

	it('delete() deletes only the endpoint registered for this URL', async () => {
		const calls: any[] = [];
		const other = ownEndpoint({ id: 'ep_other', url: 'https://other.example.com/hook' });
		const ctx = hookCtx({ endpoints: [other, ownEndpoint()] }, calls);
		expect(await node.webhookMethods.default.delete.call(ctx)).toBe(true);
		expect(calls.map((c) => [c.method, c.url])).toEqual([
			['GET', `${BASE}/endpoints`],
			['DELETE', `${BASE}/endpoints/ep_1`],
		]);
	});

	it('delete() inactivates a matching legacy subscription', async () => {
		const calls: any[] = [];
		const subscription = { ...ownEndpoint(), signing_enabled: undefined };
		delete subscription.signing_enabled;
		await node.webhookMethods.default.delete.call(
			hookCtx({ endpoints: null, subscription }, calls),
		);
		expect(calls[calls.length - 1].url).toBe(`${BASE}/inactivate`);
	});

	it('delete() leaves a newer replacement legacy subscription active', async () => {
		const calls: any[] = [];
		await node.webhookMethods.default.delete.call(
			hookCtx(
				{
					endpoints: null,
					subscription: { url: securedUrl(), email: 'ops@example.com', events: ['document_ready'] },
				},
				calls,
			),
		);
		expect(calls.some((c) => c.method === 'PUT')).toBe(false);
	});

	it('delete() rejects invalid local configuration before making an API request', async () => {
		const calls: any[] = [];
		await expect(
			node.webhookMethods.default.delete.call(hookCtx({}, calls, { webhookUrl: '/webhook/abc' })),
		).rejects.toThrow('valid HTTPS URL');
		expect(calls).toHaveLength(0);
	});

	it('checkExists() is false when no endpoint matches this URL', async () => {
		const calls: any[] = [];
		const other = ownEndpoint({ url: 'https://other.example.com/hook' });
		expect(
			await node.webhookMethods.default.checkExists.call(hookCtx({ endpoints: [other] }, calls)),
		).toBe(false);
	});

	it('checkExists() compares event types as a set', async () => {
		const calls: any[] = [];
		const ctx = hookCtx(
			{
				endpoints: [
					ownEndpoint({ events: [...DEFAULT_WEBHOOK_EVENTS, DEFAULT_WEBHOOK_EVENTS[0]] }),
				],
			},
			calls,
		);
		expect(await node.webhookMethods.default.checkExists.call(ctx)).toBe(true);
	});

	it('checkExists() is false when the signing setting differs', async () => {
		const calls: any[] = [];
		expect(
			await node.webhookMethods.default.checkExists.call(
				hookCtx({ endpoints: [ownEndpoint()] }, calls, { verify: true }),
			),
		).toBe(false);
	});

	it('checkExists() accepts a matching signed endpoint', async () => {
		const calls: any[] = [];
		const ctx = hookCtx({ endpoints: [ownEndpoint({ signing_enabled: true })] }, calls, {
			verify: true,
		});
		expect(await node.webhookMethods.default.checkExists.call(ctx)).toBe(true);
	});

	it('checkExists() is false when no legacy subscription is registered', async () => {
		const calls: any[] = [];
		expect(
			await node.webhookMethods.default.checkExists.call(
				hookCtx({ endpoints: null, subscription: { events: [], url: null, email: null } }, calls),
			),
		).toBe(false);
	});
});
