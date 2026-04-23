import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { assinafyApiRequest, getAccountId } from '../shared/transport';

interface SignerListItem {
	id: string;
	full_name?: string;
	email?: string;
}

export async function getSigners(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const accountId = await getAccountId(this);
	const page = paginationToken ? Number.parseInt(paginationToken, 10) : 1;
	const perPage = 50;

	const qs: IDataObject = { page, 'per-page': perPage };
	if (filter) qs.search = filter;

	const response = await assinafyApiRequest<SignerListItem[] | { data?: SignerListItem[] }>(this, {
		method: 'GET',
		path: `/accounts/${accountId}/signers`,
		qs,
	});
	const items = Array.isArray(response)
		? response
		: ((response as { data?: SignerListItem[] }).data ?? []);

	const results: INodeListSearchItems[] = items.map((signer) => ({
		name: signer.full_name
			? `${signer.full_name}${signer.email ? ` <${signer.email}>` : ''}`
			: (signer.email ?? signer.id),
		value: signer.id,
	}));

	const next = items.length === perPage ? String(page + 1) : undefined;
	const result: INodeListSearchResult = { results };
	if (next !== undefined) result.paginationToken = next;
	return result;
}
