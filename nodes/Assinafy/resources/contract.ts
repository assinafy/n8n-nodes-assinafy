import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assinafyApiRequest, executeListOperation, getAccountId } from '../shared/transport';
import {
	documentResourceLocator,
	limitField,
	returnAllField,
	searchField,
} from '../shared/descriptions';
import {
	cleanQs,
	extractRequiredId,
	parseJsonParam,
	parseStringList,
	showOnly as showOnlyFor,
	wrap,
} from '../shared/utils';

const showOnly = showOnlyFor('contract');

export const contractDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['contract'] } },
		default: 'list',
		options: [
			{ name: 'Get', value: 'get', action: 'Get contract terms or an amendment' },
			{
				name: 'Get Related',
				value: 'getRelated',
				action: 'Get the root contract and its amendments',
			},
			{ name: 'List', value: 'list', action: 'List workspace contracts' },
			{ name: 'Renew', value: 'renew', action: 'Renew a contract' },
			{ name: 'Set Terms', value: 'setTerms', action: 'Set contract terms or link an amendment' },
			{ name: 'Terminate', value: 'terminate', action: 'Terminate a contract' },
		],
	},
	{
		...documentResourceLocator,
		displayOptions: { show: showOnly(['get', 'getRelated', 'renew', 'setTerms', 'terminate']) },
	},
	{ ...returnAllField, displayOptions: { show: showOnly(['list']) } },
	{ ...limitField, displayOptions: { show: { ...showOnly(['list']), returnAll: [false] } } },
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showOnly(['list']) },
		options: [
			{
				displayName: 'Counterparty',
				name: 'counterparty',
				type: 'string',
				default: '',
				description: 'Part of the counterparty name or its exact CPF/CNPJ',
			},
			{
				displayName: 'End Date From',
				name: 'end_date_from',
				type: 'string',
				default: '',
				placeholder: '2026-11-01',
				description: 'Contracts ending on or after this date (YYYY-MM-DD)',
			},
			{
				displayName: 'End Date To',
				name: 'end_date_to',
				type: 'string',
				default: '',
				placeholder: '2027-10-31',
				description: 'Contracts ending on or before this date (YYYY-MM-DD)',
			},
			{
				displayName: 'Ending Within Days',
				name: 'ending_within_days',
				type: 'number',
				default: 30,
				typeOptions: { minValue: 0, maxValue: 3650, numberPrecision: 0 },
				description:
					'Days from today in Brasília time, inclusive. Zero means today; add Status to restrict to active contracts.',
			},
			{
				displayName: 'Expand Document',
				name: 'expand',
				type: 'options',
				default: 'document',
				options: [{ name: 'Document', value: 'document' }],
				description: 'Include the document in each contract',
			},
			{
				displayName: 'External ID',
				name: 'external_id',
				type: 'string',
				default: '',
				description: 'ID of the contract in the external system',
			},
			{
				displayName: 'External System',
				name: 'external_system',
				type: 'string',
				default: '',
				placeholder: 'hubspot',
			},
			{ ...searchField, description: 'Part of the document name' },
			{
				displayName: 'Sort',
				name: 'sort',
				type: 'options',
				default: '-updated_at',
				options: [
					{ name: 'End Date (Ascending)', value: 'end_date' },
					{ name: 'End Date (Descending)', value: '-end_date' },
					{ name: 'Updated At (Ascending)', value: 'updated_at' },
					{ name: 'Updated At (Descending)', value: '-updated_at' },
				],
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'multiOptions',
				default: [],
				options: [
					{ name: 'Active', value: 'active' },
					{ name: 'Draft', value: 'draft' },
					{ name: 'Expired', value: 'expired' },
					{ name: 'Terminated', value: 'terminated' },
				],
				description: 'Match any selected contract status',
			},
		],
	},
	{
		displayName: 'Terms (JSON)',
		name: 'contractTerms',
		type: 'json',
		default: '{}',
		required: true,
		displayOptions: { show: showOnly(['setTerms']) },
		description:
			'Only supplied attributes change. Supports counterparty, value/currency, dates, renewal terms, owner_id, metadata and external_references. Use parent_document_id and relation_type to link an amendment. Null clears a term or removes it from a pending amendment. Send updated_at from Get to prevent overwriting concurrent changes. Requires a contract-tracking plan.',
	},
	{
		displayName: 'Renewal (JSON)',
		name: 'contractRenewal',
		type: 'json',
		default: '{}',
		required: true,
		displayOptions: { show: showOnly(['renew']) },
		description:
			'Send the current term from Get, or a new end_date (YYYY-MM-DD). Optional value (null clears it) and updated_at precondition. Renewing an expired contract reopens it; a terminated contract cannot be renewed.',
	},
	{
		displayName: 'Termination (JSON)',
		name: 'contractTermination',
		type: 'json',
		default: '{}',
		displayOptions: { show: showOnly(['terminate']) },
		description:
			'Optional reason (up to 500 characters) and updated_at precondition. Closes contract tracking and stops lifecycle alerts; it does not cancel the signing document.',
	},
];

export async function executeContract(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	if (!['get', 'getRelated', 'list', 'renew', 'setTerms', 'terminate'].includes(operation)) {
		throw new NodeOperationError(this.getNode(), `Unknown contract operation: ${operation}`, {
			itemIndex,
		});
	}
	if (operation === 'list') {
		const filters = cleanQs(this.getNodeParameter('filters', itemIndex, {}) as IDataObject);
		const statuses = parseStringList(filters.status);
		if (statuses.length) filters.status = statuses.join(',');
		const days = filters.ending_within_days;
		if (
			days !== undefined &&
			(typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > 3650)
		) {
			throw new NodeOperationError(
				this.getNode(),
				'Ending Within Days must be an integer from 0 to 3650',
				{ itemIndex },
			);
		}
		const accountId = await getAccountId(this);
		return executeListOperation(this, itemIndex, {
			path: `/accounts/${accountId}/contracts`,
			qs: filters,
		});
	}
	const documentId = extractRequiredId(this, 'documentId', 'Document ID', itemIndex);
	let body: IDataObject | undefined;
	if (operation === 'setTerms' || operation === 'renew' || operation === 'terminate') {
		const parameter =
			operation === 'setTerms'
				? 'contractTerms'
				: operation === 'renew'
					? 'contractRenewal'
					: 'contractTermination';
		const parsed = parseJsonParam(
			this,
			this.getNodeParameter(parameter, itemIndex, '{}'),
			'Contract body',
			itemIndex,
		);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new NodeOperationError(this.getNode(), 'Contract body must be a JSON object', {
				itemIndex,
			});
		}
		body = parsed as IDataObject;
		if (operation === 'setTerms' && Object.keys(body).length === 0) {
			throw new NodeOperationError(this.getNode(), 'At least one contract term is required', {
				itemIndex,
			});
		}
		if (
			operation === 'renew' &&
			!(typeof body.end_date === 'string' && body.end_date.trim()) &&
			!(typeof body.term === 'number' && Number.isInteger(body.term) && body.term >= 1)
		) {
			throw new NodeOperationError(
				this.getNode(),
				'Renewal requires the current term or a new end_date',
				{ itemIndex },
			);
		}
		if (
			operation === 'terminate' &&
			body.reason !== undefined &&
			body.reason !== null &&
			(typeof body.reason !== 'string' || [...body.reason].length > 500)
		) {
			throw new NodeOperationError(
				this.getNode(),
				'Termination reason must be text of at most 500 characters',
				{ itemIndex },
			);
		}
	}
	const accountId = await getAccountId(this);
	const suffix =
		operation === 'getRelated'
			? '/related'
			: operation === 'renew'
				? '/renew'
				: operation === 'terminate'
					? '/terminate'
					: '';
	return wrap(
		await assinafyApiRequest(this, {
			method: operation === 'setTerms' ? 'PUT' : body ? 'POST' : 'GET',
			path: `/accounts/${accountId}/documents/${documentId}/contract${suffix}`,
			body,
		}),
	);
}
