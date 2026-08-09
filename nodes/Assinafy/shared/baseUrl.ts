export const DEFAULT_BASE_URL = 'https://api.assinafy.com.br/v1';
export const SANDBOX_BASE_URL = 'https://sandbox.assinafy.com.br/v1';

export type AssinafyBaseUrlValidation =
	{ valid: true; url: string } | { valid: false; error: string };

/** Validate and normalize a base URL without requiring an n8n execution context. */
export function validateAssinafyBaseUrl(value: string): AssinafyBaseUrlValidation {
	const raw = value.trim();
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		return { valid: false, error: 'Assinafy Base URL must be a valid absolute URL' };
	}

	const hostname = parsed.hostname.toLowerCase();
	const isLoopback =
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '[::1]' ||
		hostname === '::1';
	if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
		return {
			valid: false,
			error: 'Assinafy Base URL must use HTTPS (HTTP is allowed only for loopback hosts)',
		};
	}
	if (parsed.username || parsed.password) {
		return { valid: false, error: 'Assinafy Base URL must not contain embedded credentials' };
	}
	if (parsed.search || parsed.hash) {
		return {
			valid: false,
			error: 'Assinafy Base URL must not contain a query string or fragment',
		};
	}

	const path = parsed.pathname.replace(/\/+$/, '');
	if (!path.endsWith('/v1')) {
		return { valid: false, error: 'Assinafy Base URL must include the /v1 API path' };
	}
	return { valid: true, url: `${parsed.origin}${path}` };
}
