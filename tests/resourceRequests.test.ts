/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeAssignment } from '../nodes/Assinafy/resources/assignment';
import { executeDocument } from '../nodes/Assinafy/resources/document';
import { executeTag } from '../nodes/Assinafy/resources/tag';

const credentials = {
	accountId: 'acc_123',
	baseUrl: 'https://api.assinafy.com.br/v1',
};

function createMockContext(params: Record<string, unknown>, response: unknown = { id: 'ok' }) {
	const httpRequestWithAuthentication = jest
		.fn()
		.mockResolvedValue({ status: 200, data: response });
	const httpRequest = jest.fn().mockResolvedValue({ status: 200, data: response });

	const ctx = {
		getCredentials: jest.fn().mockResolvedValue(credentials),
		getNode: jest.fn().mockReturnValue({ name: 'Assinafy' }),
		getNodeParameter: jest.fn((name: string, _itemIndex: number, defaultValue?: unknown) =>
			name in params ? params[name] : defaultValue,
		),
		helpers: {
			httpRequestWithAuthentication,
			httpRequest,
		},
	};

	return { ctx, httpRequestWithAuthentication, httpRequest };
}

function lastAuthenticatedRequest(httpRequestWithAuthentication: jest.Mock) {
	const calls = httpRequestWithAuthentication.mock.calls;
	return calls[calls.length - 1][1];
}

describe('resource request construction', () => {
	it('creates tags with normalized colors', async () => {
		const { ctx, httpRequestWithAuthentication } = createMockContext({
			name: 'Contracts',
			color: '#FF8800',
		});

		await executeTag.call(ctx as any, 0, 'create');

		const request = lastAuthenticatedRequest(httpRequestWithAuthentication);
		expect(request.method).toBe('POST');
		expect(request.url).toBe('https://api.assinafy.com.br/v1/accounts/acc_123/tags');
		expect(request.body).toEqual({ name: 'Contracts', color: 'ff8800' });
	});

	it('deletes tags with the force query parameter when requested', async () => {
		const { ctx, httpRequestWithAuthentication } = createMockContext({
			tagId: 'tag_123',
			force: true,
		});

		await executeTag.call(ctx as any, 0, 'delete');

		const request = lastAuthenticatedRequest(httpRequestWithAuthentication);
		expect(request.method).toBe('DELETE');
		expect(request.url).toBe('https://api.assinafy.com.br/v1/accounts/acc_123/tags/tag_123');
		expect(request.qs).toEqual({ force: true });
	});

	it('preserves commas in document tag names', async () => {
		const { ctx, httpRequestWithAuthentication } = createMockContext({
			documentId: 'doc_123',
			tagNames: ['ACME, Inc.', 'Renewal'],
		});

		await executeDocument.call(ctx as any, 0, 'appendTags');

		const request = lastAuthenticatedRequest(httpRequestWithAuthentication);
		expect(request.method).toBe('POST');
		expect(request.url).toBe(
			'https://api.assinafy.com.br/v1/accounts/acc_123/documents/doc_123/tags',
		);
		expect(request.body).toEqual({ tags: ['ACME, Inc.', 'Renewal'] });
	});

	it('normalizes document tag filters to the documented comma-separated query value', async () => {
		const { ctx, httpRequestWithAuthentication } = createMockContext(
			{
				returnAll: false,
				limit: 10,
				filters: { status: 'pending_signature', tags: ['tag_1', 'tag_2'] },
			},
			[{ id: 'doc_123' }],
		);

		await executeDocument.call(ctx as any, 0, 'list');

		const request = lastAuthenticatedRequest(httpRequestWithAuthentication);
		expect(request.method).toBe('GET');
		expect(request.qs).toEqual({
			status: 'pending_signature',
			tags: 'tag_1,tag_2',
			'per-page': 10,
		});
	});

	it('includes sequential signing steps in assignment creation payloads', async () => {
		const { ctx, httpRequestWithAuthentication } = createMockContext({
			documentId: 'doc_123',
			method: 'virtual',
			signers: {
				signer: [
					{
						id: 'signer_1',
						verification_method: 'Email',
						notification_methods: ['Email'],
						step: 1,
					},
					{
						id: 'signer_2',
						verification_method: 'Whatsapp',
						notification_methods: ['Whatsapp'],
						step: 2,
					},
				],
			},
			additionalFields: {},
		});

		await executeAssignment.call(ctx as any, 0, 'create');

		const request = lastAuthenticatedRequest(httpRequestWithAuthentication);
		expect(request.method).toBe('POST');
		expect(request.url).toBe('https://api.assinafy.com.br/v1/documents/doc_123/assignments');
		expect(request.body.signers).toEqual([
			{ id: 'signer_1', verification_method: 'Email', notification_methods: ['Email'], step: 1 },
			{
				id: 'signer_2',
				verification_method: 'Whatsapp',
				notification_methods: ['Whatsapp'],
				step: 2,
			},
		]);
	});
});
