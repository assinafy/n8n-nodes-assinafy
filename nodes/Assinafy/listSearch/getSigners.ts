import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { getAccountId, searchResource } from '../shared/transport';

export async function getSigners(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const accountId = await getAccountId(this);
	return searchResource(
		this,
		{ path: `/accounts/${accountId}/signers`, filter, paginationToken },
		(signer) => ({
			name: signer.full_name
				? `${signer.full_name}${signer.email ? ` <${signer.email}>` : ''}`
				: String(signer.email ?? signer.id),
			value: String(signer.id),
		}),
	);
}
