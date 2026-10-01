# Clara BPO — v0.8.7 (auditoria técnica)

Release de correções de integridade financeira, segurança e qualidade. Não há mudança de tela nem de fluxo.

## Integridade dos dados (crítico)
- **Deploys não alteram mais a DRE nem o caixa.** A migração legada `migrateLegacyTransactions` rodava em todo boot e
  reescrevia `dre_impact`/`cash_impact` de todos os lançamentos. Após cada restart, controles de recebíveis/pagáveis,
  vendas econômicas e compras no cartão passavam a contar como caixa (e parte como receita), duplicando valores no
  Resumo, DRE e Fluxo de Caixa. Agora ela só roda em bancos realmente legados (sem `schema_meta`).
- **Reparo automático, executado uma única vez** (`accounting_flags_repaired_v087` em `schema_meta`): restaura os flags a
  partir do papel contábil de cada lançamento, com as mesmas regras da importação. A quantidade corrigida fica gravada
  no valor da chave e no log.
- Linhas ignoradas na revisão de arquivo não voltam a impactar o caixa no boot.
- **Demonstração (`/demonstracao`) voltou a funcionar**: o INSERT dos dados fictícios tinha 13 parâmetros para 12
  placeholders desde a v0.8.1 e retornava erro 500.
- O Resumo não exibe mais números fictícios ("Encantê Natural") quando ocorre erro: retorna erro explícito.

## Segurança
- **Regras GLOBAIS de classificação** (compartilhadas entre todas as empresas) só podem ser criadas pelo MASTER.
  Antes, qualquer usuário — inclusive o visitante anônimo da demonstração — podia criar uma regra global com padrão `%`
  e fazer todos os novos lançamentos de todos os clientes serem classificados automaticamente na categoria escolhida.
- Regras globais passam a casar por substring literal (`strpos`), sem curingas de `LIKE`; padrões com `%` ou com menos
  de 3 caracteres são rejeitados e removidos no boot.
- A empresa de demonstração não alimenta mais a biblioteca global.
- Rate limit por IP: login (10/min), cadastro (5/h), sessão demo (20/h), Luna (20/min).
- Cabeçalhos de segurança (`@fastify/helmet`): CSP restritiva, HSTS, `X-Frame-Options`, `nosniff`.
- CORS deixa de aceitar qualquer origem; só origens em `CORS_ORIGINS`.
- Erros 5xx não expõem mais mensagens internas (SQL, nomes de tabela); o token de autorização é mascarado nos logs.
- Login com tempo constante (não revela se o e-mail existe).
- Troca de senha, desativação ou mudança de perfil encerram as sessões do usuário; perfil MASTER não pode ser atribuído
  via edição; sessões expiradas são removidas periodicamente; sessão demo expira em 1 dia.
- Reset completo de arquivos (`DELETE /api/source-files/reset`) exige ADMIN ou MASTER.
- Validação de que o Plano de Contas pertence à empresa em Contas a Receber e Despesas Fixas; ignorar em lote só
  aceita lançamentos da própria empresa.
- Dependências: `fastify` 5.12.5 e `@fastify/static` 10 (corrigem advisories de alta severidade).

## Operação e qualidade
- Encerramento gracioso em `SIGTERM` (redeploy do Railway) fechando servidor e pool do banco.
- Versão do `/api/health` lida do `package.json` (não fica mais desatualizada).
- Removido código morto: cópias `.js` antigas em `server/src`, `server/src/import/*`, `client/src/main.jsx`,
  `client/vite.config.js`, `client/src/v080.tsx/.css` e `tsconfig.check.json`.
- Testes unitários (`npm test`) e teste de integração com PostgreSQL (`scripts/smoke-test.mjs`).
- Novo workflow `CI` em todo PR e push na `main`: typecheck, testes, build e smoke test.

## Variáveis novas (opcionais)
`CORS_ORIGINS`, `TRUST_PROXY` (padrão 1), `LOGIN_RATE_LIMIT` (padrão 10), `LOG_LEVEL`.

## Pós-deploy recomendado
1. Conferir no log `repairAccountingFlags: N lançamento(s) corrigido(s)`.
2. Revisar regras GLOBAIS existentes (`SELECT pattern,category,source FROM classification_rules WHERE scope='GLOBAL'`).
3. Se algum mês já foi **fechado** com valores inflados, reabrir e fechar de novo para regravar o snapshot da DRE.
