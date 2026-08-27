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
import { assertEmail } from '../Assinafy/shared/utils';
import { DEFAULT_WEBHOOK_EVENTS, WEBHOOK_EVENT_OPTIONS } from '../Assinafy/resources/webhookEvents';
import { isEmptySubscription, normalizeWebhookUrl } from '../Assinafy/resources/webhook';

const SIGNATURE_HEADER = 'x-assinafy-signature';
const TOKEN_QUERY = 'assinafy-token';
const WEBHOOK_HMAC_MESSAGE = 'assinafy-n8n-webhook-v1';
const REDACTED_HEADER_VALUE = '[REDACTED]';
const SENSITIVE_HEADERS = new Set([
	'authorization',
	'cookie',
	'proxy-authorization',
	'set-cookie',
	'x-api-key',
	SIGNATURE_HEADER,
]);

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
					'Whether to reject deliveries whose HMAC-SHA256 signature (hex digest of the raw body, header X-Assinafy-Signature) does not match the credential Webhook Secret. Off by default: the Assinafy public API docs do not currently document a delivery signature, so enable this only if your workspace is configured to send one and you have set the matching secret. When enabled, deliveries without a verifiable raw body are rejected.',
			},
			{
				displayName:
					'Important: Assinafy supports only one webhook subscription per workspace. Activating this trigger replaces any existing subscription with an HTTPS URL carrying a credential-derived authentication token. Do not replace the subscription concurrently with workflow deactivation because Assinafy inactivation is unconditional.',
				name: 'singleSubscriptionNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const { webhookUrl, email, desiredEvents } = await getSubscriptionConfig(this);
				try {
					const accountId = await getAccountId(this);
					const existing = await assinafyApiRequest<IDataObject | null>(this, {
						method: 'GET',
						path: `/accounts/${accountId}/webhooks/subscriptions`,
					});
					if (isEmptySubscription(existing)) return false;
					if (existing!.is_active === false) return false;
					if (existing!.url !== webhookUrl) return false;
					if (email && existing!.email !== email) return false;
					return sameEventSet(existing!.events, desiredEvents);
				} catch (error) {
					const code = (error as { httpCode?: string | number }).httpCode;
					if (code === 404 || code === '404') return false;
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const { webhookUrl, email, desiredEvents } = await getSubscriptionConfig(this);
				const accountId = await getAccountId(this);

				await assinafyApiRequest(this, {
					method: 'PUT',
					path: `/accounts/${accountId}/webhooks/subscriptions`,
					body: {
						url: webhookUrl,
						email,
						events: desiredEvents,
						is_active: true,
					},
				});
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const { webhookUrl, email, desiredEvents } = await getSubscriptionConfig(this);
				try {
					const accountId = await getAccountId(this);
					const existing = await assinafyApiRequest<IDataObject | null>(this, {
						method: 'GET',
						path: `/accounts/${accountId}/webhooks/subscriptions`,
					});
					if (
						isEmptySubscription(existing) ||
						existing!.is_active === false ||
						existing!.url !== webhookUrl ||
						existing!.email !== email ||
						!sameEventSet(existing!.events, desiredEvents)
					) {
						return true;
					}
					await assinafyApiRequest(this, {
						method: 'PUT',
						path: `/accounts/${accountId}/webhooks/inactivate`,
					});
				} catch (error) {
					const code = (error as { httpCode?: string | number }).httpCode;
					if (code === 404 || code === '404') return true;
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
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

		const verifySignature = this.getNodeParameter('verifySignature', false) as boolean;
		if (verifySignature) {
			const secret = credentials.webhookSecret;
			if (!secret) {
				throw new NodeOperationError(
					this.getNode(),
					'Verify Signature is enabled but the credential has no webhook secret configured',
				);
			}

			const signature = readSignatureHeader(headers);
			if (!signature) {
				throw new NodeOperationError(
					this.getNode(),
					`Missing webhook signature header (${SIGNATURE_HEADER})`,
				);
			}

			// Fail closed: the signature is computed over the exact bytes Assinafy
			// signed. Re-serializing the parsed body would not byte-match, so when the
			// raw body is unavailable we reject rather than silently fail the compare.
			const rawBody = (req as unknown as { rawBody?: Buffer | string }).rawBody;
			if (rawBody === undefined || rawBody === null || rawBody === '') {
				throw new NodeOperationError(
					this.getNode(),
					'Verify Signature is enabled but the raw request body is not available to verify against',
				);
			}
			const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
			if (!verifyHmac(secret, payload, signature)) {
				throw new NodeOperationError(this.getNode(), 'Invalid Assinafy webhook signature');
			}
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
}> {
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
	const webhookUrl = parsedWebhookUrl.toString();
	const email = String(ctx.getNodeParameter('email', '') ?? '').trim();
	if (!assertEmail(email)) {
		throw new NodeOperationError(ctx.getNode(), 'Invalid email address');
	}
	const events = ctx.getNodeParameter('events', []) as string[];
	return {
		webhookUrl,
		email,
		desiredEvents: events.length > 0 ? events : DEFAULT_WEBHOOK_EVENTS,
	};
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

function readSignatureHeader(
	headers: Record<string, string | string[] | undefined>,
): string | undefined {
	for (const [name, raw] of Object.entries(headers)) {
		if (name.toLowerCase() !== SIGNATURE_HEADER || !raw) continue;
		const value = Array.isArray(raw) ? raw[0] : raw;
		return typeof value === 'string' ? value.trim() : undefined;
	}
	return undefined;
}

function sameEventSet(actual: unknown, desired: string[]): boolean {
	if (!Array.isArray(actual)) return false;
	if (actual.length !== desired.length) return false;
	const set = new Set(actual.map(String));
	return desired.every((e) => set.has(e));
}

function verifyHmac(secret: string, payload: Buffer, signature: string): boolean {
	const expected = createHmac('sha256', secret).update(payload).digest('hex');
	return safeEqual(expected, signature.trim());
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
