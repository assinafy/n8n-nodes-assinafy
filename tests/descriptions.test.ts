/* eslint-disable @typescript-eslint/no-explicit-any */
import { documentDescription } from '../nodes/Assinafy/resources/document';
import { signerDescription } from '../nodes/Assinafy/resources/signer';
import { assignmentDescription } from '../nodes/Assinafy/resources/assignment';
import { workspaceDescription } from '../nodes/Assinafy/resources/workspace';
import { webhookDescription } from '../nodes/Assinafy/resources/webhook';
import { templateDescription } from '../nodes/Assinafy/resources/template';
import { fieldDescription } from '../nodes/Assinafy/resources/field';
import { signerDocumentDescription } from '../nodes/Assinafy/resources/signerDocument';
import { authDescription } from '../nodes/Assinafy/resources/auth';
import { tagDescription } from '../nodes/Assinafy/resources/tag';
import type { INodeProperties } from 'n8n-workflow';
import manifest from '../package.json';
import actionMetadata from '../nodes/Assinafy/Assinafy.node.json';
import triggerMetadata from '../nodes/AssinafyTrigger/AssinafyTrigger.node.json';

const getOperations = (description: INodeProperties[]): string[] => {
	const operationProp = description.find((p: any) => p.name === 'operation');
	if (!operationProp || !operationProp.options) return [];
	return operationProp.options.map((o: any) => o.value);
};

describe('Resource Descriptions', () => {
	it('keeps both node metadata versions aligned with the package', () => {
		expect(actionMetadata.nodeVersion).toBe(manifest.version);
		expect(triggerMetadata.nodeVersion).toBe(manifest.version);
	});

	describe('documentDescription', () => {
		it('should have operation property as first option selector', () => {
			const operationProp = documentDescription.find((p: any) => p.name === 'operation');
			expect(operationProp).toBeDefined();
			expect(operationProp!.type).toBe('options');
		});

		it('should have operation options', () => {
			const operations = getOperations(documentDescription);
			expect(operations.length).toBeGreaterThan(0);
		});

		it('should include all expected document operations', () => {
			const operations = getOperations(documentDescription);
			expect(operations).toEqual([
				'appendTags',
				'createFromTemplate',
				'delete',
				'detachTag',
				'download',
				'downloadPage',
				'downloadThumbnail',
				'estimateCostFromTemplate',
				'get',
				'getActivities',
				'getPublicInfo',
				'getSigningProgress',
				'list',
				'listStatuses',
				'listTags',
				'rename',
				'replaceTags',
				'search',
				'sendPublicToken',
				'upload',
				'verify',
				'waitUntilReady',
			]);
		});
	});

	describe('signerDescription', () => {
		it('should have operation property as first option selector', () => {
			const operationProp = signerDescription.find((p: any) => p.name === 'operation');
			expect(operationProp).toBeDefined();
			expect(operationProp!.type).toBe('options');
		});

		it('should have operation options', () => {
			const operations = getOperations(signerDescription);
			expect(operations.length).toBeGreaterThan(0);
		});

		it('should include all expected signer operations', () => {
			const operations = getOperations(signerDescription);
			expect(operations).toEqual([
				'acceptTerms',
				'confirmData',
				'create',
				'delete',
				'downloadSignature',
				'findByEmail',
				'get',
				'getSelf',
				'list',
				'update',
				'uploadSignature',
				'verifyCode',
			]);
		});
	});

	describe('assignmentDescription', () => {
		it('should have operation property as first option selector', () => {
			const operationProp = assignmentDescription.find((p: any) => p.name === 'operation');
			expect(operationProp).toBeDefined();
			expect(operationProp!.type).toBe('options');
		});

		it('should have operation options', () => {
			const operations = getOperations(assignmentDescription);
			expect(operations.length).toBeGreaterThan(0);
		});

		it('should include all expected assignment operations', () => {
			const operations = getOperations(assignmentDescription);
			expect(operations).toEqual([
				'create',
				'decline',
				'estimateCost',
				'estimateResendCost',
				'getSignPage',
				'list',
				'listWhatsapp',
				'resendNotification',
				'resetExpiration',
				'sign',
			]);
		});
	});

	describe('workspaceDescription', () => {
		it('should have operation property as first option selector', () => {
			const operationProp = workspaceDescription.find((p: any) => p.name === 'operation');
			expect(operationProp).toBeDefined();
			expect(operationProp!.type).toBe('options');
		});

		it('should have operation options', () => {
			const operations = getOperations(workspaceDescription);
			expect(operations.length).toBeGreaterThan(0);
		});

		it('should include all expected workspace operations', () => {
			const operations = getOperations(workspaceDescription);
			expect(operations).toEqual([
				'create',
				'delete',
				'deleteLogo',
				'downloadLogo',
				'get',
				'getAccountStats',
				'getCurrentUser',
				'getNotificationPreferences',
				'getTheme',
				'getUserStats',
				'list',
				'update',
				'updateNotificationPreferences',
				'uploadLogo',
			]);
		});
	});

	describe('webhookDescription', () => {
		it('should have operation property as first option selector', () => {
			const operationProp = webhookDescription.find((p: any) => p.name === 'operation');
			expect(operationProp).toBeDefined();
			expect(operationProp!.type).toBe('options');
		});

		it('should have operation options', () => {
			const operations = getOperations(webhookDescription);
			expect(operations.length).toBeGreaterThan(0);
		});

		it('should include all expected webhook operations', () => {
			const operations = getOperations(webhookDescription);
			expect(operations).toEqual([
				'get',
				'inactivate',
				'listDispatches',
				'listEventTypes',
				'register',
				'retryDispatch',
			]);
		});
	});

	describe('templateDescription', () => {
		it('should have operation property as first option selector', () => {
			const operationProp = templateDescription.find((p: any) => p.name === 'operation');
			expect(operationProp).toBeDefined();
			expect(operationProp!.type).toBe('options');
		});

		it('should have operation options', () => {
			const operations = getOperations(templateDescription);
			expect(operations.length).toBeGreaterThan(0);
		});

		it('should include list and get operations', () => {
			const operations = getOperations(templateDescription);
			expect(operations).toEqual(['get', 'list']);
		});

		it('wires the registered template list search into a resource locator', () => {
			const locator = templateDescription.find((property: any) => property.name === 'templateId');
			expect(locator?.type).toBe('resourceLocator');
			expect(locator?.modes?.[0]?.typeOptions?.searchListMethod).toBe('getTemplates');
		});
	});

	describe('tagDescription', () => {
		it('should cover workspace tag operations', () => {
			const operations = getOperations(tagDescription);
			expect(operations).toEqual(['create', 'delete', 'list', 'update']);
		});
	});

	describe('fieldDescription', () => {
		it('should cover field CRUD + validate + listTypes operations', () => {
			const operations = getOperations(fieldDescription);
			expect(operations).toEqual([
				'create',
				'delete',
				'get',
				'list',
				'listTypes',
				'update',
				'validate',
				'validateMultiple',
			]);
		});
	});

	describe('signerDocumentDescription', () => {
		it('should cover signer-side document operations', () => {
			const operations = getOperations(signerDocumentDescription);
			expect(operations).toEqual([
				'declineMultiple',
				'download',
				'getCurrent',
				'list',
				'search',
				'signMultiple',
			]);
		});

		it('scopes every access-code field to the signer-document resource', () => {
			const fields = signerDocumentDescription.filter(
				(property: any) => property.name === 'signerAccessCode',
			);
			expect(fields).toHaveLength(2);
			for (const field of fields) {
				expect((field.displayOptions?.show as any)?.resource).toEqual(['signerDocument']);
			}
		});
	});

	describe('authDescription', () => {
		it('should cover login + API key + password endpoints', () => {
			const operations = getOperations(authDescription);
			expect(operations).toEqual([
				'changePassword',
				'createApiKey',
				'deleteApiKey',
				'getApiKey',
				'linkSocialLogin',
				'login',
				'requestPasswordReset',
				'resetPassword',
				'socialLogin',
			]);
		});
	});
});
