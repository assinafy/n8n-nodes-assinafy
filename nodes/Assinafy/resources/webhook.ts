import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	INodeExecutionData,
	INodeProperties,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation, getAccountId } from '../shared/transport';
import { limitField, returnAllField } from '../shared/descriptions';
import { DEFAULT_WEBHOOK_EVENTS, WEBHOOK_EVENT_OPTIONS } from './webhookEvents';
import {
	asArray,
	assertEmail,
	cleanQs,
	extractRequiredId,
	showOnly as showOnlyFor,
	wrap,
} from '../shared/utils';

const showOnly = showOnlyFor('webhook');

const endpointNameField: INodeProperties = {
	displayName: 'Name',
	name: 'name',
	type: 'string',
	default: '',
	description: 'Label that tells endpoints apart',
};

const signingEnabledField: INodeProperties = {
	displayName: 'Signing Enabled',
	name: 'signingEnabled',
	type: 'boolean',
	default: false,
	description:
		'Whether deliveries carry a Standard Webhooks signature (webhook-signature header). Enabling generates a signing secret; disabling discards it.',
};

export const webhookDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['webhook'] } },
		default: 'register',
		options: [
			{
				name: 'Create Endpoint',
				value: 'createEndpoint',
				action: 'Create a webhook endpoint',
			},
			{
				name: 'Delete Endpoint',
				value: 'deleteEndpoint',
				action: 'Delete a webhook endpoint',
			},
			{
				name: 'Get Endpoint',
				value: 'getEndpoint',
				action: 'Get a webhook endpoint',
			},
			{
				name: 'Get Endpoint Signing Secret',
				value: 'getEndpointSecret',
				action: 'Get the signing secret of a webhook endpoint',
			},
			{
				name: 'Get Subscription',
				value: 'get',
				action: 'Get the oldest webhook endpoint as the subscription',
			},
			{
				name: 'Inactivate Subscription',
				value: 'inactivate',
				action: 'Inactivate the oldest webhook endpoint',
			},
			{
				name: 'List Dispatches',
				value: 'listDispatches',
				action: 'List webhook delivery history',
			},
			{
				name: 'List Endpoints',
				value: 'listEndpoints',
				action: 'List the webhook endpoints',
			},
			{
				name: 'List Event Types',
				value: 'listEventTypes',
				action: 'List the webhook event types exposed by the API',
			},
			{
				name: 'Register Subscription',
				value: 'register',
				action: 'Register or replace the oldest webhook endpoint',
			},
			{
				name: 'Retry Dispatch',
				value: 'retryDispatch',
				action: 'Retry delivery of a specific webhook dispatch',
			},
			{
				name: 'Rotate Endpoint Signing Secret',
				value: 'rotateEndpointSecret',
				action: 'Rotate the signing secret of a webhook endpoint',
			},
			{
				name: 'Update Endpoint',
				value: 'updateEndpoint',
				action: 'Update a webhook endpoint',
			},
		],
	},

	// --- register / create endpoint ---
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://example.com/hooks/assinafy',
		description: 'HTTPS delivery URL. HTTP is accepted only for loopback development hosts.',
		displayOptions: { show: showOnly(['register', 'createEndpoint']) },
	},
	{
		displayName: 'Notification Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@example.com',
		default: '',
		required: true,
		description: 'Email contacted if webhook deliveries start failing',
		displayOptions: { show: showOnly(['register', 'createEndpoint']) },
	},
	{
		displayName: 'Events',
		name: 'events',
		type: 'multiOptions',
		// Empty selection falls back to DEFAULT_WEBHOOK_EVENTS in registerWebhook(),
		// matching the Trigger node's Events field.
		default: [],
		displayOptions: { show: showOnly(['register', 'createEndpoint']) },
		options: WEBHOOK_EVENT_OPTIONS,
	},
	{
		displayName: 'Is Active',
		name: 'isActive',
		type: 'boolean',
		default: true,
		displayOptions: { show: showOnly(['register', 'createEndpoint']) },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnly(['createEndpoint']) },
		options: [endpointNameField, signingEnabledField],
	},

	// --- endpoint by ID ---
	{
		displayName: 'Endpoint ID',
		name: 'endpointId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: showOnly([
				'getEndpoint',
				'updateEndpoint',
				'deleteEndpoint',
				'getEndpointSecret',
				'rotateEndpointSecret',
			]),
		},
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnly(['updateEndpoint']) },
		options: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				default: [],
				options: WEBHOOK_EVENT_OPTIONS,
			},
			{ displayName: 'Is Active', name: 'isActive', type: 'boolean', default: true },
			endpointNameField,
			{
				displayName: 'Notification Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@example.com',
				default: '',
			},
			signingEnabledField,
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/hooks/assinafy',
			},
		],
	},

	// --- list dispatches ---
	{ ...returnAllField, displayOptions: { show: showOnly(['listDispatches']) } },
	{
		...limitField,
		displayOptions: { show: { ...showOnly(['listDispatches']), returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showOnly(['listDispatches']) },
		options: [
			{
				displayName: 'Delivered',
				name: 'delivered',
				type: 'options',
				default: '',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Delivered', value: 'true' },
					{ name: 'Not Delivered', value: 'false' },
				],
			},
			{
				displayName: 'Endpoint ID',
				name: 'endpoint_id',
				type: 'string',
				default: '',
				description: 'Only deliveries sent to this webhook endpoint',
			},
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				default: '',
				options: [{ name: 'Any', value: '' }, ...WEBHOOK_EVENT_OPTIONS],
			},
			{
				displayName: 'From (Unix Timestamp)',
				name: 'from',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'To (Unix Timestamp)',
				name: 'to',
				type: 'number',
				default: 0,
			},
		],
	},

	// --- retry dispatch ---
	{
		displayName: 'Dispatch ID',
		name: 'dispatchId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnly(['retryDispatch']) },
	},
];

export async function executeWebhook(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	switch (operation) {
		case 'register':
			return wrap(await registerWebhook.call(this, itemIndex));
		case 'get':
			return wrap((await getWebhook.call(this)) ?? { subscribed: false });
		case 'inactivate':
			return wrap(await inactivateWebhook.call(this));
		case 'listEventTypes':
			return wrap({ eventTypes: await listEventTypes.call(this) });
		case 'listDispatches':
			return listDispatches.call(this, itemIndex);
		case 'retryDispatch':
			return wrap(await retryDispatch.call(this, itemIndex));
		case 'listEndpoints':
			return asArray<IDataObject>(await endpointRequest(this, 'GET')).map((json) => ({ json }));
		case 'createEndpoint':
			return wrap(await endpointRequest(this, 'POST', '', createEndpointBody(this, itemIndex)));
		case 'getEndpoint':
			return wrap(await endpointRequest(this, 'GET', endpointPath(this, itemIndex)));
		case 'updateEndpoint':
			return wrap(
				await endpointRequest(
					this,
					'PUT',
					endpointPath(this, itemIndex),
					updateEndpointBody(this, itemIndex),
				),
			);
		case 'deleteEndpoint': {
			const path = endpointPath(this, itemIndex);
			await endpointRequest(this, 'DELETE', path);
			return wrap({ deleted: true, id: decodeURIComponent(path.slice(1)) });
		}
		case 'getEndpointSecret':
			return wrap(await endpointRequest(this, 'GET', `${endpointPath(this, itemIndex)}/secret`));
		case 'rotateEndpointSecret':
			return wrap(
				await endpointRequest(this, 'POST', `${endpointPath(this, itemIndex)}/secret/rotate`),
			);
		default:
			throw new NodeOperationError(this.getNode(), `Unknown webhook operation: ${operation}`, {
				itemIndex,
			});
	}
}

async function registerWebhook(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const body = readDeliveryFields(this, itemIndex);
	const accountId = await getAccountId(this);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/accounts/${accountId}/webhooks/subscriptions`,
		body,
	});
}

/** URL, email, events and active flag shared by Register Subscription and Create Endpoint. */
function readDeliveryFields(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	const events = validateEvents(ctx, ctx.getNodeParameter('events', itemIndex, []), itemIndex);
	const isActive = ctx.getNodeParameter('isActive', itemIndex, true);
	if (typeof isActive !== 'boolean') {
		throw new NodeOperationError(ctx.getNode(), 'Is Active must be a boolean', { itemIndex });
	}
	return {
		url: validateUrl(ctx, ctx.getNodeParameter('url', itemIndex), itemIndex),
		email: validateEmail(ctx, ctx.getNodeParameter('email', itemIndex), itemIndex),
		events: events.length > 0 ? events : DEFAULT_WEBHOOK_EVENTS,
		is_active: isActive,
	};
}

function validateUrl(ctx: IExecuteFunctions, value: unknown, itemIndex: number): string {
	const url = normalizeWebhookUrl(value);
	if (!url) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Webhook URL must be a valid HTTPS URL (HTTP is allowed only for loopback hosts)',
			{ itemIndex },
		);
	}
	return url;
}

function validateEmail(ctx: IExecuteFunctions, value: unknown, itemIndex: number): string {
	const email = String(value ?? '').trim();
	if (!assertEmail(email)) {
		throw new NodeOperationError(ctx.getNode(), 'Invalid email address', { itemIndex });
	}
	return email;
}

function validateEvents(ctx: IExecuteFunctions, events: unknown, itemIndex: number): string[] {
	if (
		!Array.isArray(events) ||
		events.some((event) => typeof event !== 'string' || !event.trim())
	) {
		throw new NodeOperationError(ctx.getNode(), 'Events must be an array of event types', {
			itemIndex,
		});
	}
	return events as string[];
}

function createEndpointBody(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	const extra = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const body = readDeliveryFields(ctx, itemIndex);
	const name = String(extra.name ?? '').trim();
	if (name) body.name = name;
	if (typeof extra.signingEnabled === 'boolean') body.signing_enabled = extra.signingEnabled;
	return body;
}

/** Only the fields set are sent; the API keeps every other endpoint setting. */
function updateEndpointBody(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	const fields = ctx.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
	const body: IDataObject = {};
	if (fields.url !== undefined) body.url = validateUrl(ctx, fields.url, itemIndex);
	if (fields.email !== undefined) body.email = validateEmail(ctx, fields.email, itemIndex);
	if (fields.events !== undefined) {
		const events = validateEvents(ctx, fields.events, itemIndex);
		if (events.length === 0) {
			throw new NodeOperationError(ctx.getNode(), 'Select at least one event', { itemIndex });
		}
		body.events = events;
	}
	if (fields.name !== undefined) body.name = String(fields.name).trim();
	if (typeof fields.isActive === 'boolean') body.is_active = fields.isActive;
	if (typeof fields.signingEnabled === 'boolean') body.signing_enabled = fields.signingEnabled;
	if (Object.keys(body).length === 0) {
		throw new NodeOperationError(ctx.getNode(), 'Add at least one field to update', {
			itemIndex,
		});
	}
	return body;
}

function endpointPath(ctx: IExecuteFunctions, itemIndex: number): string {
	return `/${extractRequiredId(ctx, 'endpointId', 'Endpoint ID', itemIndex)}`;
}

async function endpointRequest(
	ctx: IExecuteFunctions,
	method: IHttpRequestMethods,
	subPath = '',
	body?: IDataObject,
): Promise<IDataObject> {
	const accountId = await getAccountId(ctx);
	return assinafyApiRequest<IDataObject>(ctx, {
		method,
		path: `/accounts/${accountId}/webhooks/endpoints${subPath}`,
		...(body ? { body } : {}),
	});
}

async function getWebhook(this: IExecuteFunctions): Promise<IDataObject | null> {
	const accountId = await getAccountId(this);
	try {
		const subscription = await assinafyApiRequest<IDataObject>(this, {
			method: 'GET',
			path: `/accounts/${accountId}/webhooks/subscriptions`,
		});
		return isEmptySubscription(subscription) ? null : subscription;
	} catch (error) {
		const code = (error as { httpCode?: string | number }).httpCode;
		if (code === 404 || code === '404') return null;
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/**
 * The API returns a sentinel `{ events: [], url: null, email: null, is_active: true }`
 * when no subscription has ever been registered. Treat that as "no subscription".
 */
function isEmptySubscription(subscription: IDataObject | null): boolean {
	if (!subscription) return true;
	const url = subscription.url;
	const events = subscription.events;
	const hasUrl = typeof url === 'string' && url.length > 0;
	const hasEvents = Array.isArray(events) && events.length > 0;
	return !hasUrl && !hasEvents;
}

export function normalizeWebhookUrl(value: unknown): string | null {
	const url = typeof value === 'string' ? value.trim() : '';
	if (url.split('').some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
		return null;
	}
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.toLowerCase();
		const isLoopback =
			hostname === 'localhost' ||
			hostname === '127.0.0.1' ||
			hostname === '[::1]' ||
			hostname === '::1';
		return (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopback)) &&
			parsed.hostname &&
			!parsed.username &&
			!parsed.password &&
			!parsed.hash
			? url
			: null;
	} catch {
		return null;
	}
}

export { isEmptySubscription };

async function inactivateWebhook(this: IExecuteFunctions): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/accounts/${accountId}/webhooks/inactivate`,
	});
}

async function listEventTypes(this: IExecuteFunctions): Promise<IDataObject[]> {
	const response = await assinafyApiRequest<IDataObject[]>(this, {
		method: 'GET',
		path: '/webhooks/event-types',
	});
	return asArray<IDataObject>(response);
}

async function listDispatches(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const accountId = await getAccountId(this);
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	return executeListOperation(this, itemIndex, {
		path: `/accounts/${accountId}/webhooks`,
		qs: cleanQs(filters, ['from', 'to']),
	});
}

async function retryDispatch(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const dispatchId = extractRequiredId(this, 'dispatchId', 'Dispatch ID', itemIndex);
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/webhooks/${dispatchId}/retry`,
	});
}
