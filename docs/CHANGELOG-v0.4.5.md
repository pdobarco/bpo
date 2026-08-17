# Clara BPO Financeiro v0.4.5

## Correção crítica de reprocessamento

A v0.4.4 corrigiu o erro PostgreSQL `could not determine data type of parameter $3`, porém os quatro arquivos que haviam falhado ficaram persistidos em `source_files` com o mesmo hash, status de revisão e zero lançamentos. Ao reenviar os PDFs, a rota antiga interpretava esses registros de erro como arquivos já importados e retornava `4 duplicado(s) ignorado(s)`.

### O que mudou

- Um arquivo só é tratado como duplicado quando já foi efetivamente processado.
- Registros anteriores com `record_count = 0` e status de erro/revisão são considerados **reprocessáveis**.
- Ao reenviar um arquivo que falhou:
  1. lançamentos parciais ligados à tentativa anterior são removidos;
  2. o stub de erro anterior em `source_files` é removido;
  3. o mesmo arquivo é processado novamente normalmente.
- Em caso de nova falha no meio do processamento, quaisquer lançamentos parciais daquele arquivo são apagados antes de registrar o status `REVIEW`.
- O resumo do upload informa quantas falhas anteriores foram reprocessadas.

## Comportamento esperado no teste atual

Reenviando os quatro PDFs que constavam com o erro antigo, o popup não deve mais informar `4 duplicado(s) ignorado(s)`. Ele deve informar `4 falha(s) anterior(es) reprocessada(s)` e então processar os arquivos conforme os parsers disponíveis.

## Versão

- App: `0.4.5`
- `/api/health`: `version: 0.4.5`
- Rodapé: `Clara BPO · v0.4.5`
