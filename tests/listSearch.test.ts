/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDocuments } from '../nodes/Assinafy/listSearch/getDocuments';
import { getSigners } from '../nodes/Assinafy/listSearch/getSigners';
import { getTags } from '../nodes/Assinafy/listSearch/getTags';
import { getTemplates } from '../nodes/Assinafy/listSearch/getTemplates';
import { makeCtx, lastAuth } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('listSearch pickers', () => {
	it('getDocuments queries the account documents with search + page', async () => {
		const { ctx, requests } = makeCtx(
			{},
			{ response: [{ id: 'd1', name: 'Contract', status: 'metadata_ready' }] },
		);
		const result = await getDocuments.call(ctx as any, 'contract');
		const req = lastAuth(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/documents`);
		expect(req.qs).toEqual({ page: 1, 'per-page': 50, search: 'contract' });
		expect(req.returnFullResponse).toBe(true);
		expect(result.results).toEqual([{ name: 'Contract (metadata_ready)', value: 'd1' }]);
		expect(result.paginationToken).toBeUndefined();
	});

	it('emits a pagination token when more pages remain', async () => {
		const { ctx } = makeCtx(
			{},
			{ response: [{ id: 'd1' }], headers: { 'x-pagination-page-count': '3' } },
		);
		const result = await getDocuments.call(ctx as any, undefined, '1');
		expect(result.paginationToken).toBe('2');
	});

	it('getSigners maps full_name and email into the label', async () => {
		const { ctx } = makeCtx(
			{},
			{ response: [{ id: 's1', full_name: 'Jane', email: 'jane@example.com' }] },
		);
		const result = await getSigners.call(ctx as any);
		expect(result.results).toEqual([{ name: 'Jane <jane@example.com>', value: 's1' }]);
	});

	it('getTags maps name and color', async () => {
		const { ctx } = makeCtx({}, { response: [{ id: 't1', name: 'Legal', color: 'ff0000' }] });
		const result = await getTags.call(ctx as any);
		expect(result.results).toEqual([{ name: 'Legal (ff0000)', value: 't1' }]);
	});

	it('getTemplates maps name and status', async () => {
		const { ctx } = makeCtx({}, { response: [{ id: 'tpl1', name: 'NDA', status: 'ready' }] });
		const result = await getTemplates.call(ctx as any);
		expect(result.results).toEqual([{ name: 'NDA (ready)', value: 'tpl1' }]);
	});
});
