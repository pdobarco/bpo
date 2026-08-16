import type { QueryClient } from '@tanstack/react-query';

/**
 * Files belong to the company, not to the month currently selected in the UI.
 * Therefore the files query key must NOT include period/month/competency.
 */
export const filesQueryKey = (companyId: string) => ['files', companyId] as const;

/**
 * Upload payload intentionally contains only files.
 * Do not append `period`, `month`, `competency` or the currently selected date filter.
 */
export function buildFilesFormData(files: File[]): FormData {
  const form = new FormData();
  for (const file of files) form.append('files', file, file.name);
  return form;
}

/**
 * Transactions/DRE remain period-filtered for viewing, but after an import all
 * relevant server-state queries for the company are invalidated.
 */
export async function invalidateAfterImport(queryClient: QueryClient, companyId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: filesQueryKey(companyId) }),
    queryClient.invalidateQueries({ queryKey: ['transactions', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['dre', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['reconciliation', companyId] }),
  ]);
}
