# Clara BPO Financeiro — v0.7.0

Clareza para cuidar do seu negócio.

A v0.7.0 reorganiza o Clara em torno de um fluxo financeiro único:

**Arquivos → Contas a Pagar / Contas a Receber → Lançamentos → Conciliação → DRE → Apresentação**

## Principais mudanças

### Arquivos
- Após o login, o Clara abre diretamente em **Arquivos**.
- A pasta é selecionada e os documentos ficam preparados para conferência antes do processamento.
- O usuário confirma o tipo de cada arquivo:
  - Extrato Bancário — PDF ou Excel, sem modelo fixo;
  - Extrato Maquineta Cartão — PDF ou Excel, sem modelo fixo;
  - Fatura Cartão de Crédito — PDF ou Excel, sem modelo fixo;
  - Contas a Pagar — Excel/CSV no modelo Clara;
  - Contas a Receber — Excel/CSV no modelo Clara.
- Alertas e status **Revisar** são clicáveis e exibem diagnóstico, motivo e ações possíveis.

### Contas a Pagar
- A importação foi retirada do módulo e centralizada em **Arquivos**.
- A tela fica focada em **Títulos**, **Fluxo futuro** e **Novo Lançamento** manual.

### Contas a Receber
Novo módulo com:
- títulos e clientes;
- emissão, vencimento, valor e classificação;
- recebido, aberto, parcial e vencido;
- lançamento manual;
- fluxo futuro agrupado por cliente ou classificação;
- modelo Excel próprio para importação via Arquivos.

### Conciliação
A página passa a funcionar como uma **mesa de conferência financeira**:
- descrição original completa;
- data, valor e direção;
- arquivo e tipo de origem;
- parte e documento identificados;
- forma de pagamento;
- bruto, taxa e líquido quando disponíveis;
- metadados preservados do arquivo, como NSU e identificadores;
- possíveis contrapartidas em Contas a Pagar e Contas a Receber antes da decisão.

### Apresentação
Novo item no menu com PDFs gerenciais:
- **Semanal** — semana encerrada + próxima semana, entradas, saídas, compromissos, recebimentos e pontos de atenção;
- **Mensal** — indicadores do mês, resultado, gráfico, principais movimentações, obrigações, recebimentos e leitura executiva.

### Demonstração
`/demonstracao` usa o mesmo aplicativo real, mas conectado a um tenant fictício isolado:
- **Empresa Aurora Demo**;
- 12 meses de movimentações fictícias;
- contas bancárias, arquivos, Contas a Pagar, Contas a Receber e precificação;
- operações funcionais dentro da demo;
- botão **Restaurar dados** para recompor a base fictícia;
- empresas reais nunca são expostas ao usuário de demonstração.

## Banco / migração
A migration `server/drizzle/0004_operational_v070.sql` adiciona o modelo de **Contas a Receber** e índices operacionais.

O bootstrap do banco permanece idempotente e atualiza `schema_meta` para `0.7.0`.

## Validação
Antes da publicação, a branch de release executa automaticamente:

```bash
npm run install:all
npm run typecheck
npm run build
```

Checklist funcional: `docs/teste-aceite-v0.7.0.md`.

## Versão
- App: `0.7.0`
- Schema: `0.7.0`
- `/api/health` deve retornar `version: 0.7.0` e `schema: 0.7.0` após inicialização/migração.

## Deploy
1. Faça backup do banco.
2. Publique a branch `main` conectada ao Railway.
3. Aguarde build e migrations.
4. Valide `/api/health`.
5. Faça recarga forçada do navegador/PWA.
6. Execute `docs/teste-aceite-v0.7.0.md`.
