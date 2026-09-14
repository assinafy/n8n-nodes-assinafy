# @assinafy/n8n-nodes-assinafy

*Português · [Read in English](README.en.md)*

Nós community do n8n para a [Assinafy](https://assinafy.com.br) — plataforma brasileira de assinatura
eletrônica. O pacote é centrado em upload de documentos, criação de signatários, assignments, status
de assinatura, download de artefatos certificados, templates, tags e webhooks. Operações
relacionadas de conta e autenticação continuam disponíveis quando um workflow precisa delas.

> **Referência completa em inglês.** Este documento cobre instalação, credenciais, o trigger e os
> fluxos principais. O índice completo de operações está em **[README.en.md](README.en.md)** e, com
> payloads de requisição e resposta, em [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

Este pacote entrega:

- **Assinafy** — nó de ação para os recursos `assignment`, `auth`, `document`, `field`, `signer`,
  `signerDocument`, `tag`, `template`, `webhook` e `workspace`.
- **Assinafy Trigger** — trigger de webhook com autenticação obrigatória de URL derivada da
  credencial e verificação opcional de payload por HMAC-SHA256.
- **Assinafy API** — credencial compartilhada (X-Api-Key + ID da conta, com URLs base de
  produção/sandbox/custom).

## Instalação

Os releases públicos usam o **npmjs.com** sob `@assinafy/n8n-nodes-assinafy`; a instalação não exige
registry customizado nem `.npmrc`.

### n8n self-hosted

1. Instale o pacote:

   ```bash
   npm install @assinafy/n8n-nodes-assinafy
   ```

2. No n8n, abra **Settings → Community Nodes** e informe `@assinafy/n8n-nodes-assinafy`. Veja o
   [guia de instalação de nós community do n8n](https://docs.n8n.io/integrations/community-nodes/installation/)
   para detalhes de container e queue mode.

O GitHub Packages pode ser usado como mirror opcional de release. Instalar daquele mirror exige o
mapeamento de escopo `@assinafy:registry=https://npm.pkg.github.com` e um token do GitHub com
`read:packages` — nada disso é necessário para o pacote principal no npmjs.

### n8n Cloud

A publicação no npmjs é requisito do processo de submissão de nó community verificado do n8n. A
disponibilidade no n8n Cloud ainda depende da revisão e aprovação do catálogo pelo n8n — publicar no
npm, por si só, não implica disponibilidade no Cloud.

O pacote declara `n8n-workflow` como peer dependency, então a instância de n8n instalada fornece o
runtime. Construir, testar e rodar este release exige a linha LTS atual, **Node.js 24**.

## Credenciais

Crie uma credencial **Assinafy API** para operações com escopo de conta e por chave de API:

| Campo | Obrigatório | Observações |
| --- | --- | --- |
| Environment | ✓ | `Production` (padrão), `Sandbox` ou `Custom`. Produção resolve para `https://api.assinafy.com.br/v1`; sandbox para `https://sandbox.assinafy.com.br/v1`. |
| Custom Base URL | ✓ para `Custom` | Precisa ser HTTPS absoluta e terminar em `/v1`, sem informação de usuário, query ou fragmento. HTTP só é permitido em hosts de desenvolvimento em loopback. |
| API Key | ✓ na credencial | Gerada no painel da Assinafy. Enviada no header `X-Api-Key`. |
| Account ID | ✓ na credencial | ID do workspace (conta) padrão. Usado por todo endpoint com escopo de conta. |
| Webhook Secret | — | Segredo usado na autenticação da URL do Trigger e na verificação opcional de payload por HMAC-SHA256. Vazio, a autenticação de URL é derivada da chave de API. |

O teste da credencial chama `GET /accounts/{accountId}` para confirmar que a chave e a conta são
válidas. URLs custom são validadas e normalizadas antes que a requisição de teste — ou qualquer
requisição autenticada — possa anexar a chave de API.

A credencial do nó de ação **Assinafy** é opcional apenas para operações públicas, por código de
acesso do signatário, e as explicitamente autenticadas por Bearer. Sem credencial selecionada, essas
chamadas usam a URL base de produção; se uma credencial selecionada não puder ser carregada, a
chamada **falha** em vez de cair silenciosamente para produção. Selecione uma credencial de Sandbox
mesmo em chamada não autenticada quando precisar do host de sandbox. O **Assinafy Trigger** sempre
exige credencial, porque as chamadas de ciclo de vida da assinatura têm escopo de conta.

## Códigos de acesso do signatário

Operações marcadas **(Signer Side)** autenticam com um `signer-access-code` por signatário, e não com
a chave de API do workspace. **Nenhum endpoint devolve esse código** — ele chega ao signatário apenas
na notificação que a API envia quando um assignment é criado ou reenviado, por e-mail ou WhatsApp.

As `signing_urls` de um assignment novo **não** substituem isso: cada uma endereça a página web de
assinatura do documento (`https://app.assinafy.com.br/sign/{documentId}?email=…`) e não carrega
código algum — passar o segmento de caminho dela como `signer-access-code` devolve
`401 Credenciais inválidas.`

Use essas operações apenas quando um código entrar no workflow por um passo que você controla: um nó
que lê uma caixa de entrada, uma integração de WhatsApp, ou uma pessoa colando o valor. Para
simplesmente levar o signatário até o documento, entregue a URL de assinatura ou use
**Document → Send Public Token**. Todas as demais operações funcionam só com a chave de API.

## Métodos de verificação do signatário

Definidos por signatário na criação do assignment. O método de verificação e o de notificação são
**acoplados**: envie um, os dois ou nenhum — o lado que faltar é inferido. Sem nenhum dos dois, ambos
assumem `Email`.

| Método | Como funciona | Custo por signatário |
| --- | --- | --- |
| `Email` *(padrão)* | Código de uso único (OTP) por e-mail, exigido antes de assinar | Gratuito |
| `Whatsapp` | Código de uso único (OTP) por WhatsApp | Verificação gratuita; notificação 0,45 crédito, só em planos pagos |
| `DigitalCertificate` | O signatário assina com o **próprio certificado ICP-Brasil (A1/A3)**, pela extensão de navegador Web PKI, gerando uma assinatura **PAdES qualificada** | 2 créditos |

Combinações permitidas: `Email` → notifica por `Email`; `Whatsapp` → notifica por `Whatsapp`;
`DigitalCertificate` → notifica por `Email` **ou** `Whatsapp`. Apenas um método de notificação por
signatário.

Use **Assignment → Estimate Cost** antes de enviar quando o custo precisar ser conhecido: o
certificado digital exige o recurso na conta (planos Standard e Pro), CPF ou CNPJ em `government_id`,
e que o signatário esteja sozinho no seu passo.

## Assinafy Trigger

O nó de trigger registra ou substitui a assinatura de webhook do workspace quando o workflow é
ativado. A URL de entrega precisa usar HTTPS; HTTP só é aceito em URLs de desenvolvimento
`localhost`, `127.0.0.1` ou `::1`. O nó adiciona um parâmetro de query `assinafy-token` derivado por
HMAC-SHA256 do Webhook Secret da credencial, ou da chave de API quando não há segredo configurado.
Toda entrega precisa apresentar esse token e é rejeitada se ele faltar ou divergir. **Reative o
workflow após rotacionar qualquer um dos valores da credencial**, para que a Assinafy receba a nova
URL.

Na desativação, o nó lê a assinatura atual e chama `PUT /accounts/{accountId}/webhooks/inactivate`
apenas depois que a URL protegida, o e-mail e o conjunto de eventos conferem. O endpoint de
inativação da Assinafy é incondicional — então não substitua a assinatura da conta em paralelo com a
desativação do workflow. Cada entrega aceita emite `{ event, headers, body }` como um item do n8n;
headers de autenticação, cookie, chave de API, token, segredo e assinatura são redigidos.

**A verificação de assinatura do payload é uma checagem opcional adicional.** Se o seu workspace
assina as entregas, defina **Webhook Secret** e habilite **Verify Signature**. O nó então exige
`X-Assinafy-Signature`, calcula HMAC-SHA256 sobre o corpo bruto e **falha fechado** quando a
assinatura ou os bytes brutos não estão disponíveis.

> [!IMPORTANT]
> A API da Assinafy suporta uma **única** assinatura de webhook por workspace. Ativar este trigger
> substitui qualquer assinatura existente. Coordene as mudanças de ativação e desativação dessa
> conta, e faça o fan-out dentro de um único workflow do n8n quando vários destinos precisarem dos
> mesmos eventos.

Lista completa de eventos (fonte da verdade: `nodes/Assinafy/resources/webhookEvents.ts`, exibida no
dropdown **Events** do nó): `assignment_created`, `document_metadata_ready`, `document_prepared`,
`document_processing_failed`, `document_ready`, `document_uploaded`, `signature_requested`,
`signer_created`, `signer_data_confirmed`, `signer_email_verified`, `signer_rejected_document`,
`signer_signed_document`, `signer_viewed_document`, `signer_whatsapp_verified`, `template_created`,
`template_processed`, `template_processing_failed`, `user_rejected_document`.

Quando nenhum evento é selecionado, o trigger assina um conjunto padrão razoável
(`document_ready`, `document_prepared`, `signer_signed_document`, `signer_rejected_document`,
`document_processing_failed`).

## Fluxo de documento

Enviar e receber são workflows separados no n8n, porque um trigger inicia um workflow e não tem
conexão de entrada:

```text
Enviar:   PDF → Upload → Wait Until Ready → Create Signer(s) → Estimate Cost → Create Assignment
Receber:  Assinafy Trigger → deduplicar evento → rotear por evento → Download do PDF certificado / tratar falha
```

Os dois workflows estão detalhados passo a passo em
[README.en.md](README.en.md#workflow-a-upload-and-request-signatures).

## Convenções de dados e erro

- O envelope de resposta `{ status, message, data }` da Assinafy é removido antes da saída.
- Operações de listagem emitem um item do n8n por recurso. Respostas de mutação com valor de array
  emitem um item no formato `{ "data": [...] }`.
- Downloads binários emitem um item com metadados JSON e o arquivo na propriedade binária escolhida.
- **Get Signing Progress** define `available: false` e devolve contagens nulas quando a resposta do
  documento não inclui detalhes do assignment — nunca reporta um `0/0` sintético como progresso
  conhecido.
- Respostas HTTP 429 são retentadas com orçamento limitado em todo método, respeitando `Retry-After`.
  Um rate limit é recusado antes de a requisição ser tratada, então repeti-la não pode duplicar um
  documento, signatário, assignment, notificação ou ação de webhook. Qualquer outra falha é exposta
  após uma única tentativa, porque uma resposta ambígua pode significar que a mutação foi aplicada.

## Documentação

- **[README.en.md](README.en.md)** — índice completo de operações e workflows, em inglês
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — payloads por operação
- [Documentação da API](https://api.assinafy.com.br/v1/docs)

## Licença

Distribuído sob a licença [MIT](LICENSE.md).
