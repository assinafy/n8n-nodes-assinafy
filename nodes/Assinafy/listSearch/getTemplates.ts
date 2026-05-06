import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { assinafyApiRequest, getAccountId } from '../shared/transport';

interface TemplateListItem {
	id: string;
	name?: string;
	status?: string;
}

export async function getTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const accountId = await getAccountId(this);
	const page = paginationToken ? Number.parseInt(paginationToken, 10) : 1;
	const perPage = 50;

	const qs: IDataObject = { page, 'per-page': perPage };
	if (filter) qs.search = filter;

	const response = await assinafyApiRequest<TemplateListItem[] | { data?: TemplateListItem[] }>(
		this,
		{
			method: 'GET',
			path: `/accounts/${accountId}/templates`,
			qs,
		},
	);
	const items = Array.isArray(response)
		? response
		: ((response as { data?: TemplateListItem[] }).data ?? []);

	const results: INodeListSearchItems[] = items.map((tpl) => ({
		name: tpl.name ? `${tpl.name} (${tpl.status ?? 'unknown'})` : tpl.id,
		value: tpl.id,
	}));

	const next = items.length === perPage ? String(page + 1) : undefined;
	const result: INodeListSearchResult = { results };
	if (next !== undefined) result.paginationToken = next;
	return result;
}
