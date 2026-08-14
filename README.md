# Claria v0.2.0 — Fechamento Confiável

PWA de gestão financeira/BPO multiempresa em evolução. A v0.2.0 reorganiza o núcleo do Claria em uma cadeia simples de confiança:

**1. Arquivos → 2. Lançamentos → 3. Conciliação → 4. Gestão → Fechar período**

O objetivo desta versão é que o usuário consiga responder com segurança:

- todos os arquivos do mês foram recebidos?
- o Claria leu e contabilizou tudo?
- o que ainda precisa de classificação?
- venda, recebimento e pagamento estão sendo contados apenas uma vez?
- a DRE é por competência e o caixa por pagamento?
- o mês está pronto para ser fechado?

## Principais novidades

### Arquivos e conferência
- status claros: Importado / Revisar / Erro / Não reconhecido;
- fontes esperadas por empresa e por mês;
- conferência matemática de PDFs quando o documento fornece totais de controle;
- fallback com GPT-5.6 Luna quando um PDF não gera lançamentos pelo parser convencional;
- base Excel de fornecedores continua ensinando o PostgreSQL.

### Lançamentos
- `Ensinar o Claria`: classifica uma vez por nome + direção;
- `Todos os lançamentos`: auditoria detalhada por período;
- competência, vencimento, pagamento, forma de pagamento, fornecedor/cliente, status e arquivo de origem;
- conta de origem preservada e rastreável.

### Competência x caixa
- `competence_at` define quando receita/despesa aparece na DRE;
- `paid_at` / movimentação bancária define quando entra ou sai caixa;
- compra em cartão entra na DRE pela compra; pagamento da fatura é somente liquidação de caixa.

### Antiduplicidade econômica
- relatório detalhado de vendas PagBank vira o fato de venda;
- recebimentos equivalentes no extrato PagBank passam a ser caixa, sem duplicar receita na DRE;
- taxas de cartão são registradas separadamente na DRE;
- pagamento de fatura Nubank fica fora da DRE.

### Gestão
- período global por mês;
- DRE mensal;
- DRE comparativa mês a mês;
- valores visíveis nos gráficos;
- indicadores clicáveis para auditar os lançamentos que formam o número;
- recebimentos/pagamentos por forma.

### Fechamento
- semáforo: Arquivos / Lançamentos / Conciliação / Gestão;
- indicador de qualidade dos dados;
- fechamento mensal;
- DRE do período fechado salva em snapshot;
- classificações futuras não reescrevem lançamentos de meses fechados;
- histórico de auditoria.

## Banco existente

A v0.2.0 foi desenhada para **migrar o PostgreSQL existente**. Não apague o banco da v0.1.x.

Na inicialização, o backend cria as novas tabelas e colunas com `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

O endpoint de diagnóstico é:

```text
/api/health
```

Resposta esperada após o deploy:

```json
{
  "ok": true,
  "version": "0.2.0",
  "database": "ok",
  "schema": "0.2.0"
}
```

## Railway

1. Suba os arquivos deste diretório no GitHub.
2. Mantenha o PostgreSQL atual e a mesma `DATABASE_URL`.
3. Conecte o serviço ao repositório.
4. Configure as variáveis descritas em `docs/variaveis-railway.md`.
5. Faça o deploy.
6. Abra `/api/health` antes de testar a interface.

O `railway.json` usa:

```text
Build: npm run install:all && npm run build
Start: npm start
Healthcheck: /api/health
```

## IA / Luna

O Claria usa `gpt-5.6-luna` somente quando ajuda a economizar trabalho humano:

1. sugestão em lote para favorecidos de saída desconhecidos;
2. fallback de adaptação de PDF quando o parser convencional não encontra lançamentos.

Classificações conhecidas, biblioteca compartilhada, regras da empresa, CNPJ e parsers continuam tendo prioridade sobre IA.

## Observação de segurança

Os arquivos originais não são gravados pelo backend nesta versão. O banco guarda os lançamentos normalizados, metadados de origem, hash e resultados de conferência.
