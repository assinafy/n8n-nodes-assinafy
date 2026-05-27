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

const getOperations = (description: INodeProperties[]): string[] => {
	const operationProp = description.find((p: any) => p.name === 'operation');
	if (!operationProp || !operationProp.options) return [];
	return operationProp.options.map((o: any) => o.value);
};

describe('Resource Descriptions', () => {
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
			expect(operations).toContain('upload');
			expect(operations).toContain('list');
			expect(operations).toContain('get');
			expect(operations).toContain('delete');
			expect(operations).toContain('download');
			expect(operations).toContain('listTags');
			expect(operations).toContain('replaceTags');
			expect(operations).toContain('appendTags');
			expect(operations).toContain('detachTag');
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
			expect(operations).toContain('create');
			expect(operations).toContain('list');
			expect(operations).toContain('get');
			expect(operations).toContain('update');
			expect(operations).toContain('delete');
			expect(operations).toContain('findByEmail');
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

		it('should include create and estimateCost operations', () => {
			const operations = getOperations(assignmentDescription);
			expect(operations).toContain('create');
			expect(operations).toContain('estimateCost');
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
			expect(operations).toContain('create');
			expect(operations).toContain('list');
			expect(operations).toContain('get');
			expect(operations).toContain('update');
			expect(operations).toContain('delete');
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

		it('should include register and list operations', () => {
			const operations = getOperations(webhookDescription);
			expect(operations).toContain('register');
			expect(operations).toContain('listDispatches');
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
			expect(operations).toContain('list');
			expect(operations).toContain('get');
		});
	});

	describe('tagDescription', () => {
		it('should cover workspace tag operations', () => {
			const operations = getOperations(tagDescription);
			for (const op of ['create', 'list', 'update', 'delete']) {
				expect(operations).toContain(op);
			}
		});
	});

	describe('fieldDescription', () => {
		it('should cover field CRUD + validate + listTypes operations', () => {
			const operations = getOperations(fieldDescription);
			for (const op of [
				'create',
				'list',
				'get',
				'update',
				'delete',
				'validate',
				'validateMultiple',
				'listTypes',
			]) {
				expect(operations).toContain(op);
			}
		});
	});

	describe('signerDocumentDescription', () => {
		it('should cover signer-side document operations', () => {
			const operations = getOperations(signerDocumentDescription);
			for (const op of ['getCurrent', 'list', 'signMultiple', 'declineMultiple', 'download']) {
				expect(operations).toContain(op);
			}
		});
	});

	describe('authDescription', () => {
		it('should cover login + API key + password endpoints', () => {
			const operations = getOperations(authDescription);
			for (const op of [
				'login',
				'socialLogin',
				'createApiKey',
				'getApiKey',
				'deleteApiKey',
				'changePassword',
				'requestPasswordReset',
				'resetPassword',
			]) {
				expect(operations).toContain(op);
			}
		});
	});

	describe('newly added document operations', () => {
		it('should cover getPublicInfo, sendPublicToken, listStatuses', () => {
			const operations = getOperations(documentDescription);
			expect(operations).toContain('getPublicInfo');
			expect(operations).toContain('sendPublicToken');
			expect(operations).toContain('listStatuses');
		});
	});

	describe('newly added assignment operations', () => {
		it('should cover sign, decline, getSignPage, listWhatsapp', () => {
			const operations = getOperations(assignmentDescription);
			expect(operations).toContain('sign');
			expect(operations).toContain('decline');
			expect(operations).toContain('getSignPage');
			expect(operations).toContain('listWhatsapp');
		});
	});

	describe('newly added signer operations', () => {
		it('should cover the six signer-side ops', () => {
			const operations = getOperations(signerDescription);
			for (const op of [
				'getSelf',
				'acceptTerms',
				'verifyCode',
				'confirmData',
				'uploadSignature',
				'downloadSignature',
			]) {
				expect(operations).toContain(op);
			}
		});
	});
});
