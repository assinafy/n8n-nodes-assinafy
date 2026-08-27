/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	assinafyApiRequest,
	assinafyApiRequestAllItems,
	CREDENTIALS_TYPE,
	getAccountId,
	getBaseUrl,
	unwrapEnvelope,
} from '../nodes/Assinafy/shared/transport';
import { DEFAULT_BASE_URL } from '../nodes/Assinafy/shared/baseUrl';

const createMockContext = (credentials: Record<string, unknown>) => ({
	getCredentials: jest.fn().mockResolvedValue(credentials),
	getNode: jest.fn().mockReturnValue({ name: 'TestNode' }),
});

describe('shared/transport', () => {
	describe('getBaseUrl', () => {
		it('should return production URL by default', async () => {
			const ctx = createMockContext({ environment: 'production', baseUrl: '' });
			await expect(getBaseUrl(ctx as any)).resolves.toBe('https://api.assinafy.com.br/v1');
		});

		it('should return sandbox URL for sandbox environment', async () => {
			const ctx = createMockContext({ environment: 'sandbox' });
			await expect(getBaseUrl(ctx as any)).resolves.toBe('https://sandbox.assinafy.com.br/v1');
		});

		it('should return custom URL when environment is custom', async () => {
			const ctx = createMockContext({
				environment: 'custom',
				customBaseUrl: 'https://custom.api.com/v1',
			});
			await expect(getBaseUrl(ctx as any)).resolves.toBe('https://custom.api.com/v1');
		});

		it('should reject a blank URL when Custom is explicitly selected', async () => {
			const ctx = createMockContext({ environment: 'custom', customBaseUrl: '' });
			await expect(getBaseUrl(ctx as any)).rejects.toThrow('valid absolute URL');
		});

		it('should strip trailing slash from custom URL', async () => {
			const ctx = createMockContext({
				environment: 'custom',
				customBaseUrl: 'https://custom.api.com/v1/',
			});
			await expect(getBaseUrl(ctx as any)).resolves.toBe('https://custom.api.com/v1');
		});

		it('should use baseUrl when explicitly set', async () => {
			const ctx = createMockContext({ baseUrl: 'https://explicit.api.com/v1' });
			await expect(getBaseUrl(ctx as any)).resolves.toBe('https://explicit.api.com/v1');
		});

		it('should default to production URL when no environment specified', async () => {
			const ctx = createMockContext({});
			await expect(getBaseUrl(ctx as any)).resolves.toBe(DEFAULT_BASE_URL);
		});

		it('should allow public operations to use production without configured credentials', async () => {
			const ctx = {
				getCredentials: jest.fn().mockRejectedValue({ message: 'Credentials not found' }),
				getNode: jest.fn().mockReturnValue({ name: 'TestNode' }),
			};
			await expect(getBaseUrl(ctx as any, true)).resolves.toBe(DEFAULT_BASE_URL);
			await expect(getBaseUrl(ctx as any)).rejects.toThrow(
				'Assinafy credentials are required for this operation',
			);
		});

		it('does not fall back to production when selected credentials fail to load', async () => {
			const ctx = {
				getCredentials: jest.fn().mockRejectedValue({ message: 'Credential decryption failed' }),
				getNode: jest.fn().mockReturnValue({
					name: 'TestNode',
					credentials: { assinafyApi: { id: 'cred_1', name: 'Sandbox' } },
				}),
			};

			await expect(getBaseUrl(ctx as any, true)).rejects.toThrow(
				'Selected Assinafy credentials could not be loaded',
			);
		});

		it('should reject non-HTTPS remote custom URLs', async () => {
			const ctx = createMockContext({
				environment: 'custom',
				customBaseUrl: 'http://custom.api.com/v1',
			});
			await expect(getBaseUrl(ctx as any)).rejects.toThrow('must use HTTPS');
		});

		it('should allow an HTTP loopback URL for local development', async () => {
			const ctx = createMockContext({
				environment: 'custom',
				customBaseUrl: 'http://127.0.0.1:3000/v1/',
			});
			await expect(getBaseUrl(ctx as any)).resolves.toBe('http://127.0.0.1:3000/v1');
		});

		it.each([
			['https://user:password@api.example.com/v1', 'embedded credentials'],
			['https://custom.api.com/v1?target=other', 'query string or fragment'],
			['https://custom.api.com/v1#fragment', 'query string or fragment'],
			['https://custom.api.com/api', 'include the /v1 API path'],
		])('should reject an ambiguous custom URL: %s', async (customBaseUrl, message) => {
			const ctx = createMockContext({ environment: 'custom', customBaseUrl });
			await expect(getBaseUrl(ctx as any)).rejects.toThrow(message);
		});
	});

	describe('requests and pagination', () => {
		function requestContext(authenticatedRequest: jest.Mock) {
			return {
				getCredentials: jest.fn().mockResolvedValue({ baseUrl: DEFAULT_BASE_URL }),
				getNode: jest.fn().mockReturnValue({ name: 'TestNode' }),
				helpers: {
					httpRequestWithAuthentication: authenticatedRequest,
					httpRequest: jest.fn(),
				},
			};
		}

		it('unwraps an authenticated response and retries a transient 429', async () => {
			const rateLimitError = {
				httpCode: 429,
				response: { headers: { 'retry-after': '0' } },
			};
			const request = jest
				.fn()
				.mockRejectedValueOnce(rateLimitError)
				.mockResolvedValue({ status: 200, data: { id: 'doc_1' } });
			const ctx = requestContext(request);

			await expect(
				assinafyApiRequest(ctx as any, { method: 'GET', path: '/documents/doc_1' }),
			).resolves.toEqual({ id: 'doc_1' });
			expect(request).toHaveBeenCalledTimes(2);
		});

		it('does not replay a mutating request after HTTP 429', async () => {
			const request = jest.fn().mockRejectedValue({
				httpCode: 429,
				response: { headers: { 'retry-after': '0' } },
			});
			const ctx = requestContext(request);

			await expect(
				assinafyApiRequest(ctx as any, {
					method: 'POST',
					path: '/documents/doc_1/assignments',
					body: { method: 'virtual' },
				}),
			).rejects.toThrow('Assinafy API POST /documents/doc_1/assignments failed');
			expect(request).toHaveBeenCalledTimes(1);
		});

		it('collects all pages from pagination headers', async () => {
			const request = jest
				.fn()
				.mockResolvedValueOnce({
					body: { status: 200, data: [{ id: 'doc_1' }, { id: 'doc_2' }] },
					headers: { 'x-pagination-page-count': '2' },
				})
				.mockResolvedValueOnce({
					body: { status: 200, data: [{ id: 'doc_3' }] },
					headers: { 'x-pagination-page-count': '2' },
				});
			const ctx = requestContext(request);

			await expect(
				assinafyApiRequestAllItems(ctx as any, {
					method: 'GET',
					path: '/documents',
					perPage: 2,
				}),
			).resolves.toEqual([{ id: 'doc_1' }, { id: 'doc_2' }, { id: 'doc_3' }]);
			expect(request.mock.calls[0][1].qs).toEqual({ page: 1, 'per-page': 2 });
			expect(request.mock.calls[1][1].qs).toEqual({ page: 2, 'per-page': 2 });
		});

		it('probes the next page when pagination headers are absent', async () => {
			const request = jest
				.fn()
				.mockResolvedValueOnce({
					body: { status: 200, data: [{ id: 'doc_1' }, { id: 'doc_2' }] },
					headers: {},
				})
				.mockResolvedValueOnce({
					body: { status: 200, data: [{ id: 'doc_3' }] },
					headers: {},
				});
			const ctx = requestContext(request);

			const result = await assinafyApiRequestAllItems<{ id: string }>(ctx as any, {
				method: 'GET',
				path: '/documents',
				perPage: 2,
			});
			expect(result).toHaveLength(3);
			expect(request).toHaveBeenCalledTimes(2);
		});

		it('fails safely when an upstream server repeats a page', async () => {
			const repeated = {
				body: { status: 200, data: [{ id: 'doc_1' }, { id: 'doc_2' }] },
				headers: {},
			};
			const request = jest.fn().mockResolvedValue(repeated);
			const ctx = requestContext(request);

			await expect(
				assinafyApiRequestAllItems(ctx as any, {
					method: 'GET',
					path: '/documents',
					perPage: 2,
				}),
			).rejects.toThrow('pagination returned a repeated page');
			expect(request).toHaveBeenCalledTimes(2);
		});

		it('rejects a hostile pagination page count before requesting more pages', async () => {
			const request = jest.fn().mockResolvedValue({
				body: { status: 200, data: [{ id: 'doc_1' }] },
				headers: { 'x-pagination-page-count': '10001' },
			});
			const ctx = requestContext(request);

			await expect(
				assinafyApiRequestAllItems(ctx as any, {
					method: 'GET',
					path: '/documents',
					perPage: 2,
				}),
			).rejects.toThrow('exceeding the 10000-page safety limit');
			expect(request).toHaveBeenCalledTimes(1);
		});
	});

	describe('getAccountId', () => {
		it('should return accountId from credentials', async () => {
			const ctx = createMockContext({ accountId: 'acc_12345' });
			await expect(getAccountId(ctx as any)).resolves.toBe('acc_12345');
		});

		it('trims and encodes the account ID as one URL path segment', async () => {
			const ctx = createMockContext({ accountId: ' account/id?value ' });
			await expect(getAccountId(ctx as any)).resolves.toBe('account%2Fid%3Fvalue');
		});

		it('can return a trimmed account ID for a query parameter', async () => {
			const ctx = createMockContext({ accountId: ' account/id?value ' });
			await expect(getAccountId(ctx as any, false)).resolves.toBe('account/id?value');
		});

		it('should throw error when accountId is missing', async () => {
			const ctx = createMockContext({});
			await expect(getAccountId(ctx as any)).rejects.toThrow(
				'Assinafy credentials are missing an Account ID',
			);
		});

		it('should throw error when accountId is empty string', async () => {
			const ctx = createMockContext({ accountId: '   ' });
			await expect(getAccountId(ctx as any)).rejects.toThrow(
				'Assinafy credentials are missing an Account ID',
			);
		});
	});

	describe('unwrapEnvelope', () => {
		it('should extract data from valid envelope with status 200', () => {
			const envelope = { status: 200, message: '', data: { id: '123', name: 'Test' } };
			const result = unwrapEnvelope<any>(envelope);
			expect(result).toEqual({ id: '123', name: 'Test' });
		});

		it('should extract data from envelope with status 201', () => {
			const envelope = { status: 201, data: { created: true } };
			const result = unwrapEnvelope<any>(envelope);
			expect(result).toEqual({ created: true });
		});

		it('should extract data when status is undefined (success)', () => {
			const envelope = { data: { name: 'Test' } };
			const result = unwrapEnvelope<any>(envelope);
			expect(result).toEqual({ name: 'Test' });
		});

		it('should return response as-is when no data property', () => {
			const response = { status: 200, items: [1, 2, 3] };
			const result = unwrapEnvelope<any>(response);
			expect(result).toEqual(response);
		});

		it('should handle null/undefined input', () => {
			expect(unwrapEnvelope<any>(null)).toBeNull();
			expect(unwrapEnvelope<any>(undefined)).toBeUndefined();
		});

		it('should handle array data', () => {
			const envelope = { status: 200, data: [{ id: 1 }, { id: 2 }] };
			const result = unwrapEnvelope<any[]>(envelope);
			expect(result).toEqual([{ id: 1 }, { id: 2 }]);
		});

		it('should handle empty data object', () => {
			const envelope = { status: 200, data: {} };
			const result = unwrapEnvelope<any>(envelope);
			expect(result).toEqual({});
		});
	});

	describe('constants', () => {
		it('should have correct default base URL', () => {
			expect(DEFAULT_BASE_URL).toBe('https://api.assinafy.com.br/v1');
		});

		it('should have correct credentials type name', () => {
			expect(CREDENTIALS_TYPE).toBe('assinafyApi');
		});
	});
});
