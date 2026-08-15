# Checklist de aceite — Claria v0.3.0

## 1. Deploy / banco

- Fazer deploy mantendo o PostgreSQL existente.
- Abrir `/api/health`.
- Confirmar:
  - `ok=true`
  - `version=0.3.0`
  - `database=ok`
  - `schema=0.3.0`
- Não criar outro PostgreSQL.

## 2. Dados existentes

- Abrir um mês que já possuía DRE antes da atualização.
- Confirmar que os valores continuam presentes.
- Abrir **Lançamentos → Todos os lançamentos**.
- Confirmar que a lista aparece sem precisar digitar a URL da API manualmente.

## 3. Competência

- Conferir lançamentos antigos que não tinham competência.
- A competência deve ser a data do evento.
- Nenhuma linha deve mostrar `Invalid Date`.

## 4. Edição de lançamento

- Editar um lançamento já confirmado.
- Alterar competência e Plano de Contas.
- Salvar apenas o lançamento.
- Confirmar atualização da linha e da DRE.
- Repetir com “atualizar regra futura” e confirmar que a memória da classificação é atualizada.
- Conferir o registro em **Configurações → Auditoria**.

## 5. Ordenação

Em **Todos os lançamentos**, clicar duas vezes em cada cabeçalho abaixo e confirmar crescente/decrescente:
- Competência
- Descrição
- Forma
- Plano de contas
- Status
- Valor

## 6. Erro x lista vazia

- Se a consulta falhar, a tela deve exibir mensagem de erro e opção de tentar novamente.
- A tela não deve transformar erro de API em “0 lançamentos”.

## 7. Importação

- Importar um arquivo pequeno já conhecido.
- Confirmar que o arquivo é processado e aparece em Arquivos.
- Confirmar que os lançamentos aparecem/recarregam.
- Importar o mesmo arquivo novamente e confirmar a proteção por hash/duplicidade.

## 8. DRE

- Confirmar que os valores aparecem mais próximos dos títulos.
- Alterar o Plano de Contas de um lançamento e conferir o reflexo imediato na linha correta da DRE.
- Se o mês estiver fechado, confirmar a proteção do snapshot/fechamento.

## 9. PWA

- Abrir desktop e mobile.
- Confirmar menu, ícones e navegação.
- Confirmar que a atualização do service worker não impede carregar a versão nova após recarregar a página.

## 10. Se o Railway falhar

Copiar o log completo desde o início do `npm run install:all` ou `npm run build`, sem apagar o PostgreSQL. A migração foi desenhada para ser corrigível sem recriar a base.
