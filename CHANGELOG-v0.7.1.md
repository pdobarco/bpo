# Clara BPO Financeiro v0.7.1

## Arquivos — nova orquestração

A tela **Arquivos** passa a trabalhar em duas etapas:

1. Selecionar uma pasta ou arquivos locais (PDF, Excel ou CSV).
2. Marcar explicitamente qual papel cada arquivo exerce antes do processamento.

Tipos disponíveis:

- Extrato Bancário
- Extrato Maquineta Cartão
- Fatura Cartão de Crédito
- Contas a Pagar
- Contas a Receber

### Regras

- Um mesmo arquivo só pode exercer um papel por vez, evitando dupla contabilização.
- É possível selecionar vários arquivos para o mesmo tipo de dado.
- A Clara pode sugerir a classificação pelo nome do arquivo, mas a sugestão é opcional e editável.
- A coluna **Fonte efetivamente usada** mostra os arquivos já processados para cada origem.
- Arquivos ainda não marcados permanecem disponíveis e não são processados.
- Contas a Pagar e Contas a Receber continuam usando os modelos estruturados da Clara.
- Extratos e faturas continuam aceitando PDF, Excel ou CSV.

## Interface

- Bloco superior para arquivos locais / OneDrive.
- Bloco lateral com download dos modelos de Contas a Pagar e Contas a Receber.
- Tabela de orquestração no padrão visual utilizado no AprovaAI, adaptada ao contexto financeiro da Clara.
- Histórico de arquivos processados preservado abaixo da orquestração.

## Versão

- Aplicação: `0.7.1`
- Alteração sem mudança de schema de banco; schema permanece compatível com `0.7.0`.
