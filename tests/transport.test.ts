/* eslint-disable @typescript-eslint/no-explicit-any */
import { getBaseUrl, getAccountId, unwrapEnvelope, DEFAULT_BASE_URL, CREDENTIALS_TYPE } from '../nodes/Assinafy/shared/transport';

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
			const ctx = createMockContext({ environment: 'custom', customBaseUrl: 'https://custom.api.com/v1' });
			await expect(getBaseUrl(ctx as any)).resolves.toBe('https://custom.api.com/v1');
		});

		it('should strip trailing slash from custom URL', async () => {
			const ctx = createMockContext({ environment: 'custom', customBaseUrl: 'https://custom.api.com/v1/' });
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
	});

	describe('getAccountId', () => {
		it('should return accountId from credentials', async () => {
			const ctx = createMockContext({ accountId: 'acc_12345' });
			await expect(getAccountId(ctx as any)).resolves.toBe('acc_12345');
		});

		it('should throw error when accountId is missing', async () => {
			const ctx = createMockContext({});
			await expect(getAccountId(ctx as any)).rejects.toThrow('Assinafy credentials are missing an Account ID');
		});

		it('should throw error when accountId is empty string', async () => {
			const ctx = createMockContext({ accountId: '' });
			await expect(getAccountId(ctx as any)).rejects.toThrow('Assinafy credentials are missing an Account ID');
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