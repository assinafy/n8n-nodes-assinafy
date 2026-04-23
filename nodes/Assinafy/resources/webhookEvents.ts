import type { INodePropertyOptions } from 'n8n-workflow';

/**
 * Webhook event types exposed by the Assinafy API.
 * Source: https://api.assinafy.com.br/v1/docs and the Node/PHP SDKs.
 */
export const WEBHOOK_EVENT_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Assignment Created', value: 'assignment_created' },
	{ name: 'Document Metadata Ready', value: 'document_metadata_ready' },
	{ name: 'Document Prepared', value: 'document_prepared' },
	{
		name: 'Document Processing Failed',
		value: 'document_processing_failed',
	},
	{ name: 'Document Ready', value: 'document_ready' },
	{ name: 'Document Uploaded', value: 'document_uploaded' },
	{ name: 'Signature Requested', value: 'signature_requested' },
	{ name: 'Signer Created', value: 'signer_created' },
	{ name: 'Signer Data Confirmed', value: 'signer_data_confirmed' },
	{ name: 'Signer Email Verified', value: 'signer_email_verified' },
	{ name: 'Signer Rejected Document', value: 'signer_rejected_document' },
	{ name: 'Signer Signed Document', value: 'signer_signed_document' },
	{ name: 'Signer Viewed Document', value: 'signer_viewed_document' },
	{ name: 'Signer Whatsapp Verified', value: 'signer_whatsapp_verified' },
	{ name: 'Template Created', value: 'template_created' },
	{ name: 'Template Processed', value: 'template_processed' },
	{
		name: 'Template Processing Failed',
		value: 'template_processing_failed',
	},
	{ name: 'User Rejected Document', value: 'user_rejected_document' },
];

export const DEFAULT_WEBHOOK_EVENTS: string[] = [
	'document_ready',
	'document_prepared',
	'signer_signed_document',
	'signer_rejected_document',
	'document_processing_failed',
];
