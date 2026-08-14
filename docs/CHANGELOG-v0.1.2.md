# Changelog — Claria v0.1.2

## Plano de Contas
- tabela `chart_accounts` no PostgreSQL;
- plano padrão criado automaticamente para empresas existentes e novas;
- cadastro, edição e desativação de contas;
- hierarquia por grupos;
- mapeamento para seções da DRE;
- categorias do fluxo de classificação agora vêm do Plano de Contas;
- DRE dinâmica por conta e seção.

## Fornecedores / aprendizado
- novo parser `parsers/suppliers.js`;
- detecção automática de Excel/CSV de fornecedores/classificações;
- importação ensina regras específicas da empresa;
- fornecedores empresariais podem alimentar regras globais;
- confirmações por empresas diferentes aumentam a confiança global;
- novas classificações do Excel podem criar automaticamente uma conta no Plano de Contas.

## Transferências próprias
- cadastro de contas bancárias/financeiras da empresa;
- reconhecimento por nome, documento, banco, agência, conta e aliases;
- prioridade de transferência própria antes da biblioteca global;
- transferência própria fica fora da DRE.

## IA
- Luna usa somente contas ativas do Plano de Contas como categorias permitidas;
- continua trabalhando em lote e apenas com saídas desconhecidas.

## Compatibilidade
- migração segura adiciona `account_id` às transações e regras antigas;
- categorias antigas são vinculadas às contas equivalentes do plano padrão quando possível;
- correção da `Transferência Recebida ... NU PAGAMENTOS` permanece ativa.
