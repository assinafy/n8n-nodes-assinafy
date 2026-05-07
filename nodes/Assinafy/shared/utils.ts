import type { IDataObject, INodeExecutionData } from 'n8n-workflow';

export function cleanQs(filters: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== null && value !== '') {
			out[key] = value as IDataObject[keyof IDataObject];
		}
	}
	return out;
}

export function wrap(data: unknown): INodeExecutionData {
	return { json: (data ?? {}) as IDataObject };
}

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
	const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return EMAIL_RE.test(email);
}