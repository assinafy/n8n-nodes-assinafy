/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from 'node:crypto';
import { AssinafyTrigger } from '../nodes/AssinafyTrigger/AssinafyTrigger.node';

const SECRET = 'shh-secret';

function sign(body: unknown): string {
	return createHmac('sha256', SECRET).update(Buffer.from(JSON.stringify(body), 'utf8')).digest('hex');
}

function webhookCtx(opts: {
	verify: boolean;
	body: unknown;
	signature?: string;
	rawBody?: Buffer | string;
	secret?: string;
}) {
	const raw = opts.rawBody ?? Buffer.from(JSON.stringify(opts.body), 'utf8');
	return {
		getRequestObject: () => ({ rawBody: raw }),
		getHeaderData: () =>
			opts.signature ? { 'x-assinafy-signature': opts.signature } : {},
		getBodyData: () => opts.body,
		getNodeParameter: (name: string, def?: unknown) =>
			name === 'verifySignature' ? opts.verify : def,
		getCredentials: async () => ({ webhookSecret: 'secret' in opts ? opts.secret : SECRET }),
		getNode: () => ({ name: 'AssinafyTrigger' }),
	} as any;
}

describe('AssinafyTrigger webhook()', () => {
	const node = new AssinafyTrigger();
	const body = { event: 'document_ready', document: { id: 'd1' } };

	it('passes through and surfaces the event when verification is off', async () => {
		const result = await node.webhook.call(webhookCtx({ verify: false, body }));
		expect(result.workflowData![0][0].json.event).toBe('document_ready');
		expect(result.workflowData![0][0].json.body).toEqual(body);
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
			node.webhook.call(
				webhookCtx({ verify: true, body, signature: sign(body), rawBody: '' }),
			),
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

	function hookCtx(existing: unknown, calls: any[]) {
		return {
			getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/abc',
			getNodeParameter: (name: string, def?: unknown) =>
				name === 'email' ? 'ops@example.com' : name === 'events' ? [] : def,
			getCredentials: async () => ({ accountId: 'acc_123', baseUrl: 'https://api.assinafy.com.br/v1' }),
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
		const ok = await node.webhookMethods.default.create.call(hookCtx(null, calls));
		expect(ok).toBe(true);
		const put = calls.find((c) => c.method === 'PUT');
		expect(put.url).toBe('https://api.assinafy.com.br/v1/accounts/acc_123/webhooks/subscriptions');
		expect(put.body.url).toBe('https://n8n.example.com/webhook/abc');
		expect(put.body.is_active).toBe(true);
	});

	it('delete() inactivates the subscription', async () => {
		const calls: any[] = [];
		const ok = await node.webhookMethods.default.delete.call(hookCtx(null, calls));
		expect(ok).toBe(true);
		expect(calls[0].method).toBe('PUT');
		expect(calls[0].url).toBe('https://api.assinafy.com.br/v1/accounts/acc_123/webhooks/inactivate');
	});

	it('checkExists() is false when no subscription is registered', async () => {
		const calls: any[] = [];
		const exists = await node.webhookMethods.default.checkExists.call(
			hookCtx({ events: [], url: null, email: null, is_active: true }, calls),
		);
		expect(exists).toBe(false);
	});
});
