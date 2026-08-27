import {
	WEBHOOK_EVENT_OPTIONS,
	DEFAULT_WEBHOOK_EVENTS,
} from '../nodes/Assinafy/resources/webhookEvents';

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

		it('should contain every documented event type', () => {
			const values = WEBHOOK_EVENT_OPTIONS.map((o) => o.value);
			expect(values).toEqual([
				'assignment_created',
				'document_metadata_ready',
				'document_prepared',
				'document_processing_failed',
				'document_ready',
				'document_uploaded',
				'signature_requested',
				'signer_created',
				'signer_data_confirmed',
				'signer_email_verified',
				'signer_rejected_document',
				'signer_signed_document',
				'signer_viewed_document',
				'signer_whatsapp_verified',
				'template_created',
				'template_processed',
				'template_processing_failed',
				'user_rejected_document',
			]);
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

		it('should use the documented default event set', () => {
			expect(DEFAULT_WEBHOOK_EVENTS).toEqual([
				'document_ready',
				'document_prepared',
				'signer_signed_document',
				'signer_rejected_document',
				'document_processing_failed',
			]);
		});
	});
});
