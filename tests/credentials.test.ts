/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ICredentialDataDecryptedObject, IHttpRequestOptions } from 'n8n-workflow';
import { AssinafyApi } from '../credentials/AssinafyApi.credentials';

type AuthenticateFunction = (
	credentials: ICredentialDataDecryptedObject,
	requestOptions: IHttpRequestOptions,
) => Promise<IHttpRequestOptions>;

describe('AssinafyApi Credentials', () => {
	let credentials: AssinafyApi;

	beforeEach(() => {
		credentials = new AssinafyApi();
	});

	it('should have correct name', () => {
		expect(credentials.name).toBe('assinafyApi');
	});

	it('should have display name', () => {
		expect(credentials.displayName).toBe('Assinafy API');
	});

	it('should have properties defined', () => {
		expect(credentials.properties).toBeDefined();
		expect(Array.isArray(credentials.properties)).toBe(true);
		expect(credentials.properties.length).toBeGreaterThan(0);
	});

	it('should have environment property', () => {
		const envProp = credentials.properties.find((p: any) => p.name === 'environment');
		expect(envProp).toBeDefined();
		expect(envProp!.type).toBe('options');
	});

	it('requires a Custom Base URL when the Custom environment is selected', () => {
		const customUrl = credentials.properties.find((property) => property.name === 'customBaseUrl');
		expect(customUrl).toMatchObject({ required: true });
	});

	it('should have apiKey property', () => {
		const apiKeyProp = credentials.properties.find((p: any) => p.name === 'apiKey');
		expect(apiKeyProp).toBeDefined();
		expect(apiKeyProp!.type).toBe('string');
		expect(apiKeyProp!.typeOptions?.password).toBe(true);
	});

	it('should have accountId property', () => {
		const accountIdProp = credentials.properties.find((p: any) => p.name === 'accountId');
		expect(accountIdProp).toBeDefined();
		expect(accountIdProp!.required).toBe(true);
	});

	it('should have webhookSecret property', () => {
		const webhookSecretProp = credentials.properties.find((p: any) => p.name === 'webhookSecret');
		expect(webhookSecretProp).toBeDefined();
		expect(webhookSecretProp!.typeOptions?.password).toBe(true);
	});

	it('should have authenticate configuration', () => {
		expect(credentials.authenticate).toBeDefined();
		expect(typeof credentials.authenticate).toBe('function');
	});

	it('validates and normalizes the base URL before attaching the API key', async () => {
		const authenticate = credentials.authenticate as AuthenticateFunction;
		const result = await authenticate(
			{ apiKey: 'test-key', baseUrl: 'https://custom.example.com/v1/' },
			{ method: 'GET', url: '/accounts/acc_123', baseURL: 'https://custom.example.com/v1/' },
		);

		expect(result.baseURL).toBe('https://custom.example.com/v1');
		expect(result.headers).toMatchObject({
			Accept: 'application/json',
			'X-Api-Key': 'test-key',
		});
	});

	it.each([
		['blank URL', '', 'valid absolute URL'],
		['unencrypted remote URL', 'http://attacker.example.com/v1', 'must use HTTPS'],
		['embedded credentials', 'https://user:pass@example.com/v1', 'embedded credentials'],
		['query string', 'https://example.com/v1?redirect=elsewhere', 'query string or fragment'],
	])('rejects a custom %s before attaching authentication', async (_label, baseUrl, message) => {
		const authenticate = credentials.authenticate as AuthenticateFunction;
		const request: any = { method: 'GET', url: '/accounts/acc_123', baseURL: baseUrl };

		await expect(
			authenticate(
				{ apiKey: 'test-key', environment: 'custom', customBaseUrl: baseUrl, baseUrl },
				request,
			),
		).rejects.toThrow(message);
		expect(request.headers).toBeUndefined();
	});

	it('allows an HTTP loopback base URL for local development', async () => {
		const authenticate = credentials.authenticate as AuthenticateFunction;
		const result = await authenticate(
			{ apiKey: 'test-key', environment: 'custom', customBaseUrl: 'http://127.0.0.1:5678/v1' },
			{ method: 'GET', url: '/accounts/acc_123' },
		);

		expect(result.headers).toMatchObject({ 'X-Api-Key': 'test-key' });
	});

	it('should have test configuration', () => {
		expect(credentials.test).toBeDefined();
		expect(credentials.test.request).toBeDefined();
		expect(credentials.test.request.method).toBe('GET');
	});
});
