/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	assertEmail,
	cleanQs,
	extractRequiredId,
	safeJsonParse,
	sanitizeCpf,
	showOnly,
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
			const ctx = createCtx('abc123');
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
	});

	describe('safeJsonParse', () => {
		it('should parse valid JSON strings', () => {
			expect(safeJsonParse('{"name":"John"}')).toEqual({ name: 'John' });
			expect(safeJsonParse('{"a":1,"b":2}')).toEqual({ a: 1, b: 2 });
		});

		it('should return empty object for invalid JSON', () => {
			expect(safeJsonParse('not json')).toEqual({});
			expect(safeJsonParse('')).toEqual({});
			expect(safeJsonParse('{broken')).toEqual({});
		});

		it('should return input if already an object', () => {
			const obj = { name: 'John' };
			expect(safeJsonParse(obj)).toBe(obj);
		});

		it('should return empty object for non-object parsed values', () => {
			expect(safeJsonParse('"just a string"')).toEqual({});
			expect(safeJsonParse('123')).toEqual({});
			expect(safeJsonParse('null')).toEqual({});
			expect(safeJsonParse('true')).toEqual({});
		});

		it('should return arrays as-is', () => {
			const result = safeJsonParse('[1,2,3]');
			expect(result).toEqual([1, 2, 3]);
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

	describe('assertEmail', () => {
		it('should return true for valid emails', () => {
			expect(assertEmail('test@example.com')).toBe(true);
			expect(assertEmail('user.name@domain.org')).toBe(true);
			expect(assertEmail('user+tag@domain.co.uk')).toBe(true);
		});

		it('should return false for invalid emails', () => {
			expect(assertEmail('notanemail')).toBe(false);
			expect(assertEmail('missing@domain')).toBe(false);
			expect(assertEmail('@nodomain.com')).toBe(false);
			expect(assertEmail('spaces in@email.com')).toBe(false);
			expect(assertEmail('')).toBe(false);
		});
	});
});