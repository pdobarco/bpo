# Deploy rápido — Clara BPO v0.4.2

1. Aplicar os arquivos do patch sobre a base atual.
2. Adicionar `pdfjs-dist` ao `server/package.json` e atualizar o lockfile com o gerenciador já usado pelo projeto.
3. Não recriar o PostgreSQL.
4. Não alterar a `DATABASE_URL` do Railway.
5. Manter as variáveis atuais de autenticação, IA e upload.
6. Fazer build/deploy.
7. Abrir `/api/health` e confirmar banco ok.
8. Executar `teste-aceite-v0.4.2.md` com uma empresa de teste.

> O ponto crítico é: upload e Central de Arquivos não recebem mais o período selecionado na UI.
