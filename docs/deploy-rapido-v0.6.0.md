# Deploy rápido — Clara v0.6.0

1. Faça backup do PostgreSQL do Railway.
2. Publique o conteúdo deste pacote no mesmo repositório da Clara.
3. Aguarde o Railway executar `npm run build` e iniciar o servidor.
4. A inicialização executa o bootstrap idempotente e as migrations Drizzle pendentes.
5. Abra `/api/health` e valide:
   - `ok: true`
   - `version: 0.6.0`
   - `schema: 0.6.0`
6. Faça `Ctrl + Shift + R` no navegador.
7. Confirme no rodapé da sidebar `Clara BPO · v0.6.0`.
8. Execute o roteiro `docs/teste-aceite-v0.6.0.md` antes de usar em produção.

## Observação
A migration é aditiva. Mesmo assim, backup é obrigatório porque a versão introduz novas tabelas e novas formas de vínculo entre arquivos, lançamentos e Contas a Pagar.
