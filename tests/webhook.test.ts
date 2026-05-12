import { isEmptySubscription } from '../nodes/Assinafy/resources/webhook';

describe('isEmptySubscription', () => {
	it('treats null as empty', () => {
		expect(isEmptySubscription(null)).toBe(true);
	});

	it('treats the API sentinel (no url, no events) as empty', () => {
		expect(
			isEmptySubscription({
				events: [],
				url: null,
				email: null,
				is_active: true,
				updated_at: '2024-04-11T14:22:26Z',
			}),
		).toBe(true);
	});

	it('treats a subscription with a URL as non-empty', () => {
		expect(
			isEmptySubscription({
				events: ['document_ready'],
				url: 'https://example.com/hook',
				is_active: true,
			}),
		).toBe(false);
	});

	it('treats a subscription with events but no URL as non-empty', () => {
		expect(
			isEmptySubscription({
				events: ['document_ready'],
				url: null,
				is_active: false,
			}),
		).toBe(false);
	});
});
