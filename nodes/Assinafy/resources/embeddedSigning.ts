import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	assinafyApiRequest,
	DELEGATED_CREDENTIAL_TYPE,
	getAccountId,
	getCredentialsType,
} from '../shared/transport';
import {
	assignmentIdField,
	documentResourceLocator,
	signerResourceLocator,
} from '../shared/descriptions';
import { asArray, extractRequiredId, showOnly as showOnlyFor, wrap } from '../shared/utils';

const showOnly = showOnlyFor('embeddedSigning');
export const embeddedSigningDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['embeddedSigning'] } },
		default: 'listOrigins',
		options: [
			{ name: 'Add Origin', value: 'addOrigin', action: 'Allow an origin to embed signing pages' },
			{
				name: 'Create Session',
				value: 'createSession',
				action: 'Create a single use embed session',
			},
			{ name: 'List Origins', value: 'listOrigins', action: 'List allowed embed origins' },
			{ name: 'Remove Origin', value: 'removeOrigin', action: 'Remove an allowed embed origin' },
			{ name: 'Update Origin', value: 'updateOrigin', action: 'Replace an allowed embed origin' },
		],
	},
	{
		displayName: 'Origin ID',
		name: 'originId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnly(['updateOrigin', 'removeOrigin']) },
	},
	{
		displayName: 'Origin',
		name: 'origin',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://app.example.com',
		description:
			'Exact scheme://host[:port], with no path, credentials, query, fragment or wildcard. HTTPS is required except HTTP localhost and 127.0.0.1.',
		displayOptions: { show: showOnly(['addOrigin', 'updateOrigin']) },
	},
	{ ...documentResourceLocator, displayOptions: { show: showOnly(['createSession']) } },
	{ ...assignmentIdField, displayOptions: { show: showOnly(['createSession']) } },
	{ ...signerResourceLocator, displayOptions: { show: showOnly(['createSession']) } },
	{
		displayName:
			'The signer must have embedded enabled. Load the returned secret URL in an iframe within five minutes; opening it spends the token. Create a fresh session each time.',
		name: 'embedNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnly(['createSession']) },
	},
];

export async function executeEmbeddedSigning(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData | INodeExecutionData[]> {
	if (operation === 'createSession') {
		const documentId = extractRequiredId(this, 'documentId', 'Document ID', itemIndex);
		const assignmentId = extractRequiredId(this, 'assignmentId', 'Assignment ID', itemIndex);
		const signerId = extractRequiredId(this, 'signerId', 'Signer ID', itemIndex);
		return wrap(
			await assinafyApiRequest(this, {
				method: 'POST',
				path: `/documents/${documentId}/assignments/${assignmentId}/signers/${signerId}/embed-sessions`,
				retry: false,
			}),
		);
	}
	if (!['listOrigins', 'addOrigin', 'updateOrigin', 'removeOrigin'].includes(operation)) {
		throw new NodeOperationError(
			this.getNode(),
			`Unknown embedded signing operation: ${operation}`,
			{ itemIndex },
		);
	}
	if (getCredentialsType(this) === DELEGATED_CREDENTIAL_TYPE) {
		throw new NodeOperationError(
			this.getNode(),
			'Embed origins are not available to OAuth applications; use API Key authentication',
			{ itemIndex },
		);
	}
	const accountId = await getAccountId(this);
	let path = `/accounts/${accountId}/embed-origins`;
	if (operation === 'updateOrigin' || operation === 'removeOrigin')
		path += `/${extractRequiredId(this, 'originId', 'Origin ID', itemIndex)}`;
	let body: IDataObject | undefined;
	if (operation === 'addOrigin' || operation === 'updateOrigin') {
		const origin = String(this.getNodeParameter('origin', itemIndex, '')).trim();
		if (!origin) throw new NodeOperationError(this.getNode(), 'Origin is required', { itemIndex });
		body = { origin };
	}
	const result = await assinafyApiRequest(this, {
		method:
			operation === 'listOrigins'
				? 'GET'
				: operation === 'addOrigin'
					? 'POST'
					: operation === 'updateOrigin'
						? 'PUT'
						: 'DELETE',
		path,
		body,
	});
	return operation === 'listOrigins'
		? asArray<IDataObject>(result).map((json) => ({ json }))
		: wrap(result);
}
