/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeAuth } from '../nodes/Assinafy/resources/auth';
import { makeCtx, lastPublic } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('auth request construction (all unauthenticated / Bearer)', () => {
	it('logs in', async () => {
		const { ctx, requests } = makeCtx({ authEmail: 'a@b.com', authPassword: 'pw' });
		await executeAuth.call(ctx as any, 0, 'login');
		const req = lastPublic(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/login`);
		expect(req.body).toEqual({ email: 'a@b.com', password: 'pw' });
	});

	it('social logs in', async () => {
		const { ctx, requests } = makeCtx({
			provider: 'google',
			socialToken: 'tok',
			hasAcceptedTerms: true,
		});
		await executeAuth.call(ctx as any, 0, 'socialLogin');
		const req = lastPublic(requests);
		expect(req.url).toBe(`${BASE}/authentication/social-login`);
		expect(req.body).toEqual({ provider: 'google', token: 'tok', has_accepted_terms: true });
	});

	it('creates an API key with a Bearer token', async () => {
		const { ctx, requests } = makeCtx({ accessToken: 'jwt', authPassword: 'pw' });
		await executeAuth.call(ctx as any, 0, 'createApiKey');
		const req = lastPublic(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/users/api-keys`);
		expect(req.headers.Authorization).toBe('Bearer jwt');
		expect(req.body).toEqual({ password: 'pw' });
	});

	it('gets the masked API key', async () => {
		const { ctx, requests } = makeCtx({ accessToken: 'jwt' });
		await executeAuth.call(ctx as any, 0, 'getApiKey');
		const req = lastPublic(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/users/api-keys`);
		expect(req.headers.Authorization).toBe('Bearer jwt');
	});

	it('deletes the API key', async () => {
		const { ctx, requests } = makeCtx({ accessToken: 'jwt' });
		const result = (await executeAuth.call(ctx as any, 0, 'deleteApiKey')) as any;
		expect(lastPublic(requests).method).toBe('DELETE');
		expect(result.json).toEqual({ deleted: true });
	});

	it('changes the password', async () => {
		const { ctx, requests } = makeCtx({
			accessToken: 'jwt',
			authEmail: 'a@b.com',
			currentPassword: 'old',
			newPassword: 'new',
		});
		await executeAuth.call(ctx as any, 0, 'changePassword');
		const req = lastPublic(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/authentication/change-password`);
		expect(req.body).toEqual({ email: 'a@b.com', password: 'old', new_password: 'new' });
	});

	it('requests a password reset', async () => {
		const { ctx, requests } = makeCtx({ authEmail: 'a@b.com' });
		await executeAuth.call(ctx as any, 0, 'requestPasswordReset');
		const req = lastPublic(requests);
		expect(req.url).toBe(`${BASE}/authentication/request-password-reset`);
		expect(req.body).toEqual({ email: 'a@b.com' });
	});

	it('resets the password with a token', async () => {
		const { ctx, requests } = makeCtx({
			authEmail: 'a@b.com',
			resetToken: 'rtok',
			newPassword: 'new',
		});
		await executeAuth.call(ctx as any, 0, 'resetPassword');
		const req = lastPublic(requests);
		expect(req.url).toBe(`${BASE}/authentication/reset-password`);
		expect(req.body).toEqual({ email: 'a@b.com', new_password: 'new', token: 'rtok' });
	});
});
