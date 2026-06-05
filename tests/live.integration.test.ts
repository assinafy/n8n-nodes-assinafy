/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @n8n/community-nodes/no-restricted-globals -- dev-only test: needs process.env + fetch */
//
// Live end-to-end integration tests: they run the REAL SDK resource functions
// (executeTag/executeField/executeDocument/...) against the Assinafy sandbox,
// routing the n8n HTTP helpers to a real `fetch`. They are SKIPPED unless the
// sandbox credentials are provided via environment variables, so normal CI runs
// (and `npm test`) do not need network access or secrets:
//
//   ASSINAFY_LIVE=1 \
//   ASSINAFY_API_KEY=<key> \
//   ASSINAFY_ACCOUNT_ID=<id> \
//   ASSINAFY_BASE_URL=https://sandbox.assinafy.com.br/v1 \
//   npx jest tests/live.integration.test.ts
//
import { executeTag } from '../nodes/Assinafy/resources/tag';
import { executeField } from '../nodes/Assinafy/resources/field';
import { executeDocument } from '../nodes/Assinafy/resources/document';
import { executeWorkspace } from '../nodes/Assinafy/resources/workspace';
import { executeAssignment } from '../nodes/Assinafy/resources/assignment';
import { executeWebhook } from '../nodes/Assinafy/resources/webhook';

const env = process.env;
const LIVE = !!env.ASSINAFY_LIVE && !!env.ASSINAFY_API_KEY;
const API_KEY = env.ASSINAFY_API_KEY ?? '';
const ACCOUNT_ID = env.ASSINAFY_ACCOUNT_ID ?? '';
const BASE_URL = env.ASSINAFY_BASE_URL ?? 'https://sandbox.assinafy.com.br/v1';

const credentials = { apiKey: API_KEY, accountId: ACCOUNT_ID, baseUrl: BASE_URL };

// Minimal one-page PDF used for upload tests.
const PDF = Buffer.from(
	`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`,
	'utf8',
);

async function realRequest(requestOptions: any, auth: boolean): Promise<unknown> {
	const url = new URL(requestOptions.url);
	for (const [k, v] of Object.entries(requestOptions.qs ?? {})) url.searchParams.set(k, String(v));
	const headers: Record<string, string> = { Accept: 'application/json', ...(requestOptions.headers ?? {}) };
	if (auth) headers['X-Api-Key'] = credentials.apiKey;

	let body: any;
	if (requestOptions.body instanceof FormData || Buffer.isBuffer(requestOptions.body)) {
		body = requestOptions.body;
	} else if (requestOptions.json && requestOptions.body !== undefined) {
		body = JSON.stringify(requestOptions.body);
		headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
	}

	const res = await fetch(url, { method: requestOptions.method, headers, body });
	const buf = Buffer.from(await res.arrayBuffer());

	if (!res.ok) {
		const err: any = new Error(`HTTP ${res.status}`);
		err.httpCode = res.status;
		err.response = { statusCode: res.status, headers: Object.fromEntries(res.headers), body: buf.toString() };
		throw err;
	}
	const resHeaders = Object.fromEntries(res.headers) as Record<string, string>;
	if (requestOptions.encoding === 'arraybuffer') {
		return { body: buf, headers: resHeaders, statusCode: res.status };
	}
	let parsed: unknown = buf.toString();
	try {
		parsed = JSON.parse(buf.toString());
	} catch {
		/* non-JSON */
	}
	if (requestOptions.returnFullResponse) return { body: parsed, headers: resHeaders, statusCode: res.status };
	return parsed;
}

function liveCtx(params: Record<string, unknown>) {
	const ctx: any = {
		getCredentials: async () => credentials,
		getNode: () => ({ name: 'Assinafy' }),
		continueOnFail: () => false,
		getNodeParameter: (name: string, _i: number, def?: unknown, opts?: { extractValue?: boolean }) => {
			if (!(name in params)) return def;
			const v = params[name];
			if (opts?.extractValue && v && typeof v === 'object' && 'value' in (v as any)) return (v as any).value;
			return v;
		},
		helpers: {
			httpRequestWithAuthentication: (_t: string, o: any) => realRequest(o, true),
			httpRequest: (o: any) => realRequest(o, false),
			assertBinaryData: () => ({ fileName: 'audit.pdf', mimeType: 'application/pdf' }),
			getBinaryDataBuffer: async () => PDF,
			prepareBinaryData: async (b: Buffer, fileName: string, mimeType: string) => ({
				data: b.toString('base64'),
				fileName,
				mimeType,
			}),
		},
	};
	return ctx;
}

const d = LIVE ? describe : describe.skip;

d('LIVE sandbox integration (real SDK code paths)', () => {
	jest.setTimeout(60000);

	it('tag lifecycle: create → list → update → delete', async () => {
		const created = (await executeTag.call(
			liveCtx({ name: `it-tag-${Date.now()}`, color: 'ff8800' }),
			0,
			'create',
		)) as any;
		const tagId = created.json.id;
		expect(tagId).toBeTruthy();

		const listed = (await executeTag.call(
			liveCtx({ returnAll: false, limit: 100, filters: {} }),
			0,
			'list',
		)) as any[];
		expect(Array.isArray(listed)).toBe(true);

		const updated = (await executeTag.call(
			liveCtx({ tagId, updateFields: { name: `it-tag-renamed-${Date.now()}` } }),
			0,
			'update',
		)) as any;
		expect(updated.json.id).toBe(tagId);

		const deleted = (await executeTag.call(liveCtx({ tagId, force: false }), 0, 'delete')) as any;
		expect(deleted.json.deleted).toBe(true);
	});

	it('field lifecycle: create → get → validate → delete', async () => {
		const created = (await executeField.call(
			liveCtx({ fieldType: 'text', fieldName: 'it-field', additionalFields: { is_active: true } }),
			0,
			'create',
		)) as any;
		const fieldId = created.json.id;
		expect(fieldId).toBeTruthy();

		const got = (await executeField.call(liveCtx({ fieldId }), 0, 'get')) as any;
		expect(got.json.id).toBe(fieldId);

		const validated = (await executeField.call(
			liveCtx({ fieldId, validateValue: 'hello', signerAccessCode: '' }),
			0,
			'validate',
		)) as any;
		expect(validated.json).toHaveProperty('success');

		await executeField.call(liveCtx({ fieldId }), 0, 'delete');
	});

	it('document: upload → wait → get → activities → estimate-cost → delete', async () => {
		const uploaded = (await executeDocument.call(
			liveCtx({ binaryPropertyName: 'data', fileName: 'audit.pdf', additionalFields: {} }),
			0,
			'upload',
		)) as any;
		const documentId = uploaded.json.id;
		expect(documentId).toBeTruthy();

		const ready = (await executeDocument.call(
			liveCtx({ documentId, maxWaitMs: 30000, pollIntervalMs: 2000 }),
			0,
			'waitUntilReady',
		)) as any;
		expect(['metadata_ready', 'pending_signature', 'certificated']).toContain(ready.json.status);

		const activities = (await executeDocument.call(liveCtx({ documentId }), 0, 'getActivities')) as any;
		expect(Array.isArray(activities.json.activities)).toBe(true);

		const estimate = (await executeAssignment.call(
			liveCtx({
				documentId,
				method: 'virtual',
				signers: { signer: [{ verification_method: 'Email', notification_methods: ['Email'] }] },
				additionalFields: {},
			}),
			0,
			'estimateCost',
		)) as any;
		expect(estimate.json).toHaveProperty('total_credits');

		const deleted = (await executeDocument.call(liveCtx({ documentId }), 0, 'delete')) as any;
		expect(deleted.json.deleted).toBe(true);
	});

	it('workspace lifecycle: create → get → update → delete', async () => {
		const created = (await executeWorkspace.call(
			liveCtx({ name: `it-ws-${Date.now()}`, additionalFields: {} }),
			0,
			'create',
		)) as any;
		const workspaceId = created.json.id;
		expect(workspaceId).toBeTruthy();

		const got = (await executeWorkspace.call(liveCtx({ workspaceId }), 0, 'get')) as any;
		expect(got.json.id).toBe(workspaceId);

		await executeWorkspace.call(
			liveCtx({ workspaceId, updateFields: { name: 'it-ws-renamed' } }),
			0,
			'update',
		);
		const deleted = (await executeWorkspace.call(liveCtx({ workspaceId }), 0, 'delete')) as any;
		expect(deleted.json.deleted).toBe(true);
	});

	it('read-only catalogs: statuses, field types, webhook event types', async () => {
		const statuses = (await executeDocument.call(liveCtx({}), 0, 'listStatuses')) as any;
		expect(statuses.json.statuses.length).toBeGreaterThan(0);

		const types = (await executeField.call(liveCtx({}), 0, 'listTypes')) as any;
		expect(types.json.types.length).toBeGreaterThan(0);

		const events = (await executeWebhook.call(liveCtx({}), 0, 'listEventTypes')) as any;
		expect(events.json.eventTypes.length).toBeGreaterThan(0);
	});
});
