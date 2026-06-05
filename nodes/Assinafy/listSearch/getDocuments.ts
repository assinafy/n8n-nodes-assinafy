import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { getAccountId, searchResource } from '../shared/transport';

export async function getDocuments(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const accountId = await getAccountId(this);
	return searchResource(
		this,
		{ path: `/accounts/${accountId}/documents`, filter, paginationToken },
		(doc) => ({
			name: doc.name ? `${doc.name} (${doc.status ?? 'unknown'})` : String(doc.id),
			value: String(doc.id),
		}),
	);
}
