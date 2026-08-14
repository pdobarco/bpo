# Claria v0.2.1 — Correções de Lançamentos e DRE

PWA financeira/BPO multiempresa. Esta versão é uma correção segura sobre a v0.2.0 e **reutiliza o mesmo PostgreSQL**.

## O que mudou

- `Todos os lançamentos` recarrega ao abrir a aba, trocar período, filtros ou ordenação.
- Falha de API não aparece mais como `0 lançamentos`; a tela mostra erro e `Tentar novamente`.
- Proteção de consistência: se a DRE possui valores e a lista retorna zero, o Claria avisa.
- Competência: quando não existe `competence_at`, a data do evento (`occurred_at`) é usada automaticamente.
- Datas ISO e datas simples são exibidas sem `Invalid Date`.
- Cada lançamento pode ser editado depois de confirmado:
  - Data de competência;
  - Plano de Contas;
  - opcionalmente salvar o novo Plano de Contas como regra para próximos lançamentos do mesmo nome.
- Alterações de lançamento ficam registradas na Auditoria.
- DRE é recalculada após mudança de competência ou Plano de Contas.
- Cabeçalhos da tabela de lançamentos são clicáveis para ordenar crescente/decrescente.
- Rodapé mostra quantidade de lançamentos, entradas e saídas do filtro/período atual.
- Valores da DRE ficam mais próximos dos títulos para melhorar a leitura em telas largas.
- Rótulos conhecidos de forma de pagamento são normalizados sem inventar PIX quando o arquivo só informa transferência.

## Atualização no Railway

1. Substitua os arquivos do repositório pelos desta versão.
2. Faça commit/push no GitHub.
3. Aguarde o redeploy automático do Railway.
4. **Não apague o PostgreSQL e não altere `DATABASE_URL`.**

A inicialização atualiza o schema para `0.2.1` e preenche competências legadas vazias com a data do evento.

## Health check

Após o deploy, abra:

```text
https://SEU-APP.up.railway.app/api/health
```

Resposta esperada:

```json
{
  "ok": true,
  "version": "0.2.1",
  "database": "ok",
  "schema": "0.2.1"
}
```

## Variáveis

Consulte `docs/variaveis-railway.md`. A v0.2.1 não exige nenhuma nova variável em relação à v0.2.0.

## Teste rápido após o deploy

Consulte `docs/teste-aceite-v0.2.1.md`.
