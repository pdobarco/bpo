# Teste de aceite — Clara v0.6.0

## 1. Versão / layout
- [ ] `/api/health` retorna `version: 0.6.0` e `schema: 0.6.0`.
- [ ] Rodapé do menu mostra `Clara BPO · v0.6.0`.
- [ ] Topo da sidebar permanece branco atrás da logo oficial; menu abaixo permanece azul.

## 2. Arquivos / sincronização
- [ ] Escolher uma pasta com 4 arquivos e sincronizar.
- [ ] Confirmar que a pasta passa a substituir a base geral anterior, sem somar os arquivos antigos.
- [ ] Confirmar que regras/classificações aprendidas continuam existindo após a sincronização.
- [ ] Forçar uma pasta com um arquivo inválido e confirmar que a base anterior é preservada.
- [ ] Enviar arquivo avulso e confirmar que ele é adicionado sem limpar a base.

## 3. Revisão de arquivo
- [ ] Abrir um arquivo com status Revisar.
- [ ] Conferir motivo, totais/diferença quando disponíveis e linhas extraídas.
- [ ] Testar Ignorar linha.
- [ ] Testar Reprocessar arquivo.
- [ ] Testar Confirmar mesmo assim.
- [ ] Testar Corrigir em Lançamentos.

## 4. Lançamentos
- [ ] Alternar Receitas e Despesas e confirmar filtragem correta.
- [ ] Conferir data visível em todas as linhas.
- [ ] Marcar todos os lançamentos visíveis e confirmar em lote.
- [ ] Confirmar que lançamentos sem classificação válida continuam pendentes.
- [ ] Editar um lançamento, preencher Título personalizado e salvar.
- [ ] Confirmar que a descrição original permanece visível em segundo plano.
- [ ] Marcar “Aplicar aos próximos lançamentos semelhantes”, reimportar dado semelhante e confirmar reaplicação.

## 5. Conciliação
- [ ] Abrir Pontes esperadas.
- [ ] Conferir encontradas e faltantes com valor/data/motivo.
- [ ] Testar vínculo manual.
- [ ] Testar Marcar como transferência.
- [ ] Testar Ignorar com justificativa.
- [ ] Reprocessar conciliação.

## 6. DRE
- [ ] Abrir Comparar meses.
- [ ] Confirmar o mesmo Plano de Contas para todos os meses.
- [ ] Testar `+ / −`, Expandir tudo e Recolher tudo.

## 7. Contas bancárias
- [ ] Confirmar aviso no topo de Cadastros sobre transferências entre contas próprias.

## 8. Precificação
- [ ] Precificar um item pelo preço de venda.
- [ ] Precificar um item por custo/markup.
- [ ] Adicionar/remover linhas de despesas.
- [ ] Baixar modelo Excel, preencher e importar vários produtos.
- [ ] Exportar resultado com memória de cálculo.
- [ ] Testar Luna/mercado quando `AI_ENABLED=true` e a integração estiver configurada.

## 9. Contas a Pagar
- [ ] Importar fatura Nubank em PDF e conferir compras individuais, vencimento e total.
- [ ] Baixar `modelo-contas-a-pagar-clara.xlsx`, preencher e importar.
- [ ] Criar uma conta a pagar manualmente.
- [ ] Classificar uma despesa e marcar a opção de memorizar por fornecedor.
- [ ] Confirmar reaplicação da classificação em novo título do mesmo fornecedor.
- [ ] Marcar título como pago.
- [ ] Conferir Fluxo futuro agrupado por Fornecedor.
- [ ] Conferir Fluxo futuro agrupado por Classificação.
- [ ] Confirmar que pagamento/liquidação de fatura não duplica a despesa econômica na DRE.
