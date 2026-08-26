import { boolean, date, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  document: text('document'),
  sector: text('sector'),
  activity: text('activity'),
  active: boolean('active').default(true),
  isDemo: boolean('is_demo').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
})

export const sourceFiles = pgTable('source_files', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  hash: text('hash').notNull(),
  kind: text('kind'),
  status: text('status').default('IMPORTED'),
  statusDetail: text('status_detail'),
  recordCount: integer('record_count').default(0),
  confidence: numeric('confidence').default('0'),
  validationStatus: text('validation_status').default('NOT_AVAILABLE'),
  validation: jsonb('validation').default({}),
  mimeType: text('mime_type'),
  importScope: text('import_scope').default('GENERAL'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, table => ({ companyHash: uniqueIndex('source_files_company_hash_uq').on(table.companyId, table.hash) }))

export const chartAccounts = pgTable('chart_accounts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  code: text('code'),
  name: text('name').notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => chartAccounts.id, { onDelete: 'set null' }),
  accountType: text('account_type').notNull().default('EXPENSE'),
  dreSection: text('dre_section'),
  dreOrder: integer('dre_order').default(100),
  isGroup: boolean('is_group').default(false),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
}, table => ({ companyCode: uniqueIndex('chart_accounts_company_code_uq').on(table.companyId, table.code) }))

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  sourceFileId: uuid('source_file_id').references(() => sourceFiles.id, { onDelete: 'set null' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }),
  competenceAt: date('competence_at'),
  dueAt: date('due_at'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  description: text('description').notNull(),
  customTitle: text('custom_title'),
  normalizedParty: text('normalized_party'),
  counterpartyDocument: text('counterparty_document'),
  direction: text('direction').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  grossAmount: numeric('gross_amount', { precision: 14, scale: 2 }),
  feeAmount: numeric('fee_amount', { precision: 14, scale: 2 }),
  netAmount: numeric('net_amount', { precision: 14, scale: 2 }),
  category: text('category'),
  accountId: uuid('account_id').references(() => chartAccounts.id, { onDelete: 'set null' }),
  classificationConfidence: numeric('classification_confidence').default('0'),
  classificationStatus: text('classification_status').default('PENDING'),
  classificationSource: text('classification_source'),
  status: text('status').default('OPEN'),
  paymentMethod: text('payment_method'),
  financialStatus: text('financial_status').default('PAID'),
  dreImpact: boolean('dre_impact').default(true),
  cashImpact: boolean('cash_impact').default(true),
  accountingRole: text('accounting_role').default('BANK_MOVEMENT'),
  economicKey: text('economic_key'),
  externalId: text('external_id'),
  sourcePage: integer('source_page'),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
})

export const classificationRules = pgTable('classification_rules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  scope: text('scope').notNull().default('GLOBAL'),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(),
  normalizedParty: text('normalized_party'),
  direction: text('direction').notNull().default('ANY'),
  category: text('category').notNull(),
  accountId: uuid('account_id').references(() => chartAccounts.id, { onDelete: 'set null' }),
  confidence: numeric('confidence').default('100'),
  useCount: integer('use_count').default(0),
  source: text('source').default('MANUAL'),
  entityDocument: text('entity_document'),
  confirmationCount: integer('confirmation_count').default(0),
  sourceFileId: uuid('source_file_id').references(() => sourceFiles.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
})

export const globalRuleConfirmations = pgTable('global_rule_confirmations', {
  ruleId: uuid('rule_id').references(() => classificationRules.id, { onDelete: 'cascade' }).notNull(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, table => ({ pk: primaryKey({ columns: [table.ruleId, table.companyId] }) }))

export const companyAccounts = pgTable('company_accounts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  institution: text('institution'),
  document: text('document'),
  bankCode: text('bank_code'),
  agency: text('agency'),
  account: text('account'),
  aliases: jsonb('aliases').default([]),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
})

export const expectedSources = pgTable('expected_sources', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  frequency: text('frequency').default('MONTHLY'),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, table => ({ companyKind: uniqueIndex('expected_sources_company_kind_uq').on(table.companyId, table.kind) }))


export const titleRewriteRules = pgTable('title_rewrite_rules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(),
  normalizedParty: text('normalized_party'),
  customTitle: text('custom_title').notNull(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
}, table => ({ companyPattern: uniqueIndex('title_rewrite_rules_company_pattern_uq').on(table.companyId, table.pattern) }))

export const payables = pgTable('payables', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  sourceFileId: uuid('source_file_id').references(() => sourceFiles.id, { onDelete: 'set null' }),
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  originType: text('origin_type').notNull().default('MANUAL'),
  supplier: text('supplier'),
  supplierDocument: text('supplier_document'),
  description: text('description').notNull(),
  issueDate: date('issue_date'),
  dueDate: date('due_date').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  category: text('category'),
  accountId: uuid('account_id').references(() => chartAccounts.id, { onDelete: 'set null' }),
  classificationStatus: text('classification_status').default('PENDING'),
  classificationSource: text('classification_source'),
  paymentStatus: text('payment_status').default('OPEN'),
  paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).default('0'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentMethod: text('payment_method'),
  invoiceRef: text('invoice_ref'),
  fingerprint: text('fingerprint').notNull(),
  raw: jsonb('raw').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
}, table => ({ companyFingerprint: uniqueIndex('payables_company_fingerprint_uq').on(table.companyId, table.fingerprint) }))

export const reconciliationIgnores = pgTable('reconciliation_ignores', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, table => ({ companyTransaction: uniqueIndex('reconciliation_ignores_company_transaction_uq').on(table.companyId, table.transactionId) }))

export const pricingModels = pgTable('pricing_models', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mode: text('mode').notNull().default('SALE'),
  lines: jsonb('lines').notNull().default([]),
  targetMargin: numeric('target_margin').default('20'),
  markup: numeric('markup').default('2'),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
}, table => ({ companyName: uniqueIndex('pricing_models_company_name_uq').on(table.companyId, table.name) }))

export const periodClosures = pgTable('period_closures', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  periodKey: text('period_key').notNull(),
  status: text('status').notNull().default('CLOSED'),
  closedAt: timestamp('closed_at', { withTimezone: true }).defaultNow(),
  closedBy: text('closed_by').default('MASTER'),
  reopenedAt: timestamp('reopened_at', { withTimezone: true }),
  reopenedBy: text('reopened_by'),
  snapshot: jsonb('snapshot').default({})
}, table => ({ companyPeriod: uniqueIndex('period_closures_company_period_uq').on(table.companyId, table.periodKey) }))

export const reconciliationLinks = pgTable('reconciliation_links', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  leftTransactionId: uuid('left_transaction_id').references(() => transactions.id, { onDelete: 'cascade' }),
  rightTransactionId: uuid('right_transaction_id').references(() => transactions.id, { onDelete: 'cascade' }),
  matchType: text('match_type'),
  confidence: numeric('confidence').default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, table => ({ uniqueLink: uniqueIndex('reconciliation_links_company_pair_uq').on(table.companyId, table.leftTransactionId, table.rightTransactionId) }))

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  details: jsonb('details').default({}),
  actor: text('actor').default('MASTER'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
})

export const schemaMeta = pgTable('schema_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
})


export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('OPERATOR'),
  status: text('status').notNull().default('ACTIVE'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
})

export const userCompanies = pgTable('user_companies', {
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull().default('OPERATOR'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, table => ({ pk: primaryKey({ columns: [table.userId, table.companyId] }) }))

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, table => ({ tokenHashUq: uniqueIndex('auth_sessions_token_hash_uq').on(table.tokenHash) }))
