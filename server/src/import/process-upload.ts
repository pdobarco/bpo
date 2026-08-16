import { parseKnownFinancialPdf, type ParsedFile, type ParsedTransaction } from './parsers.js';

export type FileProcessingStatus = 'PROCESSED' | 'REVIEW_REQUIRED' | 'FAILED';

export interface ImportFileInput {
  companyId: string;
  originalName: string;
  sha256: string;
  mimeType: string;
  layoutText: string;
  // IMPORTANT: there is intentionally no month/period/competency field here.
}

export interface ImportPersistenceAdapter {
  findDuplicate(companyId: string, sha256: string): Promise<{ id: string } | null>;
  createSourceFile(input: {
    companyId: string;
    originalName: string;
    sha256: string;
    mimeType: string;
    sourceType: string;
    status: FileProcessingStatus;
    reviewReason?: string | null;
    parserWarnings?: string[];
  }): Promise<{ id: string }>;
  insertTransactions(sourceFileId: string, companyId: string, transactions: ParsedTransaction[]): Promise<number>;
  updateSourceFile(input: {
    id: string;
    status: FileProcessingStatus;
    sourceType: string;
    transactionCount: number;
    reviewReason?: string | null;
    parserWarnings?: string[];
  }): Promise<void>;
}

export interface ImportResult {
  fileName: string;
  sourceFileId?: string;
  status: 'PROCESSED' | 'REVIEW_REQUIRED' | 'DUPLICATE' | 'FAILED';
  sourceType?: string;
  transactionsInserted: number;
  reason?: string;
  warnings?: string[];
}

/**
 * File import is intentionally independent from the month selected in the UI.
 * Each transaction receives competencyDate from its own eventDate.
 */
export async function processImportedFile(
  input: ImportFileInput,
  db: ImportPersistenceAdapter,
): Promise<ImportResult> {
  try {
    const duplicate = await db.findDuplicate(input.companyId, input.sha256);
    if (duplicate) {
      return {
        fileName: input.originalName,
        sourceFileId: duplicate.id,
        status: 'DUPLICATE',
        transactionsInserted: 0,
        reason: 'Arquivo já importado para esta mesma empresa.',
      };
    }

    const parsed: ParsedFile = parseKnownFinancialPdf(input.layoutText);
    const initialStatus: FileProcessingStatus = parsed.recognized && parsed.transactions.length
      ? 'PROCESSED'
      : 'REVIEW_REQUIRED';

    const reviewReason = !parsed.recognized
      ? 'Layout ainda não reconhecido automaticamente.'
      : parsed.transactions.length === 0
        ? 'Documento reconhecido, porém sem movimentações extraídas.'
        : null;

    // Persist every uploaded file, including REVIEW_REQUIRED.
    const source = await db.createSourceFile({
      companyId: input.companyId,
      originalName: input.originalName,
      sha256: input.sha256,
      mimeType: input.mimeType,
      sourceType: parsed.sourceType,
      status: initialStatus,
      reviewReason,
      parserWarnings: parsed.warnings,
    });

    if (initialStatus === 'REVIEW_REQUIRED') {
      return {
        fileName: input.originalName,
        sourceFileId: source.id,
        status: 'REVIEW_REQUIRED',
        sourceType: parsed.sourceType,
        transactionsInserted: 0,
        reason: reviewReason ?? undefined,
        warnings: parsed.warnings,
      };
    }

    const inserted = await db.insertTransactions(source.id, input.companyId, parsed.transactions);

    await db.updateSourceFile({
      id: source.id,
      status: 'PROCESSED',
      sourceType: parsed.sourceType,
      transactionCount: inserted,
      reviewReason: null,
      parserWarnings: parsed.warnings,
    });

    return {
      fileName: input.originalName,
      sourceFileId: source.id,
      status: 'PROCESSED',
      sourceType: parsed.sourceType,
      transactionsInserted: inserted,
      warnings: parsed.warnings,
    };
  } catch (error) {
    return {
      fileName: input.originalName,
      status: 'FAILED',
      transactionsInserted: 0,
      reason: error instanceof Error ? error.message : 'Falha desconhecida durante a importação.',
    };
  }
}
