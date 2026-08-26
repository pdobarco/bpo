# CHANGELOG — Clara v0.6.0

## Arquivos
- Sincronização por pasta preservada e isolada do novo escopo de Contas a Pagar.
- Arquivo em revisão agora possui modal explicativo e ações de correção/reprocessamento.
- Conteúdo do arquivo armazenado para permitir reprocessamento dos novos uploads.

## Lançamentos
- Abas Receitas e Despesas.
- Data visível na grade.
- Seleção múltipla e confirmação em massa.
- Título personalizado sem apagar a descrição original.
- Regra opcional para reutilizar o título em lançamentos semelhantes.

## Conciliação
- Pontes esperadas/faltantes detalhadas.
- Ações manuais de vínculo, transferência, ignorar e reprocessar.

## Contas a Pagar
- Novo módulo.
- Importação de fatura Nubank PDF.
- Importação de XLSX/XLS/CSV do sistema do cliente.
- Modelo Excel disponível.
- Lançamento manual.
- Classificação e memória por fornecedor.
- Fluxo futuro por fornecedor ou classificação.

## DRE / Cadastros / Precificação
- Mantidas e consolidadas as melhorias da v0.5.0: DRE comparativa expansível, aviso de contas próprias e módulo de Precificação em lote/manual.

## Técnica
- Migration `0003_operational_v060.sql`.
- `schema_version = 0.6.0`.
- `APP_VERSION = 0.6.0`.
- `source_files.import_scope` separa a base geral de arquivos importados pelo Contas a Pagar.
