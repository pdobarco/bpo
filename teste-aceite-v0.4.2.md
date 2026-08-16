# Teste de aceite — Clara v0.4.2

## 1. Regra principal

1. Selecionar **Encantê Natural**.
2. Deixar qualquer mês na interface, por exemplo **junho/2026**.
3. Enviar arquivos que possuam lançamentos de maio, julho e agosto.
4. Confirmar que todos são recebidos/processados independentemente do mês selecionado.

## 2. Central de Arquivos

- os arquivos enviados aparecem imediatamente na Central;
- trocar mês no topo não remove arquivos da Central;
- a Central é isolada apenas pela empresa;
- arquivos em revisão também aparecem, com motivo explícito.

## 3. Lançamentos

- trocar para maio/2026 mostra apenas lançamentos com competência em maio;
- trocar para julho/2026 mostra apenas lançamentos de julho;
- trocar para agosto/2026 mostra apenas lançamentos de agosto;
- o filtro altera visualização, nunca a importação.

## 4. Quatro formatos reais usados no diagnóstico

Validar os formatos:

- PagBank Relatório de Vendas;
- Nubank Extrato;
- Nubank Fatura;
- PagBank/PagSeguro Extrato.

Resultado esperado: formatos reconhecidos não devem cair em revisão por motivo de período.

## 5. Conferência financeira

Para extrato Nubank, conferir soma de movimentos individuais contra `Total de entradas` e `Total de saídas` impressos no próprio documento.

Para fatura Nubank, conferir a soma das compras contra o total de compras da fatura. O pagamento da fatura não deve virar segunda despesa.

## 6. Duplicidade

- importar novamente o mesmo arquivo na mesma empresa: duplicado;
- importar o mesmo arquivo em outra empresa: permitido.

## 7. Atualização da interface

Após upload:

- Arquivos recarrega;
- Lançamentos recarrega;
- DRE recarrega;
- Dashboard recarrega;
- Conciliação recarrega.

Nenhum erro de API deve ser apresentado como `0 lançamentos`.
