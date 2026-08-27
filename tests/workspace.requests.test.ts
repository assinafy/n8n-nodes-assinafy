/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeWorkspace } from '../nodes/Assinafy/resources/workspace';
import { makeCtx, lastAuth } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('workspace request construction', () => {
	it('creates a workspace (account)', async () => {
		const { ctx, requests } = makeCtx({
			name: ' New WS ',
			additionalFields: { notification_sender_type: 'Account', primary_color: '#FF0000' },
		});
		await executeWorkspace.call(ctx as any, 0, 'create');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/accounts`);
		expect(req.body).toEqual({
			name: 'New WS',
			notification_sender_type: 'Account',
			primary_color: 'ff0000',
		});
	});

	it('rejects a blank workspace name before making a request', async () => {
		const { ctx, requests } = makeCtx({ name: '   ', additionalFields: {} });
		await expect(executeWorkspace.call(ctx as any, 0, 'create')).rejects.toThrow(
			'Name is required',
		);
		expect(requests).toHaveLength(0);
	});

	it('lists workspaces with a per-page limit', async () => {
		const { ctx, requests } = makeCtx(
			{ returnAll: false, limit: 10 },
			{ response: [{ id: 'ws_1' }] },
		);
		await executeWorkspace.call(ctx as any, 0, 'list');
		const req = lastAuth(requests);
		expect(req.url).toBe(`${BASE}/accounts`);
		expect(req.qs).toEqual({ 'per-page': 10 });
	});

	it('gets a workspace', async () => {
		const { ctx, requests } = makeCtx({ workspaceId: 'ws_1' });
		await executeWorkspace.call(ctx as any, 0, 'get');
		expect(lastAuth(requests).url).toBe(`${BASE}/accounts/ws_1`);
	});

	it('updates a workspace', async () => {
		const { ctx, requests } = makeCtx({
			workspaceId: 'ws_1',
			updateFields: {
				name: 'Renamed',
				notification_sender_type: 'User',
				secondary_color: '#ABCDEF',
			},
		});
		await executeWorkspace.call(ctx as any, 0, 'update');
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/accounts/ws_1`);
		expect(req.body).toEqual({
			name: 'Renamed',
			notification_sender_type: 'User',
			secondary_color: 'abcdef',
		});
	});

	it.each([
		[{ workspaceId: 'ws_1', updateFields: {} }, 'At least one update field is required'],
		[{ workspaceId: 'ws_1', updateFields: { name: '   ' } }, 'Name cannot be blank'],
	])('rejects an invalid workspace update before making a request', async (params, message) => {
		const { ctx, requests } = makeCtx(params);
		await expect(executeWorkspace.call(ctx as any, 0, 'update')).rejects.toThrow(message);
		expect(requests).toHaveLength(0);
	});

	it('rejects a color format the API cannot accept', async () => {
		const { ctx, requests } = makeCtx({
			name: 'New WS',
			additionalFields: { primary_color: 'red' },
		});
		await expect(executeWorkspace.call(ctx as any, 0, 'create')).rejects.toThrow(
			'Primary Color must be a 6-character hex value',
		);
		expect(requests).toHaveLength(0);
	});

	it('deletes a workspace', async () => {
		const { ctx, requests } = makeCtx({ workspaceId: 'ws_1' });
		const result = (await executeWorkspace.call(ctx as any, 0, 'delete')) as any;
		expect(lastAuth(requests).method).toBe('DELETE');
		expect(result.json).toEqual({ deleted: true, workspaceId: 'ws_1' });
	});

	it('can force-delete a disposable workspace', async () => {
		const { ctx, requests } = makeCtx({ workspaceId: 'ws_disposable', force: true });
		await executeWorkspace.call(ctx as any, 0, 'delete');
		expect(lastAuth(requests).body).toEqual({ force: true });
	});

	it('gets the current user from /users/self', async () => {
		const { ctx, requests } = makeCtx({}, { response: { user: { id: 'u1' }, accounts: [] } });
		await executeWorkspace.call(ctx as any, 0, 'getCurrentUser');
		const req = lastAuth(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/users/self`);
	});

	it('gets the current user notification preferences', async () => {
		const { ctx, requests } = makeCtx(
			{},
			{ response: { DocumentCompleted: true, SignerDeclined: false } },
		);
		await executeWorkspace.call(ctx as any, 0, 'getNotificationPreferences');
		const req = lastAuth(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/users/self/notification-preferences`);
	});

	it('partially updates the current user notification preferences', async () => {
		const { ctx, requests } = makeCtx({
			notificationPreferences: { DocumentCompleted: false, SignerDeclined: true },
		});
		await executeWorkspace.call(ctx as any, 0, 'updateNotificationPreferences');
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/users/self/notification-preferences`);
		expect(req.body).toEqual({ DocumentCompleted: false, SignerDeclined: true });
	});

	it('rejects an empty notification-preference update before the request', async () => {
		const { ctx, requests } = makeCtx({ notificationPreferences: {} });
		await expect(
			executeWorkspace.call(ctx as any, 0, 'updateNotificationPreferences'),
		).rejects.toThrow('At least one notification preference is required');
		expect(requests).toHaveLength(0);
	});

	it('rejects a non-boolean notification-preference value before the request', async () => {
		const { ctx, requests } = makeCtx({
			notificationPreferences: { DocumentCompleted: 'false' },
		});
		await expect(
			executeWorkspace.call(ctx as any, 0, 'updateNotificationPreferences'),
		).rejects.toThrow('Notification preferences must be boolean values');
		expect(requests).toHaveLength(0);
	});

	it('rejects an unknown notification-preference key before the request', async () => {
		const { ctx, requests } = makeCtx({
			notificationPreferences: { UnknownPreference: true },
		});
		await expect(
			executeWorkspace.call(ctx as any, 0, 'updateNotificationPreferences'),
		).rejects.toThrow('Unknown notification preference: UnknownPreference');
		expect(requests).toHaveLength(0);
	});

	it('gets monthly account statistics', async () => {
		const { ctx, requests } = makeCtx(
			{ workspaceId: 'ws_1', granularity: 'monthly' },
			{ response: [{ period: '2026-08', total_documents: 3 }] },
		);
		const result = (await executeWorkspace.call(ctx as any, 0, 'getAccountStats')) as any[];
		const req = lastAuth(requests);
		expect(req.url).toBe(`${BASE}/accounts/ws_1/stats`);
		expect(req.qs).toEqual({ granularity: 'monthly' });
		expect(result[0].json.period).toBe('2026-08');
	});

	it('gets daily current-user statistics for one month', async () => {
		const { ctx, requests } = makeCtx(
			{ granularity: 'daily', statsMonth: '2026-08' },
			{ response: [{ period: '2026-08-01' }] },
		);
		await executeWorkspace.call(ctx as any, 0, 'getUserStats');
		const req = lastAuth(requests);
		expect(req.url).toBe(`${BASE}/users/self/stats`);
		expect(req.qs).toEqual({ granularity: 'daily', month: '2026-08' });
	});

	it('rejects an invalid daily statistics month before the request', async () => {
		const { ctx, requests } = makeCtx({ granularity: 'daily', statsMonth: '08/2026' });
		await expect(executeWorkspace.call(ctx as any, 0, 'getUserStats')).rejects.toThrow(
			'Month must use YYYY-MM format',
		);
		expect(requests).toHaveLength(0);
	});

	it('gets the workspace theme', async () => {
		const { ctx, requests } = makeCtx({ workspaceId: 'ws_1' });
		await executeWorkspace.call(ctx as any, 0, 'getTheme');
		expect(lastAuth(requests).url).toBe(`${BASE}/accounts/ws_1/theme`);
	});

	it('uploads a logo as multipart', async () => {
		const { ctx, requests } = makeCtx(
			{ workspaceId: 'ws_1', binaryPropertyName: 'data' },
			{
				binaryBuffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
				binaryMeta: { fileName: 'logo.png', mimeType: 'image/png' },
			},
		);
		await executeWorkspace.call(ctx as any, 0, 'uploadLogo');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/accounts/ws_1/logo`);
		expect(req.body).toBeInstanceOf(FormData);
	});

	it('rejects a logo whose bytes do not match its declared image type', async () => {
		const { ctx, requests } = makeCtx(
			{ workspaceId: 'ws_1', binaryPropertyName: 'data' },
			{
				binaryBuffer: Buffer.from('not an image'),
				binaryMeta: { fileName: 'logo.png', mimeType: 'image/png' },
			},
		);
		await expect(executeWorkspace.call(ctx as any, 0, 'uploadLogo')).rejects.toThrow(
			'content does not match',
		);
		expect(requests).toHaveLength(0);
	});

	it('downloads the logo as binary', async () => {
		const { ctx, requests } = makeCtx(
			{ workspaceId: 'ws_1', binaryOutputProperty: 'data' },
			{ binaryBuffer: Buffer.from('PNG'), headers: { 'content-type': 'image/png' } },
		);
		const result = (await executeWorkspace.call(ctx as any, 0, 'downloadLogo')) as any;
		const req = lastAuth(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/accounts/ws_1/logo`);
		expect(req.encoding).toBe('arraybuffer');
		expect(result.binary.data).toBeDefined();
	});

	it('deletes the logo', async () => {
		const { ctx, requests } = makeCtx({ workspaceId: 'ws_1' });
		const result = (await executeWorkspace.call(ctx as any, 0, 'deleteLogo')) as any;
		expect(lastAuth(requests).method).toBe('DELETE');
		expect(lastAuth(requests).url).toBe(`${BASE}/accounts/ws_1/logo`);
		expect(result.json).toEqual({ deleted: true, workspaceId: 'ws_1' });
	});
});
