# Teste de aceite — Clara BPO v0.6.1

## 1. Fatura Nubank — julho/2026
Arquivo de regressão: `07.26 FATURA Nubank_2026-07-17 2.pdf`.

Esperado:
- Tipo: `NUBANK_CARD`.
- 57 compras extraídas.
- Total das compras: R$ 5.519,35.
- `validation_status = OK`.
- As duas compras `Superfrete` de R$ 30,68 em 26/06/2026 devem existir separadamente.
- O pagamento da fatura anterior não deve entrar como nova despesa da fatura atual.

## 2. Relatório de Vendas PagBank — 01/06 a 26/08/2026
Arquivo de regressão: `PagBank_2026-08-26_10-54-04-detalhado.pdf`.

Esperado:
- Tipo: `PAGBANK_SALES`.
- O PDF possui páginas rotacionadas e deve ser lido normalmente.
- Deve extrair lançamentos de 02/06/2026 a 22/08/2026, em vez de retornar zero.
- Linhas `Valor Líquido do dia` não são lançamentos e não devem ser importadas.

## 3. Sincronização por pasta
- Selecionar uma pasta contendo os arquivos acima e as demais fontes válidas.
- Nenhum dos dois arquivos deve gerar `REVIEW` por falha de parser.
- Se todos os arquivos forem válidos, `syncApplied` deve ser `true` e a pasta passa a substituir a base geral anterior.
