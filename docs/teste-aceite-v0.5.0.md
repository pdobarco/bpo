# Teste de aceite — Clara v0.5.0

## 1. Versão
- [ ] `/api/health` retorna `version: 0.5.0`.
- [ ] Rodapé da sidebar mostra `Clara BPO · v0.5.0`.
- [ ] Logo permanece inalterada sobre cabeçalho branco integral.

## 2. Sincronizar pasta
1. Importe uma pasta com 8 arquivos.
2. Confirme os arquivos e lançamentos na Central de Arquivos.
3. Selecione nova pasta contendo somente 4 arquivos.
4. Confirme o aviso de sincronização.
- [ ] Ao final permanecem somente os 4 arquivos da pasta atual.
- [ ] Os lançamentos antigos dos 4 arquivos removidos não permanecem na base.
- [ ] Classificações ensinadas anteriormente continuam sendo reaplicadas.
- [ ] Upload avulso continua adicionando sem limpar os demais.
- [ ] Se um arquivo da nova pasta falhar sem lançamentos, a base anterior é preservada.

## 3. DRE comparativa
- [ ] Abrir DRE > Comparar meses.
- [ ] As mesmas contas aparecem em todos os meses quando expandidas.
- [ ] Valores zero aparecem como `R$ 0,00`.
- [ ] `+ / −` expande/recolhe cada grupo.
- [ ] Expandir tudo e Recolher tudo funcionam.

## 4. Cadastros
- [ ] Aviso sobre contas próprias aparece no topo.

## 5. Precificação manual
- [ ] Menu Precificação aparece acima de Cadastros.
- [ ] Preço → margem calcula custo, despesas, MC R$, MC %, preço mínimo e recomendado.
- [ ] Custo → markup calcula preço de venda pelo markup.
- [ ] Adicionar/remover/editar despesas recalcula imediatamente.
- [ ] Salvar e reaplicar modelo funciona.

## 6. Excel
- [ ] Baixar modelo gera `modelo-precificacao-clara.xlsx`.
- [ ] Importar o modelo reconhece os cabeçalhos.
- [ ] A lógica atual é aplicada aos produtos importados.
- [ ] Editar custo/preço de uma linha recalcula o lote.
- [ ] Exportar gera `precificacao-clara.xlsx` com aba Produtos e aba Lógica.

## 7. Luna / mercado
- [ ] Com `AI_ENABLED=true` e `OPENAI_API_KEY`, Comparar com mercado pesquisa referências.
- [ ] Sem Luna configurada, a tela informa que a função precisa ser ativada, sem quebrar a precificação.
