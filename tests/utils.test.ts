/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	asArray,
	assertBinaryFormat,
	assertEmail,
	cleanQs,
	extractRequiredId,
	normalizeHexColor,
	parseStringList,
	sanitizeCpf,
	showOnly,
	validateDigitalCertificateSteps,
	validateSigningSteps,
	wrap,
} from '../nodes/Assinafy/shared/utils';

describe('shared/utils', () => {
	describe('cleanQs', () => {
		it('should remove undefined, null, and empty string values', () => {
			const input = {
				name: 'John',
				email: '',
				age: undefined,
				city: null,
				active: false,
			};
			const result = cleanQs(input);
			expect(result).toEqual({
				name: 'John',
				active: false,
			});
		});

		it('should keep falsy values like false, 0', () => {
			const input = { active: false, count: 0, name: 'test' };
			const result = cleanQs(input);
			expect(result).toEqual({ active: false, count: 0, name: 'test' });
		});

		it('should return empty object for empty input', () => {
			expect(cleanQs({})).toEqual({});
		});

		it('should handle nested objects', () => {
			const input = { name: 'John', meta: { a: 1, b: undefined } };
			const result = cleanQs(input);
			expect(result).toEqual({ name: 'John', meta: { a: 1, b: undefined } });
		});

		it('should drop zero values for keys listed in dropZero', () => {
			const input = { from: 0, to: 1700000000, event: 'document_ready' };
			const result = cleanQs(input, ['from', 'to']);
			expect(result).toEqual({ to: 1700000000, event: 'document_ready' });
		});

		it('should keep zero values for keys not in dropZero', () => {
			const input = { count: 0, name: 'John' };
			const result = cleanQs(input, ['from']);
			expect(result).toEqual({ count: 0, name: 'John' });
		});
	});

	describe('asArray', () => {
		it('returns documented array payloads unchanged', () => {
			const items = [{ id: 'one' }, { id: 'two' }];
			expect(asArray(items)).toBe(items);
		});

		it.each([null, {}, { data: [] }, 'not-an-array'])(
			'rejects an invalid list payload: %j',
			(payload) => {
				expect(() => asArray(payload)).toThrow('invalid list response');
			},
		);
	});

	describe('showOnly', () => {
		it('should build a displayOptions show clause scoped to a resource', () => {
			const show = showOnly('signer');
			expect(show(['create'])).toEqual({ resource: ['signer'], operation: ['create'] });
			expect(show(['get', 'update'])).toEqual({
				resource: ['signer'],
				operation: ['get', 'update'],
			});
		});
	});

	describe('extractRequiredId', () => {
		const createCtx = (value: string) => ({
			getNodeParameter: jest.fn().mockReturnValue(value),
			getNode: jest.fn().mockReturnValue({ name: 'TestNode' }),
		});

		it('returns the value when present', () => {
			const ctx = createCtx(' abc123 ');
			expect(extractRequiredId(ctx as any, 'documentId', 'Document ID', 0)).toBe('abc123');
			expect(ctx.getNodeParameter).toHaveBeenCalledWith('documentId', 0, '', {
				extractValue: true,
			});
		});

		it('throws NodeOperationError when missing', () => {
			const ctx = createCtx('');
			expect(() => extractRequiredId(ctx as any, 'signerId', 'Signer ID', 2)).toThrow(
				'Signer ID is required',
			);
		});

		it('encodes an opaque ID as one safe URL path segment', () => {
			const ctx = createCtx('opaque/id?value');
			expect(extractRequiredId(ctx as any, 'documentId', 'Document ID', 0)).toBe(
				'opaque%2Fid%3Fvalue',
			);
		});
	});

	describe('wrap', () => {
		it('should wrap data in INodeExecutionData format', () => {
			const data = { id: '123', name: 'Test' };
			const result = wrap(data);
			expect(result).toEqual({ json: { id: '123', name: 'Test' } });
		});

		it('should handle null/undefined data gracefully', () => {
			expect(wrap(null)).toEqual({ json: {} });
			expect(wrap(undefined)).toEqual({ json: {} });
		});

		it('should preserve nested structures', () => {
			const data = { users: [{ id: 1 }, { id: 2 }], count: 2 };
			const result = wrap(data);
			expect(result.json.users).toHaveLength(2);
			expect(result.json.count).toBe(2);
		});

		it('keeps an array response inside a valid n8n JSON object', () => {
			expect(wrap([])).toEqual({ json: { data: [] } });
			expect(wrap([{ id: 'tag_1' }])).toEqual({ json: { data: [{ id: 'tag_1' }] } });
		});
	});

	describe('sanitizeCpf', () => {
		it('should remove all non-digit characters', () => {
			expect(sanitizeCpf('123.456.789-00')).toBe('12345678900');
			expect(sanitizeCpf('12345678900')).toBe('12345678900');
		});

		it('should handle empty string', () => {
			expect(sanitizeCpf('')).toBe('');
		});

		it('should handle string with only special characters', () => {
			expect(sanitizeCpf('...---...')).toBe('');
		});

		it('should preserve digits only', () => {
			expect(sanitizeCpf('abc123def456')).toBe('123456');
		});
	});

	describe('parseStringList', () => {
		it('should parse comma-separated scalar strings and trim arrays', () => {
			expect(parseStringList('one, two,three')).toEqual(['one', 'two', 'three']);
			expect(parseStringList(['one', ' two ', 'three'])).toEqual(['one', 'two', 'three']);
		});

		it('preserves commas inside array entries', () => {
			expect(parseStringList(['ACME, Inc.', ' Legal '])).toEqual(['ACME, Inc.', 'Legal']);
		});

		it('should drop empty values', () => {
			expect(parseStringList(['', 'one', ' ', 'two', undefined])).toEqual(['one', 'two']);
		});
	});

	describe('normalizeHexColor', () => {
		const ctx = {
			getNode: jest.fn().mockReturnValue({ name: 'TestNode' }),
		};

		it('should normalize valid hex colors', () => {
			expect(normalizeHexColor(ctx as any, '#FF8800', 0)).toBe('ff8800');
			expect(normalizeHexColor(ctx as any, '112233', 0)).toBe('112233');
			expect(normalizeHexColor(ctx as any, '', 0)).toBeUndefined();
		});

		it('should reject invalid hex colors', () => {
			expect(() => normalizeHexColor(ctx as any, 'red', 0)).toThrow(
				'Tag color must be a 6-character hex value',
			);
		});

		it('supports a field-specific validation label', () => {
			expect(() => normalizeHexColor(ctx as any, 'red', 0, 'Primary Color')).toThrow(
				'Primary Color must be a 6-character hex value',
			);
		});
	});

	describe('assertBinaryFormat', () => {
		const ctx = {
			getNode: jest.fn().mockReturnValue({ name: 'TestNode' }),
		};

		it('accepts matching PDF, PNG, and JPEG signatures', () => {
			expect(
				assertBinaryFormat(
					ctx as any,
					Buffer.from('%PDF-1.7\n'),
					'application/pdf',
					['pdf'],
					'Document',
					0,
				),
			).toBe('application/pdf');
			expect(
				assertBinaryFormat(
					ctx as any,
					Buffer.from('89504e470d0a1a0a', 'hex'),
					'image/png',
					['png'],
					'Image',
					0,
				),
			).toBe('image/png');
			expect(
				assertBinaryFormat(
					ctx as any,
					Buffer.from('ffd8ffe000', 'hex'),
					'image/jpg',
					['jpeg'],
					'Image',
					0,
				),
			).toBe('image/jpeg');
		});

		it('infers an allowed format from magic bytes for generic binary MIME types', () => {
			expect(
				assertBinaryFormat(
					ctx as any,
					Buffer.from('%PDF-1.7\n'),
					'application/octet-stream',
					['pdf'],
					'Document',
					0,
				),
			).toBe('application/pdf');
		});

		it('rejects a recognized MIME type that contradicts the magic bytes', () => {
			expect(() =>
				assertBinaryFormat(
					ctx as any,
					Buffer.from('ffd8ffe000', 'hex'),
					'image/png',
					['png', 'jpeg'],
					'Image',
					0,
				),
			).toThrow('content does not match');
		});

		it('rejects unsupported or spoofed content', () => {
			expect(() =>
				assertBinaryFormat(ctx as any, Buffer.from('text'), 'text/plain', ['pdf'], 'Document', 0),
			).toThrow('Document must be PDF');
			expect(() =>
				assertBinaryFormat(ctx as any, Buffer.from('not png'), 'image/png', ['png'], 'Image', 0),
			).toThrow('content does not match');
		});
	});

	describe('validateSigningSteps', () => {
		const ctx = {
			getNode: jest.fn().mockReturnValue({ name: 'TestNode' }),
		};

		it('should allow omitted or contiguous signing steps', () => {
			expect(() => validateSigningSteps(ctx as any, [0, 0], 0)).not.toThrow();
			expect(() => validateSigningSteps(ctx as any, [1, 1, 2], 0)).not.toThrow();
		});

		it('should require every signer to have a step when any step is set', () => {
			expect(() => validateSigningSteps(ctx as any, [1, 0], 0)).toThrow(
				'Signing step must be set for every signer',
			);
		});

		it('should require contiguous signing steps', () => {
			expect(() => validateSigningSteps(ctx as any, [1, 3], 0)).toThrow(
				'Signing steps must form a contiguous sequence starting at 1',
			);
		});

		it.each([
			[-1, 1],
			[1.5, 2],
			['not-a-number', 1],
		])('should reject invalid signing steps: %j', (...steps) => {
			expect(() => validateSigningSteps(ctx as any, steps, 0)).toThrow(
				'Signing steps must be non-negative whole numbers',
			);
		});
	});

	describe('validateDigitalCertificateSteps', () => {
		const ctx = {
			getNode: jest.fn().mockReturnValue({ name: 'TestNode' }),
		};

		it('allows a digital-certificate signer only when alone in its step', () => {
			expect(() =>
				validateDigitalCertificateSteps(
					ctx as any,
					[
						{ verification_method: 'DigitalCertificate', step: 1 },
						{ verification_method: 'Email', step: 2 },
					],
					0,
				),
			).not.toThrow();
			expect(() =>
				validateDigitalCertificateSteps(
					ctx as any,
					[
						{ verification_method: 'DigitalCertificate', step: 1 },
						{ verification_method: 'Email', step: 1 },
					],
					0,
				),
			).toThrow('must be alone in their signing step');
		});
	});

	describe('assertEmail', () => {
		it('should return true for valid emails', () => {
			expect(assertEmail('test@example.com')).toBe(true);
			expect(assertEmail('user.name@example.org')).toBe(true);
			expect(assertEmail('user+tag@example.com')).toBe(true);
		});

		it('should return false for invalid emails', () => {
			expect(assertEmail('notanemail')).toBe(false);
			expect(assertEmail('missing@domain')).toBe(false);
			expect(assertEmail('@nodomain.com')).toBe(false);
			expect(assertEmail('spaces in@example.com')).toBe(false);
			expect(assertEmail('')).toBe(false);
		});
	});
});
