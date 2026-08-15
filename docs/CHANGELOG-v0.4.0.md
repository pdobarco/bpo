# Changelog — Clara BPO Financeiro v0.4.0

## Identidade e UX
- nova marca visual Clara BPO Financeiro;
- logo oficial preservada em seus pixels, proporções e cores; somente recorte de área branca para aplicação responsiva;
- novo login/página inicial;
- menu lateral navy/azul e dashboard reorganizado conforme mockup aprovado.

## Autenticação
- tabela `users`;
- tabela `auth_sessions`;
- password hashing com `scrypt` nativo do Node;
- tokens de sessão aleatórios; banco guarda somente SHA-256 do token;
- login, logout, sessão atual e cadastro de nova conta.

## Multiempresa
- tabela `user_companies`;
- seletor de empresa;
- cada requisição financeira usa a empresa autorizada indicada no header `x-company-id`;
- MASTER acessa todas as empresas ativas.

## Administração
- cadastrar/ativar/desativar empresas;
- cadastrar, editar, ativar/desativar usuários;
- perfis MASTER, ADMIN, OPERATOR e VIEWER;
- vincular e reconfigurar usuário em uma ou mais empresas.

## Demonstração
- rota pública `/demonstracao`;
- dados fictícios e read-only;
- não usa o PostgreSQL de produção.

## Banco
- schema version: `0.4.0`;
- migration: `0001_auth_multiempresa.sql`;
- banco financeiro existente é preservado.
