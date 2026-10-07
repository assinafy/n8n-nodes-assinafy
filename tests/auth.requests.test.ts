/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeAuth } from '../nodes/Assinafy/resources/auth';
import { makeCtx, lastAuth, lastPublic } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('auth request construction (all unauthenticated / Bearer)', () => {
	it('logs in', async () => {
		const { ctx, requests } = makeCtx({ authEmail: ' user@example.com ', authPassword: 'pw' });
		await executeAuth.call(ctx as any, 0, 'login');
		const req = lastPublic(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/login`);
		expect(req.body).toEqual({ email: 'user@example.com', password: 'pw' });
	});

	it('social logs in', async () => {
		const { ctx, requests } = makeCtx({
			provider: 'google',
			socialToken: ' tok ',
			hasAcceptedTerms: true,
		});
		await executeAuth.call(ctx as any, 0, 'socialLogin');
		const req = lastPublic(requests);
		expect(req.url).toBe(`${BASE}/authentication/social-login`);
		expect(req.body).toEqual({ provider: 'google', token: 'tok', has_accepted_terms: true });
	});

	it('links a social login with the configured API key', async () => {
		const { ctx, requests } = makeCtx({ provider: 'google', socialToken: 'tok' });
		await executeAuth.call(ctx as any, 0, 'linkSocialLogin');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/auth/link-social-login`);
		expect(req.body).toEqual({ provider: 'google', token: 'tok' });
	});

	it('links a social login with an explicit Bearer token', async () => {
		const { ctx, requests } = makeCtx({
			provider: 'google',
			socialToken: 'tok',
			accessToken: ' jwt ',
		});
		await executeAuth.call(ctx as any, 0, 'linkSocialLogin');
		expect(lastPublic(requests).headers.Authorization).toBe('Bearer jwt');
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

	it('gets the masked API key with configured API-key authentication when Bearer is omitted', async () => {
		const { ctx, requests } = makeCtx({});
		await executeAuth.call(ctx as any, 0, 'getApiKey');
		expect(lastAuth(requests).url).toBe(`${BASE}/users/api-keys`);
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
			authEmail: 'user@example.com',
			currentPassword: 'old',
			newPassword: 'new',
		});
		await executeAuth.call(ctx as any, 0, 'changePassword');
		const req = lastPublic(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/authentication/change-password`);
		expect(req.body).toEqual({
			email: 'user@example.com',
			password: 'old',
			new_password: 'new',
		});
	});

	it('requests a password reset', async () => {
		const { ctx, requests } = makeCtx({ authEmail: 'user@example.com' });
		await executeAuth.call(ctx as any, 0, 'requestPasswordReset');
		const req = lastPublic(requests);
		expect(req.url).toBe(`${BASE}/authentication/request-password-reset`);
		expect(req.body).toEqual({ email: 'user@example.com' });
	});

	it('resets the password with a token', async () => {
		const { ctx, requests } = makeCtx({
			authEmail: 'user@example.com',
			resetToken: 'rtok',
			newPassword: 'new',
		});
		await executeAuth.call(ctx as any, 0, 'resetPassword');
		const req = lastPublic(requests);
		expect(req.url).toBe(`${BASE}/authentication/reset-password`);
		expect(req.body).toEqual({
			email: 'user@example.com',
			new_password: 'new',
			token: 'rtok',
		});
	});

	it.each(['not-an-email', '   '])('rejects an invalid required email: %j', async (authEmail) => {
		const { ctx, requests } = makeCtx({ authEmail, authPassword: 'pw' });
		await expect(executeAuth.call(ctx as any, 0, 'login')).rejects.toThrow();
		expect(requests).toHaveLength(0);
	});

	it.each([
		['login', { authEmail: 'user@example.com', authPassword: ' ' }],
		['socialLogin', { provider: 'google', socialToken: ' ' }],
		['linkSocialLogin', { provider: 'google', socialToken: ' ' }],
		['createApiKey', { authPassword: ' ' }],
		['changePassword', { authEmail: 'user@example.com', currentPassword: ' ', newPassword: 'new' }],
		['changePassword', { authEmail: 'user@example.com', currentPassword: 'old', newPassword: ' ' }],
		['resetPassword', { authEmail: 'user@example.com', newPassword: ' ' }],
	] as const)('rejects blank required credentials for %s', async (operation, params) => {
		const { ctx, requests } = makeCtx(params);
		await expect(executeAuth.call(ctx as any, 0, operation)).rejects.toThrow('required');
		expect(requests).toHaveLength(0);
	});

	it('omits a blank optional reset token', async () => {
		const { ctx, requests } = makeCtx({
			authEmail: 'user@example.com',
			resetToken: '   ',
			newPassword: 'new',
		});
		await executeAuth.call(ctx as any, 0, 'resetPassword');
		expect(lastPublic(requests).body).toEqual({
			email: 'user@example.com',
			new_password: 'new',
		});
	});
});

describe('two-factor authentication requests', () => {
	it('completes a two-factor login without account authentication', async () => {
		const { ctx, requests } = makeCtx({ mfaToken: ' mfa_tok ', mfaCode: ' ABCD-EFGH-JKMN ' });
		await executeAuth.call(ctx as any, 0, 'verifyMfa');
		const req = lastPublic(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/authentication/mfa/verify`);
		expect(req.body).toEqual({ mfa_token: 'mfa_tok', code: 'ABCD-EFGH-JKMN' });
		expect(lastAuth(requests)).toBeUndefined();
	});

	it('lists methods with an explicit Bearer token', async () => {
		const { ctx, requests } = makeCtx({ accessToken: ' jwt ' });
		await executeAuth.call(ctx as any, 0, 'listMfaMethods');
		const req = lastPublic(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/users/self/mfa`);
		expect(req.headers.Authorization).toBe('Bearer jwt');
	});

	it('starts enrollment with an optional label', async () => {
		const { ctx, requests } = makeCtx({ mfaLabel: ' Phone ' });
		await executeAuth.call(ctx as any, 0, 'startTotpEnrollment');
		expect(lastAuth(requests)).toMatchObject({
			method: 'POST',
			url: `${BASE}/users/self/mfa/totp`,
			body: { label: 'Phone' },
		});
	});

	it('confirms enrollment, sending re-authentication only when given', async () => {
		const first = makeCtx({ mfaMethodId: 'm1', mfaCode: '123456' });
		await executeAuth.call(first.ctx as any, 0, 'confirmTotpEnrollment');
		expect(lastAuth(first.requests)).toMatchObject({
			method: 'PUT',
			url: `${BASE}/users/self/mfa/totp/confirm`,
			body: { id: 'm1', code: '123456' },
		});

		const replace = makeCtx({ mfaMethodId: 'm2', mfaCode: '654321', reauthCode: '111111' });
		await executeAuth.call(replace.ctx as any, 0, 'confirmTotpEnrollment');
		expect(lastAuth(replace.requests).body).toEqual({
			id: 'm2',
			code: '654321',
			reauth_code: '111111',
		});
	});

	it('regenerates recovery codes with the current password', async () => {
		const { ctx, requests } = makeCtx({ reauthPassword: 'pw' });
		await executeAuth.call(ctx as any, 0, 'regenerateRecoveryCodes');
		expect(lastAuth(requests)).toMatchObject({
			method: 'POST',
			url: `${BASE}/users/self/mfa/recovery-codes`,
			body: { password: 'pw' },
		});
	});

	it('removes a method by encoded ID with a code', async () => {
		const { ctx, requests } = makeCtx({ mfaMethodId: 'm/1', reauthCode: '123456' });
		await executeAuth.call(ctx as any, 0, 'removeMfaMethod');
		expect(lastAuth(requests)).toMatchObject({
			method: 'DELETE',
			url: `${BASE}/users/self/mfa/m%2F1`,
			body: { code: '123456' },
		});
	});

	it.each(['regenerateRecoveryCodes', 'removeMfaMethod'])(
		'%s requires re-authentication before sending',
		async (operation) => {
			const { ctx, requests } = makeCtx({ mfaMethodId: 'm1' });
			await expect(executeAuth.call(ctx as any, 0, operation)).rejects.toThrow(
				'Provide the current password or a re-authentication code',
			);
			expect(requests).toHaveLength(0);
		},
	);
});
