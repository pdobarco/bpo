# Teste de aceite — Clara v0.4.4

## 1. Versão e interface
- [ ] `/api/health` retorna `0.4.4`.
- [ ] Rodapé da sidebar mostra `Clara BPO · v0.4.4`.
- [ ] O topo da sidebar, atrás da logo oficial, é branco em 100% da largura.
- [ ] A partir de `Resumo`, a sidebar permanece azul escuro.

## 2. Upload sem relação com o filtro de mês
- [ ] Escolha qualquer competência na tela.
- [ ] Envie PDFs de outros meses.
- [ ] O upload não é recusado nem enviado para revisão por causa do mês selecionado.

## 3. PDFs reais
- [ ] PagBank relatório de vendas: aproximadamente 16 vendas extraídas.
- [ ] Nubank extrato jul/2026: 45 movimentações; entradas R$ 11.096,69; saídas R$ 13.113,60.
- [ ] Nubank fatura ago/2026: compras extraídas das páginas de transações.
- [ ] PagBank extrato jul/2026: linhas `Saldo do dia` não viram lançamentos.

## 4. Persistência
- [ ] Cada arquivo aparece na Central de Arquivos após upload.
- [ ] Lançamentos aparecem no mês correspondente à data de cada lançamento.
- [ ] Não ocorre `could not determine data type of parameter $3`.
