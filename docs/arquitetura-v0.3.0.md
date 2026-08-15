# Arquitetura — Claria v0.3.0

```text
PWA / navegador
      │
      ▼
React 19 + TypeScript + Vite 8
      │
TanStack Query + Zod
      │
      ▼
Fastify 5 + TypeScript + Zod
      │
Drizzle ORM ───── SQL financeiro legado validado
      │
      ▼
PostgreSQL Railway
```

## Por que duas formas de acesso ao banco nesta versão?

A v0.3.0 é uma migração de fundação em um sistema que já possui banco e regras financeiras. Reescrever todas as consultas no mesmo deploy aumentaria o risco sem trazer benefício imediato ao usuário.

Por isso:
- Drizzle já é a camada tipada e o mapa oficial do schema;
- migrations novas passam a ter pasta própria e controle explícito;
- acessos simples e centrais já usam Drizzle;
- consultas agregadas de DRE, conciliação e classificação podem ser convertidas gradualmente, acompanhadas de testes de paridade.

## Estado do servidor no frontend

A lista de lançamentos usa TanStack Query para evitar estado manual divergente. A chave da consulta inclui período, filtros e ordenação. Quando uma edição/importação pode alterar a lista, a query é invalidada e consultada novamente.

## Validação

Zod foi colocado nas fronteiras mais propensas a erro:
- resposta da API de lançamentos no frontend;
- corpos de edição/classificação/fechamento no backend.

A estratégia pode ser ampliada para os demais endpoints conforme o produto crescer.

## TypeScript

A conversão está concluída em arquivos `.ts/.tsx`, mas `strict` permanece desativado nesta primeira versão de transição. Isso permite modernizar sem exigir uma reescrita simultânea de todo o domínio. O próximo passo técnico recomendado é elevar a tipagem por módulo e ativar `strict` quando os contratos principais estiverem tipados.
