import type { INodeProperties } from 'n8n-workflow';

/** `document` as a resourceLocator: list picker, by ID, or by URL. */
export const documentResourceLocator: INodeProperties = {
	displayName: 'Document',
	name: 'documentId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The Assinafy document to operate on',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			placeholder: 'Select a document…',
			typeOptions: {
				searchListMethod: 'getDocuments',
				searchable: true,
			},
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 9f0b1cb4-…',
			validation: [
				{
					type: 'regex',
					properties: {
						regex: '^[a-zA-Z0-9\\-]{8,}$',
						errorMessage: 'Not a valid Assinafy document ID',
					},
				},
			],
		},
		{
			displayName: 'By URL',
			name: 'url',
			type: 'string',
			placeholder: 'https://app.assinafy.com.br/documents/<id>',
			extractValue: {
				type: 'regex',
				regex: 'documents/([a-zA-Z0-9\\-]+)',
			},
			validation: [
				{
					type: 'regex',
					properties: {
						regex: 'documents/([a-zA-Z0-9\\-]+)',
						errorMessage: 'Not a valid Assinafy document URL',
					},
				},
			],
		},
	],
};

export const signerResourceLocator: INodeProperties = {
	displayName: 'Signer',
	name: 'signerId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The Assinafy signer to operate on',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			placeholder: 'Select a signer…',
			typeOptions: {
				searchListMethod: 'getSigners',
				searchable: true,
			},
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. b4f2c93e-…',
		},
	],
};

export const assignmentIdField: INodeProperties = {
	displayName: 'Assignment ID',
	name: 'assignmentId',
	type: 'string',
	default: '',
	required: true,
	description: 'ID of the assignment (returned by Create Assignment)',
};

export const workspaceIdField: INodeProperties = {
	displayName: 'Workspace ID',
	name: 'workspaceId',
	type: 'string',
	default: '',
	required: true,
	description: 'Workspace (account) ID. Leave blank in the credential to override per call.',
};

export const returnAllField: INodeProperties = {
	displayName: 'Return All',
	name: 'returnAll',
	type: 'boolean',
	default: false,
	description: 'Whether to return all results or only up to a given limit',
};

export const limitField: INodeProperties = {
	displayName: 'Limit',
	name: 'limit',
	type: 'number',
	typeOptions: { minValue: 1, maxValue: 100 },
	default: 50,
	description: 'Max number of results to return',
	displayOptions: {
		show: {
			returnAll: [false],
		},
	},
};

export const searchField: INodeProperties = {
	displayName: 'Search',
	name: 'search',
	type: 'string',
	default: '',
	description: 'Filter results by partial match on searchable fields (name, email, etc.)',
};

export const sortField: INodeProperties = {
	displayName: 'Sort',
	name: 'sort',
	type: 'string',
	default: '',
	placeholder: 'e.g. -created_at',
	description: 'Sort expression (prefix with `-` for descending)',
};
