import { executeEnvelope } from '../nodes/Assinafy/resources/envelope';
import { executeEmbeddedSigning } from '../nodes/Assinafy/resources/embeddedSigning';
import { executeWorkspace } from '../nodes/Assinafy/resources/workspace';
import { executeSignerDocument } from '../nodes/Assinafy/resources/signerDocument';
import { executeAssignment } from '../nodes/Assinafy/resources/assignment';
import { executeDocument } from '../nodes/Assinafy/resources/document';
import { executeWebhook } from '../nodes/Assinafy/resources/webhook';
import { executeContract } from '../nodes/Assinafy/resources/contract';
import {
	assinafyApiRequest,
	assinafyApiRequestAllItems,
	searchResource,
} from '../nodes/Assinafy/shared/transport';
import { makeCtx, lastAuth, lastPublic } from './helpers';

const base = 'https://api.assinafy.com.br/v1';
const ids = {
	envelopeId: 'env/a?',
	signerId: 'signer/a?',
	documentId: 'doc/a?',
	assignmentId: 'assignment/a?',
};
const root = '/accounts/acc_123/envelopes';

it.each([false, true])(
	'sends the explicit webhook rotation grace period (%s)',
	async (keepPreviousSecret) => {
		const { ctx, requests } = makeCtx({ endpointId: 'endpoint', keepPreviousSecret });
		await executeWebhook.call(ctx, 0, 'rotateEndpointSecret');
		expect(lastAuth(requests).body).toEqual({ keep_previous: keepPreviousSecret });
	},
);

it('preserves optional workspace and contract expansions', async () => {
	const workspace = makeCtx({ workspaceId: 'workspace', expandSigningFeatures: true });
	await executeWorkspace.call(workspace.ctx, 0, 'get');
	expect(lastAuth(workspace.requests).qs).toEqual({ expand: 'signing_features' });
	const contract = makeCtx({ documentId: 'document', expandDocument: true });
	await executeContract.call(contract.ctx, 0, 'getRelated');
	expect(lastAuth(contract.requests).qs).toEqual({ expand: 'document' });
});

it.each(['list', 'search'])(
	'filters signer documents by envelope without workspace authentication (%s)',
	async (operation) => {
		const { ctx, requests } = makeCtx(
			{
				signerId: 'signer',
				signerAccessCode: 'code',
				envelopeId: 'envelope',
				returnAll: false,
			},
			{ response: [] },
		);
		await executeSignerDocument.call(ctx, 0, operation);
		expect(lastPublic(requests).qs).toMatchObject({
			envelope_id: 'envelope',
			'signer-access-code': 'code',
		});
		expect(requests.every((r) => !r.auth)).toBe(true);
	},
);

it('expands the current signer document envelope', async () => {
	const { ctx, requests } = makeCtx({
		signerId: 'signer',
		signerAccessCode: 'code',
		expandEnvelope: true,
	});
	await executeSignerDocument.call(ctx, 0, 'getCurrent');
	expect(lastPublic(requests).qs).toEqual({ expand: 'envelope', 'signer-access-code': 'code' });
});

describe('Envelope', () => {
	it.each([
		['get', 'GET', `${root}/env%2Fa%3F`],
		['delete', 'DELETE', `${root}/env%2Fa%3F`],
		['cancel', 'PUT', `${root}/env%2Fa%3F/cancel`],
		['removeDocument', 'DELETE', `${root}/env%2Fa%3F/documents/doc%2Fa%3F`],
		['resendNotification', 'PUT', `${root}/env%2Fa%3F/signers/signer%2Fa%3F/resend`],
	])('%s encodes IDs and preserves array-valued mutations', async (operation, method, path) => {
		const { ctx, requests } = makeCtx(ids, { response: [{ id: 'doc', cancelled: false }] });
		const output = await executeEnvelope.call(ctx, 0, operation);
		expect(lastAuth(requests)).toMatchObject({ method, url: base + path });
		expect(output).toEqual({ json: { data: [{ id: 'doc', cancelled: false }] } });
	});
	it.each([
		['create', 'POST', root],
		['estimateCost', 'POST', `${root}/estimate-cost`],
		['update', 'PATCH', `${root}/env%2Fa%3F`],
		['addDocument', 'POST', `${root}/env%2Fa%3F/documents`],
	])(
		'%s preserves complete JSON and sends the idempotency key only on creation',
		async (operation, method, path) => {
			const body = {
				name: 'Fixture',
				message: null,
				max_total_credits: 0,
				signers: [{ id: 'signer', embedded: false }],
				documents: [{ id: 'doc', expires_at: null, signer_ids: ['signer'], entries: [] }],
			};
			const { ctx, requests } = makeCtx({
				...ids,
				envelopeBody: JSON.stringify(body),
				idempotencyKey: 'Stable Case Sensitive Key',
			});
			await executeEnvelope.call(ctx, 0, operation);
			expect(lastAuth(requests)).toMatchObject({ method, url: base + path, body });
			expect(lastAuth(requests).headers['Idempotency-Key']).toBe(
				operation === 'create' ? 'Stable Case Sensitive Key' : undefined,
			);
		},
	);
	it.each(['list', 'getActivities'])(
		'%s paginates and emits one item per resource',
		async (operation) => {
			const { ctx, requests } = makeCtx(
				{ ...ids, returnAll: true, filters: { status: 'open', search: 'Fixture' }, sort: 'id' },
				{ response: [{ id: 1 }, { id: 2 }] },
			);
			expect(await executeEnvelope.call(ctx, 0, operation)).toEqual([
				{ json: { id: 1 } },
				{ json: { id: 2 } },
			]);
			expect(lastAuth(requests).qs).toMatchObject(
				operation === 'list'
					? { status: 'open', search: 'Fixture', page: 1 }
					: { sort: 'id', page: 1 },
			);
		},
	);
	it('downloads ZIP bytes using binary storage', async () => {
		const { ctx, requests } = makeCtx(
			{ ...ids, binaryOutputProperty: 'archive', artifact: 'original' },
			{ binaryBuffer: Buffer.from('ZIP'), headers: { 'Content-Type': 'application/zip' } },
		);
		const result = await executeEnvelope.call(ctx, 0, 'download');
		expect(lastAuth(requests).url).toBe(`${base}${root}/env%2Fa%3F/download/original`);
		expect(result).toMatchObject({ binary: { archive: { mimeType: 'application/zip' } } });
		expect(ctx.helpers.prepareBinaryData).toHaveBeenCalledWith(
			Buffer.from('ZIP'),
			expect.any(String),
			'application/zip',
		);
	});
	it.each(['[]', 'null', '1', 'bad-json'])('rejects an invalid body: %s', async (envelopeBody) => {
		const { ctx, requests } = makeCtx({ envelopeBody });
		await expect(executeEnvelope.call(ctx, 0, 'create')).rejects.toThrow('Envelope must be');
		expect(requests).toHaveLength(0);
	});
	it('rejects unknown operations and missing identifiers before HTTP', async () => {
		const { ctx, requests } = makeCtx({});
		await expect(executeEnvelope.call(ctx, 0, 'bad')).rejects.toThrow('Unknown envelope operation');
		await expect(executeEnvelope.call(ctx, 0, 'get')).rejects.toThrow('Envelope ID is required');
		expect(requests).toHaveLength(0);
	});
});

describe('Embedded Signing', () => {
	it.each([
		['addOrigin', 'POST', ''],
		['updateOrigin', 'PUT', '/origin%2Fa'],
		['removeOrigin', 'DELETE', '/origin%2Fa'],
	])('%s sends the origin contract', async (operation, method, suffix) => {
		const { ctx, requests } = makeCtx(
			{ originId: 'origin/a', origin: 'https://app.example.com' },
			{ response: [] },
		);
		expect(await executeEmbeddedSigning.call(ctx, 0, operation)).toEqual({ json: { data: [] } });
		expect(lastAuth(requests)).toMatchObject({
			method,
			url: `${base}/accounts/acc_123/embed-origins${suffix}`,
		});
		expect(lastAuth(requests).body).toEqual(
			operation === 'removeOrigin' ? undefined : { origin: 'https://app.example.com' },
		);
	});
	it('lists one item per origin', async () => {
		const { ctx } = makeCtx(
			{},
			{ response: [{ id: 'origin', origin: 'https://app.example.com' }] },
		);
		expect(await executeEmbeddedSigning.call(ctx, 0, 'listOrigins')).toEqual([
			{ json: { id: 'origin', origin: 'https://app.example.com' } },
		]);
	});
	it.each(['addOrigin', 'listOrigins', 'updateOrigin', 'removeOrigin'])(
		'rejects OAuth for %s before any request',
		async (operation) => {
			const { ctx, requests } = makeCtx({ authentication: 'oAuth2' });
			await expect(executeEmbeddedSigning.call(ctx, 0, operation)).rejects.toThrow(
				'not available to OAuth',
			);
			expect(requests).toHaveLength(0);
		},
	);
	it('creates a secret session without requesting an access code', async () => {
		const response = {
			url: 'https://app.example.com/embed/test-token',
			expires_at: '2026-12-01T00:05:00Z',
		};
		const { ctx, requests } = makeCtx(ids, { response });
		expect(await executeEmbeddedSigning.call(ctx, 0, 'createSession')).toEqual({ json: response });
		expect(lastAuth(requests)).toMatchObject({
			method: 'POST',
			url: `${base}/documents/doc%2Fa%3F/assignments/assignment%2Fa%3F/signers/signer%2Fa%3F/embed-sessions`,
		});
	});
	it('does not replay a rate-limited session creation', async () => {
		const { ctx, requests } = makeCtx(ids, {
			rejectWith: { httpCode: 429, response: { headers: { 'retry-after': '0' } } },
		});
		await expect(executeEmbeddedSigning.call(ctx, 0, 'createSession')).rejects.toThrow();
		expect(requests).toHaveLength(1);
	});
	it('rejects unknown operations and empty origins', async () => {
		const { ctx, requests } = makeCtx({ origin: '  ' });
		await expect(executeEmbeddedSigning.call(ctx, 0, 'bad')).rejects.toThrow(
			'Unknown embedded signing',
		);
		await expect(executeEmbeddedSigning.call(ctx, 0, 'addOrigin')).rejects.toThrow(
			'Origin is required',
		);
		expect(requests).toHaveLength(0);
	});
});

describe('Workspace usage and notification controls', () => {
	it.each([
		['getUsage', 'GET', '/accounts/acc%2Fa/usage'],
		['getNotificationPolicy', 'GET', '/accounts/acc%2Fa/notification-policy'],
		['updateNotificationPolicy', 'PUT', '/accounts/acc%2Fa/notification-policy'],
		['getPushPreferences', 'GET', '/users/self/push-preferences'],
		['updatePushPreferences', 'PUT', '/users/self/push-preferences'],
	])('%s preserves false and checks OAuth before discovery', async (operation, method, path) => {
		const notificationSettings =
			operation === 'updatePushPreferences'
				? { SignerViewed: false }
				: { owners_receive_all: false, events: { SignerViewed: false } };
		const { ctx, requests } = makeCtx({ workspaceId: 'acc/a', notificationSettings });
		await executeWorkspace.call(ctx, 0, operation);
		expect(lastAuth(requests)).toMatchObject({ method, url: base + path });
		expect(lastAuth(requests).body).toEqual(method === 'PUT' ? notificationSettings : undefined);
		const oauth = makeCtx({ authentication: 'oAuth2' });
		await expect(executeWorkspace.call(oauth.ctx, 0, operation)).rejects.toThrow(
			'not available to OAuth',
		);
		expect(oauth.requests).toHaveLength(0);
	});
});

describe('Signer branding and certified copies', () => {
	it.each([
		['getSigningTheme', 'GET', '/sign/theme'],
		['sendCertifiedCopy', 'POST', '/sign/certified-copy'],
		['resendCertifiedCopy', 'POST', '/signers/downloads/token%2Fa/resend'],
	])('%s sends only its bearer credential', async (operation, method, path) => {
		const { ctx, requests } = makeCtx({
			signerAccessCode: 'secret-code',
			downloadToken: 'token/a',
			certifiedCopyDocumentId: 'other-doc',
		});
		await executeSignerDocument.call(ctx, 0, operation);
		expect(requests.every((r) => !r.auth)).toBe(true);
		expect(lastPublic(requests)).toMatchObject({ method, url: base + path });
		expect(lastPublic(requests).qs).toEqual(
			operation === 'resendCertifiedCopy' ? undefined : { 'signer-access-code': 'secret-code' },
		);
		expect(lastPublic(requests).body).toEqual(
			operation === 'sendCertifiedCopy' ? { document_id: 'other-doc' } : undefined,
		);
	});
	it.each([
		['downloadCertifiedCopy', false, '/signers/downloads/token%2Fa', 'application/pdf'],
		['downloadCertifiedCopy', true, '/signers/downloads/token%2Fa/pades', 'application/pdf'],
		['downloadSigningLogo', false, '/sign/logo', 'image/jpeg'],
	])(
		'%s downloads binary without following expired-link redirects',
		async (operation, pades, path, mime) => {
			const { ctx, requests } = makeCtx(
				{
					signerAccessCode: 'secret-code',
					downloadToken: 'token/a',
					pades,
					binaryOutputProperty: 'file',
				},
				{ headers: { 'content-type': mime } },
			);
			const result = await executeSignerDocument.call(ctx, 0, operation);
			expect(lastPublic(requests)).toMatchObject({
				url: base + path,
				disableFollowRedirect: true,
				encoding: 'arraybuffer',
			});
			expect(result).toMatchObject({ binary: { file: { mimeType: mime } } });
			expect(JSON.stringify(result)).not.toContain('token/a');
		},
	);
	it.each(['downloadCertifiedCopy', 'downloadSigningLogo'])(
		'rejects an HTML page instead of silently saving it: %s',
		async (operation) => {
			const { ctx } = makeCtx(
				{ signerAccessCode: 'code', downloadToken: 'token' },
				{ headers: { 'content-type': 'text/html' } },
			);
			await expect(executeSignerDocument.call(ctx, 0, operation)).rejects.toThrow(
				'did not return the requested file',
			);
		},
	);
	it.each([
		'getSigningTheme',
		'sendCertifiedCopy',
		'downloadSigningLogo',
		'downloadCertifiedCopy',
		'resendCertifiedCopy',
	])('rejects missing credentials before HTTP: %s', async (operation) => {
		const { ctx, requests } = makeCtx({ signerAccessCode: '', downloadToken: '' });
		await expect(executeSignerDocument.call(ctx, 0, operation)).rejects.toThrow('is required');
		expect(requests).toHaveLength(0);
	});
	it('redacts download tokens from the transport error message', async () => {
		const { ctx } = makeCtx({}, { rejectWith: { httpCode: 404 } });
		await expect(
			assinafyApiRequest(ctx, {
				method: 'GET',
				path: '/signers/downloads/secret-token/resend',
				skipAuth: true,
			}),
		).rejects.toThrow('/signers/downloads/[redacted]/resend');
	});
});

it('sends a webhook test to exactly the selected endpoint', async () => {
	const { ctx, requests } = makeCtx({ endpointId: 'endpoint/a', authentication: 'oAuth2' });
	await executeWebhook.call(ctx, 0, 'testEndpoint');
	expect(lastAuth(requests)).toMatchObject({
		method: 'POST',
		url: `${base}/accounts/acc_123/webhooks/endpoints/endpoint%2Fa/test`,
	});
});
it('preserves zero credit ceilings and embedded=false in assignment creation, excluding them from estimation', async () => {
	const { ctx, requests } = makeCtx({
		documentId: 'doc',
		signers: { signer: [{ id: 's', embedded: false }] },
		additionalFields: { max_total_credits: 0 },
	});
	await executeAssignment.call(ctx, 0, 'create');
	expect(lastAuth(requests).body).toEqual({
		method: 'virtual',
		signers: [{ id: 's', embedded: false }],
		max_total_credits: 0,
	});
	await executeAssignment.call(ctx, 0, 'estimateCost');
	expect(lastAuth(requests).body).toEqual({ method: 'virtual', signers: [{}] });
});
it('preserves template credit ceilings, embedded signers and idempotency keys', async () => {
	const { ctx, requests } = makeCtx({
		templateId: 'template',
		templateSigners: { signer: [{ role_id: 'role', id: 's', embedded: true }] },
		additionalFields: { max_total_credits: 0 },
		idempotencyKey: 'stable-key',
	});
	await executeDocument.call(ctx, 0, 'createFromTemplate');
	expect(lastAuth(requests)).toMatchObject({
		headers: { 'Idempotency-Key': 'stable-key' },
		body: { signers: [{ role_id: 'role', id: 's', embedded: true }], max_total_credits: 0 },
	});
});
it('requests envelope expansion and switches signer documents explicitly', async () => {
	const doc = makeCtx({ documentId: 'doc', expand: ['envelope', 'envelope_id'] });
	await executeDocument.call(doc.ctx, 0, 'get');
	expect(lastAuth(doc.requests).qs).toEqual({ expand: 'envelope,envelope_id' });
	const signer = makeCtx({
		signerAccessCode: 'code',
		signPageOptions: { document_id: 'second', expandEnvelope: true },
	});
	await executeAssignment.call(signer.ctx, 0, 'getSignPage');
	expect(lastPublic(signer.requests).qs).toEqual({
		'signer-access-code': 'code',
		document_id: 'second',
		expand: 'envelope',
	});
});
it.each([undefined, '50', '20'])(
	'continues past server-capped pages without a page count (%s)',
	async (pageSize) => {
		const size = Number(pageSize || 50);
		const first = Array.from({ length: size }, (_, id) => ({ id: String(id) }));
		const { ctx, httpRequestWithAuthentication } = makeCtx({});
		httpRequestWithAuthentication
			.mockResolvedValueOnce({
				body: { data: first },
				headers: pageSize ? { 'X-Pagination-Per-Page': pageSize } : {},
			})
			.mockResolvedValueOnce({ body: { data: [{ id: 'last' }] }, headers: {} });
		const result = await assinafyApiRequestAllItems(ctx, {
			method: 'GET',
			path: '/accounts/acc_123/signers',
			perPage: 100,
		});
		expect(result).toHaveLength(size + 1);
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
		httpRequestWithAuthentication.mockResolvedValueOnce({
			body: { data: first },
			headers: pageSize ? { 'X-Pagination-Per-Page': pageSize } : {},
		});
		const picker = await searchResource(
			ctx,
			{ path: '/accounts/acc_123/signers', perPage: 100 },
			(entry) => ({ name: String(entry.id), value: String(entry.id) }),
		);
		expect(picker.paginationToken).toBe('2');
	},
);
