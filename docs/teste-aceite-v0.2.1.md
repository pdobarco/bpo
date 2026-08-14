# Checklist de aceite — Claria v0.2.1

## 1. Health

- Abrir `/api/health`.
- Confirmar `version=0.2.1`.
- Confirmar `database=ok`.
- Confirmar `schema=0.2.1`.

## 2. Todos os lançamentos

- Entrar em Lançamentos > Todos os lançamentos sem acessar a API manualmente.
- Confirmar que os registros aparecem.
- Trocar o mês e voltar ao mês anterior; a lista deve atualizar.
- Aplicar busca/filtro e confirmar atualização.
- Em caso de erro da API, a tela deve mostrar erro e `Tentar novamente`, nunca `0 lançamentos` silenciosamente.

## 3. Competência

- Abrir um lançamento legado.
- Confirmar que não aparece `Invalid Date`.
- Se não existir competência original, confirmar que a Data do evento é exibida como competência efetiva.

## 4. Editar lançamento

- Abrir uma linha e clicar `Editar lançamento`.
- Alterar competência e salvar.
- Confirmar que o lançamento muda de período quando aplicável.
- Alterar Plano de Contas e salvar.
- Confirmar que a DRE é recalculada.
- Marcar a opção de usar o Plano de Contas para próximos lançamentos e confirmar que a regra foi salva.
- Conferir a alteração em Configurações > Auditoria.

## 5. Ordenação

- Clicar em cada cabeçalho da tabela.
- Confirmar crescente no primeiro estado e decrescente no segundo.
- Confirmar indicador `↑` ou `↓` no cabeçalho ativo.

## 6. Resumo

- Conferir no rodapé: quantidade de lançamentos, Entradas e Saídas.

## 7. DRE

- Abrir Gestão > DRE do mês.
- Confirmar que os valores estão visualmente mais próximos dos títulos.
