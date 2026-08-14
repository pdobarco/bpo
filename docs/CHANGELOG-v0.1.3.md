# Changelog — Claria v0.1.3

## Correção crítica de banco / Railway

- Corrigida a ordem das migrações do PostgreSQL.
- `counterparty_document` e `account_id` agora são adicionados antes dos índices que dependem dessas colunas.
- `chart_accounts` é garantida antes das FKs que apontam para ela.
- Criação de índices foi separada do bloco inicial de `CREATE TABLE`, evitando rollback completo em bancos antigos.
- Adicionada tabela `schema_meta` com `schema_version` para diagnóstico.
- Adicionado `/api/health` com validação real do schema.
- Removido o comportamento de iniciar silenciosamente como “Claria sem DB” quando uma migração falha; com `DATABASE_URL` configurada, o serviço encerra com erro explícito para o Railway reiniciar, evitando uma aplicação parcialmente migrada.

## Compatibilidade

A migração foi desenhada para aproveitar o PostgreSQL existente das versões anteriores. Não é necessário apagar o banco.
