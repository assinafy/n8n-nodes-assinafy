import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { getAccountId, searchResource } from '../shared/transport';

export async function getTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const accountId = await getAccountId(this);
	return searchResource(
		this,
		{ path: `/accounts/${accountId}/templates`, filter, paginationToken },
		(tpl) => ({
			name: tpl.name ? `${tpl.name} (${tpl.status ?? 'unknown'})` : String(tpl.id),
			value: String(tpl.id),
		}),
	);
}
