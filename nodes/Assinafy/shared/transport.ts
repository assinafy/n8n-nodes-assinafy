import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://api.assinafy.com.br/v1';

export const CREDENTIALS_TYPE = 'assinafyApi';

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

	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url,
		headers: {
			Accept: 'application/json',
			...(options.headers ?? {}),
		},
	};

	if (options.qs && Object.keys(options.qs).length > 0) {
		requestOptions.qs = options.qs;
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

	try {
		const response = (await ctx.helpers.httpRequestWithAuthentication.call(
			ctx,
			CREDENTIALS_TYPE,
			requestOptions,
		)) as unknown;

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
	const perPage = options.perPage ?? 100;
	const url = `${baseURL}${ensureLeadingSlash(options.path)}`;

	const items: T[] = [];
	let page = 1;
	let lastPage = 1;

	do {
		const qs: IDataObject = { ...(options.qs ?? {}), page, 'per-page': perPage };
		const requestOptions: IHttpRequestOptions = {
			method: options.method,
			url,
			qs,
			headers: {
				Accept: 'application/json',
				...(options.headers ?? {}),
			},
			returnFullResponse: true,
		};

		const response = (await ctx.helpers.httpRequestWithAuthentication.call(
			ctx,
			CREDENTIALS_TYPE,
			requestOptions,
		)) as { body?: unknown; headers?: IDataObject };

		const data = unwrapEnvelope<T[] | { data?: T[] }>(response.body);
		const chunk: T[] = Array.isArray(data)
			? data
			: Array.isArray((data as { data?: T[] })?.data)
				? (data as { data: T[] }).data
				: [];
		items.push(...chunk);

		const pageCount = readPaginationHeader(response.headers, 'x-pagination-page-count');
		lastPage = pageCount ?? page;
		page += 1;
		if (chunk.length === 0) break;
	} while (page <= lastPage && lastPage > 0);

	return items;
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
