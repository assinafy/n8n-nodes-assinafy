import { executeContract } from '../nodes/Assinafy/resources/contract';
import { Assinafy } from '../nodes/Assinafy/Assinafy.node';
import { lastAuth, makeCtx } from './helpers';

describe('Contract requests', () => {
	it.each([
		['get', ''],
		['getRelated', '/related'],
	])('reads %s and preserves its response', async (operation, suffix) => {
		const response = {
			resource: 'document_contract',
			document_id: 'doc/id',
			amendments: [{ status: 'pending', terms: { value: 0 } }],
		};
		const { ctx, requests } = makeCtx({ documentId: { value: 'doc/id' } }, { response });
		expect(await executeContract.call(ctx, 0, operation)).toEqual({ json: response });
		expect(lastAuth(requests)).toMatchObject({
			method: 'GET',
			url: `https://api.assinafy.com.br/v1/accounts/acc_123/documents/doc%2Fid/contract${suffix}`,
		});
		expect(lastAuth(requests).body).toBeUndefined();
	});

	it('preserves the full partial update, explicit clears, zero and false', async () => {
		const body = {
			status: 'active',
			counterparty_name: 'Example Company',
			counterparty_taxpayer_id: null,
			value: 0,
			currency: 'BRL',
			start_date: '2026-11-01',
			end_date: null,
			auto_renew: false,
			renewal_term_months: 12,
			notice_period_days: 0,
			owner_id: null,
			metadata: { crm_stage: 'won' },
			external_references: [],
			updated_at: '2026-10-23T12:00:00Z',
		};
		const { ctx, requests } = makeCtx({ documentId: 'doc-1', contractTerms: JSON.stringify(body) });
		await executeContract.call(ctx, 0, 'setTerms');
		expect(lastAuth(requests)).toMatchObject({ method: 'PUT', json: true, body });
	});

	it.each([
		{ parent_document_id: 'root-1', relation_type: 'amendment', value: 0 },
		{ parent_document_id: 'root-1', relation_type: 'renewal', end_date: '2028-10-31' },
		{ parent_document_id: 'root-1', relation_type: 'termination', end_date: '2027-10-31' },
		{ parent_document_id: null },
		{ value: null, updated_at: '2026-10-23T12:00:00Z' },
	])('passes amendment links, deltas and unlinking intact: %j', async (body) => {
		const { ctx, requests } = makeCtx({ documentId: 'instrument-1', contractTerms: body });
		await executeContract.call(ctx, 0, 'setTerms');
		expect(lastAuth(requests).body).toEqual(body);
	});

	it.each([
		{ term: 1, value: null },
		{ end_date: '2028-10-31', value: 0 },
		{ term: 2, end_date: null, updated_at: '2026-10-23T12:00:00Z' },
	])('renews with explicit replay protection: %j', async (body) => {
		const { ctx, requests } = makeCtx({ documentId: 'doc-1', contractRenewal: body });
		await executeContract.call(ctx, 0, 'renew');
		expect(lastAuth(requests)).toMatchObject({
			method: 'POST',
			url: expect.stringMatching(/\/contract\/renew$/),
			body,
		});
	});

	it.each([{}, { reason: null }, { reason: '🙂'.repeat(500), updated_at: '2026-10-23T12:00:00Z' }])(
		'terminates with optional fields: %j',
		async (body) => {
			const { ctx, requests } = makeCtx({ documentId: 'doc-1', contractTermination: body });
			await executeContract.call(ctx, 0, 'terminate');
			expect(lastAuth(requests)).toMatchObject({
				method: 'POST',
				url: expect.stringMatching(/\/contract\/terminate$/),
				body,
			});
		},
	);

	it('lists filtered contracts with zero-day horizon and pairs each result', async () => {
		const filters = {
			status: ['active', 'expired'],
			counterparty: 'Example',
			search: 'Service',
			end_date_from: '2026-11-01',
			end_date_to: '2027-10-31',
			ending_within_days: 0,
			external_system: 'crm',
			external_id: 'deal-1',
			sort: 'end_date',
			expand: 'document',
		};
		const { ctx, requests } = makeCtx(
			{ resource: 'contract', operation: 'list', filters, returnAll: false, limit: 2 },
			{ response: [{ document_id: 'doc-1' }, { document_id: 'doc-2' }] },
		);
		expect(await new Assinafy().execute.call(ctx)).toEqual([
			[
				{ json: { document_id: 'doc-1' }, pairedItem: { item: 0 } },
				{ json: { document_id: 'doc-2' }, pairedItem: { item: 0 } },
			],
		]);
		expect(lastAuth(requests)).toMatchObject({
			method: 'GET',
			url: expect.stringMatching(/\/accounts\/acc_123\/contracts$/),
			qs: { ...filters, status: 'active,expired', 'per-page': 2 },
		});
	});

	it('paginates with the shared transport and no empty status filter', async () => {
		const { ctx, requests, httpRequestWithAuthentication } = makeCtx({
			returnAll: true,
			filters: { status: [] },
		});
		httpRequestWithAuthentication.mockImplementation(async (_type, options) => {
			requests.push({ auth: true, options });
			return {
				body: { status: 200, data: [{ document_id: `doc-${options.qs.page}` }] },
				headers: { 'X-Pagination-Page-Count': '2' },
			};
		});
		expect(await executeContract.call(ctx, 0, 'list')).toEqual([
			{ json: { document_id: 'doc-1' } },
			{ json: { document_id: 'doc-2' } },
		]);
		expect(requests.map(({ options }) => options.qs)).toEqual([
			{ page: 1, 'per-page': 100 },
			{ page: 2, 'per-page': 100 },
		]);
	});

	it('uses native OAuth and encoded workspace discovery', async () => {
		const { ctx, httpRequestWithAuthentication } = makeCtx(
			{ authentication: 'oAuth2', documentId: 'doc-1' },
			{ credentials: { accountId: '' } },
		);
		httpRequestWithAuthentication
			.mockResolvedValueOnce({ status: 200, data: [{ id: 'acc/id' }] })
			.mockResolvedValueOnce({ status: 200, data: { document_id: 'doc-1' } });
		await executeContract.call(ctx, 0, 'get');
		expect(httpRequestWithAuthentication).toHaveBeenLastCalledWith(
			'assinafyOAuth2Api',
			expect.objectContaining({
				url: 'https://api.assinafy.com.br/v1/accounts/acc%2Fid/documents/doc-1/contract',
			}),
		);
	});

	it.each([
		['setTerms', 'contractTerms', '{}', 'At least one'],
		['setTerms', 'contractTerms', 'not json', 'valid JSON'],
		['setTerms', 'contractTerms', '[]', 'JSON object'],
		['setTerms', 'contractTerms', 'null', 'JSON object'],
		['setTerms', 'contractTerms', 'true', 'JSON object'],
		['renew', 'contractRenewal', {}, 'current term'],
		['renew', 'contractRenewal', { term: 0 }, 'current term'],
		['renew', 'contractRenewal', { term: 1.5 }, 'current term'],
		['renew', 'contractRenewal', { end_date: ' ' }, 'current term'],
		['terminate', 'contractTermination', { reason: 1 }, 'at most 500'],
		['terminate', 'contractTermination', { reason: '🙂'.repeat(501) }, 'at most 500'],
	])('rejects invalid %s body before requesting', async (operation, parameter, body, message) => {
		const { ctx, requests } = makeCtx({ documentId: 'doc-1', [String(parameter)]: body });
		await expect(executeContract.call(ctx, 0, String(operation))).rejects.toThrow(String(message));
		expect(requests).toHaveLength(0);
	});

	it.each([-1, 3651, 1.5, '0'])('rejects invalid ending horizon %s', async (days) => {
		const { ctx, requests } = makeCtx({ filters: { ending_within_days: days } });
		await expect(executeContract.call(ctx, 0, 'list')).rejects.toThrow('0 to 3650');
		expect(requests).toHaveLength(0);
	});

	it.each([400, 403, 404, 409, 500])(
		'propagates %s without replaying a mutation',
		async (statusCode) => {
			const { ctx, httpRequestWithAuthentication } = makeCtx(
				{ documentId: 'doc-1', contractTerms: { value: 0 } },
				{ rejectWith: { statusCode, message: 'Contract write refused' } },
			);
			await expect(executeContract.call(ctx, 0, 'setTerms')).rejects.toThrow();
			expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		},
	);

	it('rejects unknown operations and missing document IDs', async () => {
		const { ctx, requests } = makeCtx({ documentId: '' });
		await expect(executeContract.call(ctx, 0, 'unknown')).rejects.toThrow(
			'Unknown contract operation',
		);
		await expect(executeContract.call(ctx, 0, 'get')).rejects.toThrow('Document ID');
		expect(requests).toHaveLength(0);
	});
});
