import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strip undefined/null/'' values so the query string only carries real filters. */
export function cleanQs(filters: IDataObject, dropZero: string[] = []): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(filters)) {
		if (value === undefined || value === null || value === '') continue;
		if (dropZero.includes(key) && value === 0) continue;
		out[key] = value as IDataObject[keyof IDataObject];
	}
	return out;
}

export function wrap(data: unknown): INodeExecutionData {
	return { json: (data ?? {}) as IDataObject };
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