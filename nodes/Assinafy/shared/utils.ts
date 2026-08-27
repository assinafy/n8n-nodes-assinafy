import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Strip `undefined`/`null`/`''` and empty arrays so the resulting object only
 * carries real values. Used both for query strings and for compacting request
 * bodies. Falsy-but-meaningful values (`false`, `0`) are preserved unless the
 * key is listed in `dropZero`.
 */
export function cleanQs(filters: IDataObject, dropZero: string[] = []): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(filters)) {
		if (value === undefined || value === null || value === '') continue;
		if (Array.isArray(value) && value.length === 0) continue;
		if (dropZero.includes(key) && value === 0) continue;
		out[key] = value as IDataObject[keyof IDataObject];
	}
	return out;
}

export function wrap(data: unknown): INodeExecutionData {
	if (data === null || data === undefined) return { json: {} };
	return {
		json:
			typeof data === 'object' && !Array.isArray(data)
				? (data as IDataObject)
				: { data: data as IDataObject[keyof IDataObject] },
	};
}

/** Convert an n8n full binary response into a non-empty Buffer and MIME type. */
export function parseBinaryResponse(
	ctx: IExecuteFunctions,
	response: { body?: Buffer | ArrayBuffer | Uint8Array; headers?: IDataObject },
	defaultMimeType: string,
	label: string,
	itemIndex: number,
): { buffer: Buffer; mimeType: string } {
	const raw = response.body;
	let buffer: Buffer;
	if (Buffer.isBuffer(raw)) {
		buffer = raw;
	} else if (raw instanceof ArrayBuffer) {
		buffer = Buffer.from(raw);
	} else if (ArrayBuffer.isView(raw)) {
		buffer = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
	} else {
		buffer = Buffer.alloc(0);
	}
	if (buffer.byteLength === 0) {
		throw new NodeOperationError(ctx.getNode(), `${label} response was empty`, { itemIndex });
	}

	const header = response.headers?.['content-type'] ?? response.headers?.['Content-Type'];
	const rawContentType = Array.isArray(header) ? header[0] : header;
	const mimeType = rawContentType ? String(rawContentType).split(';')[0].trim() : defaultMimeType;
	return { buffer, mimeType };
}

export type BinaryFormat = 'pdf' | 'png' | 'jpeg';

/** Validate both the declared MIME type and the file signature before upload. */
export function assertBinaryFormat(
	ctx: IExecuteFunctions,
	buffer: Buffer,
	mimeType: string,
	allowedFormats: BinaryFormat[],
	label: string,
	itemIndex: number,
): string {
	const normalizedMime = mimeType.toLowerCase().split(';')[0].trim();
	const formatByMime: Record<string, BinaryFormat | undefined> = {
		'application/pdf': 'pdf',
		'image/png': 'png',
		'image/jpeg': 'jpeg',
		'image/jpg': 'jpeg',
	};
	const declaredFormat = formatByMime[normalizedMime];
	const detectedFormat: BinaryFormat | undefined =
		buffer.subarray(0, 5).toString('ascii') === '%PDF-'
			? 'pdf'
			: buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
				? 'png'
				: buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
					? 'jpeg'
					: undefined;

	if (!detectedFormat || !allowedFormats.includes(detectedFormat)) {
		if (declaredFormat && allowedFormats.includes(declaredFormat)) {
			throw new NodeOperationError(
				ctx.getNode(),
				`${label} content does not match its declared ${normalizedMime} type`,
				{ itemIndex },
			);
		}
		throw new NodeOperationError(ctx.getNode(), `${label} must be ${formatList(allowedFormats)}`, {
			itemIndex,
		});
	}

	const hasGenericMime = normalizedMime === '' || normalizedMime === 'application/octet-stream';
	if (!hasGenericMime && declaredFormat !== detectedFormat) {
		throw new NodeOperationError(
			ctx.getNode(),
			`${label} content does not match its declared ${normalizedMime} type`,
			{ itemIndex },
		);
	}
	return detectedFormat === 'pdf'
		? 'application/pdf'
		: detectedFormat === 'png'
			? 'image/png'
			: 'image/jpeg';
}

function formatList(formats: BinaryFormat[]): string {
	const labels = formats.map((format) => (format === 'jpeg' ? 'JPEG' : format.toUpperCase()));
	return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}`;
}

/** Require the documented array payload from a list endpoint. */
export function asArray<T = IDataObject>(response: unknown): T[] {
	if (Array.isArray(response)) return response as T[];
	throw new TypeError('Assinafy API returned an invalid list response (expected an array)');
}

/**
 * Read and validate a required per-signer access code (from the email/WhatsApp
 * link). Shared by the signer-side flows in signer.ts and signerDocument.ts.
 */
export function requireAccessCode(ctx: IExecuteFunctions, itemIndex: number): string {
	const code = (ctx.getNodeParameter('signerAccessCode', itemIndex) as string).trim();
	if (!code) {
		throw new NodeOperationError(ctx.getNode(), 'Signer Access Code is required', { itemIndex });
	}
	return code;
}

/**
 * Parse an n8n `json`-typed parameter that may arrive as a string or an already
 * parsed value. Throws a NodeOperationError naming the field when the string is
 * not valid JSON.
 */
export function parseJsonParam(
	ctx: IExecuteFunctions,
	value: unknown,
	label: string,
	itemIndex: number,
): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch {
		throw new NodeOperationError(ctx.getNode(), `${label} must be valid JSON`, { itemIndex });
	}
}

/**
 * Collapse a multi-value `tags` filter into the documented comma-separated query
 * value, or remove it entirely when empty. Shared by the document and template
 * list filters (Assinafy returns items carrying *all* listed tags).
 */
export function normalizeTagFilter(qs: IDataObject): IDataObject {
	const tags = parseStringList(qs.tags);
	if (tags.length > 0) {
		qs.tags = tags.join(',');
	} else {
		delete qs.tags;
	}
	return qs;
}

/**
 * Build a `displayOptions.show` clause scoped to a single resource. Each resource
 * imports this once and binds it to its resource name to keep field declarations
 * concise: `const show = showOnly('signer'); { displayOptions: { show: show(['create']) } }`.
 */
export const showOnly = (resource: string) => (operation: string[]) => ({
	resource: [resource],
	operation,
});

export function sanitizeCpf(value: string): string {
	return value.replace(/\D/g, '');
}

export function parseStringList(value: unknown): string[] {
	const values = Array.isArray(value) ? value : String(value ?? '').split(',');
	return values.map((entry) => String(entry ?? '').trim()).filter(Boolean);
}

export function normalizeHexColor(
	ctx: IExecuteFunctions,
	value: unknown,
	itemIndex: number,
	label = 'Tag color',
): string | undefined {
	const color = String(value ?? '')
		.trim()
		.replace(/^#/, '');
	if (!color) return undefined;
	if (!/^[0-9a-fA-F]{6}$/.test(color)) {
		throw new NodeOperationError(
			ctx.getNode(),
			`${label} must be a 6-character hex value, with or without #`,
			{ itemIndex },
		);
	}
	return color.toLowerCase();
}

export function validateSigningSteps(
	ctx: IExecuteFunctions,
	steps: Array<number | string | undefined>,
	itemIndex: number,
): void {
	const normalized = steps.map((step) => Number(step ?? 0));
	if (normalized.some((step) => !Number.isFinite(step) || !Number.isInteger(step) || step < 0)) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Signing steps must be non-negative whole numbers',
			{ itemIndex },
		);
	}
	const numericSteps = normalized.filter((step) => step > 0);
	if (numericSteps.length === 0) return;
	if (numericSteps.length !== steps.length) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Signing step must be set for every signer or omitted for every signer',
			{ itemIndex },
		);
	}
	const distinct = [...new Set(numericSteps)].sort((a, b) => a - b);
	for (let i = 0; i < distinct.length; i++) {
		if (distinct[i] !== i + 1) {
			throw new NodeOperationError(
				ctx.getNode(),
				'Signing steps must form a contiguous sequence starting at 1',
				{ itemIndex },
			);
		}
	}
}

/** Digital-certificate signers cannot share a signing step with another signer. */
export function validateDigitalCertificateSteps(
	ctx: IExecuteFunctions,
	signers: Array<{ step?: number | string; verification_method?: unknown }>,
	itemIndex: number,
): void {
	for (const signer of signers) {
		if (signer.verification_method !== 'DigitalCertificate') continue;
		const step = Number(signer.step ?? 0);
		if (signers.filter((candidate) => Number(candidate.step ?? 0) === step).length > 1) {
			throw new NodeOperationError(
				ctx.getNode(),
				'Digital Certificate signers must be alone in their signing step',
				{ itemIndex },
			);
		}
	}
}

export function assertEmail(email: string): boolean {
	return EMAIL_RE.test(email);
}

/**
 * Read a required ID parameter (supports resourceLocator extraction). Throws a
 * NodeOperationError with the configured label if the value is missing.
 */
export function extractRequiredId(
	ctx: IExecuteFunctions,
	paramName: string,
	label: string,
	itemIndex: number,
	defaultValue = '',
): string {
	const id = String(
		ctx.getNodeParameter(paramName, itemIndex, defaultValue, { extractValue: true }) ?? '',
	).trim();
	if (!id) {
		throw new NodeOperationError(ctx.getNode(), `${label} is required`, { itemIndex });
	}
	return encodeURIComponent(id);
}
