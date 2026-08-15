# Claria v0.3.2 — correção de build TypeScript

## Correção principal

- Corrige o erro `TS2769` no build do backend causado pela inferência do TypeScript ao criar um `Map` contendo vários schemas Zod com formatos diferentes.
- O mapa de validação de rotas passa a declarar explicitamente o tipo comum `Map<string, any>`, permitindo armazenar schemas heterogêneos sem o TypeScript tentar impor o formato do primeiro schema aos demais.
- Nenhuma tabela ou dado do PostgreSQL é alterado por esta correção.
- Nenhuma mudança de autenticação, multiempresa ou identidade visual entra nesta versão; essas evoluções permanecem no gatilho futuro.

## Railway

- Mantém Node 24, React 19, Vite 8, Fastify 5, TypeScript, Zod 4, Drizzle e PostgreSQL.
- Os avisos do Nixpacks sobre secrets/`NIXPACKS_PATH` não são a causa da falha observada; o bloqueio real era o erro de compilação TypeScript.
