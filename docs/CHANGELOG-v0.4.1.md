# Changelog — Clara BPO Financeiro v0.4.1

## Objetivo

Corrigir a diferença visual entre a v0.4.0 e o mockup escolhido como referência oficial.

## Login / página inicial

- novo container central branco, arredondado e com sombra suave;
- painel institucional claro à esquerda;
- logo oficial aplicada sem alteração de símbolo, tipografia, proporções ou cores;
- personagem baseada no mockup aprovado;
- headline e benefícios reposicionados conforme a referência;
- card de login/cadastro à direita com dimensões, espaçamento e hierarquia mais próximos do mockup;
- links de criação de conta e demonstração preservados.

## Área logada

- menu lateral azul mais compacto e refinado;
- cards executivos menores e com mais respiro;
- DRE em bloco principal;
- gráfico mensal Receita x Despesas;
- bloco de conciliação abaixo dos indicadores;
- tipografia, bordas, sombras e espaçamentos ajustados para a mesma linguagem do mockup.

## Demonstração

- `/demonstracao` usa a mesma linguagem visual do app real;
- KPIs, DRE, gráfico e movimentações permanecem 100% fictícios;
- nenhuma informação da demonstração é gravada no banco.

## Banco / infraestrutura

- nenhuma migration nova;
- `schema_version` permanece `0.4.0`;
- versão da aplicação: `0.4.1`;
- manter PostgreSQL e `DATABASE_URL` atuais.
