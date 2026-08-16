export type ImportSourceType =
  | 'NUBANK_STATEMENT'
  | 'NUBANK_CREDIT_CARD'
  | 'PAGBANK_STATEMENT'
  | 'PAGBANK_SALES'
  | 'UNKNOWN';

export type TransactionDirection = 'IN' | 'OUT';

export interface ParsedTransaction {
  eventDate: string; // YYYY-MM-DD
  competencyDate: string; // always derived from eventDate; never from UI period filter
  description: string;
  amount: number; // signed: IN positive, OUT negative
  direction: TransactionDirection;
  sourceType: ImportSourceType;
  paymentMethod?: string | null;
  counterparty?: string | null;
  externalId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ParsedFile {
  sourceType: ImportSourceType;
  recognized: boolean;
  transactions: ParsedTransaction[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

const PT_MONTHS: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
  JANEIRO: 1, FEVEREIRO: 2, 'MARÇO': 3, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};

const brMoney = (raw: string): number => {
  const clean = raw
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/[−–—]/g, '-')
    .trim();
  const negative = clean.startsWith('-');
  const digits = clean.replace(/^[-+]/, '').replace(/\./g, '').replace(',', '.');
  const value = Number(digits);
  if (!Number.isFinite(value)) throw new Error(`Valor monetário inválido: ${raw}`);
  return negative ? -value : value;
};

const isoDate = (day: number, month: number, year: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const compact = (value: string): string => value.replace(/\s+/g, ' ').trim();

const sourceFromText = (text: string): ImportSourceType => {
  const t = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

  if (
    t.includes('RELATORIO DE VENDAS') &&
    t.includes('DATA DA TRANSACAO') &&
    t.includes('VALOR BRUTO') &&
    t.includes('VALOR LIQUIDO') &&
    t.includes('PAGBANK')
  ) return 'PAGBANK_SALES';

  if (
    t.includes('EXTRATO DA CONTA') &&
    (t.includes('PAGSEGURO INTERNET S/A') || t.includes('PAGBANK')) &&
    t.includes('DATA') && t.includes('DESCRICAO') && t.includes('VALOR')
  ) return 'PAGBANK_STATEMENT';

  if (
    t.includes('FATURA') &&
    t.includes('TRANSACOES') &&
    (t.includes('NU PAGAMENTOS') || t.includes('NUBANK') || t.includes('NU FINANCEIRA'))
  ) return 'NUBANK_CREDIT_CARD';

  if (
    t.includes('MOVIMENTACOES') &&
    t.includes('TOTAL DE ENTRADAS') &&
    t.includes('TOTAL DE SAIDAS') &&
    (t.includes('NU PAGAMENTOS') || t.includes('NUBANK') || t.includes('NU FINANCEIRA'))
  ) return 'NUBANK_STATEMENT';

  return 'UNKNOWN';
};

function paymentMethodFromDescription(description: string): string | null {
  const d = description.toUpperCase();
  if (d.includes('PIX')) return 'PIX';
  if (d.includes('BOLETO')) return 'BOLETO';
  if (d.includes('CREDITO') || d.includes('CRÉDITO')) return 'CARTAO_CREDITO';
  if (d.includes('DEBITO') || d.includes('DÉBITO')) return 'CARTAO_DEBITO';
  if (d.includes('FATURA')) return 'FATURA_CARTAO';
  if (d.includes('CDB') || d.includes('RENDA FIXA')) return 'INVESTIMENTO';
  return null;
}

function parsePagBankStatement(layoutText: string): ParsedFile {
  const transactions: ParsedTransaction[] = [];
  const warnings: string[] = [];
  const rowRe = /^\s*(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+([−–—-]?\s*R\$\s*[\d.]+,\d{2})\s*$/gim;

  for (const m of layoutText.matchAll(rowRe)) {
    const [, dd, mm, yyyy, rawDescription, rawValue] = m;
    const description = compact(rawDescription);
    if (/^Saldo do dia$/i.test(description)) continue;

    const amount = brMoney(rawValue);
    const eventDate = `${yyyy}-${mm}-${dd}`;
    transactions.push({
      eventDate,
      competencyDate: eventDate,
      description,
      amount,
      direction: amount < 0 ? 'OUT' : 'IN',
      sourceType: 'PAGBANK_STATEMENT',
      paymentMethod: paymentMethodFromDescription(description),
      metadata: { originalValue: rawValue },
    });
  }

  if (!transactions.length) warnings.push('Layout PagBank reconhecido, mas nenhuma movimentação foi extraída.');

  return {
    sourceType: 'PAGBANK_STATEMENT',
    recognized: true,
    transactions,
    warnings,
    metadata: { extractedCount: transactions.length },
  };
}

function parseNubankStatement(layoutText: string): ParsedFile {
  const transactions: ParsedTransaction[] = [];
  const warnings: string[] = [];
  const lines = layoutText.split(/\r?\n/);
  let currentDate: string | null = null;

  const headingDate = /^\s*(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})\b/i;
  const transactionLine = /^\s*(Transferência recebida pelo Pix|Transferência Recebida|Transferência enviada pelo Pix|Pagamento de boleto efetuado|Pagamento de fatura)\s+(.+?)\s+([+\-−–—]?\s*[\d.]+,\d{2})\s*$/i;

  for (const line of lines) {
    const dateMatch = line.match(headingDate);
    if (dateMatch) {
      currentDate = isoDate(Number(dateMatch[1]), PT_MONTHS[dateMatch[2].toUpperCase()], Number(dateMatch[3]));
    }

    const tx = line.match(transactionLine);
    if (!tx || !currentDate) continue;

    const action = compact(tx[1]);
    const details = compact(tx[2]);
    let amount = Math.abs(brMoney(tx[3]));
    const incoming = /^Transferência (recebida pelo Pix|Recebida)$/i.test(action);
    if (!incoming) amount = -amount;

    const description = compact(`${action} ${details}`);
    transactions.push({
      eventDate: currentDate,
      competencyDate: currentDate,
      description,
      amount,
      direction: amount < 0 ? 'OUT' : 'IN',
      sourceType: 'NUBANK_STATEMENT',
      paymentMethod: paymentMethodFromDescription(action),
      counterparty: details || null,
    });
  }

  // Strong reconciliation when totals are printed in the statement.
  const entriesMatch = layoutText.match(/Total de entradas\s+\+?\s*([\d.]+,\d{2})/i);
  const exitsMatch = layoutText.match(/Total de saídas\s+[-−–—]?\s*([\d.]+,\d{2})/i);
  const parsedIn = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const parsedOut = Math.abs(transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));

  if (entriesMatch) {
    const expected = Math.abs(brMoney(entriesMatch[1]));
    if (Math.abs(expected - parsedIn) > 0.02) warnings.push(`Entradas divergentes: extrato=${expected.toFixed(2)}, extraído=${parsedIn.toFixed(2)}.`);
  }
  if (exitsMatch) {
    const expected = Math.abs(brMoney(exitsMatch[1]));
    if (Math.abs(expected - parsedOut) > 0.02) warnings.push(`Saídas divergentes: extrato=${expected.toFixed(2)}, extraído=${parsedOut.toFixed(2)}.`);
  }
  if (!transactions.length) warnings.push('Layout Nubank extrato reconhecido, mas nenhuma movimentação individual foi extraída.');

  return {
    sourceType: 'NUBANK_STATEMENT',
    recognized: true,
    transactions,
    warnings,
    metadata: { extractedCount: transactions.length, parsedIn, parsedOut },
  };
}

function parseNubankCreditCard(layoutText: string): ParsedFile {
  const transactions: ParsedTransaction[] = [];
  const warnings: string[] = [];

  const invoice = layoutText.match(/FATURA\s+\d{1,2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i);
  const invoiceMonth = invoice ? PT_MONTHS[invoice[1].toUpperCase()] : 12;
  const invoiceYear = invoice ? Number(invoice[2]) : new Date().getUTCFullYear();

  // The card row may contain arbitrary spaces between date, masked card, description and value.
  const rowRe = /^\s*(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+•{2,}\s*\d+\s+(.+?)\s+R\$\s*([\d.]+,\d{2})\s*$/gim;

  for (const m of layoutText.matchAll(rowRe)) {
    const day = Number(m[1]);
    const month = PT_MONTHS[m[2].toUpperCase()];
    // A December purchase shown in a January invoice belongs to the previous year.
    const year = month > invoiceMonth ? invoiceYear - 1 : invoiceYear;
    const eventDate = isoDate(day, month, year);
    const description = compact(m[3]);
    const amount = -Math.abs(brMoney(m[4]));

    transactions.push({
      eventDate,
      competencyDate: eventDate,
      description,
      amount,
      direction: 'OUT',
      sourceType: 'NUBANK_CREDIT_CARD',
      paymentMethod: 'CARTAO_CREDITO',
      metadata: { statementMonth: invoiceMonth, statementYear: invoiceYear },
    });
  }

  const purchasesTotal = layoutText.match(/Total de compras de todos os cartões[^\n]*R\$\s*([\d.]+,\d{2})/i)
    ?? layoutText.match(/^\s*[^\n]*R\$\s*([\d.]+,\d{2})\s*$/m);
  const parsedTotal = Math.abs(transactions.reduce((s, t) => s + t.amount, 0));
  if (purchasesTotal) {
    const expected = Math.abs(brMoney(purchasesTotal[1]));
    if (Math.abs(expected - parsedTotal) > 0.02) warnings.push(`Compras divergentes: fatura=${expected.toFixed(2)}, extraído=${parsedTotal.toFixed(2)}.`);
  }

  // Payment of the invoice is deliberately NOT imported here as a new expense.
  // It belongs to cash/bank reconciliation, avoiding double counting in the DRE.
  if (!transactions.length) warnings.push('Fatura Nubank reconhecida, mas nenhuma compra foi extraída.');

  return {
    sourceType: 'NUBANK_CREDIT_CARD',
    recognized: true,
    transactions,
    warnings,
    metadata: { extractedCount: transactions.length, parsedTotal, invoiceMonth, invoiceYear },
  };
}

function parsePagBankSales(layoutText: string): ParsedFile {
  const transactions: ParsedTransaction[] = [];
  const warnings: string[] = [];

  // layoutText keeps each visual table row together.
  const rowRe = /^\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})\s+Pagbank\s+.*?([A-F0-9-]{36})\s+(\d{12}|-)\s+(.+?)\s+Aprovada\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})\s*$/gim;

  for (const m of layoutText.matchAll(rowRe)) {
    const [, dd, mm, yyyy, hh, minute, transactionCode, nsu, type, grossRaw, feeRaw, netRaw] = m;
    const eventDate = `${yyyy}-${mm}-${dd}`;
    const net = Math.abs(brMoney(netRaw));
    const description = compact(`Venda PagBank - ${type}`);

    transactions.push({
      eventDate,
      competencyDate: eventDate,
      description,
      amount: net,
      direction: 'IN',
      sourceType: 'PAGBANK_SALES',
      paymentMethod: paymentMethodFromDescription(type),
      externalId: transactionCode,
      metadata: {
        time: `${hh}:${minute}`,
        nsu,
        grossAmount: Math.abs(brMoney(grossRaw)),
        feeAmount: Math.abs(brMoney(feeRaw)),
        netAmount: net,
        transactionType: compact(type),
      },
    });
  }

  if (!transactions.length) warnings.push('Relatório de vendas PagBank reconhecido, mas nenhuma venda foi extraída.');

  return {
    sourceType: 'PAGBANK_SALES',
    recognized: true,
    transactions,
    warnings,
    metadata: { extractedCount: transactions.length },
  };
}

export function parseKnownFinancialPdf(layoutText: string): ParsedFile {
  const sourceType = sourceFromText(layoutText);
  switch (sourceType) {
    case 'NUBANK_STATEMENT': return parseNubankStatement(layoutText);
    case 'NUBANK_CREDIT_CARD': return parseNubankCreditCard(layoutText);
    case 'PAGBANK_STATEMENT': return parsePagBankStatement(layoutText);
    case 'PAGBANK_SALES': return parsePagBankSales(layoutText);
    default:
      return {
        sourceType: 'UNKNOWN',
        recognized: false,
        transactions: [],
        warnings: ['Layout ainda não reconhecido automaticamente.'],
        metadata: {},
      };
  }
}

export const __test = { brMoney, sourceFromText };
