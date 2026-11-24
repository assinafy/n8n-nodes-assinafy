import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation, getAccountId } from '../shared/transport';
import { documentResourceLocator, limitField, returnAllField } from '../shared/descriptions';
import {
	cleanQs,
	extractRequiredId,
	parseJsonObject,
	showOnly as showOnlyFor,
	wrap,
} from '../shared/utils';

const showOnly = showOnlyFor('scheduledSend');

export const scheduledSendDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'list',
		displayOptions: { show: { resource: ['scheduledSend'] } },
		options: [
			{ name: 'Cancel', value: 'cancel', action: 'Cancel a pending scheduled send' },
			{ name: 'List', value: 'list', action: 'List scheduled sends' },
			{
				name: 'Schedule Assignment',
				value: 'scheduleAssignment',
				action: 'Schedule an assignment',
			},
			{ name: 'Schedule Envelope', value: 'scheduleEnvelope', action: 'Schedule an envelope' },
			{ name: 'Send Now', value: 'sendNow', action: 'Send a pending scheduled send now' },
		],
	},
	{ ...documentResourceLocator, displayOptions: { show: showOnly(['scheduleAssignment']) } },
	{
		displayName: 'Scheduled Send ID',
		name: 'scheduledSendId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnly(['cancel', 'sendNow']) },
	},
	{
		displayName: 'Send (JSON)',
		name: 'scheduledSendBody',
		type: 'json',
		default: '{}',
		required: true,
		description:
			'Complete assignment or envelope creation body plus send_at (ISO 8601 or Unix seconds), one hour to 90 days ahead. Any expires_at must be at least two hours later. No charge until sending; max_total_credits is checked then. Scheduling does not accept an idempotency key.',
		displayOptions: { show: showOnly(['scheduleAssignment', 'scheduleEnvelope']) },
	},
	{ ...returnAllField, displayOptions: { show: showOnly(['list']) } },
	{ ...limitField, displayOptions: { show: { ...showOnly(['list']), returnAll: [false] } } },
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		default: {},
		placeholder: 'Add Filter',
		displayOptions: { show: showOnly(['list']) },
		options: [{ displayName: 'Document ID', name: 'document_id', type: 'string', default: '' }],
	},
];

export async function executeScheduledSend(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	if (
		!['list', 'cancel', 'sendNow', 'scheduleAssignment', 'scheduleEnvelope'].includes(operation)
	) {
		throw new NodeOperationError(this.getNode(), `Unknown scheduled send operation: ${operation}`, {
			itemIndex,
		});
	}
	if (operation === 'scheduleAssignment' || operation === 'scheduleEnvelope') {
		const body = parseJsonObject(
			this,
			this.getNodeParameter('scheduledSendBody', itemIndex, '{}'),
			'Send',
			itemIndex,
		);
		const path =
			operation === 'scheduleAssignment'
				? `/documents/${extractRequiredId(this, 'documentId', 'Document ID', itemIndex)}/scheduled-sends`
				: `/accounts/${await getAccountId(this)}/scheduled-sends`;
		return wrap(await assinafyApiRequest(this, { method: 'POST', path, body }));
	}
	const root = `/accounts/${await getAccountId(this)}/scheduled-sends`;
	if (operation === 'list') {
		return executeListOperation(this, itemIndex, {
			path: root,
			qs: cleanQs(this.getNodeParameter('filters', itemIndex, {}) as IDataObject),
		});
	}
	const id = extractRequiredId(this, 'scheduledSendId', 'Scheduled Send ID', itemIndex);
	return wrap(
		await assinafyApiRequest(this, {
			method: 'PUT',
			path: `${root}/${id}/${operation === 'cancel' ? 'cancel' : 'send'}`,
		}),
	);
}
