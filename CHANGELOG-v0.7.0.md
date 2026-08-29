# Clara BPO Financeiro — v0.7.0

## Arquivos como porta de entrada
- O app passa a abrir em **Arquivos** após o login.
- Selecionar pasta primeiro prepara os arquivos para conferência; o usuário confirma o significado de cada documento antes do processamento.
- Tipos disponíveis: **Extrato Bancário**, **Extrato Maquineta Cartão**, **Fatura Cartão de Crédito**, **Contas a Pagar** e **Contas a Receber**.
- Extratos/faturas aceitam PDF ou Excel sem modelo fixo; Pagar/Receber usam o modelo Excel da Clara.
- Alertas e status de revisão são clicáveis e explicam o motivo, origem, quantidade extraída, validação e ações de correção/reprocessamento.

## Contas a Pagar
- Importação removida do módulo: toda entrada por arquivo fica concentrada em **Arquivos**.
- A tela mantém **Títulos**, **Fluxo futuro** e o botão **Novo Lançamento** para inclusão manual.

## Contas a Receber
- Novo módulo com títulos, clientes, vencimentos, valores, status, recebimentos futuros, agrupamentos e lançamento manual.
- Modelo Excel próprio disponível pela tela Arquivos.

## Conciliação
- Evolui para uma mesa de conferência financeira.
- Detalhes exibem descrição original, valor, data, direção, arquivo e tipo de origem, parte/documento, meio de pagamento, bruto/taxa/líquido e metadados preservados do documento.
- Exibe possíveis contrapartidas de Contas a Pagar e Contas a Receber antes da decisão.

## Apresentação
- Novo item no menu com geração de **PDF semanal** e **PDF mensal**.
- Semanal: leitura da semana encerrada + compromissos/recebimentos da próxima semana.
- Mensal: visão gerencial do período com indicadores, gráfico, tabelas, principais movimentos e pontos de atenção.

## Demonstração
- `/demonstracao` passa a utilizar o mesmo `MainApp` do ambiente real.
- Tenant fictício **Empresa Aurora Demo**, totalmente isolado das empresas reais.
- Base com 12 meses de movimentações, contas a pagar/receber, arquivos, contas bancárias e precificação.
- Botão **Restaurar dados** recompõe a base fictícia.

## Versão
- App: `0.7.0`
- Schema: `0.7.0`
- `/api/health` deve retornar `version: 0.7.0`.
