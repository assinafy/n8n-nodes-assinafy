import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { getAccountId, searchResource } from '../shared/transport';

export async function getTags(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const accountId = await getAccountId(this);
	return searchResource(
		this,
		{ path: `/accounts/${accountId}/tags`, filter, paginationToken },
		(tag) => ({
			name: tag.name ? `${tag.name}${tag.color ? ` (${tag.color})` : ''}` : String(tag.id),
			value: String(tag.id),
		}),
	);
}
