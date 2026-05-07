import { WEBHOOK_EVENT_OPTIONS, DEFAULT_WEBHOOK_EVENTS } from '../nodes/Assinafy/resources/webhookEvents';

describe('webhookEvents', () => {
	describe('WEBHOOK_EVENT_OPTIONS', () => {
		it('should be an array', () => {
			expect(Array.isArray(WEBHOOK_EVENT_OPTIONS)).toBe(true);
		});

		it('should have objects with name and value properties', () => {
			for (const option of WEBHOOK_EVENT_OPTIONS) {
				expect(option).toHaveProperty('name');
				expect(option).toHaveProperty('value');
				expect(typeof option.name).toBe('string');
				expect(typeof option.value).toBe('string');
			}
		});

		it('should contain expected event types', () => {
			const values = WEBHOOK_EVENT_OPTIONS.map((o) => o.value);
			expect(values).toContain('document_ready');
			expect(values).toContain('document_prepared');
			expect(values).toContain('signer_signed_document');
			expect(values).toContain('signer_rejected_document');
			expect(values).toContain('signature_requested');
			expect(values).toContain('assignment_created');
		});

		it('should have unique values', () => {
			const values = WEBHOOK_EVENT_OPTIONS.map((o) => o.value);
			const uniqueValues = new Set(values);
			expect(uniqueValues.size).toBe(values.length);
		});
	});

	describe('DEFAULT_WEBHOOK_EVENTS', () => {
		it('should be an array', () => {
			expect(Array.isArray(DEFAULT_WEBHOOK_EVENTS)).toBe(true);
		});

		it('should only contain values from WEBHOOK_EVENT_OPTIONS', () => {
			const validValues = new Set(WEBHOOK_EVENT_OPTIONS.map((o) => o.value));
			for (const event of DEFAULT_WEBHOOK_EVENTS) {
				expect(validValues.has(event)).toBe(true);
			}
		});

		it('should have a reasonable number of default events', () => {
			expect(DEFAULT_WEBHOOK_EVENTS.length).toBeGreaterThan(0);
			expect(DEFAULT_WEBHOOK_EVENTS.length).toBeLessThanOrEqual(WEBHOOK_EVENT_OPTIONS.length);
		});
	});
});