/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared test harness: builds a mock n8n execution context whose HTTP helpers
// record the request options the SDK constructs, so tests can assert the exact
// method / url / qs / body / transport (authenticated vs public) per operation.

export interface RecordedRequest {
	auth: boolean;
	options: any;
}

export interface MockOptions {
	/** The `data` payload returned inside the {status,message,data} envelope. */
	response?: unknown;
	/** Credentials returned by getCredentials. */
	credentials?: Record<string, unknown>;
	/** Body returned by helpers.getBinaryDataBuffer. */
	binaryBuffer?: Buffer;
	/** Metadata returned by helpers.assertBinaryData. */
	binaryMeta?: Record<string, unknown>;
	/** Response headers exposed on full/binary responses. */
	headers?: Record<string, string>;
	/** When set, the HTTP helpers reject with this error (to test catch paths). */
	rejectWith?: unknown;
}

const DEFAULT_CREDENTIALS = {
	accountId: 'acc_123',
	baseUrl: 'https://api.assinafy.com.br/v1',
};

export function makeCtx(params: Record<string, unknown>, opts: MockOptions = {}) {
	const requests: RecordedRequest[] = [];
	const response = 'response' in opts ? opts.response : { id: 'ok' };
	const headers = opts.headers ?? { 'content-type': 'application/pdf' };

	function buildResult(requestOptions: any): unknown {
		if (opts.rejectWith) throw opts.rejectWith;
		if (requestOptions.encoding === 'arraybuffer') {
			return {
				body: opts.binaryBuffer ?? Buffer.from('BINARY'),
				headers,
				statusCode: 200,
			};
		}
		if (requestOptions.returnFullResponse) {
			return {
				body: { status: 200, message: '', data: response },
				headers: { 'x-pagination-page-count': '1', ...headers },
				statusCode: 200,
			};
		}
		return { status: 200, message: '', data: response };
	}

	const httpRequestWithAuthentication = jest.fn(async (_type: string, requestOptions: any) => {
		requests.push({ auth: true, options: requestOptions });
		return buildResult(requestOptions);
	});
	const httpRequest = jest.fn(async (requestOptions: any) => {
		requests.push({ auth: false, options: requestOptions });
		return buildResult(requestOptions);
	});

	const ctx: any = {
		getCredentials: jest.fn().mockResolvedValue(opts.credentials ?? DEFAULT_CREDENTIALS),
		getNode: jest.fn().mockReturnValue({ name: 'Assinafy' }),
		continueOnFail: jest.fn().mockReturnValue(false),
		getInputData: jest.fn().mockReturnValue([{ json: {} }]),
		getNodeParameter: jest.fn(
			(name: string, _itemIndex: number, defaultValue?: unknown, options?: { extractValue?: boolean }) => {
				if (!(name in params)) return defaultValue;
				const value = params[name];
				if (options?.extractValue && value && typeof value === 'object' && 'value' in (value as any)) {
					return (value as any).value;
				}
				return value;
			},
		),
		helpers: {
			httpRequestWithAuthentication,
			httpRequest,
			assertBinaryData: jest.fn().mockReturnValue(
				opts.binaryMeta ?? { fileName: 'file.pdf', mimeType: 'application/pdf' },
			),
			getBinaryDataBuffer: jest.fn().mockResolvedValue(opts.binaryBuffer ?? Buffer.from('PDFDATA')),
			prepareBinaryData: jest.fn(async (buffer: Buffer, fileName: string, mimeType: string) => ({
				data: buffer.toString('base64'),
				fileName,
				mimeType,
			})),
		},
	};

	return { ctx, requests, httpRequestWithAuthentication, httpRequest };
}

/** The most recent recorded request (any transport). */
export function lastRequest(requests: RecordedRequest[]): RecordedRequest {
	return requests[requests.length - 1];
}

/** The most recent authenticated request's options. */
export function lastAuth(requests: RecordedRequest[]): any {
	const authed = requests.filter((r) => r.auth);
	return authed[authed.length - 1]?.options;
}

/** The most recent public (skipAuth) request's options. */
export function lastPublic(requests: RecordedRequest[]): any {
	const pub = requests.filter((r) => !r.auth);
	return pub[pub.length - 1]?.options;
}
