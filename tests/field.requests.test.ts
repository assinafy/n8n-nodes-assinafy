/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeField } from '../nodes/Assinafy/resources/field';
import { makeCtx, lastAuth } from './helpers';

const BASE = 'https://api.assinafy.com.br/v1';

describe('field request construction', () => {
	it('creates a field definition with compacted extras', async () => {
		const { ctx, requests } = makeCtx({
			fieldType: 'text',
			fieldName: 'Reference',
			additionalFields: { is_required: true, is_active: true, regex: '' },
		});
		await executeField.call(ctx as any, 0, 'create');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/fields`);
		// empty regex stripped, booleans preserved
		expect(req.body).toEqual({
			type: 'text',
			name: 'Reference',
			is_required: true,
			is_active: true,
		});
	});

	it('lists field definitions', async () => {
		const { ctx, requests } = makeCtx(
			{ filters: { include_inactive: true } },
			{ response: [{ id: 'fld_1' }] },
		);
		const result = (await executeField.call(ctx as any, 0, 'list')) as any;
		const req = lastAuth(requests);
		expect(req.url).toBe(`${BASE}/accounts/acc_123/fields`);
		expect(req.qs).toEqual({ include_inactive: true });
		expect(result.json.fields).toEqual([{ id: 'fld_1' }]);
	});

	it('gets a field definition', async () => {
		const { ctx, requests } = makeCtx({ fieldId: 'fld_1' });
		await executeField.call(ctx as any, 0, 'get');
		expect(lastAuth(requests).url).toBe(`${BASE}/accounts/acc_123/fields/fld_1`);
	});

	it('updates a field definition', async () => {
		const { ctx, requests } = makeCtx({ fieldId: 'fld_1', updateFields: { name: 'New' } });
		await executeField.call(ctx as any, 0, 'update');
		const req = lastAuth(requests);
		expect(req.method).toBe('PUT');
		expect(req.body).toEqual({ name: 'New' });
	});

	it('deletes a field definition', async () => {
		const { ctx, requests } = makeCtx({ fieldId: 'fld_1' });
		await executeField.call(ctx as any, 0, 'delete');
		expect(lastAuth(requests).method).toBe('DELETE');
	});

	it('validates a single value as an authenticated user', async () => {
		const { ctx, requests } = makeCtx({
			fieldId: 'fld_1',
			validateValue: 'hi',
			signerAccessCode: '',
		});
		await executeField.call(ctx as any, 0, 'validate');
		const req = lastAuth(requests);
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`${BASE}/accounts/acc_123/fields/fld_1/validate`);
		expect(req.body).toEqual({ value: 'hi' });
		expect(req.qs).toBeUndefined();
	});

	it('ignores a leftover access code when workspace credentials are selected', async () => {
		const { ctx, requests } = makeCtx({
			fieldId: 'fld_1',
			validateValue: 'hi',
			signerAccessCode: 'code123',
		});
		await executeField.call(ctx as any, 0, 'validate');
		expect(requests).toHaveLength(1);
		expect(lastAuth(requests).qs).toBeUndefined();
	});

	it.each(['validate', 'validateMultiple'])(
		'%s with a signer access code sends only the code',
		async (operation) => {
			const { ctx, requests } = makeCtx(
				{
					authenticateWith: 'signerAccessCode',
					signerAccessCode: ' code123 ',
					fieldId: 'fld_1',
					validateValue: 'hi',
					validateItems: '[{"field_id":"fld_1","value":"x"}]',
				},
				{ response: operation === 'validate' ? { success: true } : [] },
			);
			await executeField.call(ctx as any, 0, operation);
			expect(requests).toHaveLength(1);
			expect(requests[0].auth).toBe(false);
			expect(requests[0].options.qs).toEqual({ 'signer-access-code': 'code123' });
			expect(requests[0].options.headers).not.toHaveProperty('X-Api-Key');
		},
	);

	it.each(['validate', 'validateMultiple'])(
		'%s rejects a blank signer access code instead of falling back to credentials',
		async (operation) => {
			const { ctx, requests } = makeCtx({
				authenticateWith: 'signerAccessCode',
				signerAccessCode: '  ',
				fieldId: 'fld_1',
				validateValue: 'hi',
				validateItems: '[{"field_id":"fld_1","value":"x"}]',
			});
			await expect(executeField.call(ctx as any, 0, operation)).rejects.toThrow(
				'Signer Access Code is required',
			);
			expect(requests).toHaveLength(0);
		},
	);

	it('validates multiple values from a JSON array', async () => {
		const { ctx, requests } = makeCtx(
			{ signerAccessCode: '', validateItems: '[{"field_id":"fld_1","value":"x"}]' },
			{ response: [{ field_id: 'fld_1', success: true }] },
		);
		await executeField.call(ctx as any, 0, 'validateMultiple');
		const req = lastAuth(requests);
		expect(req.url).toBe(`${BASE}/accounts/acc_123/fields/validate-multiple`);
		expect(req.body).toEqual([{ field_id: 'fld_1', value: 'x' }]);
	});

	it('lists field types from the global endpoint', async () => {
		const { ctx, requests } = makeCtx({}, { response: [{ type: 'text', name: 'Texto' }] });
		await executeField.call(ctx as any, 0, 'listTypes');
		expect(lastAuth(requests).url).toBe(`${BASE}/field-types`);
	});
});
