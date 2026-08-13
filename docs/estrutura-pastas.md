# Estrutura de dados por empresa

A Claria pode receber uma pasta inteira. A organização abaixo é recomendada, mas não obrigatória.

```text
Claria Dados/
└── Empresa/
    ├── 01 Caixa/
    ├── 02 Bancos/
    ├── 03 Cartoes e Maquininhas/
    ├── 04 Vendas/
    ├── 05 Compras/
    ├── 06 Estoque/
    └── 99 Outros/
```

## Regra de ouro

O arquivo original é fonte de auditoria, mas a aplicação trabalha com um modelo interno normalizado. Nesta v0.1 o servidor não salva o binário original por padrão; guarda nome, hash, tipo detectado, quantidade de registros e os lançamentos extraídos.

## Campos internos principais

- `occurred_at`: data/hora do movimento
- `description`: descrição original
- `normalized_party`: fornecedor/cliente reconhecido
- `direction`: ENTRADA / SAIDA
- `amount`: valor do movimento
- `gross_amount`: venda bruta quando houver
- `fee_amount`: taxa da adquirente
- `net_amount`: valor líquido
- `category`: plano de conta/classificação
- `classification_confidence`: confiança
- `source_file_id`: rastreabilidade da origem
- `raw`: dados auxiliares do arquivo

## Aprendizado compartilhado

A tabela `classification_rules` aceita escopo `GLOBAL` e `COMPANY`. Uma regra global como `CELESC → Energia elétrica` beneficia todas as empresas, sem compartilhar valores, saldos ou transações entre elas. Regras de empresa têm prioridade quando houver necessidade de classificação diferente.
