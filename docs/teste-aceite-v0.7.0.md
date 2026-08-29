# Teste de aceite — Clara BPO v0.7.0

## 1. Entrada e navegação
- [ ] Após login, o primeiro módulo exibido é **Arquivos**.
- [ ] O menu contém **Contas a Receber** e **Apresentação**.
- [ ] Resumo permanece disponível normalmente.

## 2. Arquivos
- [ ] Selecionar pasta não importa imediatamente; abre a lista para confirmação de tipos.
- [ ] Cada arquivo permite escolher: Extrato Bancário, Extrato Maquineta Cartão, Fatura Cartão de Crédito, Contas a Pagar, Contas a Receber.
- [ ] PDF e Excel de extrato/fatura são aceitos sem modelo fixo.
- [ ] Contas a Pagar/Receber recusam arquivos fora do formato tabular e orientam o modelo.
- [ ] Arquivo com alerta/revisão é clicável.
- [ ] Diagnóstico informa motivo, tipo, linhas extraídas e oferece revisar/reprocessar/confirmar/descartar quando aplicável.

## 3. Contas a Pagar
- [ ] Não existe aba de importação.
- [ ] Botão **Novo Lançamento** cria título manual.
- [ ] Títulos e Fluxo futuro carregam normalmente.
- [ ] Importação feita em Arquivos aparece em Contas a Pagar.

## 4. Contas a Receber
- [ ] Modelo Excel pode ser baixado em Arquivos.
- [ ] Importação pelo tipo Contas a Receber cria títulos.
- [ ] Novo Lançamento cria recebível manual.
- [ ] Títulos mostram cliente, vencimento, classificação, status e valor.
- [ ] Fluxo futuro agrupa por cliente e por classificação.
- [ ] Título pode ser marcado como recebido.

## 5. Conciliação
- [ ] Itens podem ser abertos para inspeção.
- [ ] Detalhes mostram descrição original, data, valor, entrada/saída, arquivo, tipo, parte, documento, forma de pagamento e bruto/taxa/líquido quando disponíveis.
- [ ] Metadados brutos úteis (NSU, autorização etc.) são exibidos quando existirem.
- [ ] Possíveis títulos de Pagar/Receber aparecem antes da decisão.
- [ ] Vincular, marcar transferência, ignorar justificadamente e reprocessar continuam funcionando.

## 6. Apresentação
- [ ] PDF semanal é gerado e abre corretamente.
- [ ] PDF semanal contém indicadores, visão da semana encerrada, compromissos e recebimentos futuros.
- [ ] PDF mensal é gerado para o mês selecionado.
- [ ] PDF mensal contém indicadores, gráfico, tabelas e leitura executiva.

## 7. Demonstração
- [ ] `/demonstracao` abre sem login manual.
- [ ] A demonstração usa o mesmo menu e telas do app real.
- [ ] A empresa exibida é **Empresa Aurora Demo**.
- [ ] Há 12 meses de dados fictícios e títulos a pagar/receber.
- [ ] Dados reais não aparecem no ambiente demo.
- [ ] Botão **Restaurar dados** repõe a base fictícia.
- [ ] Ao sair da demonstração, a sessão real anterior é preservada quando existia.

## 8. Integridade
- [ ] `npm run typecheck` passa.
- [ ] `npm run build` passa.
- [ ] `/api/health` retorna `version: 0.7.0` e `schema: 0.7.0` após migração.
