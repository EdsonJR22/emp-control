# EmpControl — Controle de Empenhos

Aplicação web para controlar notas de empenho (NE), pedidos,
notas fiscais, reforços de empenho e saldos por item.

## Funcionalidades

- cadastro de notas de empenho e seus itens;
- dashboard com valor autorizado, comprometido e saldo disponível;
- registro, edição e exclusão de pedidos;
- transformação de pedidos em notas fiscais sem perder o pedido original;
- registro das quantidades, preços e valores efetivamente entregues;
- bloqueio de lançamentos acima do valor financeiro da NE;
- alerta visual quando a quantidade utilizada ultrapassa a autorizada;
- reforço de empenho com histórico e atualização automática dos limites;
- arquivamento e restauração de NEs;
- banco persistente no Cloudflare D1;
- acesso protegido por usuário, senha e sessão segura;
- interface responsiva e acessível.

## Tecnologias

- Next.js 16 e React 19;
- Vinext e Vite;
- Cloudflare Workers e D1;
- Drizzle ORM;
- TypeScript e CSS.

## Rodar localmente

Requisitos: Node.js 22.13 ou mais recente, npm e Git.

```bash
git clone https://github.com/EdsonJR22/controle-empenhos-hortifruti.git
cd controle-empenhos-hortifruti
npm ci
npm run dev
```

O Vite mostrará o endereço local no terminal. O D1 é simulado localmente pelo
Miniflare e os dados iniciais são carregados automaticamente no primeiro acesso.

Antes de iniciar, crie um arquivo `.dev.vars` local, que já é ignorado pelo Git:

```dotenv
AUTH_USERNAME=seu-usuario
AUTH_PASSWORD=sua-senha
AUTH_SECRET=uma-chave-aleatoria-com-pelo-menos-32-caracteres
```

Para gerar uma chave de sessão forte:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Comandos úteis:

```bash
npm run dev
npm run lint
npm test
npm run db:generate
```

## Usar no VS Code com Codex (opcional)

Abra a pasta clonada no VS Code:

```bash
code .
```

Instale a extensão oficial **Codex – OpenAI's coding agent**, entre com sua
conta e abra a barra lateral do Codex. Se o ícone não aparecer, use a Paleta de
Comandos e execute `Codex: Open Codex Sidebar`.

Antes de cada alteração maior, crie um commit. Assim você consegue revisar ou
desfazer mudanças feitas pelo Codex sem perder uma versão estável.

## Configurar o Cloudflare D1

Crie um banco D1 com o nome `controle-empenhos-hortifruti-db`. Depois copie o
ID real do banco para o campo `database_id` do arquivo `wrangler.jsonc`.

Para aplicar as migrações no banco remoto:

```bash
npx wrangler login
npm run db:migrate:remote
```

O aplicativo também verifica e cria as tabelas necessárias no primeiro acesso.

## Publicar no Cloudflare Workers

Antes do primeiro deploy da versão com login, cadastre os três valores como
**Secrets** em **Cloudflare > Worker > Settings > Variables and Secrets**:

- `AUTH_USERNAME`;
- `AUTH_PASSWORD`;
- `AUTH_SECRET` — chave aleatória com pelo menos 32 caracteres.

Os valores também podem ser cadastrados interativamente pelo terminal. Eles não
aparecem no comando nem são gravados no repositório:

```bash
npx wrangler secret put AUTH_USERNAME
npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put AUTH_SECRET
```

Cada comando `wrangler secret put` cria uma nova versão no Cloudflare. Depois de
autenticar o Wrangler e configurar os secrets:

```bash
npm run deploy
```

Para implantação automática pelo GitHub, conecte este repositório em
**Cloudflare > Workers & Pages > Create application > Import a repository** e
use `npm run build` como comando de build e `npx wrangler deploy` como comando
de implantação.

Defina a variável de build `NEXT_PUBLIC_SITE_URL` com o endereço público final
para que a imagem e os metadados de compartilhamento usem a URL correta.

## Fluxo de edição

```bash
git pull
npm ci
npm run dev
```

Depois de editar e validar:

```bash
git add .
git commit -m "Descreva a alteração"
git push
```

Com a integração GitHub–Cloudflare ativa, cada `git push` na branch `main`
gera uma nova implantação.

## Segurança

O repositório pode ser público porque não contém o banco D1 nem as credenciais
de acesso. O usuário, a senha e a chave de sessão ficam armazenados como secrets criptografados no Cloudflare.

Nunca envie `.env`, `.dev.vars`, tokens ou senhas para o GitHub.

O login cria uma sessão assinada de 12 horas em cookie `HttpOnly`, `Secure` em
produção e `SameSite=Lax`. Todas as páginas e APIs exigem uma sessão válida, e o endpoint de login limita cada usuário a 10 tentativas por minuto em cada localidade da rede Cloudflare.
Cloudflare Access ainda pode ser habilitado como uma segunda camada de proteção.

Esta versão usa uma única credencial compartilhada. O logout remove a sessão do
navegador; para invalidar todas as sessões já emitidas, troque também o valor de
`AUTH_SECRET`.
