/* eslint-disable @typescript-eslint/no-explicit-any */
import { Assinafy } from '../nodes/Assinafy/Assinafy.node';
import * as assignment from '../nodes/Assinafy/resources/assignment';
import * as auth from '../nodes/Assinafy/resources/auth';
import * as document from '../nodes/Assinafy/resources/document';
import * as field from '../nodes/Assinafy/resources/field';
import * as signer from '../nodes/Assinafy/resources/signer';
import * as signerDocument from '../nodes/Assinafy/resources/signerDocument';
import * as tag from '../nodes/Assinafy/resources/tag';
import * as template from '../nodes/Assinafy/resources/template';
import * as webhook from '../nodes/Assinafy/resources/webhook';
import * as workspace from '../nodes/Assinafy/resources/workspace';

function executeCtx(options: {
	resource: string;
	operations?: string[];
	itemCount?: number;
	continueOnFail?: boolean;
}) {
	const operations = options.operations ?? ['operation-under-test'];
	const itemCount = options.itemCount ?? operations.length;
	return {
		getInputData: jest.fn(() =>
			Array.from({ length: itemCount }, (_, index) => ({ json: { inputIndex: index } })),
		),
		getNodeParameter: jest.fn((name: string, itemIndex: number) => {
			if (name === 'resource') return options.resource;
			if (name === 'operation') return operations[itemIndex];
			throw new Error(`Unexpected parameter ${name}`);
		}),
		continueOnFail: jest.fn(() => options.continueOnFail ?? false),
		getNode: jest.fn(() => ({ name: 'Assinafy' })),
	} as any;
}

describe('Assinafy top-level dispatch', () => {
	afterEach(() => jest.restoreAllMocks());

	it.each([
		['assignment', assignment, 'executeAssignment'],
		['auth', auth, 'executeAuth'],
		['document', document, 'executeDocument'],
		['field', field, 'executeField'],
		['signer', signer, 'executeSigner'],
		['signerDocument', signerDocument, 'executeSignerDocument'],
		['tag', tag, 'executeTag'],
		['template', template, 'executeTemplate'],
		['webhook', webhook, 'executeWebhook'],
		['workspace', workspace, 'executeWorkspace'],
	] as const)('dispatches the %s resource to its executor', async (resource, module, method) => {
		const executor = jest.spyOn(module as any, method as any) as jest.SpyInstance;
		executor.mockResolvedValue({ json: { resource, dispatched: true } });
		const context = executeCtx({ resource });

		const result = await new Assinafy().execute.call(context);

		expect(executor).toHaveBeenCalledTimes(1);
		expect(executor).toHaveBeenCalledWith(0, 'operation-under-test');
		expect(result).toEqual([[{ json: { resource, dispatched: true }, pairedItem: { item: 0 } }]]);
	});

	it('preserves input pairing for every output from every input item', async () => {
		jest
			.spyOn(document, 'executeDocument')
			.mockResolvedValueOnce({ json: { output: 'first' }, pairedItem: { item: 999 } })
			.mockResolvedValueOnce([
				{ json: { output: 'second-a' } },
				{ json: { output: 'second-b' }, pairedItem: { item: 999 } },
			]);
		const context = executeCtx({
			resource: 'document',
			operations: ['get', 'list'],
			itemCount: 2,
		});

		const result = await new Assinafy().execute.call(context);

		expect(result[0]).toEqual([
			{ json: { output: 'first' }, pairedItem: { item: 0 } },
			{ json: { output: 'second-a' }, pairedItem: { item: 1 } },
			{ json: { output: 'second-b' }, pairedItem: { item: 1 } },
		]);
	});

	it('emits an item-scoped error and continues when Continue On Fail is enabled', async () => {
		jest
			.spyOn(document, 'executeDocument')
			.mockRejectedValueOnce(new Error('first item failed'))
			.mockResolvedValueOnce({ json: { output: 'second' } });
		const context = executeCtx({
			resource: 'document',
			operations: ['get', 'get'],
			itemCount: 2,
			continueOnFail: true,
		});

		const result = await new Assinafy().execute.call(context);

		expect(result[0]).toEqual([
			{ json: { error: 'first item failed' }, pairedItem: { item: 0 } },
			{ json: { output: 'second' }, pairedItem: { item: 1 } },
		]);
	});

	it('fails fast when Continue On Fail is disabled', async () => {
		const executor = jest
			.spyOn(document, 'executeDocument')
			.mockRejectedValue(new Error('request failed'));
		const context = executeCtx({ resource: 'document', continueOnFail: false });

		await expect(new Assinafy().execute.call(context)).rejects.toThrow('request failed');
		expect(executor).toHaveBeenCalledTimes(1);
	});

	it('reports an unknown resource with the failing item index', async () => {
		const context = executeCtx({ resource: 'not-a-resource' });

		await expect(new Assinafy().execute.call(context)).rejects.toThrow(
			'Unknown resource: not-a-resource',
		);
	});
});
