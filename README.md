# Clara BPO Financeiro — v0.6.1

Versão consolidada da próxima evolução da Clara, construída sobre a v0.5.0.

## O que entra nesta versão

### 1. Arquivos — pasta como espelho da base
- **Escolher pasta = sincronizar base**: os arquivos gerais da pasta passam a representar a fotografia atual da base importada.
- A sincronização substitui arquivos e lançamentos anteriores do fluxo geral somente depois que a nova pasta termina com sucesso.
- Se houver falha crítica, a base anterior é preservada.
- **Enviar arquivos = adicionar**, sem apagar os demais.
- Regras de classificação e títulos aprendidos permanecem salvos.
- Importações de **Contas a Pagar** ficam em escopo próprio e não são apagadas por uma sincronização da pasta geral.
- O mês selecionado continua servindo apenas para visualização, nunca para aceitar/rejeitar um arquivo.

### 2. Arquivos — revisão acionável
- Arquivos em **Revisar** abrem uma tela de diagnóstico.
- Exibe tipo detectado, quantidade de lançamentos, motivo, total esperado, total extraído e diferenças quando disponíveis.
- Lista as linhas extraídas.
- Ações: **Corrigir em Lançamentos**, **Ignorar linha**, **Reprocessar arquivo**, **Confirmar mesmo assim** e **Descartar arquivo**.
- Novos arquivos passam a armazenar o conteúdo necessário para reprocessamento.

### 3. Lançamentos
- Separação em abas **Receitas | Despesas**.
- Data sempre visível na tabela.
- Colunas principais: data, título/fornecedor, forma de pagamento, plano de contas, status e valor.
- Checkbox no cabeçalho para **Selecionar todos os lançamentos visíveis**.
- Ação **Confirmar selecionados** em lote, respeitando os filtros da tela.
- Lançamentos ainda sem classificação válida são preservados para revisão.
- Em **Editar lançamento**, novo campo **Reescrever título**.
- O título personalizado não altera a descrição original importada.
- Opção **Aplicar este título aos próximos lançamentos semelhantes**, criando memória permanente por empresa.

### 4. Conciliação explicável
- O indicador **Pontes esperadas** é clicável.
- Mostra pontes encontradas e faltantes, com valor, data, origem, contrapartida e motivo provável.
- Diagnósticos previstos: venda → recebimento, fatura/cartão → liquidação e transferência entre contas próprias.
- Ações: **Vincular manualmente**, **Marcar como transferência**, **Ignorar justificadamente** e **Reprocessar conciliação**.

### 5. DRE comparativa
- Mantém o mesmo Plano de Contas em todos os meses.
- Contas sem movimento continuam visíveis na estrutura quando expandidas.
- Grupos com `+ / −`.
- Ações **Expandir tudo** e **Recolher tudo**.

### 6. Cadastros — contas bancárias
- Aviso no topo explicando que cadastrar todas as contas da empresa ajuda a identificar transferências entre contas próprias.
- O objetivo é impedir que uma movimentação interna seja contabilizada novamente como receita ou despesa.

### 7. Precificação
- Menu **Precificação** acima de Cadastros.
- Entrada manual de um produto ou importação por Excel.
- Modo principal **Preço de venda → margem de contribuição**.
- Modo alternativo **Custo + markup → preço sugerido**.
- Linhas de custos/despesas editáveis e reutilizáveis em modelos.
- Margem de contribuição, meta, cenários, preço mínimo e preço sugerido.
- Modelo XLSX padrão disponível para download.
- Aplicação em lote e exportação com memória de cálculo.
- **Comparar com mercado — Luna** para referências externas quando a integração estiver configurada.

### 8. Novo módulo — Contas a Pagar
Novo item no menu, entre DRE / Resultados e Precificação.

Três origens de dados:
1. **Fatura de cartão** em PDF reconhecido (Nubank) ou tabela Excel/CSV.
2. **Planilha Excel/CSV exportada do sistema do cliente**.
3. **Lançamento manual** direto no Clara.

Recursos:
- fornecedor, descrição, emissão, vencimento, valor, forma de pagamento, documento e classificação;
- classificação inteligente usando a mesma memória do restante do financeiro;
- possibilidade de confirmar a classificação por fornecedor e reaplicá-la no futuro;
- status aberto, agendado, parcial, pago e vencido;
- edição e exclusão de títulos;
- compras de cartão são despesas econômicas; a liquidação da fatura não deve criar uma segunda despesa na DRE;
- modelo Excel padrão em `docs/modelo-contas-a-pagar-clara.xlsx` e também via `/api/payables/template`.

### 9. Fluxo de caixa futuro
Dentro de Contas a Pagar:
- visão por vencimento;
- total futuro aberto e vencido;
- agrupamento por **Fornecedor**;
- agrupamento por **Classificação da despesa**.

## Banco / migração
A migration `server/drizzle/0003_operational_v060.sql` adiciona:
- conteúdo e tipo MIME dos arquivos para reprocessamento;
- escopo de importação dos arquivos;
- título personalizado dos lançamentos;
- memória de títulos (`title_rewrite_rules`);
- `payables`;
- justificativas de conciliação (`reconciliation_ignores`).

## Versão
- App: `0.6.1`
- A versão aparece no rodapé do menu lateral.
- `/api/health` deve retornar `version: 0.6.1`.

## Deploy rápido
1. Faça backup do banco antes da publicação.
2. Substitua o conteúdo do repositório pelos arquivos deste pacote.
3. Commit/push no GitHub conectado ao Railway.
4. Aguarde build e migrations.
5. Acesse `/api/health` e confirme `version: 0.6.1` e `schema: 0.6.1`.
6. Faça recarga forçada do navegador/PWA.
7. Execute `docs/teste-aceite-v0.6.1.md`.
