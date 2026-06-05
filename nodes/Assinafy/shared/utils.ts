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
	return { json: (data ?? {}) as IDataObject };
}

/**
 * Normalize a list endpoint's response into a plain array. `assinafyApiRequest`
 * already unwraps the `{status,message,data}` envelope, so a list call returns
 * the array directly; this guards the rare doubly-wrapped shape in one place.
 */
export function asArray<T = IDataObject>(response: unknown): T[] {
	if (Array.isArray(response)) return response as T[];
	const data = (response as { data?: T[] } | null)?.data;
	return Array.isArray(data) ? data : [];
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
 * not valid JSON (unlike safeJsonParse, which swallows errors).
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

export function safeJsonParse(value: string | IDataObject): IDataObject {
	if (typeof value === 'object' && value !== null) return value;
	try {
		const parsed = JSON.parse(value);
		return typeof parsed === 'object' && parsed !== null ? (parsed as IDataObject) : {};
	} catch {
		return {};
	}
}

export function sanitizeCpf(value: string): string {
	return value.replace(/\D/g, '');
}

export function parseStringList(value: unknown): string[] {
	const values = Array.isArray(value) ? value : [value];
	return values
		.flatMap((entry) => String(entry ?? '').split(','))
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export function normalizeHexColor(
	ctx: IExecuteFunctions,
	value: unknown,
	itemIndex: number,
): string | undefined {
	const color = String(value ?? '')
		.trim()
		.replace(/^#/, '');
	if (!color) return undefined;
	if (!/^[0-9a-fA-F]{6}$/.test(color)) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Tag color must be a 6-character hex value, with or without #',
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
	const numericSteps = steps.map((step) => Number(step ?? 0)).filter((step) => step > 0);
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
): string {
	const id = ctx.getNodeParameter(paramName, itemIndex, '', { extractValue: true }) as string;
	if (!id) {
		throw new NodeOperationError(ctx.getNode(), `${label} is required`, { itemIndex });
	}
	return id;
}
