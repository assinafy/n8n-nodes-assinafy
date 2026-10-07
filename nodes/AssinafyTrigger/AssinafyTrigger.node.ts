import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { CREDENTIALS_TYPE, assinafyApiRequest, getAccountId } from '../Assinafy/shared/transport';
import { asArray, assertEmail } from '../Assinafy/shared/utils';
import { DEFAULT_WEBHOOK_EVENTS, WEBHOOK_EVENT_OPTIONS } from '../Assinafy/resources/webhookEvents';
import { isEmptySubscription, normalizeWebhookUrl } from '../Assinafy/resources/webhook';

const TOKEN_QUERY = 'assinafy-token';
const WEBHOOK_HMAC_MESSAGE = 'assinafy-n8n-webhook-v1';
const REDACTED_HEADER_VALUE = '[REDACTED]';
const SENSITIVE_HEADERS = new Set([
	'authorization',
	'cookie',
	'proxy-authorization',
	'set-cookie',
	'x-api-key',
]);
/** Standard Webhooks replay window, in seconds. */
const SIGNATURE_TOLERANCE_SECONDS = 300;
const ENDPOINT_NAME = 'n8n Assinafy Trigger';

const INVALID_SIGNATURE = 'Invalid Assinafy webhook signature';
/**
 * Endpoint signing secrets by delivery URL. Workflow static data written while
 * receiving a webhook is not persisted, so the cache lives in the process.
 */
const signingSecrets = new Map<string, string>();

export class AssinafyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Assinafy Trigger',
		name: 'assinafyTrigger',
		icon: { light: 'file:../../icons/assinafy.svg', dark: 'file:../../icons/assinafy.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'Webhook events',
		description:
			'Starts a workflow when Assinafy posts a webhook event (document ready, signer signed, etc.)',
		defaults: {
			name: 'Assinafy Trigger',
		},
		usableAsTool: undefined,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: CREDENTIALS_TYPE,
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Notification Email',
				name: 'email',
				type: 'string',
				default: '',
				required: true,
				description: 'Email address Assinafy contacts if deliveries start failing',
				placeholder: 'ops@example.com',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				default: [],
				description: 'Event types to subscribe to',
				options: WEBHOOK_EVENT_OPTIONS,
			},
			{
				displayName: 'Verify Signature',
				name: 'verifySignature',
				type: 'boolean',
				default: false,
				description:
					'Whether to enable signing on the webhook endpoint and reject deliveries whose Standard Webhooks signature does not match the endpoint secret, or whose timestamp is more than five minutes old',
			},
			{
				displayName:
					'Activating creates a webhook endpoint for this workflow; deactivating deletes it. A workspace holds 1 endpoint, or up to 3 on paid plans. Where the API has no webhook endpoints, the trigger uses the single workspace subscription and activation replaces it.',
				name: 'singleSubscriptionNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const config = await getSubscriptionConfig(this);
				const accountId = await getAccountId(this);
				const endpoints = await listEndpoints(this, accountId);
				if (endpoints === null) {
					const existing = await getLegacySubscription(this, accountId);
					return existing !== null && matchesConfig(existing, config);
				}
				const endpoint = endpoints.find((entry) => entry.url === config.webhookUrl);
				return endpoint !== undefined && matchesConfig(endpoint, config);
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const config = await getSubscriptionConfig(this);
				const accountId = await getAccountId(this);
				const endpoints = await listEndpoints(this, accountId);
				const body: IDataObject = {
					url: config.webhookUrl,
					email: config.email,
					events: config.desiredEvents,
					is_active: true,
				};
				if (endpoints === null) {
					assertLegacySupportsConfig(this, config);
					await assinafyApiRequest(this, {
						method: 'PUT',
						path: `/accounts/${accountId}/webhooks/subscriptions`,
						body,
					});
					return true;
				}
				body.signing_enabled = config.verifySignature;
				const existing = endpoints.find((entry) => entry.url === config.webhookUrl);
				await assinafyApiRequest(this, {
					method: existing ? 'PUT' : 'POST',
					path: `/accounts/${accountId}/webhooks/endpoints${existing ? `/${encodeURIComponent(String(existing.id))}` : ''}`,
					body: existing ? body : { ...body, name: ENDPOINT_NAME },
				});
				signingSecrets.delete(config.webhookUrl);
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const config = await getSubscriptionConfig(this);
				const accountId = await getAccountId(this);
				const endpoints = await listEndpoints(this, accountId);
				if (endpoints === null) {
					// The subscription is shared by the workspace and inactivation is
					// unconditional, so only inactivate it while it still matches this trigger.
					const existing = await getLegacySubscription(this, accountId);
					if (existing !== null && matchesConfig(existing, config)) {
						await assinafyApiRequest(this, {
							method: 'PUT',
							path: `/accounts/${accountId}/webhooks/inactivate`,
						});
					}
					return true;
				}
				const endpoint = endpoints.find((entry) => entry.url === config.webhookUrl);
				if (endpoint) {
					try {
						await assinafyApiRequest(this, {
							method: 'DELETE',
							path: `/accounts/${accountId}/webhooks/endpoints/${encodeURIComponent(String(endpoint.id))}`,
						});
					} catch (error) {
						if (!isNotFound(error)) throw new NodeApiError(this.getNode(), error as JsonObject);
					}
				}
				signingSecrets.delete(config.webhookUrl);
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const headers = this.getHeaderData() as Record<string, string | string[] | undefined>;
		const safeHeaders = redactSensitiveHeaders(headers);
		const body = this.getBodyData() as IDataObject;
		const credentials = (await this.getCredentials(CREDENTIALS_TYPE)) as {
			apiKey?: string;
			webhookSecret?: string;
		};
		const query = this.getQueryData() as Record<string, unknown>;
		const rawToken = query[TOKEN_QUERY];
		const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
		if (
			typeof token !== 'string' ||
			!safeEqual(createWebhookToken(credentials, this), token.trim())
		) {
			throw new NodeOperationError(this.getNode(), 'Invalid Assinafy webhook token');
		}

		if (this.getNodeParameter('verifySignature', false) as boolean) {
			// The signature covers the exact bytes Assinafy sent. Re-serializing the
			// parsed body would not byte-match, so a missing raw body fails closed.
			const rawBody = (req as unknown as { rawBody?: Buffer | string }).rawBody;
			if (rawBody === undefined || rawBody === null || rawBody === '') {
				throw new NodeOperationError(
					this.getNode(),
					'Verify Signature is enabled but the raw request body is not available to verify against',
				);
			}
			const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
			// Try the cached secret first; on a signature mismatch fetch the current
			// one, which also picks up a rotated secret.
			const webhookUrl = await buildWebhookUrl(this);
			const cached = signingSecrets.get(webhookUrl);
			let failure = cached ? verifyStandardWebhook(cached, headers, payload) : INVALID_SIGNATURE;
			if (failure === INVALID_SIGNATURE) {
				const secret = await fetchSigningSecret(this, webhookUrl);
				failure = verifyStandardWebhook(secret, headers, payload);
				if (!failure) signingSecrets.set(webhookUrl, secret);
			}
			if (failure) throw new NodeOperationError(this.getNode(), failure);
		}

		const eventType = (body.event ?? body.type) as string | undefined;
		return {
			workflowData: [
				[
					{
						json: {
							event: eventType,
							headers: safeHeaders,
							body,
						},
					},
				],
			],
		};
	}
}

async function getSubscriptionConfig(ctx: IHookFunctions): Promise<{
	webhookUrl: string;
	email: string;
	desiredEvents: string[];
	verifySignature: boolean;
}> {
	const webhookUrl = await buildWebhookUrl(ctx);
	const email = String(ctx.getNodeParameter('email', '') ?? '').trim();
	if (!assertEmail(email)) {
		throw new NodeOperationError(ctx.getNode(), 'Invalid email address');
	}
	const events = ctx.getNodeParameter('events', []);
	if (
		!Array.isArray(events) ||
		events.some((event) => typeof event !== 'string' || !event.trim())
	) {
		throw new NodeOperationError(ctx.getNode(), 'Events must be a list of non-empty event types');
	}
	return {
		webhookUrl,
		email,
		desiredEvents: events.length > 0 ? events : DEFAULT_WEBHOOK_EVENTS,
		verifySignature: ctx.getNodeParameter('verifySignature', false) === true,
	};
}

type SubscriptionConfig = Awaited<ReturnType<typeof getSubscriptionConfig>>;

/** This workflow's delivery URL carrying the credential-derived token. */
async function buildWebhookUrl(ctx: IHookFunctions | IWebhookFunctions): Promise<string> {
	const rawWebhookUrl = normalizeWebhookUrl(ctx.getNodeWebhookUrl('default'));
	if (!rawWebhookUrl) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Webhook URL must be a valid HTTPS URL (HTTP is allowed only for loopback hosts)',
		);
	}
	const credentials = (await ctx.getCredentials(CREDENTIALS_TYPE)) as {
		apiKey?: string;
		webhookSecret?: string;
	};
	const parsedWebhookUrl = new URL(rawWebhookUrl);
	parsedWebhookUrl.searchParams.set(TOKEN_QUERY, createWebhookToken(credentials, ctx));
	return parsedWebhookUrl.toString();
}

/** The signing secret of the endpoint registered for this workflow's URL. */
async function fetchSigningSecret(ctx: IWebhookFunctions, webhookUrl: string): Promise<string> {
	const accountId = await getAccountId(ctx);
	const endpoint = (await listEndpoints(ctx, accountId))?.find((entry) => entry.url === webhookUrl);
	if (!endpoint) {
		throw new NodeOperationError(
			ctx.getNode(),
			'No Assinafy webhook endpoint is registered for this workflow',
		);
	}
	const { secret } = await assinafyApiRequest<IDataObject>(ctx, {
		method: 'GET',
		path: `/accounts/${accountId}/webhooks/endpoints/${encodeURIComponent(String(endpoint.id))}/secret`,
	});
	if (typeof secret !== 'string' || !secret.startsWith('whsec_')) {
		throw new NodeOperationError(ctx.getNode(), 'Assinafy returned no endpoint signing secret');
	}
	return secret;
}

/** The workspace's webhook endpoints, or null where the API predates webhook endpoints. */
async function listEndpoints(
	ctx: IHookFunctions | IWebhookFunctions,
	accountId: string,
): Promise<IDataObject[] | null> {
	try {
		return asArray<IDataObject>(
			await assinafyApiRequest(ctx, {
				method: 'GET',
				path: `/accounts/${accountId}/webhooks/endpoints`,
			}),
		);
	} catch (error) {
		if (isNotFound(error)) return null;
		throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

async function getLegacySubscription(
	ctx: IHookFunctions,
	accountId: string,
): Promise<IDataObject | null> {
	try {
		const subscription = await assinafyApiRequest<IDataObject | null>(ctx, {
			method: 'GET',
			path: `/accounts/${accountId}/webhooks/subscriptions`,
		});
		return isEmptySubscription(subscription) ? null : subscription;
	} catch (error) {
		if (isNotFound(error)) return null;
		throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

function assertLegacySupportsConfig(ctx: IHookFunctions, config: SubscriptionConfig): void {
	if (config.verifySignature) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Verify Signature requires webhook endpoints, which this Assinafy environment does not provide',
		);
	}
}

function matchesConfig(existing: IDataObject, config: SubscriptionConfig): boolean {
	return (
		existing.is_active !== false &&
		existing.url === config.webhookUrl &&
		existing.email === config.email &&
		sameEventSet(existing.events, config.desiredEvents) &&
		('signing_enabled' in existing
			? existing.signing_enabled === config.verifySignature
			: !config.verifySignature)
	);
}

function isNotFound(error: unknown): boolean {
	const code = (error as { httpCode?: string | number }).httpCode;
	return code === 404 || code === '404';
}

/**
 * Verify a Standard Webhooks signature: HMAC-SHA256 over
 * `{webhook-id}.{webhook-timestamp}.{raw body}` keyed with the base64 part of the
 * `whsec_` secret. Returns the failure reason, or undefined when valid.
 */
export function verifyStandardWebhook(
	secret: string,
	headers: Record<string, string | string[] | undefined>,
	payload: Buffer,
	nowSeconds = Math.floor(Date.now() / 1000),
): string | undefined {
	const id = readHeader(headers, 'webhook-id');
	const timestamp = readHeader(headers, 'webhook-timestamp');
	const signatures = readHeader(headers, 'webhook-signature');
	if (!id || !timestamp || !signatures) {
		return 'Missing webhook signature headers (webhook-id, webhook-timestamp, webhook-signature)';
	}
	if (
		!/^\d+$/.test(timestamp) ||
		Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS
	) {
		return 'Assinafy webhook timestamp is outside the accepted window';
	}
	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	const expected = createHmac('sha256', key)
		.update(Buffer.concat([Buffer.from(`${id}.${timestamp}.`, 'utf8'), payload]))
		.digest('base64');
	const valid = signatures
		.split(' ')
		.some((entry) => entry.startsWith('v1,') && safeEqual(expected, entry.slice(3)));
	return valid ? undefined : INVALID_SIGNATURE;
}

function redactSensitiveHeaders(
	headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
	return Object.fromEntries(
		Object.entries(headers).map(([name, value]) => [
			name,
			isSensitiveHeader(name) ? REDACTED_HEADER_VALUE : value,
		]),
	);
}

function isSensitiveHeader(name: string): boolean {
	const normalized = name.toLowerCase();
	return (
		SENSITIVE_HEADERS.has(normalized) ||
		/(?:^|[-_])(?:api[-_]?key|auth(?:entication|orization)?|credential|jwt|token|secret|signature|assertion)(?:$|[-_])/.test(
			normalized,
		)
	);
}

function readHeader(
	headers: Record<string, string | string[] | undefined>,
	name: string,
): string | undefined {
	for (const [key, raw] of Object.entries(headers)) {
		if (key.toLowerCase() !== name || !raw) continue;
		const value = Array.isArray(raw) ? raw[0] : raw;
		return typeof value === 'string' ? value.trim() : undefined;
	}
	return undefined;
}

function sameEventSet(actual: unknown, desired: string[]): boolean {
	if (!Array.isArray(actual)) return false;
	const set = new Set(actual.map(String));
	return set.size === new Set(desired).size && desired.every((e) => set.has(e));
}

function createWebhookToken(
	credentials: { apiKey?: string; webhookSecret?: string },
	ctx: IHookFunctions | IWebhookFunctions,
): string {
	const secret = String(credentials.webhookSecret || credentials.apiKey || '').trim();
	if (!secret) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Assinafy credentials require an API Key or Webhook Secret for trigger security',
		);
	}
	return createHmac('sha256', secret).update(WEBHOOK_HMAC_MESSAGE).digest('hex');
}

function safeEqual(expected: string, provided: string): boolean {
	const a = Buffer.from(expected, 'utf8');
	const b = Buffer.from(provided, 'utf8');
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(a, b);
	} catch {
		return false;
	}
}
