import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation, getAccountId } from '../shared/transport';
import { limitField, returnAllField } from '../shared/descriptions';
import { DEFAULT_WEBHOOK_EVENTS, WEBHOOK_EVENT_OPTIONS } from './webhookEvents';
import { cleanQs, showOnly as showOnlyFor, wrap } from '../shared/utils';

const showOnly = showOnlyFor('webhook');

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
				name: 'Get Subscription',
				value: 'get',
				action: 'Get the current webhook subscription',
			},
			{
				name: 'Inactivate Subscription',
				value: 'inactivate',
				action: 'Inactivate the webhook subscription',
			},
			{
				name: 'List Dispatches',
				value: 'listDispatches',
				action: 'List webhook delivery history',
			},
			{
				name: 'List Event Types',
				value: 'listEventTypes',
				action: 'List the webhook event types exposed by the API',
			},
			{
				name: 'Register Subscription',
				value: 'register',
				action: 'Register or replace the webhook subscription',
			},
			{
				name: 'Retry Dispatch',
				value: 'retryDispatch',
				action: 'Retry delivery of a specific webhook dispatch',
			},
		],
	},

	// --- register ---
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://example.com/hooks/assinafy',
		displayOptions: { show: showOnly(['register']) },
	},
	{
		displayName: 'Notification Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		default: '',
		required: true,
		description: 'Email contacted if webhook deliveries start failing',
		displayOptions: { show: showOnly(['register']) },
	},
	{
		displayName: 'Events',
		name: 'events',
		type: 'multiOptions',
		// Empty selection falls back to DEFAULT_WEBHOOK_EVENTS in registerWebhook(),
		// matching the Trigger node's Events field.
		default: [],
		displayOptions: { show: showOnly(['register']) },
		options: WEBHOOK_EVENT_OPTIONS,
	},
	{
		displayName: 'Is Active',
		name: 'isActive',
		type: 'boolean',
		default: true,
		displayOptions: { show: showOnly(['register']) },
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
				displayName: 'Event',
				name: 'event',
				type: 'options',
				default: '',
				options: [{ name: 'Any', value: '' }, ...WEBHOOK_EVENT_OPTIONS],
			},
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
		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unknown webhook operation: ${operation}`,
				{ itemIndex },
			);
	}
}

async function registerWebhook(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const url = this.getNodeParameter('url', itemIndex) as string;
	const email = this.getNodeParameter('email', itemIndex) as string;
	const events = this.getNodeParameter('events', itemIndex, []) as string[];
	const isActive = this.getNodeParameter('isActive', itemIndex, true) as boolean;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'PUT',
		path: `/accounts/${accountId}/webhooks/subscriptions`,
		body: {
			url,
			email,
			events: events.length > 0 ? events : DEFAULT_WEBHOOK_EVENTS,
			is_active: isActive,
		},
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
		throw error;
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
	return Array.isArray(response) ? response : [];
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

async function retryDispatch(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = await getAccountId(this);
	const dispatchId = this.getNodeParameter('dispatchId', itemIndex) as string;
	return assinafyApiRequest<IDataObject>(this, {
		method: 'POST',
		path: `/accounts/${accountId}/webhooks/${dispatchId}/retry`,
	});
}
