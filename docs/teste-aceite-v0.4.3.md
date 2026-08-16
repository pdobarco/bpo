# Teste de aceite — Clara v0.4.3

## 1. Versão e interface

- [ ] `/api/health` retorna `version: 0.4.3`.
- [ ] O topo da sidebar é branco em toda a largura até o início do menu azul.
- [ ] A logo oficial não foi alterada.
- [ ] O rodapé da sidebar mostra `Clara BPO · v0.4.3`.

## 2. Upload independente da competência

1. Selecione qualquer mês na barra superior (por exemplo junho/2026).
2. Envie PDFs de outros meses.
3. Confirme:
   - [ ] os arquivos são recebidos normalmente;
   - [ ] o mês selecionado não bloqueia a importação;
   - [ ] os lançamentos aparecem quando o mês correspondente é selecionado depois.

## 3. Arquivos de referência usados na correção

Com os 4 PDFs reais usados nesta correção, o parser deve reconhecer aproximadamente:

- [ ] PagBank Relatório de Vendas (maio/2026): **16 vendas**.
- [ ] Nubank Extrato (julho/2026): **45 movimentações**, totalizando R$ 11.096,69 de entradas e R$ 13.113,60 de saídas.
- [ ] Nubank Fatura (jul/ago 2026): **59 compras**, total de R$ 4.866,14.
- [ ] PagBank/PagSeguro Extrato (julho/2026): **40 movimentações** (excluindo linhas de “Saldo do dia”).

Observação: o relatório PagBank de vendas gera também lançamentos derivados de taxas, além das 16 vendas principais.

## 4. Central de Arquivos

- [ ] A tela Arquivos lista todos os arquivos da empresa, independentemente do mês selecionado.
- [ ] Arquivo processado aparece como `Lido`.
- [ ] Arquivo com problema aparece como `Revisar`, com o motivo exibido.
- [ ] Nenhum erro de parser desaparece silenciosamente.

## 5. Regras contábeis

- [ ] `Saldo do dia` não é importado como lançamento.
- [ ] Pagamento da fatura Nubank não duplica a despesa das compras do cartão.
- [ ] Aplicação/resgate de CDB fica fora da DRE.
- [ ] Transferências entre contas próprias ficam fora da DRE.
