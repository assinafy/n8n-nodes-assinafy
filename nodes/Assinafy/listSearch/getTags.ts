import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { assinafyApiRequest, getAccountId } from '../shared/transport';

interface TagListItem {
	id: string;
	name?: string;
	color?: string | null;
}

export async function getTags(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const accountId = await getAccountId(this);
	const page = paginationToken ? Number.parseInt(paginationToken, 10) : 1;
	const perPage = 50;

	const qs: IDataObject = { page, 'per-page': perPage };
	if (filter) qs.search = filter;

	const response = await assinafyApiRequest<TagListItem[] | { data?: TagListItem[] }>(this, {
		method: 'GET',
		path: `/accounts/${accountId}/tags`,
		qs,
	});
	const items = Array.isArray(response)
		? response
		: ((response as { data?: TagListItem[] }).data ?? []);

	const results: INodeListSearchItems[] = items.map((tag) => ({
		name: tag.name ? `${tag.name}${tag.color ? ` (${tag.color})` : ''}` : tag.id,
		value: tag.id,
	}));

	const next = items.length === perPage ? String(page + 1) : undefined;
	const result: INodeListSearchResult = { results };
	if (next !== undefined) result.paginationToken = next;
	return result;
}
