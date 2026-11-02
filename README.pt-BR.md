# @assinafy/n8n-nodes-assinafy

**Português (Brasil)** · [English](README.md)

Nós comunitários do n8n para a [Assinafy](https://assinafy.com.br): documentos, contratos, signatários, solicitações de assinatura, modelos, etiquetas, campos, contas, autenticação, OAuth e webhooks. O pacote inclui o nó de ações **Assinafy**, o **Assinafy Trigger** e as credenciais **Assinafy API** e **Assinafy OAuth2 API**.

## Instalação

No n8n em infraestrutura própria, abra **Settings → Community Nodes → Install**, informe `@assinafy/n8n-nodes-assinafy` e reinicie o n8n se solicitado. O npmjs é o registro principal; o GitHub Packages é apenas um espelho. A disponibilidade no n8n Cloud depende da aprovação no catálogo do n8n.

Use Node.js 26.13.0 LTS no desenvolvimento. A versão mínima de execução do pacote é Node.js 24.21.0; o ambiente local usa n8n 2.42.4. A Assinafy exige HTTPS com TLS 1.2 ou mais recente.

## Credenciais

### OAuth2

Use OAuth2 para aplicativos que atuam em uma conta autorizada.

1. No nó de ações, selecione **Authentication → OAuth2** e crie uma credencial **Assinafy OAuth2 API**.
2. Copie a URL HTTPS exata de callback exibida pelo n8n. Na Assinafy, abra **Integrações → Apps OAuth**, crie um aplicativo e cadastre esse callback.
3. Um aplicativo confidencial de servidor usa Client ID e Client Secret privado. Um cliente público omite o segredo. O n8n gerencia Authorization Code, PKCE S256, armazenamento criptografado e renovação.
4. Solicite apenas os escopos permitidos. Fluxos de documentos usam `documents:read documents:write account:read`; modelos adicionam `templates:read`; alterações de webhook adicionam `webhooks:write`. Adicione `offline_access` para rotação e `openid profile email` somente quando precisar dos dados de identidade.
5. Deixe **Account ID** vazio para descobrir a única conta selecionada no consentimento, ou informe o ID dessa conta. OAuth não pode trocar de conta nem executar administração exclusiva do proprietário.
6. Teste com **Workspace → List**. O access token dura uma hora; cada renovação troca o refresh token por outro válido por mais 30 dias. Uma credencial ociosa por 30 dias precisa ser reconectada.

O recurso OAuth expõe troca, renovação, revogação, UserInfo e metadados do recurso protegido para integrações que gerenciam seus próprios tokens. A saída contém dados sensíveis, e mutações de token nunca são repetidas automaticamente.

### Chave de API

Use **Assinafy API** para rotas administrativas, o Trigger, leitura de segredos de assinatura, evidências/decisões biométricas, sandbox ou fixtures locais. Configure a chave, o Account ID padrão e Production, Sandbox ou uma URL `/v1` personalizada validada. A chave é enviada apenas em `X-Api-Key`. Guarde chaves, tokens OAuth, códigos de signatários, URLs de captura e segredos de webhook somente em armazenamento protegido.

## Métodos de verificação e notificações

| Método de verificação | Dados obrigatórios | Notificação | Observações |
| --- | --- | --- | --- |
| `Email` | Email | `Email` | Sem crédito de notificação |
| `Whatsapp` | `whatsapp_phone_number`; plano pago | `Whatsapp` | 0,45 crédito por notificação |
| `IdDocumentFaceMatchBasic` | CPF válido; recurso biométrico | Email ou WhatsApp | Consentimento explícito; estime o custo por signatário |
| `DigitalCertificate` | CPF ou CNPJ alfanumérico; recurso de certificado | Email ou WhatsApp | ICP-Brasil A1/A3 no navegador; assignment virtual; signatário sozinho na etapa |

Cada signatário aceita um método de notificação. Estime o custo e confirme os recursos antes de criar o assignment. Os códigos de acesso chegam nas notificações; URLs de documentos não os contêm, e o workflow nunca deve derivar ou inventar códigos.

## Fluxo completo de documentos

1. Use **Document → Upload** para enviar um PDF não vazio de até 25 MB e salve o ID.
2. Use **Document → Wait Until Ready** até os metadados ficarem prontos. Isso não garante que o arquivo certificado já exista.
3. Use **Signer → Create** ou reutilize um signatário. Informe email/WhatsApp e o `government_id` exigido pelo método.
4. Execute **Assignment → Estimate Cost**; pare se faltarem recursos ou funcionalidades do plano.
5. Execute **Assignment → Create** uma única vez e salve os IDs do assignment e dos signatários. Use etapas contíguas ou omita todas.
6. O signatário recebe um código, confirma dados/termos, conclui OTP ou captura biométrica quando necessário e assina. Certificado digital permanece no fluxo do navegador da Assinafy.
7. Execute o **Assinafy Trigger** em outro workflow. Elimine duplicidades por `webhook-id`, rote por evento e trate falha de processamento, recusa e expiração como falhas finais.
8. Depois de todas as assinaturas, consulte **Document → Get** até o status `certificated` e a disponibilidade do arquivo solicitado. `document_metadata_ready` e todos os signatários concluídos não garantem o arquivo.
9. Use **Document → Download Artifact** (`certificated`, `pades`, `certificate-page`, `original` ou `bundle`) e armazene o binário.

Em modelos, **Create From Template** pode retornar inicialmente `uploaded` com `assignment: null`; salve o ID e aguarde `pending_signature` com um assignment. Em gestão de contratos, faça o upload e depois use **Contract → Set Terms**; preserve o ID se os termos falharem. Renove ou encerre usando o `updated_at` lido por Get.

## Assinafy Trigger

A ativação cria ou atualiza somente o endpoint deste workflow; a desativação remove somente esse endpoint. Uma conta comporta um endpoint, ou até três em planos pagos. Em ambientes antigos, o Trigger usa a assinatura única.

A URL sempre contém um token derivado da credencial. **Verify Signature** também habilita a validação HMAC-SHA256 do Standard Webhooks sobre o corpo bruto exato, com janela de cinco minutos e cache do segredo de no máximo 60 segundos. Cabeçalhos com credenciais são ocultados. Proteja o segredo do endpoint e elimine duplicidades por `webhook-id`.

## Operações disponíveis

| Recurso | Operações |
| --- | --- |
| Document | Append Tags, Create From Template, Delete, Detach Tag, Download Artifact, Download Page, Download Thumbnail, Estimate Cost From Template, Get, Get Activities, Get Public Info, Get Signing Progress, List, List Statuses, List Tags, Rename, Replace Tags, Search, Send Public Token, Upload, Verify, Wait Until Ready |
| Contract | List, Get, Get Related, Set Terms, Renew, Terminate |
| Signer | Accept Terms (Signer Side), Confirm Data (Signer Side), Create, Delete, Download Signature (Signer Side), Find by Email, Get, Get Identity Verification (Signer Side), Get Self (Signer Side), List, Start Identity Verification (Signer Side), Update, Upload Signature (Signer Side), Verify Code (Signer Side) |
| Assignment | Create, Decide Identity Review, Decline (Signer Side), Download Identity Review Image, Estimate Cost, Estimate Resend Cost, Get Identity Review, Get Sign Page, List, List WhatsApp Notifications, Resend Notification, Reset Expiration, Sign (Signer Side) |
| Template | List, Get |
| Tag | Create, List, Update, Delete |
| Field Definition | Create, List, Get, Update, Delete, Validate, Validate Multiple, List Types |
| Signer Document | Get Current, List, Search, Sign Multiple, Decline Multiple, Download |
| OAuth | Exchange Code, Refresh Token, Revoke Token, Get User Info, Get Metadata |
| Authentication | Change Password, Complete Two-Factor Login, Confirm Authenticator Enrollment, Create API Key, Delete API Key, Get API Key (Masked), Link Social Login, List Two-Factor Methods, Login, Regenerate Recovery Codes, Remove Two-Factor Method, Request Password Reset, Reset Password, Social Login, Start Authenticator Enrollment |
| Workspace | Create, Delete, Delete Logo, Download Logo, Get, Get Account Statistics, Get Current User, Get Notification Preferences, Get Theme, Get User Statistics, List, Update, Update Notification Preferences, Upload Logo |
| Webhook | Create Endpoint, Delete Endpoint, Delete Endpoint by URL, Get Endpoint, Get Endpoint Signing Secret, Get Subscription, Inactivate Subscription, List Dispatches, List Endpoints, List Event Types, Register Subscription, Retry Dispatch, Rotate Endpoint Signing Secret, Update Endpoint |

O contrato completo de parâmetros, autenticação, endpoints, mídia, requisições, respostas, erros e payloads de webhook está em [docs/OPERATIONS.md](docs/OPERATIONS.md), em inglês. Listas geram um item n8n por registro; mutações que retornam arrays usam `{ "data": [...] }`; envelopes de sucesso são removidos; binários incluem metadados; cada saída permanece ligada à entrada original. HTTP 429 recebe no máximo três tentativas; outras falhas e mutações OAuth são executadas uma vez.

## Desenvolvimento

```bash
npm ci --strict-peer-deps
npm run verify:dependencies
npm run build
npm run lint
npm run test:ci
npm run audit:dev
npm run audit:prod
npm run verify:package
```

Execute `npm run build && docker compose up -d` para iniciar o n8n isolado em `http://localhost:5679`. Consulte [CONTRIBUTING.md](CONTRIBUTING.md), em inglês, para OAuth com HTTPS, fixtures, gates de sandbox e verificação da versão. Relate vulnerabilidades conforme [SECURITY.md](SECURITY.md); nunca coloque credenciais, identidades reais ou documentos em issues públicas, testes ou exemplos.

## Licença

[MIT](LICENSE.md)
