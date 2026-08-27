/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from 'node:crypto';
import { AssinafyTrigger } from '../nodes/AssinafyTrigger/AssinafyTrigger.node';
import { DEFAULT_WEBHOOK_EVENTS } from '../nodes/Assinafy/resources/webhookEvents';

const SECRET = 'shh-secret';
const API_KEY = 'api-key';
const WEBHOOK_HMAC_MESSAGE = 'assinafy-n8n-webhook-v1';

function webhookToken(secret: string): string {
	return createHmac('sha256', secret).update(WEBHOOK_HMAC_MESSAGE).digest('hex');
}

function securedUrl(url = 'https://n8n.example.com/webhook/abc'): string {
	const parsed = new URL(url);
	parsed.searchParams.set('assinafy-token', webhookToken(API_KEY));
	return parsed.toString();
}

function sign(body: unknown): string {
	return createHmac('sha256', SECRET)
		.update(Buffer.from(JSON.stringify(body), 'utf8'))
		.digest('hex');
}

function webhookCtx(opts: {
	verify: boolean;
	body: unknown;
	signature?: string;
	headers?: Record<string, string | string[]>;
	rawBody?: Buffer | string;
	secret?: string;
	token?: string;
}) {
	const raw = opts.rawBody ?? Buffer.from(JSON.stringify(opts.body), 'utf8');
	const secret = 'secret' in opts ? opts.secret : SECRET;
	return {
		getRequestObject: () => ({ rawBody: raw }),
		getQueryData: () => ({
			'assinafy-token': opts.token ?? webhookToken(secret || API_KEY),
		}),
		getHeaderData: () => ({
			...(opts.headers ?? {}),
			...(opts.signature ? { 'x-assinafy-signature': opts.signature } : {}),
		}),
		getBodyData: () => opts.body,
		getNodeParameter: (name: string, def?: unknown) =>
			name === 'verifySignature' ? opts.verify : def,
		getCredentials: async () => ({ apiKey: API_KEY, webhookSecret: secret }),
		getNode: () => ({ name: 'AssinafyTrigger' }),
	} as any;
}

describe('AssinafyTrigger webhook()', () => {
	const node = new AssinafyTrigger();
	const body = { event: 'document_ready', document: { id: 'd1' } };

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
				signature: 'signature-value',
				headers: {
					Authorization: 'Bearer secret',
					Cookie: 'session=secret',
					'Set-Cookie': ['session=secret', 'csrf=secret'],
					'X-Api-Key': 'api-key',
					'X-Forwarded-Authorization': 'Bearer forwarded-secret',
					'X-Client-Jwt-Assertion': 'jwt-secret',
					'X-Webhook-Secret': 'webhook-secret',
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
			'x-assinafy-signature': '[REDACTED]',
			'x-request-id': 'req_123',
		});
	});

	it('accepts a valid HMAC signature', async () => {
		const result = await node.webhook.call(
			webhookCtx({ verify: true, body, signature: sign(body) }),
		);
		expect(result.workflowData![0][0].json.event).toBe('document_ready');
	});

	it('rejects an invalid signature', async () => {
		await expect(
			node.webhook.call(webhookCtx({ verify: true, body, signature: 'deadbeef' })),
		).rejects.toThrow('Invalid Assinafy webhook signature');
	});

	it('rejects when the signature header is missing', async () => {
		await expect(node.webhook.call(webhookCtx({ verify: true, body }))).rejects.toThrow(
			'Missing webhook signature header',
		);
	});

	it('fails closed when the raw body is unavailable', async () => {
		await expect(
			node.webhook.call(webhookCtx({ verify: true, body, signature: sign(body), rawBody: '' })),
		).rejects.toThrow('raw request body is not available');
	});

	it('errors when verification is on but no secret is configured', async () => {
		await expect(
			node.webhook.call(
				webhookCtx({ verify: true, body, signature: sign(body), secret: undefined }),
			),
		).rejects.toThrow('no webhook secret configured');
	});
});

describe('AssinafyTrigger lifecycle', () => {
	const node = new AssinafyTrigger();

	function hookCtx(
		existing: unknown,
		calls: any[],
		overrides: { webhookUrl?: string; email?: string } = {},
	) {
		return {
			getNodeWebhookUrl: () => overrides.webhookUrl ?? 'https://n8n.example.com/webhook/abc',
			getNodeParameter: (name: string, def?: unknown) =>
				name === 'email' ? (overrides.email ?? 'ops@example.com') : name === 'events' ? [] : def,
			getCredentials: async () => ({
				accountId: 'acc_123',
				apiKey: API_KEY,
				baseUrl: 'https://api.assinafy.com.br/v1',
			}),
			getNode: () => ({ name: 'AssinafyTrigger' }),
			helpers: {
				httpRequestWithAuthentication: async (_t: string, options: any) => {
					calls.push(options);
					if (options.returnFullResponse) {
						return { body: { status: 200, data: existing }, headers: {} };
					}
					return { status: 200, data: existing };
				},
			},
		} as any;
	}

	it('create() registers the subscription via PUT', async () => {
		const calls: any[] = [];
		const ok = await node.webhookMethods.default.create.call(
			hookCtx(null, calls, {
				webhookUrl: ' https://n8n.example.com/webhook/abc ',
				email: ' ops@example.com ',
			}),
		);
		expect(ok).toBe(true);
		const put = calls.find((c) => c.method === 'PUT');
		expect(put.url).toBe('https://api.assinafy.com.br/v1/accounts/acc_123/webhooks/subscriptions');
		expect(put.body.url).toBe(securedUrl());
		expect(put.body.email).toBe('ops@example.com');
		expect(put.body.is_active).toBe(true);
	});

	it.each([
		'/webhook/abc',
		'http://n8n.example.com/webhook/abc',
		'https://user:password@n8n.example.com/webhook/abc',
	])('create() rejects an invalid webhook URL: %s', async (webhookUrl) => {
		const calls: any[] = [];
		await expect(
			node.webhookMethods.default.create.call(hookCtx(null, calls, { webhookUrl })),
		).rejects.toThrow('valid HTTPS URL');
		expect(calls).toHaveLength(0);
	});

	it('create() accepts HTTP for a loopback development webhook URL', async () => {
		const calls: any[] = [];
		await node.webhookMethods.default.create.call(
			hookCtx(null, calls, { webhookUrl: 'http://127.0.0.1:5678/webhook/abc' }),
		);
		expect(calls[0].body.url).toBe(securedUrl('http://127.0.0.1:5678/webhook/abc'));
	});

	it('create() rejects an invalid notification email', async () => {
		const calls: any[] = [];
		await expect(
			node.webhookMethods.default.create.call(hookCtx(null, calls, { email: 'not-an-email' })),
		).rejects.toThrow('Invalid email address');
		expect(calls).toHaveLength(0);
	});

	it('delete() inactivates the subscription', async () => {
		const calls: any[] = [];
		const ok = await node.webhookMethods.default.delete.call(
			hookCtx(
				{
					url: securedUrl(),
					email: 'ops@example.com',
					events: DEFAULT_WEBHOOK_EVENTS,
					is_active: true,
				},
				calls,
			),
		);
		expect(ok).toBe(true);
		expect(calls.map((call) => call.method)).toEqual(['GET', 'PUT']);
		expect(calls[1].url).toBe(
			'https://api.assinafy.com.br/v1/accounts/acc_123/webhooks/inactivate',
		);
	});

	it('delete() leaves a newer replacement subscription active', async () => {
		const calls: any[] = [];
		const ok = await node.webhookMethods.default.delete.call(
			hookCtx(
				{
					url: securedUrl(),
					email: 'ops@example.com',
					events: ['document_ready'],
					is_active: true,
				},
				calls,
			),
		);
		expect(ok).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe('GET');
	});

	it('delete() rejects invalid local configuration before making an API request', async () => {
		const calls: any[] = [];
		await expect(
			node.webhookMethods.default.delete.call(hookCtx(null, calls, { webhookUrl: '/webhook/abc' })),
		).rejects.toThrow('valid HTTPS URL');
		expect(calls).toHaveLength(0);
	});

	it('checkExists() is false when no subscription is registered', async () => {
		const calls: any[] = [];
		const exists = await node.webhookMethods.default.checkExists.call(
			hookCtx({ events: [], url: null, email: null, is_active: true }, calls),
		);
		expect(exists).toBe(false);
	});
});
