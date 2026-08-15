# Claria v0.3.0 — Base Moderna

## Objetivo

Modernizar a fundação do Claria sem mudar o Aprovaí e sem reconstruir ou apagar o PostgreSQL atual.

## Frontend

- React atualizado para a linha 19.
- Migração do frontend de JavaScript/JSX para TypeScript/TSX.
- Vite atualizado para a linha 8.
- Inclusão de TanStack Query 5.
- “Todos os lançamentos” passa a usar query declarativa com cache, invalidação e refetch.
- A lista refaz a consulta ao entrar na aba, ao voltar para a janela e após invalidações relevantes.
- Inclusão de Zod 4 para validar em runtime a resposta de `/api/transactions`.
- Mantido o comportamento da v0.2.1 para erro explícito, edição, ordenação e resumo da tabela.

## Backend

- Migração de `.js` para TypeScript `.ts`.
- Express substituído por Fastify 5 como servidor HTTP.
- URLs e contratos atuais da API foram preservados.
- Zod valida corpos das rotas mais sensíveis, incluindo edição de lançamento e fechamento mensal.
- Node alvo definido como 24 LTS.

## Banco de dados / Drizzle

- Adicionado Drizzle ORM.
- Adicionado Drizzle Kit.
- Criado `server/src/db/schema.ts` com o schema tipado das tabelas atuais.
- Criada migration de adoção em `server/drizzle/0000_adopt_claria.sql`.
- O startup executa o migrador Drizzle depois do bootstrap idempotente de compatibilidade.
- Funções centrais de empresa, Plano de Contas, contas próprias e auditoria já usam queries tipadas do Drizzle.
- Consultas financeiras complexas permanecem em SQL nesta primeira migração para reduzir risco de regressão de cálculo.
- PostgreSQL existente é reutilizado; não há exclusão nem recriação das tabelas.

## Correções da v0.2.1 preservadas

- competência vazia → data do evento;
- correção de `Invalid Date`;
- edição de competência e Plano de Contas;
- opção de atualizar também a regra futura;
- auditoria da alteração;
- DRE atualizada após edição;
- ordenação por cabeçalhos;
- carregamento confiável de lançamentos;
- erro de API não mascarado como lista vazia;
- resumo de quantidade, entradas e saídas;
- valores da DRE mais próximos dos títulos;
- normalização conservadora das formas de pagamento.

## Compatibilidade

- O Aprovaí não foi alterado.
- As variáveis de ambiente do Claria permanecem essencialmente as mesmas.
- Drizzle não requer um novo serviço no Railway.
