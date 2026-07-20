/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeWorkspace } from '../nodes/Assinafy/resources/workspace';
import { makeCtx, lastAuth } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('workspace request construction', () => {
	it('creates a workspace (account)', async () => {
		const { ctx, requests } = makeCtx({
			name: 'New WS',
			additionalFields: { primary_color: 'ff0000' },
		});
		await executeWorkspace.call(ctx as any, 0, 'create');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/accounts`);
		expect(req.body).toEqual({ name: 'New WS', primary_color: 'ff0000' });
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
		const { ctx, requests } = makeCtx({ workspaceId: 'ws_1', updateFields: { name: 'Renamed' } });
		await executeWorkspace.call(ctx as any, 0, 'update');
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.url).toBe(`${BASE}/accounts/ws_1`);
		expect(req.body).toEqual({ name: 'Renamed' });
	});

	it('deletes a workspace', async () => {
		const { ctx, requests } = makeCtx({ workspaceId: 'ws_1' });
		const result = (await executeWorkspace.call(ctx as any, 0, 'delete')) as any;
		expect(lastAuth(requests).method).toBe('DELETE');
		expect(result.json).toEqual({ deleted: true, workspaceId: 'ws_1' });
	});

	it('gets the current user from /users/self', async () => {
		const { ctx, requests } = makeCtx({}, { response: { user: { id: 'u1' }, accounts: [] } });
		await executeWorkspace.call(ctx as any, 0, 'getCurrentUser');
		const req = lastAuth(requests);
		expect(req.method).toBe('GET');
		expect(req.url).toBe(`${BASE}/users/self`);
	});

	it('gets the workspace theme', async () => {
		const { ctx, requests } = makeCtx({ workspaceId: 'ws_1' });
		await executeWorkspace.call(ctx as any, 0, 'getTheme');
		expect(lastAuth(requests).url).toBe(`${BASE}/accounts/ws_1/theme`);
	});

	it('uploads a logo as multipart', async () => {
		const { ctx, requests } = makeCtx(
			{ workspaceId: 'ws_1', binaryPropertyName: 'data' },
			{ binaryBuffer: Buffer.from('PNG'), binaryMeta: { fileName: 'logo.png', mimeType: 'image/png' } },
		);
		await executeWorkspace.call(ctx as any, 0, 'uploadLogo');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/accounts/ws_1/logo`);
		expect(req.body).toBeInstanceOf(FormData);
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
