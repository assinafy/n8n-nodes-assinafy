import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { documentDescription, executeDocument } from './resources/document';
import { signerDescription, executeSigner } from './resources/signer';
import { assignmentDescription, executeAssignment } from './resources/assignment';
import { workspaceDescription, executeWorkspace } from './resources/workspace';
import { webhookDescription, executeWebhook } from './resources/webhook';
import { templateDescription, executeTemplate } from './resources/template';
import { fieldDescription, executeField } from './resources/field';
import { signerDocumentDescription, executeSignerDocument } from './resources/signerDocument';
import { authDescription, executeAuth } from './resources/auth';
import { getDocuments } from './listSearch/getDocuments';
import { getSigners } from './listSearch/getSigners';
import { getTemplates } from './listSearch/getTemplates';

export class Assinafy implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Assinafy',
		name: 'assinafy',
		icon: { light: 'file:../../icons/assinafy.svg', dark: 'file:../../icons/assinafy.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Manage Assinafy documents, signers, assignments, templates, workspaces and webhooks via the official REST API',
		defaults: {
			name: 'Assinafy',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'assinafyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'document',
			options: [
				{ name: 'Assignment', value: 'assignment' },
				{ name: 'Authentication', value: 'auth' },
				{ name: 'Document', value: 'document' },
				{ name: 'Field Definition', value: 'field' },
				{ name: 'Signer', value: 'signer' },
				{ name: 'Signer Document', value: 'signerDocument' },
				{ name: 'Template', value: 'template' },
				{ name: 'Webhook', value: 'webhook' },
				{ name: 'Workspace', value: 'workspace' },
			],
			},
			...documentDescription,
			...signerDescription,
			...assignmentDescription,
			...templateDescription,
			...workspaceDescription,
			...webhookDescription,
			...fieldDescription,
			...signerDocumentDescription,
			...authDescription,
		],
	};

	methods = {
		listSearch: {
			getDocuments,
			getSigners,
			getTemplates,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				let result: INodeExecutionData | INodeExecutionData[];

				switch (resource) {
					case 'document':
						result = await executeDocument.call(this, i, operation);
						break;
					case 'signer':
						result = await executeSigner.call(this, i, operation);
						break;
					case 'assignment':
						result = await executeAssignment.call(this, i, operation);
						break;
					case 'workspace':
						result = await executeWorkspace.call(this, i, operation);
						break;
				case 'template':
					result = await executeTemplate.call(this, i, operation);
					break;
				case 'webhook':
					result = await executeWebhook.call(this, i, operation);
					break;
				case 'field':
					result = await executeField.call(this, i, operation);
					break;
				case 'signerDocument':
					result = await executeSignerDocument.call(this, i, operation);
					break;
				case 'auth':
					result = await executeAuth.call(this, i, operation);
					break;
				default:
						throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`, {
							itemIndex: i,
						});
				}

				const asArray = Array.isArray(result) ? result : [result];
				for (const entry of asArray) {
					returnData.push({
						...entry,
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
