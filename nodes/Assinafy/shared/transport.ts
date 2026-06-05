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
import { NodeApiError, sleep } from 'n8n-workflow';
import { asArray } from './utils';

export const DEFAULT_BASE_URL = 'https://api.assinafy.com.br/v1';

export const CREDENTIALS_TYPE = 'assinafyApi';

/** Documented maximum page size (`per-page`) accepted by the API. */
export const MAX_PER_PAGE = 100;

/** Bounded retry budget for transient HTTP 429 (Too Many Requests) responses. */
const MAX_RETRIES = 3;

export type AssinafyContext =
	| IExecuteFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| IWebhookFunctions;

export interface AssinafyRequestOptions {
	method: IHttpRequestMethods;
	path: string;
	qs?: IDataObject;
	body?: IDataObject | Buffer | FormData;
	headers?: IDataObject;
	/** Request binary response (full response with Buffer body). Used for artifact downloads. */
	returnBinary?: boolean;
	/** Opt out of the standard {status,message,data} envelope unwrapping. */
	rawResponse?: boolean;
	/** Override the credential's base URL (used for ad-hoc calls). */
	baseUrlOverride?: string;
	/**
	 * Skip the X-Api-Key authentication header — for `/public/*` endpoints and
	 * signer-access-code flows where the API key is irrelevant.
	 */
	skipAuth?: boolean;
}

export interface AssinafyBinaryResponse {
	body: Buffer;
	headers: IDataObject;
	statusCode: number;
}

/** Resolve the effective base URL from credentials (respects environment/custom override). */
export async function getBaseUrl(ctx: AssinafyContext): Promise<string> {
	const credentials = (await ctx.getCredentials(CREDENTIALS_TYPE)) as {
		environment?: string;
		customBaseUrl?: string;
		baseUrl?: string;
	};
	if (credentials.baseUrl) return stripTrailingSlash(credentials.baseUrl);
	if (credentials.environment === 'sandbox') return 'https://sandbox.assinafy.com.br/v1';
	if (credentials.environment === 'custom' && credentials.customBaseUrl) {
		return stripTrailingSlash(credentials.customBaseUrl);
	}
	return DEFAULT_BASE_URL;
}

/** Resolve the default account (workspace) ID from credentials. Throws if missing. */
export async function getAccountId(ctx: AssinafyContext): Promise<string> {
	const credentials = (await ctx.getCredentials(CREDENTIALS_TYPE)) as { accountId?: string };
	const accountId = credentials.accountId;
	if (!accountId) {
		throw new Error('Assinafy credentials are missing an Account ID');
	}
	return accountId;
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
		if (options.body instanceof FormData) {
			requestOptions.body = options.body as unknown as IDataObject;
		} else if (Buffer.isBuffer(options.body)) {
			requestOptions.body = options.body;
		} else {
			requestOptions.body = options.body;
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

/** Issue the HTTP call (auth or unauthenticated) with bounded retry on HTTP 429. */
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
			if (getHttpCode(error) === 429 && attempt < MAX_RETRIES) {
				await sleep(retryDelayMs(error, attempt));
				continue;
			}
			throw error;
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
	const baseURL = options.baseUrlOverride ?? (await getBaseUrl(ctx));
	const url = `${baseURL}${ensureLeadingSlash(options.path)}`;
	const requestOptions = buildHttpOptions(url, options);

	try {
		const response = await sendRequest(ctx, options, requestOptions);
		if (options.returnBinary || options.rawResponse) {
			return response as T;
		}
		return unwrapEnvelope<T>(response);
	} catch (error) {
		throw new NodeApiError(ctx.getNode(), error as JsonObject, {
			message: `Assinafy API ${options.method} ${options.path} failed`,
		});
	}
}

/** Collect every page of a list endpoint via the X-Pagination-* headers. */
export async function assinafyApiRequestAllItems<T = IDataObject>(
	ctx: AssinafyContext,
	options: Omit<AssinafyRequestOptions, 'rawResponse' | 'returnBinary'> & { perPage?: number },
): Promise<T[]> {
	const baseURL = options.baseUrlOverride ?? (await getBaseUrl(ctx));
	const perPage = Math.min(options.perPage ?? MAX_PER_PAGE, MAX_PER_PAGE);
	const url = `${baseURL}${ensureLeadingSlash(options.path)}`;

	const items: T[] = [];
	let page = 1;
	let lastPage = 1;

	do {
		const qs: IDataObject = { ...(options.qs ?? {}), page, 'per-page': perPage };
		const requestOptions = buildHttpOptions(url, options, { qs, returnFullResponse: true });

		let response: { body?: unknown; headers?: IDataObject };
		try {
			response = (await sendRequest(ctx, options, requestOptions)) as {
				body?: unknown;
				headers?: IDataObject;
			};
		} catch (error) {
			throw new NodeApiError(ctx.getNode(), error as JsonObject, {
				message: `Assinafy API ${options.method} ${options.path} failed`,
			});
		}

		const chunk = asArray<T>(unwrapEnvelope(response.body));
		items.push(...chunk);

		const pageCount = readPaginationHeader(response.headers, 'x-pagination-page-count');
		lastPage = pageCount ?? page;
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
	opts: { path: string; qs?: IDataObject; headers?: IDataObject },
): Promise<INodeExecutionData[]> {
	const returnAll = ctx.getNodeParameter('returnAll', itemIndex, false) as boolean;

	if (returnAll) {
		const items = await assinafyApiRequestAllItems<IDataObject>(ctx, {
			method: 'GET',
			path: opts.path,
			qs: opts.qs,
			headers: opts.headers,
		});
		return items.map((item) => ({ json: item }));
	}

	const limit = ctx.getNodeParameter('limit', itemIndex, 50) as number;
	const response = await assinafyApiRequest<IDataObject[] | { data?: IDataObject[] }>(ctx, {
		method: 'GET',
		path: opts.path,
		qs: { ...(opts.qs ?? {}), 'per-page': limit },
		headers: opts.headers,
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
	const perPage = opts.perPage ?? 50;
	const page = opts.paginationToken ? Number.parseInt(opts.paginationToken, 10) : 1;

	const qs: IDataObject = { page, 'per-page': perPage };
	if (opts.filter) qs.search = opts.filter;

	const requestOptions: IHttpRequestOptions = {
		method: 'GET',
		url: `${baseURL}${ensureLeadingSlash(opts.path)}`,
		qs,
		headers: { Accept: 'application/json' },
		returnFullResponse: true,
	};

	let response: { body?: unknown; headers?: IDataObject };
	try {
		response = (await ctx.helpers.httpRequestWithAuthentication.call(
			ctx,
			CREDENTIALS_TYPE,
			requestOptions,
		)) as { body?: unknown; headers?: IDataObject };
	} catch (error) {
		throw new NodeApiError(ctx.getNode(), error as JsonObject, {
			message: `Assinafy API GET ${opts.path} failed`,
		});
	}

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

function stripTrailingSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

function readPaginationHeader(
	headers: IDataObject | undefined,
	name: string,
): number | undefined {
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
		(error as { response?: { statusCode?: number } })?.response?.statusCode;
	if (raw === undefined || raw === null) return undefined;
	const parsed = Number.parseInt(String(raw), 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/** Honor a `Retry-After` header (seconds) when present, else exponential backoff. */
function retryDelayMs(error: unknown, attempt: number): number {
	const headers = (error as { response?: { headers?: IDataObject } })?.response?.headers;
	const retryAfter = headers?.['retry-after'] ?? headers?.['Retry-After'];
	if (retryAfter !== undefined) {
		const seconds = Number.parseInt(String(Array.isArray(retryAfter) ? retryAfter[0] : retryAfter), 10);
		if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);
	}
	return Math.min(500 * 2 ** attempt, 30000);
}
