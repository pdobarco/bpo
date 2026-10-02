# Clara BPO — v0.8.8

## Segurança
- `xlsx` (SheetJS) atualizado de 0.18.5 para **0.20.3**, distribuído pelo CDN oficial (`cdn.sheetjs.com`), já que o
  pacote do npm não recebe mais correções. Corrige prototype pollution (CVE-2023-30533) e ReDoS (CVE-2024-22363) na
  leitura de planilhas enviadas pelos usuários. `npm audit` do servidor: 0 vulnerabilidades.
- Novo teste garante que datas de planilhas `.xlsx`, `.xls` e `.csv` continuam sendo lidas no dia correto.
