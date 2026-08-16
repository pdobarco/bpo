# Clara BPO Financeiro v0.4.2 — correção de importação

## Regra funcional corrigida

**Importação de arquivos não possui competência/mês.**

O seletor de mês da interface serve somente para consultar dados financeiros do período. Ele não pode:

- ser enviado no upload;
- rejeitar um arquivo por ser de outro mês;
- definir a competência do arquivo;
- filtrar a Central de Arquivos;
- colocar um arquivo em revisão por divergência de período.

Cada lançamento importado recebe sua própria `eventDate` e `competencyDate`, ambas derivadas da data existente no documento.

## Evidência usada para a correção

Os quatro layouts fornecidos são formatos que o Clara já deveria reconhecer:

1. Nubank — extrato de conta;
2. Nubank — fatura de cartão;
3. PagBank/PagSeguro — extrato de conta;
4. PagBank — relatório de vendas.

O projeto original já documentava detecção desses quatro layouts. A correção reintroduz uma rota determinística antes do fallback de revisão/IA.

## Como integrar no backend atual

### 1. PDF com layout preservado

Adicionar ao `server/package.json`:

```json
"pdfjs-dist": "^5.4.149"
```

No fluxo atual de PDF, substituir o texto simples usado no detector por:

```ts
import { extractPdfLayoutText } from './import/pdf-layout.js';

const layoutText = await extractPdfLayoutText(new Uint8Array(fileBuffer));
```

Isso é importante porque alguns PDFs bancários movem a coluna de valores para o final da página quando extraídos como texto simples.

### 2. Processar layout conhecido antes do fallback

```ts
import { parseKnownFinancialPdf } from './import/parsers.js';

const parsed = parseKnownFinancialPdf(layoutText);

if (parsed.recognized && parsed.transactions.length > 0) {
  // persistir normalmente
} else {
  // somente aqui usar REVIEW_REQUIRED / fallback de adaptação
}
```

**Classificação desconhecida de fornecedor não transforma o arquivo inteiro em `REVIEW_REQUIRED`.**
O lançamento pode entrar como `A classificar`; revisão de classificação é posterior à extração.

### 3. Endpoint de upload

Remover do body/query/form-data do upload qualquer campo semelhante a:

- `period`;
- `month`;
- `competency`;
- `selectedPeriod`;
- `referenceMonth`.

O endpoint precisa de empresa + arquivo. A empresa continua vindo do `x-company-id` autorizado.

### 4. Central de Arquivos

A listagem de arquivos deve ser por empresa, sem período:

```text
GET /api/files
x-company-id: <empresa>
```

Não usar `?period=...` nessa tela. O arquivo deve aparecer mesmo que contenha lançamentos de maio, julho e agosto ao mesmo tempo.

Todos os uploads devem ser persistidos com um status:

- `PROCESSED`;
- `REVIEW_REQUIRED`;
- `FAILED`.

Nunca retornar “4 precisam de revisão” e depois mostrar “0 arquivos encontrados”.

### 5. Duplicidade

A duplicidade deve ser verificada dentro da empresa:

```text
company_id + sha256
```

O mesmo PDF em empresas diferentes não deve ser tratado como duplicado global.

### 6. Frontend

Usar `client/src/features/files/import-policy.ts`:

- `filesQueryKey(companyId)` não contém mês;
- `buildFilesFormData(files)` não envia competência;
- após importação, invalidar Arquivos + Lançamentos + DRE + Dashboard + Conciliação.

## Regra contábil preservada

- `Saldo do dia`, `Total de entradas` e `Total de saídas` não são lançamentos.
- Fatura Nubank: compras entram como despesas; o pagamento da fatura não é importado novamente pela fatura para evitar dupla despesa. A liquidação aparece pelo extrato bancário.
- Aplicação/resgate de CDB continuam como movimentações financeiras e podem ser classificados fora da DRE conforme o Plano de Contas.

## Banco / Railway

Esta correção não exige recriar PostgreSQL nem trocar `DATABASE_URL`.

Se as colunas de status/revisão já existem, não é necessária migration. Caso o schema atual não tenha `review_reason`/`parser_warnings`, grave essas informações no campo de observação existente; não faça migration apenas para esta correção.
