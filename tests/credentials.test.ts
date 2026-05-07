/* eslint-disable @typescript-eslint/no-explicit-any */
import { AssinafyApi } from '../credentials/AssinafyApi.credentials';

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
		expect(credentials.authenticate.type).toBe('generic');
		expect(credentials.authenticate.properties).toBeDefined();
		expect(credentials.authenticate.properties.headers).toBeDefined();
		const headers = credentials.authenticate.properties.headers as Record<string, string>;
		expect(headers['X-Api-Key']).toBeDefined();
	});

	it('should have test configuration', () => {
		expect(credentials.test).toBeDefined();
		expect(credentials.test.request).toBeDefined();
		expect(credentials.test.request.method).toBe('GET');
	});
});