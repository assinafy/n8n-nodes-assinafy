/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @n8n/community-nodes/no-restricted-globals -- dev-only test: needs process.env + fetch */
/* eslint-disable @n8n/community-nodes/require-node-api-error -- configuration guard has no n8n node context */
//
// Live end-to-end integration tests: they run the REAL SDK resource functions
// (executeTag/executeField/executeDocument/...) against the Assinafy sandbox,
// routing the n8n HTTP helpers to a real `fetch`. They are SKIPPED unless the
// sandbox credentials are provided via environment variables, so normal CI runs
// (and `npm test`) do not need network access or secrets. Tests which create,
// mutate or delete records require the second, explicit destructive gate:
//
//   ASSINAFY_LIVE=1 \
//   ASSINAFY_LIVE_DESTRUCTIVE=1 \
//   ASSINAFY_LIVE_WORKSPACE_MUTATIONS=1 \
//   ASSINAFY_API_KEY=<key> \
//   ASSINAFY_ACCOUNT_ID=<id> \
//   ASSINAFY_TEST_EMAIL_PRIMARY=<sandbox-test-email> \
//   ASSINAFY_TEST_EMAIL_SECONDARY=<second-sandbox-test-email> \
//   ASSINAFY_BASE_URL=https://sandbox.assinafy.com.br/v1 \
//   npx jest tests/live.integration.test.ts
//
import { executeTag } from '../nodes/Assinafy/resources/tag';
import { executeField } from '../nodes/Assinafy/resources/field';
import { executeDocument } from '../nodes/Assinafy/resources/document';
import { executeWorkspace } from '../nodes/Assinafy/resources/workspace';
import { executeAssignment } from '../nodes/Assinafy/resources/assignment';
import { executeWebhook } from '../nodes/Assinafy/resources/webhook';
import { executeTemplate } from '../nodes/Assinafy/resources/template';
import { executeSigner } from '../nodes/Assinafy/resources/signer';

const env = process.env;
const LIVE = env.ASSINAFY_LIVE === '1';
const DESTRUCTIVE = env.ASSINAFY_LIVE_DESTRUCTIVE === '1';
const WORKSPACE_MUTATIONS = env.ASSINAFY_LIVE_WORKSPACE_MUTATIONS === '1';
const API_KEY = env.ASSINAFY_API_KEY ?? '';
const ACCOUNT_ID = env.ASSINAFY_ACCOUNT_ID ?? '';
const SANDBOX_BASE_URL = 'https://sandbox.assinafy.com.br/v1';
const BASE_URL = env.ASSINAFY_BASE_URL ?? SANDBOX_BASE_URL;
const TEST_EMAIL_PRIMARY = env.ASSINAFY_TEST_EMAIL_PRIMARY ?? '';
const TEST_EMAIL_SECONDARY = env.ASSINAFY_TEST_EMAIL_SECONDARY ?? '';

const credentials = { apiKey: API_KEY, accountId: ACCOUNT_ID, baseUrl: BASE_URL };

// Minimal one-page PDF used for upload tests.
const PDF = Buffer.from(
	`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`,
	'utf8',
);

async function realRequest(requestOptions: any, auth: boolean): Promise<unknown> {
	const url = new URL(requestOptions.url);
	for (const [k, v] of Object.entries(requestOptions.qs ?? {})) url.searchParams.set(k, String(v));
	const headers: Record<string, string> = {
		Accept: 'application/json',
		...(requestOptions.headers ?? {}),
	};
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
		err.response = {
			statusCode: res.status,
			headers: Object.fromEntries(res.headers),
			body: buf.toString(),
		};
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
	if (requestOptions.returnFullResponse)
		return { body: parsed, headers: resHeaders, statusCode: res.status };
	return parsed;
}

function liveCtx(params: Record<string, unknown>, accountId = ACCOUNT_ID) {
	const ctx: any = {
		getCredentials: async () => ({ ...credentials, accountId }),
		getNode: () => ({ name: 'Assinafy' }),
		continueOnFail: () => false,
		getNodeParameter: (
			name: string,
			_i: number,
			def?: unknown,
			opts?: { extractValue?: boolean },
		) => {
			if (!(name in params)) return def;
			const v = params[name];
			if (opts?.extractValue && v && typeof v === 'object' && 'value' in (v as any))
				return (v as any).value;
			return v;
		},
		helpers: {
			httpRequestWithAuthentication: (_t: string, o: any) => realRequest(o, true),
			httpRequest: (o: any) => realRequest(o, false),
			assertBinaryData: () => ({ fileName: 'sdk-test.pdf', mimeType: 'application/pdf' }),
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
const destructiveIt = LIVE && DESTRUCTIVE ? it : it.skip;
const workspaceIt = LIVE && DESTRUCTIVE && WORKSPACE_MUTATIONS ? it : it.skip;
const emailIt = LIVE && DESTRUCTIVE && TEST_EMAIL_PRIMARY && TEST_EMAIL_SECONDARY ? it : it.skip;

function assertSandboxConfiguration(): void {
	if (!API_KEY) throw new Error('ASSINAFY_API_KEY is required when ASSINAFY_LIVE=1');
	if (!ACCOUNT_ID) throw new Error('ASSINAFY_ACCOUNT_ID is required when ASSINAFY_LIVE=1');

	let parsed: URL;
	try {
		parsed = new URL(BASE_URL);
	} catch {
		throw new Error('ASSINAFY_BASE_URL must be the Assinafy sandbox v1 URL');
	}
	const normalizedPath = parsed.pathname.replace(/\/+$/, '');
	if (
		parsed.protocol !== 'https:' ||
		parsed.hostname !== 'sandbox.assinafy.com.br' ||
		parsed.port !== '' ||
		normalizedPath !== '/v1' ||
		parsed.username !== '' ||
		parsed.password !== '' ||
		parsed.search !== '' ||
		parsed.hash !== ''
	) {
		throw new Error(
			`Live integration tests are sandbox-only; ASSINAFY_BASE_URL must be ${SANDBOX_BASE_URL}`,
		);
	}
}

d('LIVE sandbox integration (real SDK code paths)', () => {
	jest.setTimeout(60000);
	beforeAll(assertSandboxConfiguration);

	destructiveIt('tag lifecycle: create → list → update → delete', async () => {
		let tagId: string | undefined;
		try {
			const created = (await executeTag.call(
				liveCtx({ name: `it-tag-${Date.now()}`, color: 'ff8800' }),
				0,
				'create',
			)) as any;
			tagId = created.json.id;
			expect(tagId).toBeTruthy();

			const listed = (await executeTag.call(
				liveCtx({ returnAll: false, limit: 100, filters: {} }),
				0,
				'list',
			)) as any[];
			expect(listed.some((item) => item.json.id === tagId)).toBe(true);

			const updated = (await executeTag.call(
				liveCtx({ tagId, updateFields: { name: `it-tag-renamed-${Date.now()}` } }),
				0,
				'update',
			)) as any;
			expect(updated.json.id).toBe(tagId);
		} finally {
			if (tagId) await executeTag.call(liveCtx({ tagId, force: true }), 0, 'delete');
		}
	});

	destructiveIt('field lifecycle: create → get → validate → delete', async () => {
		let fieldId: string | undefined;
		try {
			const created = (await executeField.call(
				liveCtx({
					fieldType: 'text',
					fieldName: `it-field-${Date.now()}`,
					additionalFields: { is_active: true },
				}),
				0,
				'create',
			)) as any;
			fieldId = created.json.id;
			expect(fieldId).toBeTruthy();

			const got = (await executeField.call(liveCtx({ fieldId }), 0, 'get')) as any;
			expect(got.json.id).toBe(fieldId);

			const renamedField = `it-field-renamed-${Date.now()}`;
			const updated = (await executeField.call(
				liveCtx({ fieldId, updateFields: { name: renamedField } }),
				0,
				'update',
			)) as any;
			expect(updated.json.name).toBe(renamedField);

			const listed = (await executeField.call(
				liveCtx({ filters: { include_inactive: true } }),
				0,
				'list',
			)) as any;
			expect(listed.json.fields.some((field: any) => field.id === fieldId)).toBe(true);

			const validated = (await executeField.call(
				liveCtx({ fieldId, validateValue: 'hello', signerAccessCode: '' }),
				0,
				'validate',
			)) as any;
			expect(validated.json).toHaveProperty('success');
		} finally {
			if (fieldId) await executeField.call(liveCtx({ fieldId }), 0, 'delete');
		}
	});

	destructiveIt('document: upload → wait → get → activities → estimate-cost → delete', async () => {
		let documentId: string | undefined;
		try {
			const uploaded = (await executeDocument.call(
				liveCtx({ binaryPropertyName: 'data', fileName: 'sdk-test.pdf', additionalFields: {} }),
				0,
				'upload',
			)) as any;
			documentId = uploaded.json.id;
			expect(documentId).toBeTruthy();

			const ready = (await executeDocument.call(
				liveCtx({ documentId, maxWaitMs: 30000, pollIntervalMs: 2000 }),
				0,
				'waitUntilReady',
			)) as any;
			expect(['metadata_ready', 'pending_signature', 'certificated']).toContain(ready.json.status);

			const activities = (await executeDocument.call(
				liveCtx({ documentId }),
				0,
				'getActivities',
			)) as any;
			expect(Array.isArray(activities.json.activities)).toBe(true);

			const estimate = (await executeAssignment.call(
				liveCtx({
					documentId,
					method: 'virtual',
					signers: {
						signer: [{ verification_method: 'Email', notification_methods: ['Email'] }],
					},
					additionalFields: {},
				}),
				0,
				'estimateCost',
			)) as any;
			expect(estimate.json).toHaveProperty('total_credits');
		} finally {
			if (documentId) {
				await executeDocument.call(liveCtx({ documentId }), 0, 'delete');
			}
		}
	});

	workspaceIt(
		'workspace lifecycle: account + logo + webhook on one disposable workspace',
		async () => {
			let workspaceId: string | undefined;
			try {
				const created = (await executeWorkspace.call(
					liveCtx({
						name: `it-ws-${Date.now()}`,
						additionalFields: {},
					}),
					0,
					'create',
				)) as any;
				workspaceId = created.json.id;
				expect(workspaceId).toBeTruthy();

				const got = (await executeWorkspace.call(liveCtx({ workspaceId }), 0, 'get')) as any;
				expect(got.json.id).toBe(workspaceId);

				await executeWorkspace.call(
					liveCtx({
						workspaceId,
						updateFields: {
							name: `it-ws-renamed-${Date.now()}`,
						},
					}),
					0,
					'update',
				);

				// 1x1 transparent PNG, installed only on the disposable workspace.
				const png = Buffer.from(
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
					'base64',
				);
				const logoContext = liveCtx({ workspaceId, binaryPropertyName: 'data' });
				logoContext.helpers.assertBinaryData = () => ({
					fileName: 'logo.png',
					mimeType: 'image/png',
				});
				logoContext.helpers.getBinaryDataBuffer = async () => png;
				const uploadedLogo = (await executeWorkspace.call(logoContext, 0, 'uploadLogo')) as any;
				expect(uploadedLogo.json).toHaveProperty('mime_type');

				const downloadedLogo = (await executeWorkspace.call(
					liveCtx({ workspaceId, binaryOutputProperty: 'data' }),
					0,
					'downloadLogo',
				)) as any;
				expect(downloadedLogo.binary.data).toBeDefined();
				await executeWorkspace.call(liveCtx({ workspaceId }), 0, 'deleteLogo');

				const webhookContext = (params: Record<string, unknown>) =>
					liveCtx(params, workspaceId as string);
				const url = `https://example.com/assinafy-sdk-integration/${Date.now()}`;
				const email = TEST_EMAIL_PRIMARY || 'webhook-integration@example.com';
				const registered = (await executeWebhook.call(
					webhookContext({ url, email, events: ['document_ready'], isActive: true }),
					0,
					'register',
				)) as any;
				expect(registered.json.url).toBe(url);

				const current = (await executeWebhook.call(webhookContext({}), 0, 'get')) as any;
				expect(current.json.url).toBe(url);
				const history = (await executeWebhook.call(
					webhookContext({ returnAll: false, limit: 10, filters: {} }),
					0,
					'listDispatches',
				)) as any[];
				expect(Array.isArray(history)).toBe(true);
				await executeWebhook.call(webhookContext({}), 0, 'inactivate');
			} finally {
				if (workspaceId) {
					await executeWorkspace.call(liveCtx({ workspaceId, force: true }), 0, 'delete');
				}
			}
		},
	);

	destructiveIt('document: rename → search finds the renamed doc → delete', async () => {
		let documentId: string | undefined;
		try {
			const uploaded = (await executeDocument.call(
				liveCtx({
					binaryPropertyName: 'data',
					fileName: 'sdk-rename-test.pdf',
					additionalFields: {},
				}),
				0,
				'upload',
			)) as any;
			documentId = uploaded.json.id;
			expect(documentId).toBeTruthy();

			// A document can only be renamed once metadata processing has finished.
			await executeDocument.call(
				liveCtx({ documentId, maxWaitMs: 30000, pollIntervalMs: 2000 }),
				0,
				'waitUntilReady',
			);

			const newName = `it-renamed-${Date.now()}.pdf`;
			const renamed = (await executeDocument.call(
				liveCtx({ documentId, newName }),
				0,
				'rename',
			)) as any;
			expect(renamed.json.name).toBe(newName);

			const found = (await executeDocument.call(
				liveCtx({ returnAll: false, limit: 20, searchFilters: { search: newName } }),
				0,
				'search',
			)) as any[];
			expect(found.some((item) => item.json.id === documentId)).toBe(true);
		} finally {
			if (documentId) await executeDocument.call(liveCtx({ documentId }), 0, 'delete');
		}
	});

	destructiveIt('document tags: append names → replace names → detach by ID', async () => {
		let documentId: string | undefined;
		const tagIds: string[] = [];
		try {
			const stamp = Date.now();
			for (const suffix of ['a', 'b']) {
				const created = (await executeTag.call(
					liveCtx({ name: `it-document-tag-${suffix}-${stamp}`, color: '336699' }),
					0,
					'create',
				)) as any;
				tagIds.push(created.json.id);
			}

			const uploaded = (await executeDocument.call(
				liveCtx({
					binaryPropertyName: 'data',
					fileName: 'sdk-tags-test.pdf',
					additionalFields: {},
				}),
				0,
				'upload',
			)) as any;
			documentId = uploaded.json.id;
			await executeDocument.call(
				liveCtx({ documentId, maxWaitMs: 30000, pollIntervalMs: 2000 }),
				0,
				'waitUntilReady',
			);

			const firstName = `it-document-tag-a-${stamp}`;
			await executeDocument.call(liveCtx({ documentId, tagNames: [firstName] }), 0, 'appendTags');
			let attached = (await executeDocument.call(liveCtx({ documentId }), 0, 'listTags')) as any[];
			expect(attached.some((item) => item.json.name === firstName)).toBe(true);

			const secondName = `it-document-tag-b-${stamp}`;
			await executeDocument.call(liveCtx({ documentId, tagNames: [secondName] }), 0, 'replaceTags');
			attached = (await executeDocument.call(liveCtx({ documentId }), 0, 'listTags')) as any[];
			const second = attached.find((item) => item.json.name === secondName);
			expect(second?.json.id).toBeTruthy();

			await executeDocument.call(liveCtx({ documentId, tagId: second.json.id }), 0, 'detachTag');
		} finally {
			try {
				if (documentId) await executeDocument.call(liveCtx({ documentId }), 0, 'delete');
			} finally {
				await Promise.all(
					tagIds.map((tagId) => executeTag.call(liveCtx({ tagId, force: true }), 0, 'delete')),
				);
			}
		}
	});

	it('workspace: getCurrentUser + getTheme', async () => {
		const me = (await executeWorkspace.call(liveCtx({}), 0, 'getCurrentUser')) as any;
		expect(me.json.user).toBeDefined();

		const theme = (await executeWorkspace.call(
			liveCtx({ workspaceId: ACCOUNT_ID }),
			0,
			'getTheme',
		)) as any;
		expect(theme.json).toHaveProperty('primary_color');
	});

	it('read-only catalogs: statuses, field types, webhook event types', async () => {
		const statuses = (await executeDocument.call(liveCtx({}), 0, 'listStatuses')) as any;
		expect(statuses.json.statuses.length).toBeGreaterThan(0);

		const types = (await executeField.call(liveCtx({}), 0, 'listTypes')) as any;
		expect(types.json.types.length).toBeGreaterThan(0);

		const events = (await executeWebhook.call(liveCtx({}), 0, 'listEventTypes')) as any;
		expect(events.json.eventTypes.length).toBeGreaterThan(0);
	});

	it('template list and get use the configured sandbox workspace', async () => {
		const templates = (await executeTemplate.call(
			liveCtx({ returnAll: false, limit: 20, filters: {} }),
			0,
			'list',
		)) as any[];
		expect(Array.isArray(templates)).toBe(true);

		const firstTemplateId = templates[0]?.json?.id as string | undefined;
		if (firstTemplateId) {
			const template = (await executeTemplate.call(
				liveCtx({ templateId: firstTemplateId }),
				0,
				'get',
			)) as any;
			expect(template.json.id).toBe(firstTemplateId);
		}
	});

	emailIt(
		'signer + assignment lifecycle uses both configured inboxes and public token delivery',
		async () => {
			let documentId: string | undefined;
			const createdSignerIds: string[] = [];
			const signerIds: string[] = [];

			async function resolveSigner(email: string, label: string): Promise<string> {
				const found = (await executeSigner.call(liveCtx({ email }), 0, 'findByEmail')) as any;
				if (found.json.id) return found.json.id as string;
				const created = (await executeSigner.call(
					liveCtx({
						fullName: `Assinafy SDK Test ${label}`,
						email,
						// The preceding lookup proves absence. Disable SDK reuse here so a
						// lookup/create race can never mark somebody else's signer for cleanup.
						additionalFields: { reuseIfExists: false },
					}),
					0,
					'create',
				)) as any;
				createdSignerIds.push(created.json.id);
				return created.json.id as string;
			}

			try {
				signerIds.push(await resolveSigner(TEST_EMAIL_PRIMARY, 'Primary'));
				signerIds.push(await resolveSigner(TEST_EMAIL_SECONDARY, 'Secondary'));

				const uploaded = (await executeDocument.call(
					liveCtx({
						binaryPropertyName: 'data',
						fileName: 'sdk-assignment-test.pdf',
						additionalFields: {},
					}),
					0,
					'upload',
				)) as any;
				documentId = uploaded.json.id;
				await executeDocument.call(
					liveCtx({ documentId, maxWaitMs: 30000, pollIntervalMs: 2000 }),
					0,
					'waitUntilReady',
				);

				const assignment = (await executeAssignment.call(
					liveCtx({
						documentId,
						method: 'virtual',
						signers: {
							signer: signerIds.map((id) => ({
								id,
								verification_method: 'Email',
								notification_methods: ['Email'],
								step: 0,
							})),
						},
						additionalFields: { message: 'Automated Assinafy SDK sandbox integration test' },
					}),
					0,
					'create',
				)) as any;
				const assignmentId = assignment.json.id as string;
				expect(assignmentId).toBeTruthy();

				const assignments = (await executeAssignment.call(
					liveCtx({ returnAll: false, limit: 100 }),
					0,
					'list',
				)) as any[];
				expect(assignments.some((item) => item.json.id === assignmentId)).toBe(true);

				const resendEstimate = (await executeAssignment.call(
					liveCtx({ documentId, assignmentId, signerId: signerIds[0] }),
					0,
					'estimateResendCost',
				)) as any;
				expect(resendEstimate.json).toHaveProperty('total');

				await executeAssignment.call(
					liveCtx({ documentId, assignmentId, signerId: signerIds[0] }),
					0,
					'resendNotification',
				);

				const whatsapp = (await executeAssignment.call(
					liveCtx({ documentId, assignmentId }),
					0,
					'listWhatsapp',
				)) as any;
				expect(Array.isArray(whatsapp.json.notifications)).toBe(true);

				const publicInfo = (await executeDocument.call(
					liveCtx({ publicDocumentId: documentId }),
					0,
					'getPublicInfo',
				)) as any;
				expect(publicInfo.json.id).toBe(documentId);

				await executeDocument.call(
					liveCtx({
						publicDocumentId: documentId,
						recipient: TEST_EMAIL_PRIMARY,
						channel: 'email',
					}),
					0,
					'sendPublicToken',
				);
			} finally {
				try {
					if (documentId) await executeDocument.call(liveCtx({ documentId }), 0, 'delete');
				} finally {
					await Promise.all(
						createdSignerIds.map((signerId) =>
							executeSigner.call(liveCtx({ signerId }), 0, 'delete'),
						),
					);
				}
			}
		},
	);
});
