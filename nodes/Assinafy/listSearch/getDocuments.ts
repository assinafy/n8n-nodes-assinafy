import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { assinafyApiRequest, getAccountId } from '../shared/transport';

interface DocumentListItem {
	id: string;
	name?: string;
	status?: string;
}

export async function getDocuments(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const accountId = await getAccountId(this);
	const page = paginationToken ? Number.parseInt(paginationToken, 10) : 1;
	const perPage = 50;

	const qs: IDataObject = { page, 'per-page': perPage };
	if (filter) qs.search = filter;

	const response = await assinafyApiRequest<DocumentListItem[] | { data?: DocumentListItem[] }>(
		this,
		{
			method: 'GET',
			path: `/accounts/${accountId}/documents`,
			qs,
		},
	);
	const items = Array.isArray(response)
		? response
		: ((response as { data?: DocumentListItem[] }).data ?? []);

	const results: INodeListSearchItems[] = items.map((doc) => ({
		name: doc.name ? `${doc.name} (${doc.status ?? 'unknown'})` : doc.id,
		value: doc.id,
	}));

	const next = items.length === perPage ? String(page + 1) : undefined;
	const result: INodeListSearchResult = { results };
	if (next !== undefined) result.paginationToken = next;
	return result;
}
