# @assinafy/n8n-nodes-assinafy

**Português (Brasil)** · [English](README.md)

Nós da comunidade para integrar o n8n à [Assinafy](https://assinafy.com.br), plataforma brasileira de assinatura eletrônica. O pacote permite enviar documentos, cadastrar signatários, solicitar assinaturas, acompanhar o andamento, baixar documentos certificados e trabalhar com modelos, tags e webhooks. Também oferece operações de conta e autenticação para fluxos que precisam desses recursos.

O pacote inclui:

- **Assinafy** — nó de ação com os recursos `assignment`, `auth`, `document`, `field`, `oauth`, `signer`, `signerDocument`, `tag`, `template`, `webhook` e `workspace`.
- **Assinafy Trigger** — gatilho de webhook com autenticação obrigatória na URL, derivada da credencial, e verificação opcional do conteúdo por HMAC-SHA256.
- **Assinafy OAuth2 API** — credencial OAuth com código de autorização e PKCE, armazenamento criptografado dos tokens e renovação automática pelo n8n.
- **Assinafy API** — credencial compartilhada com chave de API (`X-Api-Key`), ID da conta e ambientes de produção, sandbox e URL personalizada.

Os nomes de nós, operações e campos da interface aparecem em inglês neste guia para corresponder ao que você encontra no n8n. Os identificadores e valores da API também são mantidos como devem ser enviados.

## Instalação

As versões públicas são distribuídas pelo **npmjs.com** com o nome `@assinafy/n8n-nodes-assinafy`. A instalação não exige um registro personalizado nem um arquivo `.npmrc`.

### n8n em infraestrutura própria

No n8n, acesse **Settings → Community Nodes → Install**, informe `@assinafy/n8n-nodes-assinafy` e siga as instruções de instalação. Para instalar manualmente, instale o pacote no diretório de nós da comunidade da sua instância e reinicie o n8n. Consulte o [guia oficial de instalação](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation) para contêineres e workers que processam filas.

O GitHub Packages pode ser usado como espelho opcional das versões. A instalação por esse espelho exige o mapeamento `@assinafy:registry=https://npm.pkg.github.com` e um token do GitHub com a permissão `read:packages`. Essas configurações não são necessárias para instalar pelo npmjs.

### n8n Cloud

A publicação no npmjs é um requisito do processo de submissão de nós verificados da comunidade. A disponibilidade no n8n Cloud depende também da análise e aprovação no catálogo do n8n; publicar no npm não torna o pacote automaticamente disponível no Cloud.

O pacote declara `n8n-workflow` como dependência do tipo peer, fornecida pela instância do n8n. Use **Node.js 24.21.0 LTS** para desenvolvimento, compilação e testes. O ambiente que executa o n8n deve atender ao requisito `node >=24.21.0` do pacote; a imagem oficial do n8n já fornece uma versão compatível do Node.js.

Em produção, use a imagem oficial compatível do n8n, um endereço HTTPS estável, armazenamento persistente e backups do banco de dados e da chave de criptografia das credenciais. Mantenha todos os workers de fila na mesma versão do n8n e com este pacote instalado. Siga as [orientações de implantação com Docker](https://docs.n8n.io/deploy/host-n8n/install-options/install-with-docker) para configurar o banco e o ambiente de execução. O serviço Compose deste repositório é uma instância local isolada para testes.

## Credenciais

### OAuth para fluxos de documentos

Use uma versão atual do n8n; a configuração local deste repositório fixa a versão 2.39.8. No nó de ação Assinafy, selecione **Authentication → OAuth2** e crie uma credencial **Assinafy OAuth2 API**.

1. Copie a **OAuth Redirect URL** exibida pelo n8n. Ela deve ser uma URL HTTPS pública, normalmente `https://n8n.example.com/rest/oauth2-credential/callback`.
2. No seu workspace da Assinafy, acesse **Integrações → Apps OAuth → Novo aplicativo**. Escolha **Aplicação no servidor / Confidential**, informe exatamente a URL de callback e selecione as permissões necessárias para os seus fluxos.
3. Copie o Client ID e o Client Secret, exibido uma única vez, para a credencial do n8n. Guarde o segredo nas credenciais do n8n, nunca nos parâmetros do fluxo ou em arquivos JSON exportados.
4. Em **Scope**, informe as permissões separadas por espaços, usando apenas as que foram habilitadas no aplicativo. Um fluxo de documentos usa `documents:read documents:write account:read offline_access`; adicione `templates:read` se usar modelos. A configuração padrão da credencial já inclui `templates:read`; remova esse escopo se o aplicativo não o permitir.
5. Deixe **Account ID** vazio para descobrir automaticamente o único workspace selecionado no consentimento, ou informe explicitamente o ID desse workspace. Clique em **Connect my account**, entre na Assinafy, selecione o workspace e autorize o acesso solicitado.
6. Teste a conexão com **Workspace → List**. O OAuth retorna apenas o workspace autorizado; o acesso a outro workspace é proibido. O teste de conexão da própria credencial também chama `GET /accounts`.

O n8n executa o fluxo Authorization Code com PKCE S256 e envia o segredo do cliente confidencial no corpo da requisição de token. Um aplicativo público pode deixar Client Secret vazio. Os tokens de acesso expiram após uma hora. O escopo `offline_access` solicita tokens de renovação com rotação; a autorização dura no máximo 30 dias antes de exigir uma nova conexão. Reconecte quando a autorização expirar ou for revogada. Mantenha os workers na mesma versão compatível do n8n, com infraestrutura compartilhada de credenciais e coordenação. Não copie tokens com rotação para credenciais separadas nem renove manualmente a mesma conexão.

| Permissão | Uso no fluxo |
| --- | --- |
| `documents:read` | Ler documentos, andamento das assinaturas, signatários e arquivos do documento |
| `documents:write` | Enviar documentos, gerenciar signatários e solicitar assinaturas |
| `templates:read` | Consultar os modelos usados para gerar documentos |
| `account:read` | Consultar os dados permitidos do workspace selecionado |
| `offline_access` | Manter a conexão com tokens de renovação com rotação |
| `openid`, `profile`, `email` | Acessar identidade, nome e e-mail, respectivamente, pelo OAuth UserInfo; são opcionais |

O OAuth não autoriza operações administrativas do proprietário, como alteração de senha ou chave de API, criação e exclusão de workspaces, cobrança, membros ou administração de webhooks. Use a credencial de chave de API para essas operações e para o **Assinafy Trigger**. As operações executadas em nome do signatário continuam exigindo o código de acesso dele.

**Cada implantação registra seu próprio callback.** Tanto o n8n em infraestrutura própria quanto o n8n Cloud usam a URL exibida pela respectiva instância. Um aplicativo pode atender a vários fluxos e conexões. Implantações separadas devem usar aplicativos separados ou registrar explicitamente cada callback exato em um aplicativo que controlem. O pacote não fornece um segredo de cliente compartilhado nem um callback local de aplicativo desktop. Ao usar um proxy reverso, configure `N8N_EDITOR_BASE_URL`, `WEBHOOK_URL` e `N8N_PROXY_HOPS` para que o n8n anuncie o endereço HTTPS externo. A URL de um túnel temporário muda quando ele é recriado, exigindo atualização do callback e nova conexão. Atualmente, o OAuth usa o ambiente de produção; o sandbox continua disponível para fluxos com chave de API.

### Chave de API para administração e webhooks

Crie uma credencial **Assinafy API** para operações da conta que usam chave de API:

| Campo | Obrigatório | Observações |
| --- | --- | --- |
| Environment | Sim | `Production` (padrão), `Sandbox` ou `Custom`. Produção usa `https://api.assinafy.com.br/v1`; sandbox usa `https://sandbox.assinafy.com.br/v1`. |
| Custom Base URL | Quando `Custom` | URL HTTPS absoluta terminada em `/v1`, sem dados de usuário, parâmetros de consulta ou fragmento. HTTP é permitido apenas em endereços de loopback para desenvolvimento. |
| API Key | Sim, na credencial | Gerada no painel da Assinafy. Enviada no cabeçalho `X-Api-Key`. |
| Account ID | Sim, na credencial | ID padrão do workspace (conta), usado pelos endpoints vinculados à conta. |
| Webhook Secret | Não | Segredo usado na autenticação da URL do Trigger e na verificação opcional do conteúdo por HMAC-SHA256. Quando vazio, a autenticação da URL é derivada da chave de API. |

O teste da credencial chama `GET /accounts/{accountId}` para confirmar a chave e a conta. URLs personalizadas são validadas e normalizadas antes que o teste ou qualquer requisição autenticada possa incluir a chave de API. A credencial do nó de ação **Assinafy** só é opcional em operações públicas, com código de acesso do signatário ou com autenticação Bearer explícita. Sem uma credencial selecionada, essas chamadas usam a URL de produção. Se uma credencial selecionada não puder ser carregada, a chamada falha, sem mudar silenciosamente para produção. Selecione uma credencial Sandbox mesmo em chamadas sem autenticação quando precisar usar esse ambiente. O **Assinafy Trigger** sempre exige uma credencial, pois o gerenciamento da assinatura do webhook depende da conta.

## Fluxo de documentos

O envio e o recebimento de eventos ficam em fluxos separados no n8n, pois um gatilho inicia um fluxo e não possui conexão de entrada:

```text
Envio:       PDF → Upload → Wait Until Ready → criar signatários → Estimate Cost → Create Assignment
Recebimento: Assinafy Trigger → eliminar eventos duplicados → encaminhar por evento → baixar PDF certificado / tratar falha
```

### Fluxo A: enviar o documento e solicitar assinaturas

1. Comece com um Manual Trigger, Webhook, formulário, nó de armazenamento ou outra origem que forneça um PDF não vazio como dado binário, com até 25 MB e 2.000 páginas. A propriedade binária padrão é `data`. Confirme os destinatários antes de enviar.
2. Adicione **Assinafy → Document → Upload**, selecione a propriedade binária e dê ao nó o nome `Upload document`. A saída é o objeto do documento; a expressão para reutilizar o ID é `={{ $('Upload document').first().json.id }}`. Salve esse ID para consultar o documento existente antes de repetir uma operação.
3. Adicione **Assinafy → Document → Wait Until Ready**. Em **Document ID**, use a expressão do upload. O fluxo só continua quando o status é `metadata_ready`, `pending_signature` ou `certificated`; falha (`failed`), rejeição, expiração e esgotamento do tempo de espera geram um erro.
4. Adicione **Assinafy → Signer → Create** para cada destinatário. Apenas Full Name é obrigatório, mas uma solicitação remota por e-mail ou WhatsApp exige o contato correspondente. **Reuse If Exists** consulta todas as páginas de resultados antes de criar outro contato com o mesmo e-mail. Nomeie os nós, por exemplo, como `Create signer 1` e `Create signer 2`.
5. Adicione **Assignment → Estimate Cost** antes do envio. Use o ID do documento enviado e as mesmas opções de verificação e notificação que serão usadas em Create. Confira `has_sufficient_resources`, `total_credits` e `blocking_reason` antes de permitir a solicitação. Interrompa o fluxo se os recursos forem insuficientes ou o custo previsto não for aceitável.
6. Adicione **Assignment → Create**:
   - **Document ID:** `={{ $('Upload document').first().json.id }}`
   - **Method:** `virtual` para assinatura remota ou `collect` para campos posicionados no documento
   - **Signer 1 ID:** `={{ $('Create signer 1').first().json.id }}`
   - **Signer 2 ID:** `={{ $('Create signer 2').first().json.id }}`
   - Defina o método de verificação, o método de notificação e o `step` de cada signatário. Signatários na mesma etapa assinam em paralelo; etapas crescentes impõem uma sequência.
   - Inclua `expires_at`, `message` ou `copy_receivers` apenas quando necessário. Associe tags com **Document → Append Tags** ou **Replace Tags**.
7. Salve o ID da solicitação de assinatura retornada junto com o ID do documento na sua aplicação ou banco de dados. Só configure tentativas automáticas em torno de Create Assignment se o fluxo primeiro verificar se a solicitação já existe. O nó repete apenas falhas HTTP 429 explícitas; as demais falhas são devolvidas ao fluxo.

Para uma lista dinâmica de destinatários, use Split Out/Loop Over Items do n8n para criar os signatários, reúna os IDs retornados com Aggregate e monte a coleção de signatários de Assignment a partir desse resultado. Preserve o ID do documento de `Upload document` por meio de uma expressão que referencia esse nó pelo nome, sem depender do item atual após o loop de signatários.

A requisição de assinatura montada pelo nó tem este formato:

```json
{
  "method": "virtual",
  "signers": [{
    "id": "<signer-id>",
    "verification_method": "Email",
    "notification_methods": ["Email"],
    "step": 1
  }],
  "message": "Documento de demonstração para assinatura"
}
```

O destinatário abre o convite de assinatura, recebe o código de acesso pelo canal selecionado, confirma seus dados e assina. A assinatura com certificado digital usa o certificado do próprio signatário e o fluxo no navegador dele. O status `metadata_ready` significa apenas que o PDF está pronto para receber uma solicitação de assinatura; não indica que alguém já assinou.

Para gerar um documento a partir de um modelo, use **Template → List/Get** para obter os IDs dos papéis, **Document → Estimate Cost From Template** com a configuração desejada dos signatários e **Document → Create From Template** com um signatário por papel e os valores dos campos do editor. Salve os IDs retornados do documento e da solicitação e use o mesmo fluxo de conclusão descrito a seguir.

### Fluxo B: receber a conclusão e baixar o arquivo

1. Crie um fluxo separado começando com **Assinafy Trigger**. Selecione `document_ready`, `signer_rejected_document` e `document_processing_failed`; inclua `signer_signed_document` se precisar acompanhar o progresso individual dos signatários.
2. Armazene `$json.body.id` como chave de idempotência antes de executar ações que alterem dados ou enviem notificações. A Assinafy pode entregar o mesmo evento novamente.
3. Adicione um nó Switch usando `={{ $json.event }}`.
4. Para `document_ready`, use `={{ $json.body.object.id }}` como **Document ID** em **Document → Get**. Prossiga para **Document → Download Artifact** com `certificated` somente quando o status retornado for `certificated` e `artifacts.certificated` existir. Caso contrário, use um nó IF e um nó Wait com espera curta para voltar a Get, com um limite de tentativas ou de duração do fluxo. Interrompa imediatamente se o status indicar falha, rejeição ou expiração. O PDF é retornado na propriedade binária configurada (`data` por padrão), acompanhado de metadados JSON com `documentId`, nome do arquivo, tipo MIME e tamanho.
5. Em caso de rejeição ou falha de processamento, encaminhe `$json.body.object.id`, `$json.body.message` e `$json.body.payload` para o seu fluxo de notificações ou tratamento de incidentes.

O Trigger gerencia a única assinatura de webhook da conta na Assinafy. Use um fluxo com esse gatilho por conta e distribua os eventos dentro do n8n quando vários processos precisarem deles. Se usar OAuth sem uma conexão de webhook por chave de API, inicie o fluxo de conclusão pelo seu agendador ou aplicação e consulte **Document → Get** com ciclos Wait/Get limitados.

Salve o PDF certificado no sistema de armazenamento escolhido. O artefato `certificate-page` contém o certificado, `bundle` é um ZIP e `pades` fica disponível quando houve assinatura com certificado digital. **Get Signing Progress** fornece contagens quando disponíveis, mas o download deve aguardar o status final e a disponibilidade do artefato.

Se o resultado de Upload ou Create Assignment for incerto, consulte os registros existentes usando os IDs salvos antes de repetir a operação. Reexecutar o fluxo de conclusão deve apenas consultar o status e baixar artefatos já existentes.

### Convenções de dados e erros

- O envelope de resposta da Assinafy, `{ status, message, data }`, é removido antes de gerar a saída.
- Operações de listagem geram um item do n8n por recurso. Operações que alteram dados e retornam arrays geram um único item no formato `{ "data": [...] }`.
- Downloads binários geram um item com metadados JSON e o arquivo na propriedade binária selecionada.
- **Get Signing Progress** define `available: false` e retorna contagens nulas quando a resposta do documento não inclui os detalhes da solicitação de assinatura; nunca apresenta um `0/0` inventado como progresso conhecido.
- A troca de código, a renovação e a revogação de tokens OAuth nunca são repetidas automaticamente. As requisições HTTP têm um tempo limite de 30 segundos.
- Respostas HTTP 429 são repetidas com um limite de tentativas para todos os métodos, respeitando `Retry-After`. A limitação de taxa recusa a requisição antes do processamento; repetir essa requisição não duplica documentos, signatários, solicitações de assinatura, notificações ou ações de webhook. Qualquer outra falha é devolvida após uma única tentativa, pois uma resposta ambígua pode indicar que a alteração já foi aplicada.

## Assinafy Trigger

O gatilho registra ou substitui a assinatura de webhook de todo o workspace quando o fluxo é ativado. A URL de entrega deve usar HTTPS; HTTP é aceito apenas em URLs de desenvolvimento com `localhost`, `127.0.0.1` ou `::1`. O nó adiciona o parâmetro de consulta `assinafy-token`, derivado por HMAC-SHA256 do Webhook Secret da credencial ou, quando não há segredo configurado, da chave de API. Toda entrega deve apresentar esse token e é rejeitada se ele estiver ausente ou incorreto. Reative o fluxo após trocar qualquer um desses valores para que a Assinafy receba a nova URL.

Ao desativar o fluxo, o nó lê a assinatura de webhook atual e só chama `PUT /accounts/{accountId}/webhooks/inactivate` se a URL protegida, o e-mail e o conjunto de eventos corresponderem à sua configuração. O endpoint de inativação da Assinafy é incondicional; portanto, não substitua a assinatura de webhook da conta ao mesmo tempo que desativa o fluxo. Cada entrega aceita gera um item do n8n com `{ event, headers, body }`; cabeçalhos de autenticação, cookies, chaves de API, tokens, segredos e assinaturas são ocultados.

**A verificação da assinatura do conteúdo é uma proteção adicional opcional.** Se o seu workspace assina as entregas, configure **Webhook Secret** e ative **Verify Signature**. O nó passa a exigir `X-Assinafy-Signature`, calcula HMAC-SHA256 sobre os bytes originais do corpo da requisição e rejeita a entrega se a assinatura ou esses bytes não estiverem disponíveis.

> [!IMPORTANT]
> A API da Assinafy permite **uma única** assinatura de webhook por workspace. Ativar este gatilho substitui qualquer assinatura de webhook existente. Coordene a ativação e a desativação nessa conta e distribua os eventos dentro de um único fluxo do n8n quando houver vários destinos.

A lista completa de eventos é definida em `nodes/Assinafy/resources/webhookEvents.ts` e aparece no campo **Events** do nó:
`assignment_created`, `document_metadata_ready`, `document_prepared`, `document_processing_failed`, `document_ready`, `document_uploaded`, `signature_requested`, `signer_created`, `signer_data_confirmed`, `signer_email_verified`, `signer_rejected_document`, `signer_signed_document`, `signer_viewed_document`, `signer_whatsapp_verified`, `template_created`, `template_processed`, `template_processing_failed`, `user_rejected_document`. Quando nenhum evento é selecionado, o gatilho usa o conjunto padrão: `document_ready`, `document_prepared`, `signer_signed_document`, `signer_rejected_document` e `document_processing_failed`.

## Operações disponíveis

> **Referência completa dos conteúdos de requisição e resposta:** consulte
> [`docs/OPERATIONS.md`](docs/OPERATIONS.md), em inglês, para ver os parâmetros de cada
> operação no nó, exemplos de corpo e parâmetros de consulta da requisição e exemplos
> de resposta, incluindo o envelope `{status,message,data}` removido pelo nó.
> As tabelas abaixo servem como índice dos endpoints.

### Códigos de acesso do signatário

As operações marcadas com **(Signer Side)** usam um `signer-access-code` individual em vez da chave de API do workspace. **Nenhum endpoint retorna esse código**: ele chega ao signatário apenas na notificação enviada pela API quando uma solicitação de assinatura é criada ou reenviada, por e-mail ou WhatsApp. Os `signing_urls` de uma nova solicitação não substituem o código. Cada URL leva à página de assinatura do documento (`https://app.assinafy.com.br/sign/{documentId}?email=…`) e não contém o código; usar um trecho desse caminho como `signer-access-code` resulta em erro de autenticação HTTP 401.

Execute essas operações somente quando o código chegar ao fluxo por uma etapa sob seu controle, como um nó de leitura de caixa de entrada, uma integração com WhatsApp ou o preenchimento manual pelo usuário. Para apenas encaminhar um signatário ao documento, envie a URL de assinatura ou use **Document → Send Public Token**. A administração pelo proprietário usa a credencial de chave de API; operações delegadas de documentos podem usar OAuth. Consulte a [origem do código de acesso do signatário](docs/OPERATIONS.md#where-a-signer-access-code-comes-from), em inglês.

### Recurso: Document (documentos)

| Operação | Endpoint |
| --- | --- |
| Upload | `POST /accounts/{accountId}/documents` (multipart) |
| List | `GET /accounts/{accountId}/documents` |
| Search | `GET /accounts/{accountId}/documents/search` — busca simplificada por nome/status |
| Get | `GET /documents/{id}` |
| Rename | `PATCH /documents/{id}` |
| Delete | `DELETE /documents/{id}` |
| Download Artifact | `GET /documents/{id}/download/{artifact}` — `original`, `certificated`, `certificate-page`, `pades`, `bundle` |
| Download Thumbnail | `GET /documents/{id}/thumbnail` |
| Download Page | `GET /documents/{id}/pages/{pageId}/download` |
| Get Activities | `GET /documents/{id}/activities` |
| Get Signing Progress | Calculado a partir de `GET /documents/{id}` |
| Wait Until Ready | Consulta `GET /documents/{id}` até o status ser `metadata_ready`, `pending_signature` ou `certificated` |
| Create From Template | `POST /accounts/{accountId}/templates/{templateId}/documents` |
| Estimate Cost From Template | `POST /accounts/{accountId}/templates/{templateId}/documents/estimate-cost` |
| Verify | `GET /documents/{hash}/verify` — público; verifica um documento certificado pelo hash da assinatura |
| Get Public Info | `GET /public/documents/{id}` — público |
| Send Public Token | `PUT /public/documents/{id}/send-token` — envia o token de acesso de 6 dígitos por e-mail/WhatsApp |
| List Statuses | `GET /documents/statuses` — lista os códigos de status e a possibilidade de exclusão |
| List Tags | `GET /accounts/{accountId}/documents/{documentId}/tags` |
| Replace Tags | `PUT /accounts/{accountId}/documents/{documentId}/tags` |
| Append Tags | `POST /accounts/{accountId}/documents/{documentId}/tags` |
| Detach Tag | `DELETE /accounts/{accountId}/documents/{documentId}/tags/{tagId}` |

O upload recebe uma propriedade binária do nó anterior, contendo um PDF não vazio de até 25 MB e no máximo 2.000 páginas. Os artefatos baixados são anexados ao item de saída como dados binários. O PDF `pades` contém as assinaturas ICP-Brasil dos signatários e o quadro de certificação da plataforma; só existe em documentos com signatários que usam certificado digital. O `bundle` é um ZIP com os três artefatos PDF padrão e o `pades`, quando disponível. A operação List permite filtrar por `status`, `method` (`virtual` / `collect`), IDs de tags e um termo de busca `search`. Create From Template aceita papéis de signatários, ordem sequencial por `step`, valores de campos do editor e nomes de tags do documento.

### Recurso: Signer (signatários)

| Operação | Endpoint |
| --- | --- |
| Create | `POST /accounts/{accountId}/signers` |
| List | `GET /accounts/{accountId}/signers` |
| Get | `GET /accounts/{accountId}/signers/{signerId}` |
| Update | `PUT /accounts/{accountId}/signers/{signerId}` |
| Delete | `DELETE /accounts/{accountId}/signers/{signerId}` |
| Find by Email | `GET /accounts/{accountId}/signers?search={email}` |
| Get Self (Signer Side) | `GET /signers/self?signer-access-code=…` |
| Accept Terms (Signer Side) | `PUT /signers/accept-terms?signer-access-code=…` |
| Verify Code (Signer Side) | `POST /verify?signer-access-code=…` |
| Confirm Data (Signer Side) | `PUT /documents/{documentId}/signers/confirm-data?signer-access-code=…` |
| Upload Signature (Signer Side) | `POST /signature?signer-access-code=…&type=signature\|initial` |
| Download Signature (Signer Side) | `GET /signature/{type}?signer-access-code=…` |

O cadastro de signatário segue o corpo de requisição publicado: apenas **Full Name** é obrigatório. E-mail e WhatsApp são opcionais e podem ser adicionados antes de uma solicitação de assinatura remota. A operação Update disponibiliza `government_id` para CPF ou CNPJ e mantém apenas os dígitos. Alterar um canal de e-mail/WhatsApp ainda não verificado com solicitações em andamento renova seus links e códigos de uso único (OTPs). Um canal já verificado com solicitações em andamento não pode ser alterado até que seus documentos sejam certificados. Create não envia as chaves `cpf` ou `metadata`, que não são aceitas pela API.

### Recurso: Assignment (solicitações de assinatura)

| Operação | Endpoint |
| --- | --- |
| Create | `POST /documents/{documentId}/assignments` |
| Estimate Cost | `POST /documents/{documentId}/assignments/estimate-cost` |
| Reset Expiration | `PUT /documents/{documentId}/assignments/{assignmentId}/reset-expiration` |
| Resend Notification | `PUT /documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/resend` |
| Estimate Resend Cost | `POST /documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/estimate-resend-cost` |
| List WhatsApp Notifications | `GET /documents/{documentId}/assignments/{assignmentId}/whatsapp-notifications` |
| Get Sign Page (Signer Side) | `GET /sign?signer-access-code=…` |
| Sign (Signer Side) | `POST /documents/{documentId}/assignments/{assignmentId}?signer-access-code=…` |
| Decline (Signer Side) | `PUT /documents/{documentId}/assignments/{assignmentId}/reject?signer-access-code=…` |
| List | `GET /assignments?accountId={accountId}` |

O campo `method` pode ser `virtual` (assinatura remota por e-mail ou WhatsApp) ou `collect` (assinaturas em campos posicionados no documento). Cada signatário aceita os campos opcionais `verification_method` (`Email`, `Whatsapp` ou `DigitalCertificate`), um ou mais `notification_methods` e `step` para definir a sequência. Use um canal de notificação compatível com os dados de contato do signatário; quando omitidos, os métodos de verificação e notificação usam `Email`. `DigitalCertificate` exige que a conta tenha o recurso habilitado, que o CPF/CNPJ do signatário esteja em `government_id` e que ele seja o único signatário da sua etapa. Esse método custa 2 créditos por signatário, além do custo da notificação, e gera o artefato opcional `pades`. Para `collect`, informe `entries` como JSON. O campo `copy_receivers` recebe IDs de signatários, não endereços de e-mail.

### Recurso: Template (modelos)

| Operação | Endpoint |
| --- | --- |
| List | `GET /accounts/{accountId}/templates` — filtros: `search`, `status`, IDs de tags, `sort` |
| Get | `GET /accounts/{accountId}/templates/{templateId}` |

Os modelos são criados pela aplicação web da Assinafy e estão disponíveis apenas para leitura neste recurso. Use **List** e **Get** para consultar os papéis e as posições dos campos necessários para gerar documentos com Create From Template.

### Recurso: Tag (etiquetas)

| Operação | Endpoint |
| --- | --- |
| Create | `POST /accounts/{accountId}/tags` |
| List | `GET /accounts/{accountId}/tags` — filtro: `search` |
| Update | `PUT /accounts/{accountId}/tags/{tagId}` |
| Delete | `DELETE /accounts/{accountId}/tags/{tagId}` — parâmetro opcional `force=true` |

As tags são etiquetas do workspace. Você pode gerenciá-las pelo recurso Tag e associá-las aos documentos pelas operações de tags do recurso Document. As cores são validadas como sequências hexadecimais de 6 caracteres antes do envio. Arrays de tags preservam cada entrada como uma única tag, inclusive quando ela contém vírgulas, como em `Empresa Exemplo, Ltda.`. Apenas um valor escalar separado por vírgulas é dividido em várias tags.

### Recurso: Field Definition (definições de campos)

| Operação | Endpoint |
| --- | --- |
| Create | `POST /accounts/{accountId}/fields` |
| List | `GET /accounts/{accountId}/fields` — filtros: `include_inactive`, `include_standard` |
| Get | `GET /accounts/{accountId}/fields/{fieldId}` |
| Update | `PUT /accounts/{accountId}/fields/{fieldId}` |
| Delete | `DELETE /accounts/{accountId}/fields/{fieldId}` |
| Validate | `POST /accounts/{accountId}/fields/{fieldId}/validate` — aceita signer-access-code |
| Validate Multiple | `POST /accounts/{accountId}/fields/validate-multiple` — aceita signer-access-code |
| List Types | `GET /field-types` |

### Recurso: Signer Document (documentos do signatário — Signer Side)

Esses endpoints acessados pelo link do signatário não usam a chave de API do workspace. Get Current, List, Search, Sign Multiple e Decline Multiple exigem o parâmetro de consulta individual `signer-access-code`. Download é público; o campo de código de acesso é opcional e só é enviado quando preenchido.

| Operação | Endpoint |
| --- | --- |
| Get Current | `GET /signers/{signerId}/document?signer-access-code=…` |
| List | `GET /signers/{signerId}/documents?signer-access-code=…` |
| Search | `GET /signers/{signerId}/documents/search?signer-access-code=…&search=…` |
| Sign Multiple | `PUT /signers/documents/sign-multiple?signer-access-code=…` |
| Decline Multiple | `PUT /signers/documents/decline-multiple?signer-access-code=…` |
| Download | `GET /signers/{signerId}/documents/{documentId}/download/{artifact}` — público; código de acesso opcional |

O Download do signatário aceita os mesmos artefatos `original`, `certificated`, `certificate-page`, `pades` e `bundle` do download autenticado de documentos. List oferece paginação e filtros por `status`, `method`, `search` e `sort`.

### Recurso: OAuth

| Operação | Endpoint |
| --- | --- |
| Exchange Code | `POST /oauth/token`, `grant_type=authorization_code` |
| Refresh Token | `POST /oauth/token`, `grant_type=refresh_token` |
| Revoke Token | `POST /oauth/revoke` |
| Get User Info | `GET /oauth/userinfo` |
| Get Metadata | `GET /.well-known/oauth-protected-resource` na origem da API, fora de `/v1` |

Use a credencial nativa nos fluxos comuns. As operações diretas de token retornam dados sensíveis na execução e nunca repetem automaticamente a troca de código, a renovação ou a revogação. Consulte os [conteúdos completos das requisições e respostas e o ciclo de vida do OAuth](docs/OPERATIONS.md#oauth), em inglês.

### Recurso: Authentication (autenticação)

Operações da conta de usuário. As operações de login retornam um token de acesso usado em `Authorization: Bearer …`. As operações que oferecem **Access Token** usam esse valor quando preenchido; caso contrário, usam a chave de API configurada. As operações públicas de recuperação de senha não exigem nenhum dos dois.

| Operação | Endpoint |
| --- | --- |
| Login | `POST /login` |
| Social Login | `POST /authentication/social-login` |
| Link Social Login | `POST /auth/link-social-login` |
| Create API Key | `POST /users/api-keys` |
| Get API Key (Masked) | `GET /users/api-keys` |
| Delete API Key | `DELETE /users/api-keys` |
| Change Password | `PUT /authentication/change-password` |
| Request Password Reset | `PUT /authentication/request-password-reset` |
| Reset Password | `PUT /authentication/reset-password` |

### Recurso: Workspace (contas)

| Operação | Endpoint |
| --- | --- |
| Create | `POST /accounts` |
| List | `GET /accounts` |
| Get | `GET /accounts/{workspaceId}` |
| Update | `PUT /accounts/{workspaceId}` |
| Delete | `DELETE /accounts/{workspaceId}` |
| Get Current User | `GET /users/self` |
| Get Account Statistics | `GET /accounts/{workspaceId}/stats` |
| Get User Statistics | `GET /users/self/stats` |
| Get Theme | `GET /accounts/{workspaceId}/theme` |
| Get Notification Preferences | `GET /users/self/notification-preferences` |
| Update Notification Preferences | `PUT /users/self/notification-preferences` |
| Upload Logo | `POST /accounts/{workspaceId}/logo` (multipart) |
| Download Logo | `GET /accounts/{workspaceId}/logo` |
| Delete Logo | `DELETE /accounts/{workspaceId}/logo` |

`GET /users/self` retorna os dados do usuário autenticado na Assinafy após a remoção do envelope padrão da resposta.

### Recurso: Webhook

| Operação | Endpoint |
| --- | --- |
| Register Subscription | `PUT /accounts/{accountId}/webhooks/subscriptions` |
| Get Subscription | `GET /accounts/{accountId}/webhooks/subscriptions` |
| Inactivate Subscription | `PUT /accounts/{accountId}/webhooks/inactivate` |
| List Event Types | `GET /webhooks/event-types` |
| List Dispatches | `GET /accounts/{accountId}/webhooks` |
| Retry Dispatch | `POST /accounts/{accountId}/webhooks/{dispatchId}/retry` |

Consulte a [referência do conteúdo das entregas de webhook](docs/OPERATIONS.md#webhook-delivery-payloads), em inglês, para ver o envelope completo do POST, as variantes dos 18 eventos, o comportamento de sucesso, novas tentativas e interrupção temporária após falhas, além do formato de saída do gatilho no n8n.

## Desenvolvimento

```bash
npm ci --strict-peer-deps # instalação reproduzível com validação das dependências peer
npm run verify:dependencies # verifica toda a árvore de dependências instalada
npm run dev       # executa n8n-node dev: n8n local com o pacote carregado e recarga automática
npm run lint      # executa n8n-node lint
npm run build     # compila o TypeScript para dist/
npm test          # testes unitários e de formato das requisições
npm run test:ci   # testes com limites mínimos de cobertura
npm run audit:dev # verifica vulnerabilidades nas ferramentas de desenvolvimento
npm run audit:prod # verifica vulnerabilidades nas dependências de produção
npm run verify:package # verifica os arquivos publicáveis e carrega os módulos compilados
```

Para iniciar uma instância isolada em `http://localhost:5679`, execute `npm run build` e depois `docker compose up -d`, conclua a configuração da conta proprietária e siga as instruções de [n8n local e OAuth com HTTPS](CONTRIBUTING.md#local-n8n-and-https-oauth), em inglês. Recompile e reinicie o serviço após alterar o código.

O projeto contém duas credenciais, um nó de ação com onze recursos e um gatilho. O transporte compartilhado trata requisições autenticadas, públicas e com código de acesso do signatário, remove envelopes de resposta, percorre páginas e limita as novas tentativas por excesso de requisições. Os métodos de busca em listas alimentam os seletores de documentos, signatários, tags e modelos.

A suíte de sandbox exige credenciais explícitas, rejeita endereços de produção e remove os registros descartáveis que cria. Alterações de registros, consumo de créditos da conta e mudanças em workspaces, logos e assinaturas de webhook exigem habilitações separadas. Consulte [CONTRIBUTING.md](CONTRIBUTING.md), em inglês, para ver os comandos e as variáveis de ambiente.

## Publicação de versões

`npm run release` executa a verificação de código, compila e solicita o incremento da versão. Uma tag estável `vMAJOR.MINOR.PATCH` gera um único pacote imutável, executa a etapa protegida de testes de documentos e assinaturas no sandbox da Assinafy — incluindo o envio de solicitações que consomem créditos —, publica o pacote no npmjs com comprovação de origem e espelha os mesmos bytes no GitHub Packages. Consulte `.github/workflows/publish.yml`.

Na primeira publicação no npmjs, armazene um `NPM_TOKEN` granular de uso inicial no ambiente protegido `npm` do GitHub e publique apenas pelo fluxo automatizado. Depois, configure o recurso trusted publishing do npm para o repositório `assinafy/n8n-nodes-assinafy`, o arquivo `publish.yml` e o ambiente `npm`; revogue e remova o token inicial. As versões seguintes usam autenticação por GitHub OIDC e mantêm a comprovação de origem habilitada.

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para o processo de verificação e testes no sandbox. Relate vulnerabilidades conforme [SECURITY.md](SECURITY.md). Nunca inclua chaves de API, códigos de signatários, dados pessoais ou conteúdo de documentos em uma issue pública.

## Licença

[MIT](LICENSE.md)
