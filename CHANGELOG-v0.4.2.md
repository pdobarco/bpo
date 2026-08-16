# Changelog — Clara BPO Financeiro v0.4.2

## Importação

- importação desacoplada completamente do seletor de mês/competência da interface;
- arquivos passam a pertencer à empresa, não a um mês;
- competência de cada lançamento deriva exclusivamente da data encontrada no documento;
- Central de Arquivos deixa de ser filtrada pelo período selecionado;
- layouts determinísticos restaurados/fortalecidos para Nubank extrato, Nubank fatura, PagBank/PagSeguro extrato e PagBank relatório de vendas;
- extração de PDF passa a preservar coordenadas/linhas para evitar desalinhamento de colunas em PDFs bancários;
- todo upload é persistido e aparece na Central com status processado, revisão ou erro;
- arquivo reconhecido não vai para revisão apenas porque há classificações financeiras ainda desconhecidas;
- duplicidade deve ser scoped por empresa (`company_id + hash`);
- queries de Arquivos, Lançamentos, DRE, Dashboard e Conciliação são invalidadas após importação.

## Banco

- nenhuma recriação de banco;
- manter PostgreSQL atual e a mesma `DATABASE_URL`;
- sem migration obrigatória para esta correção.
