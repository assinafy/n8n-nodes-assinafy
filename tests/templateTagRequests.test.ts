import { executeTag } from '../nodes/Assinafy/resources/tag';
import { executeTemplate } from '../nodes/Assinafy/resources/template';
import { lastAuth, makeCtx } from './helpers';

describe('template request construction', () => {
	it('lists workspace templates with normalized filters and a bounded page size', async () => {
		const { ctx, requests } = makeCtx(
			{
				returnAll: false,
				limit: 25,
				filters: {
					search: 'NDA',
					status: 'ready',
					tags: ['tag_1, tag_2'],
					sort: '-created_at',
				},
			},
			{ response: [{ id: 'template_1', name: 'NDA' }] },
		);

		const result = await executeTemplate.call(ctx, 0, 'list');

		expect(result).toEqual([{ json: { id: 'template_1', name: 'NDA' } }]);
		expect(lastAuth(requests)).toMatchObject({
			method: 'GET',
			url: 'https://api.assinafy.com.br/v1/accounts/acc_123/templates',
			qs: {
				search: 'NDA',
				status: 'ready',
				tags: 'tag_1,tag_2',
				sort: '-created_at',
				'per-page': 25,
			},
		});
	});

	it('gets a workspace template by ID', async () => {
		const { ctx, requests } = makeCtx(
			{ templateId: 'template_123' },
			{ response: { id: 'template_123', name: 'NDA' } },
		);

		const result = await executeTemplate.call(ctx, 0, 'get');

		expect(result).toEqual({ json: { id: 'template_123', name: 'NDA' } });
		expect(lastAuth(requests)).toMatchObject({
			method: 'GET',
			url: 'https://api.assinafy.com.br/v1/accounts/acc_123/templates/template_123',
		});
	});
});

describe('tag request construction', () => {
	it('lists workspace tags with search and page-size parameters', async () => {
		const { ctx, requests } = makeCtx(
			{ returnAll: false, limit: 10, filters: { search: 'Legal' } },
			{ response: [{ id: 'tag_1', name: 'Legal' }] },
		);

		const result = await executeTag.call(ctx, 0, 'list');

		expect(result).toEqual([{ json: { id: 'tag_1', name: 'Legal' } }]);
		expect(lastAuth(requests)).toMatchObject({
			method: 'GET',
			url: 'https://api.assinafy.com.br/v1/accounts/acc_123/tags',
			qs: { search: 'Legal', 'per-page': 10 },
		});
	});

	it('updates only the selected tag fields and normalizes its color', async () => {
		const { ctx, requests } = makeCtx({
			tagId: 'tag_123',
			updateFields: { name: '  Contracts  ', color: '#AABBCC', clearColor: false },
		});

		await executeTag.call(ctx, 0, 'update');

		expect(lastAuth(requests)).toMatchObject({
			method: 'PUT',
			url: 'https://api.assinafy.com.br/v1/accounts/acc_123/tags/tag_123',
			body: { name: 'Contracts', color: 'aabbcc' },
		});
	});

	it('sends null to explicitly clear a tag color', async () => {
		const { ctx, requests } = makeCtx({
			tagId: 'tag_123',
			updateFields: { clearColor: true },
		});

		await executeTag.call(ctx, 0, 'update');

		expect(lastAuth(requests).body).toEqual({ color: null });
	});
});
