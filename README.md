# Claria v0.3.2 — Correção de build da Base Moderna

PWA financeira/BPO voltada a usuários não técnicos. A v0.3.2 mantém a base moderna da v0.3.0 e corrige a falha TypeScript encontrada no segundo build do Railway, sem alterar dados nem o schema do PostgreSQL.

## Stack da v0.3.2

### Correções de build acumuladas

- **v0.3.1:** atualizou o SDK oficial `openai` para `7.4.0`, eliminando o conflito de peer dependency com Zod 4;
- **v0.3.1:** passou a instalar as dependências de desenvolvimento necessárias para TypeScript/Vite no Railway;
- **v0.3.2:** corrige o `TS2769` em `server/src/index.ts`: o mapa de schemas de validação agora aceita explicitamente schemas Zod heterogêneos, em vez de o TypeScript inferir o formato do primeiro schema para todos os demais;
- não usa `--force` nem `--legacy-peer-deps`;
- não altera tabelas, dados, migrations ou a `DATABASE_URL`.


### Frontend
- React 19
- TypeScript
- Vite 8
- TanStack Query 5 para estado vindo da API
- Zod 4 para validar respostas críticas da API
- PWA com `vite-plugin-pwa`

### Backend
- Node.js 24 LTS
- TypeScript
- Fastify 5
- Zod 4 para validar corpos de rotas críticas
- Drizzle ORM + Drizzle Kit
- PostgreSQL

### Infraestrutura
- GitHub → Railway
- PostgreSQL continua sendo o serviço de banco no Railway
- **Drizzle não é um serviço separado:** ele roda dentro da aplicação Node e usa a mesma `DATABASE_URL`.

## O que muda para o usuário

A interface continua simples. A maior parte desta versão é de fundação técnica.

Também permanecem as correções da v0.2.1:
- “Todos os lançamentos” recarrega de forma confiável;
- erro de API não aparece como `0 lançamentos`;
- competência vazia usa a data do evento;
- datas ISO não aparecem como `Invalid Date`;
- competência e Plano de Contas podem ser editados após a confirmação;
- edição pode afetar apenas o lançamento ou também a regra futura;
- alterações são auditadas e recalculam a DRE;
- cabeçalhos da tabela são clicáveis para ordenar;
- resumo de entradas/saídas na tabela;
- valores da DRE ficam mais próximos dos títulos.

## PostgreSQL existente — NÃO APAGAR

A base v0.3.x foi criada para adotar o banco já usado pelo Claria.

No primeiro startup:
1. o bootstrap compatível garante, com operações idempotentes, que tabelas/colunas antigas existam;
2. competências legadas vazias recebem a data do evento;
3. o schema TypeScript do Drizzle passa a representar a estrutura do banco;
4. o migrador do Drizzle registra/aplica a migration de adoção;
5. o `schema_version` passa para `0.3.0`.

Não recrie o PostgreSQL e não troque a `DATABASE_URL`.

> A adoção é propositalmente conservadora. Consultas financeiras complexas continuam usando SQL já testado nesta versão, enquanto acessos centrais e o schema já usam Drizzle. Isso reduz o risco de alterar resultados financeiros apenas para trocar a tecnologia.

## Deploy no Railway

1. Substitua o conteúdo do repositório pelos arquivos desta versão.
2. Faça commit/push no GitHub.
3. Mantenha o PostgreSQL atual.
4. Mantenha as variáveis descritas em `docs/variaveis-railway.md`.
5. O Railway executará:

```text
Build: npm run install:all && npm run build
Start: npm start
Healthcheck: /api/health
```

6. Após o deploy, abra:

```text
https://SEU-APP.up.railway.app/api/health
```

Resposta esperada:

```json
{
  "ok": true,
  "version": "0.3.2",
  "database": "ok",
  "schema": "0.3.0"
}
```

Depois faça o checklist em `docs/teste-aceite-v0.3.2.md`.

## Comandos úteis

```bash
# desenvolvimento
npm install
npm run install:all
npm run dev

# validar TypeScript + gerar frontend/backend
npm run typecheck
npm run build

# Drizzle (executar dentro de /server com DATABASE_URL configurada)
npm run db:pull
npm run db:generate
npm run db:migrate
```

Para este banco já existente, leia `docs/migracao-drizzle.md` antes de usar comandos de alteração de schema diretamente em produção.

## Estrutura principal

```text
/client
  /src
    main.tsx
    api.ts
    queryClient.ts
  vite.config.ts
/server
  /src
    index.ts
    db.ts
    /db/schema.ts
    /parsers
    /services
  /drizzle
  drizzle.config.ts
/docs
```

## IA / Luna

A Luna continua sendo usada somente quando agrega valor:
- sugestão em lote para saídas desconhecidas;
- adaptação de PDF quando o parser normal não consegue extrair lançamentos.

Regras conhecidas, biblioteca compartilhada, CNPJ, memória da empresa e parsers continuam tendo prioridade.

## Segurança

- Não coloque `OPENAI_API_KEY` no GitHub.
- Não publique extratos ou planilhas reais no repositório.
- A v0.3.2 não exige serviço adicional no Railway para Drizzle.
