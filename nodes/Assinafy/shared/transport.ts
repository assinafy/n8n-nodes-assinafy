import { createHash } from 'node:crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchItems,
	INodeListSearchResult,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';
import { DEFAULT_BASE_URL, SANDBOX_BASE_URL, validateAssinafyBaseUrl } from './baseUrl';
import { asArray } from './utils';

export const CREDENTIALS_TYPE = 'assinafyApi';

/** Documented maximum page size (`per-page`) accepted by the API. */
const MAX_PER_PAGE = 100;

/** Bounded retry budget for transient HTTP 429 (Too Many Requests) responses. */
const MAX_RETRIES = 3;

/** Hard stop for corrupt or hostile pagination metadata. */
const MAX_PAGINATION_PAGES = 10000;

export type AssinafyContext =
	IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions | IWebhookFunctions;

export interface AssinafyRequestOptions {
	method: IHttpRequestMethods;
	path: string;
	qs?: IDataObject;
	body?: IDataObject | IDataObject[] | Buffer | FormData;
	headers?: IDataObject;
	/** Request binary response (full response with Buffer body). Used for artifact downloads. */
	returnBinary?: boolean;
	/**
	 * Skip the X-Api-Key authentication header — for `/public/*` endpoints and
	 * signer-access-code flows where the API key is irrelevant.
	 */
	skipAuth?: boolean;
}

/** Resolve the effective base URL from credentials (respects environment/custom override). */
export async function getBaseUrl(
	ctx: AssinafyContext,
	allowMissingCredentials = false,
): Promise<string> {
	let credentials: {
		environment?: string;
		customBaseUrl?: string;
		baseUrl?: string;
	};
	try {
		credentials = (await ctx.getCredentials(CREDENTIALS_TYPE)) as typeof credentials;
	} catch (error) {
		const hasSelectedCredential = Boolean(ctx.getNode().credentials?.[CREDENTIALS_TYPE]);
		if (allowMissingCredentials && !hasSelectedCredential) return DEFAULT_BASE_URL;
		throw new NodeApiError(ctx.getNode(), error as JsonObject, {
			message: hasSelectedCredential
				? 'Selected Assinafy credentials could not be loaded'
				: 'Assinafy credentials are required for this operation',
		});
	}
	if (credentials.environment === 'sandbox') return SANDBOX_BASE_URL;
	if (credentials.environment === 'custom') {
		return normalizeBaseUrl(ctx, credentials.customBaseUrl ?? '');
	}
	if (credentials.environment === 'production') return DEFAULT_BASE_URL;
	if (credentials.baseUrl) return normalizeBaseUrl(ctx, credentials.baseUrl);
	return DEFAULT_BASE_URL;
}

/** Resolve the default account (workspace) ID from credentials. Throws if missing. */
export async function getAccountId(ctx: AssinafyContext, encodeForPath = true): Promise<string> {
	const credentials = (await ctx.getCredentials(CREDENTIALS_TYPE)) as { accountId?: string };
	const accountId = String(credentials.accountId ?? '').trim();
	if (!accountId) {
		throw new NodeOperationError(ctx.getNode(), 'Assinafy credentials are missing an Account ID');
	}
	return encodeForPath ? encodeURIComponent(accountId) : accountId;
}

/** Assemble the n8n HTTP options for an Assinafy request. */
function buildHttpOptions(
	url: string,
	options: AssinafyRequestOptions,
	extra: { qs?: IDataObject; returnFullResponse?: boolean } = {},
): IHttpRequestOptions {
	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url,
		headers: {
			Accept: 'application/json',
			...(options.headers ?? {}),
		},
	};

	const qs = extra.qs ?? options.qs;
	if (qs && Object.keys(qs).length > 0) {
		requestOptions.qs = qs;
	}

	if (options.body !== undefined) {
		const body = options.body;
		if (body instanceof FormData) {
			requestOptions.body = body as unknown as IDataObject;
		} else if (Buffer.isBuffer(body)) {
			requestOptions.body = body;
		} else {
			requestOptions.body = body as unknown as IDataObject;
			requestOptions.json = true;
		}
	}

	if (options.returnBinary) {
		requestOptions.encoding = 'arraybuffer';
		requestOptions.returnFullResponse = true;
	}
	if (extra.returnFullResponse) {
		requestOptions.returnFullResponse = true;
	}

	return requestOptions;
}

/** Issue the HTTP call, retrying only read-only GET requests after HTTP 429. */
async function sendRequest(
	ctx: AssinafyContext,
	options: AssinafyRequestOptions,
	requestOptions: IHttpRequestOptions,
): Promise<unknown> {
	for (let attempt = 0; ; attempt++) {
		try {
			return options.skipAuth
				? ((await ctx.helpers.httpRequest.call(ctx, requestOptions)) as unknown)
				: ((await ctx.helpers.httpRequestWithAuthentication.call(
						ctx,
						CREDENTIALS_TYPE,
						requestOptions,
					)) as unknown);
		} catch (error) {
			if (options.method === 'GET' && getHttpCode(error) === 429 && attempt < MAX_RETRIES) {
				await sleep(retryDelayMs(error, attempt));
				continue;
			}
			throw new NodeApiError(ctx.getNode(), error as JsonObject, {
				message: `Assinafy API ${options.method} ${options.path} failed`,
			});
		}
	}
}

/**
 * Execute an authenticated request against the Assinafy API and return the
 * unwrapped `data` field from the response envelope.
 */
export async function assinafyApiRequest<T = IDataObject>(
	ctx: AssinafyContext,
	options: AssinafyRequestOptions,
): Promise<T> {
	const baseURL = await getBaseUrl(ctx, options.skipAuth === true);
	const url = `${baseURL}${ensureLeadingSlash(options.path)}`;
	const requestOptions = buildHttpOptions(url, options);

	const response = await sendRequest(ctx, options, requestOptions);
	if (options.returnBinary) {
		return response as T;
	}
	return unwrapEnvelope<T>(response);
}

/** Collect every page of a list endpoint via the X-Pagination-* headers. */
export async function assinafyApiRequestAllItems<T = IDataObject>(
	ctx: AssinafyContext,
	options: Omit<AssinafyRequestOptions, 'returnBinary'> & { perPage?: number },
): Promise<T[]> {
	const baseURL = await getBaseUrl(ctx, options.skipAuth === true);
	const perPage = clampPageSize(options.perPage ?? MAX_PER_PAGE);
	const url = `${baseURL}${ensureLeadingSlash(options.path)}`;

	const items: T[] = [];
	const seenPages = new Set<string>();
	let page = 1;
	let lastPage = 1;

	do {
		if (page > MAX_PAGINATION_PAGES) {
			throw new NodeOperationError(
				ctx.getNode(),
				`Assinafy pagination exceeded the ${MAX_PAGINATION_PAGES}-page safety limit`,
			);
		}
		const qs: IDataObject = { ...(options.qs ?? {}), page, 'per-page': perPage };
		const requestOptions = buildHttpOptions(url, options, { qs, returnFullResponse: true });

		const response = (await sendRequest(ctx, options, requestOptions)) as {
			body?: unknown;
			headers?: IDataObject;
		};

		const chunk = asArray<T>(unwrapEnvelope(response.body));
		if (chunk.length > 0) {
			const fingerprint = createHash('sha256').update(JSON.stringify(chunk)).digest('hex');
			if (seenPages.has(fingerprint)) {
				throw new NodeOperationError(
					ctx.getNode(),
					'Assinafy pagination returned a repeated page; the upstream server may be ignoring the page parameter',
				);
			}
			seenPages.add(fingerprint);
		}
		const pageCount = readPaginationHeader(response.headers, 'x-pagination-page-count');
		if (pageCount !== undefined && pageCount > MAX_PAGINATION_PAGES) {
			throw new NodeOperationError(
				ctx.getNode(),
				`Assinafy pagination declared ${pageCount} pages, exceeding the ${MAX_PAGINATION_PAGES}-page safety limit`,
			);
		}
		items.push(...chunk);
		// Some reverse proxies omit Assinafy's pagination headers. A full page is
		// therefore enough evidence to probe the next page, stopping on a short or
		// empty response.
		lastPage = pageCount ?? (chunk.length === perPage ? page + 1 : page);
		page += 1;
		if (chunk.length === 0) break;
	} while (page <= lastPage && lastPage > 0);

	return items;
}

/**
 * Run a standard list operation: honors the `returnAll`/`limit` node parameters
 * and returns one n8n item per record. Collapses the pagination boilerplate that
 * every account-scoped list resource shares.
 */
export async function executeListOperation(
	ctx: IExecuteFunctions,
	itemIndex: number,
	opts: { path: string; qs?: IDataObject; skipAuth?: boolean },
): Promise<INodeExecutionData[]> {
	const returnAll = ctx.getNodeParameter('returnAll', itemIndex, false) as boolean;

	if (returnAll) {
		const items = await assinafyApiRequestAllItems<IDataObject>(ctx, {
			method: 'GET',
			path: opts.path,
			qs: opts.qs,
			skipAuth: opts.skipAuth,
		});
		return items.map((item) => ({ json: item }));
	}

	const limit = clampPageSize(ctx.getNodeParameter('limit', itemIndex, 50) as number);
	const response = await assinafyApiRequest<IDataObject[]>(ctx, {
		method: 'GET',
		path: opts.path,
		qs: { ...(opts.qs ?? {}), 'per-page': limit },
		skipAuth: opts.skipAuth,
	});
	return asArray<IDataObject>(response).map((item) => ({ json: item }));
}

/**
 * Back a `resourceLocator` list-search picker: requests one page, maps each
 * record through `toItem`, and emits an accurate next-page token derived from
 * the X-Pagination-Page-Count header. Shared by every listSearch method.
 */
export async function searchResource(
	ctx: ILoadOptionsFunctions,
	opts: { path: string; filter?: string; paginationToken?: string; perPage?: number },
	toItem: (entry: IDataObject) => INodeListSearchItems,
): Promise<INodeListSearchResult> {
	const baseURL = await getBaseUrl(ctx);
	const perPage = clampPageSize(opts.perPage ?? 50);
	const parsedPage = opts.paginationToken ? Number.parseInt(opts.paginationToken, 10) : 1;
	const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

	const qs: IDataObject = { page, 'per-page': perPage };
	if (opts.filter) qs.search = opts.filter;

	const requestOptions: IHttpRequestOptions = {
		method: 'GET',
		url: `${baseURL}${ensureLeadingSlash(opts.path)}`,
		qs,
		headers: { Accept: 'application/json' },
		returnFullResponse: true,
	};

	const response = (await sendRequest(ctx, { method: 'GET', path: opts.path }, requestOptions)) as {
		body?: unknown;
		headers?: IDataObject;
	};

	const items = asArray<IDataObject>(unwrapEnvelope(response.body));
	const result: INodeListSearchResult = { results: items.map(toItem) };
	const pageCount = readPaginationHeader(response.headers, 'x-pagination-page-count');
	if (pageCount !== undefined ? page < pageCount : items.length === perPage) {
		result.paginationToken = String(page + 1);
	}
	return result;
}

export function unwrapEnvelope<T>(response: unknown): T {
	if (response && typeof response === 'object' && 'data' in (response as Record<string, unknown>)) {
		const envelope = response as { status?: number; data?: T };
		if (envelope.status === undefined || (envelope.status >= 200 && envelope.status < 300)) {
			return envelope.data as T;
		}
	}
	return response as T;
}

function ensureLeadingSlash(path: string): string {
	return path.startsWith('/') ? path : `/${path}`;
}

function clampPageSize(value: number): number {
	if (!Number.isFinite(value)) return MAX_PER_PAGE;
	return Math.max(1, Math.min(Math.trunc(value), MAX_PER_PAGE));
}

/**
 * Normalize a credential-supplied API origin before attaching authentication.
 * HTTPS is mandatory except for explicit loopback development URLs. User-info,
 * query strings and fragments are rejected so credentials cannot be confused
 * with, or leaked through, an ambiguous base URL.
 */
function normalizeBaseUrl(ctx: AssinafyContext, value: string): string {
	const result = validateAssinafyBaseUrl(value);
	if (!result.valid) {
		throw new NodeOperationError(ctx.getNode(), result.error);
	}
	return result.url;
}

function readPaginationHeader(headers: IDataObject | undefined, name: string): number | undefined {
	if (!headers) return undefined;
	const raw = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
	if (raw === undefined || raw === null) return undefined;
	const value = Array.isArray(raw) ? raw[0] : raw;
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/** Extract the numeric HTTP status from an n8n/axios-style request error. */
function getHttpCode(error: unknown): number | undefined {
	const raw =
		(error as { httpCode?: string | number })?.httpCode ??
		(error as { statusCode?: string | number })?.statusCode ??
		(error as { response?: { status?: string | number } })?.response?.status ??
		(error as { response?: { statusCode?: number } })?.response?.statusCode;
	if (raw === undefined || raw === null) return undefined;
	const parsed = Number.parseInt(String(raw), 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/** Honor a `Retry-After` header (seconds or HTTP-date) when present. */
function retryDelayMs(error: unknown, attempt: number): number {
	const headers = (error as { response?: { headers?: IDataObject } })?.response?.headers;
	const retryAfter = headers?.['retry-after'] ?? headers?.['Retry-After'];
	if (retryAfter !== undefined) {
		const value = String(Array.isArray(retryAfter) ? retryAfter[0] : retryAfter).trim();
		const seconds = /^\d+$/.test(value) ? Number.parseInt(value, 10) : Number.NaN;
		if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);
		const retryAt = Date.parse(value);
		if (Number.isFinite(retryAt)) return Math.max(0, Math.min(retryAt - Date.now(), 30000));
	}
	return Math.min(500 * 2 ** attempt, 30000);
}
