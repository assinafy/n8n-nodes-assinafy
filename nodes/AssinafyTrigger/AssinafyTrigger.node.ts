import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	CREDENTIALS_TYPE,
	assinafyApiRequest,
	getAccountId,
} from '../Assinafy/shared/transport';
import {
	DEFAULT_WEBHOOK_EVENTS,
	WEBHOOK_EVENT_OPTIONS,
} from '../Assinafy/resources/webhookEvents';

const SIGNATURE_HEADER = 'x-assinafy-signature';

export class AssinafyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Assinafy Trigger',
		name: 'assinafyTrigger',
		icon: { light: 'file:../../icons/assinafy.svg', dark: 'file:../../icons/assinafy.dark.svg' },
		group: ['trigger'],
		version: 1,
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
				default: true,
				description:
					'Whether to reject requests whose HMAC-SHA256 signature does not match the credential webhook secret',
			},
			{
				displayName:
					'⚠ Assinafy supports only one webhook subscription per workspace. Activating this trigger replaces any existing subscription and deactivating it deletes the subscription entirely.',
				name: 'singleSubscriptionNotice',
				type: 'notice',
				default: '',
			},
		],
		usableAsTool: true,
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				try {
					const accountId = await getAccountId(this);
					const existing = await assinafyApiRequest<IDataObject | null>(this, {
						method: 'GET',
						path: `/accounts/${accountId}/webhooks/subscriptions`,
					});
					if (!existing) return false;
					return (
						typeof existing.url === 'string' && existing.url === webhookUrl && existing.is_active !== false
					);
				} catch (error) {
					const code = (error as { httpCode?: string | number }).httpCode;
					if (code === 404 || code === '404') return false;
					throw error;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const email = this.getNodeParameter('email') as string;
				const events = this.getNodeParameter('events', []) as string[];
				const accountId = await getAccountId(this);

				await assinafyApiRequest(this, {
					method: 'PUT',
					path: `/accounts/${accountId}/webhooks/subscriptions`,
					body: {
						url: webhookUrl,
						email,
						events: events.length > 0 ? events : DEFAULT_WEBHOOK_EVENTS,
						is_active: true,
					},
				});
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				try {
					const accountId = await getAccountId(this);
					await assinafyApiRequest(this, {
						method: 'DELETE',
						path: `/accounts/${accountId}/webhooks/subscriptions`,
					});
				} catch (error) {
					const code = (error as { httpCode?: string | number }).httpCode;
					if (code === 404 || code === '404') return true;
					throw error;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const headers = this.getHeaderData() as Record<string, string | string[] | undefined>;
		const body = this.getBodyData() as IDataObject;

		const verifySignature = this.getNodeParameter('verifySignature', true) as boolean;
		if (verifySignature) {
			const credentials = (await this.getCredentials(CREDENTIALS_TYPE)) as {
				webhookSecret?: string;
			};
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

			const rawBody =
				(req as unknown as { rawBody?: Buffer | string }).rawBody ?? JSON.stringify(body);
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
							headers,
							body,
						},
					},
				],
			],
		};
	}
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

function verifyHmac(secret: string, payload: Buffer, signature: string): boolean {
	const provided = signature.trim();
	const expected = createHmac('sha256', secret).update(payload).digest('hex');
	const a = Buffer.from(expected, 'utf8');
	const b = Buffer.from(provided, 'utf8');
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(a, b);
	} catch {
		return false;
	}
}
