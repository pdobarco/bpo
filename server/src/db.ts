import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { and, asc, eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import * as schema from './db/schema.js'
import { chartAccounts, companies, companyAccounts, auditLog } from './db/schema.js'
import { extractDocument, extractParty, isIncomingTransfer, normalize } from './services/entity.js'

const { Pool } = pg
const enabled = Boolean(process.env.DATABASE_URL)
export const pool = enabled ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
}) : null
export const db = pool ? drizzle(pool, { schema }) : null
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

export const DRE_SECTIONS = [
  ['RECEITA_BRUTA', 'Receita bruta', 10],
  ['DEDUCOES_RECEITA', '(-) Deduções da receita', 20],
  ['CUSTOS', '(-) Custos / CMV', 30],
  ['DESPESAS_OPERACIONAIS', '(-) Despesas operacionais', 40],
  ['RESULTADO_FINANCEIRO', 'Resultado financeiro', 50],
  ['OUTRAS_RECEITAS_DESPESAS', 'Outras receitas / despesas', 60],
  ['FORA_DRE', 'Fora da DRE', 99]
]

const defaultAccounts = [
  ['1', 'Receitas', null, 'GROUP', null, 10, true],
  ['1.01', 'Receita de vendas', '1', 'REVENUE', 'RECEITA_BRUTA', 11, false],
  ['1.02', 'Outras receitas', '1', 'REVENUE', 'OUTRAS_RECEITAS_DESPESAS', 12, false],
  ['2', 'Deduções da receita', null, 'GROUP', null, 20, true],
  ['2.01', 'Impostos sobre vendas', '2', 'DEDUCTION', 'DEDUCOES_RECEITA', 21, false],
  ['2.02', 'Estorno / Reembolso', '2', 'DEDUCTION', 'DEDUCOES_RECEITA', 22, false],
  ['3', 'Custos e mercadorias', null, 'GROUP', null, 30, true],
  ['3.01', 'Compra de mercadoria / insumos', '3', 'COST', 'CUSTOS', 31, false],
  ['3.02', 'Fretes e entregas', '3', 'COST', 'CUSTOS', 32, false],
  ['3.03', 'Embalagens', '3', 'COST', 'CUSTOS', 33, false],
  ['4', 'Despesas operacionais', null, 'GROUP', null, 40, true],
  ['4.01', 'Marketing e anúncios', '4', 'EXPENSE', 'DESPESAS_OPERACIONAIS', 41, false],
  ['4.02', 'Sistemas e tecnologia', '4', 'EXPENSE', 'DESPESAS_OPERACIONAIS', 42, false],
  ['4.03', 'Energia elétrica', '4', 'EXPENSE', 'DESPESAS_OPERACIONAIS', 43, false],
  ['4.04', 'Água e saneamento', '4', 'EXPENSE', 'DESPESAS_OPERACIONAIS', 44, false],
  ['4.05', 'Aluguel e ocupação', '4', 'EXPENSE', 'DESPESAS_OPERACIONAIS', 45, false],
  ['4.06', 'Contabilidade e serviços profissionais', '4', 'EXPENSE', 'DESPESAS_OPERACIONAIS', 46, false],
  ['4.07', 'Serviços terceirizados', '4', 'EXPENSE', 'DESPESAS_OPERACIONAIS', 47, false],
  ['4.08', 'Material de escritório / gráfica', '4', 'EXPENSE', 'DESPESAS_OPERACIONAIS', 48, false],
  ['4.09', 'Folha / pessoas', '4', 'EXPENSE', 'DESPESAS_OPERACIONAIS', 49, false],
  ['4.99', 'Outras despesas', '4', 'EXPENSE', 'DESPESAS_OPERACIONAIS', 59, false],
  ['5', 'Financeiro', null, 'GROUP', null, 60, true],
  ['5.01', 'Taxas bancárias e financeiras', '5', 'FINANCIAL', 'RESULTADO_FINANCEIRO', 61, false],
  ['5.02', 'Juros e encargos', '5', 'FINANCIAL', 'RESULTADO_FINANCEIRO', 62, false],
  ['9', 'Movimentações fora da DRE', null, 'GROUP', null, 90, true],
  ['9.01', 'Transferência entre contas próprias', '9', 'TRANSFER', 'FORA_DRE', 91, false],
  ['9.02', 'Aporte / Empréstimo', '9', 'TRANSFER', 'FORA_DRE', 92, false],
  ['9.03', 'Liquidação de cartão de crédito', '9', 'TRANSFER', 'FORA_DRE', 93, false],
  ['9.04', 'Retirada do sócio', '9', 'EQUITY', 'FORA_DRE', 94, false]
]

async function addColumn(table, sql) { await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${sql}`) }

export async function initDb() {
  if (!pool) return false
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`)

  await pool.query(`CREATE TABLE IF NOT EXISTS companies(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, document TEXT, created_at TIMESTAMPTZ DEFAULT now())`)
  await addColumn('companies', 'sector TEXT')
  await addColumn('companies', 'activity TEXT')
  await addColumn('companies', 'active BOOLEAN DEFAULT true')
  await addColumn('companies', 'is_demo BOOLEAN DEFAULT false')

  await pool.query(`CREATE TABLE IF NOT EXISTS source_files(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL, hash TEXT NOT NULL, kind TEXT, status TEXT DEFAULT 'IMPORTED', record_count INT DEFAULT 0,
    confidence NUMERIC DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(company_id,hash))`)
  await addColumn('source_files', `status_detail TEXT`)
  await addColumn('source_files', `validation_status TEXT DEFAULT 'NOT_AVAILABLE'`)
  await addColumn('source_files', `validation JSONB DEFAULT '{}'::jsonb`)
  await addColumn('source_files', `period_start DATE`)
  await addColumn('source_files', `period_end DATE`)
  await addColumn('source_files', `processed_at TIMESTAMPTZ DEFAULT now()`)
  await addColumn('source_files', `content BYTEA`)
  await addColumn('source_files', `mime_type TEXT`)
  await addColumn('source_files', `import_scope TEXT DEFAULT 'GENERAL'`)

  await pool.query(`CREATE TABLE IF NOT EXISTS chart_accounts(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    code TEXT, name TEXT NOT NULL, parent_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL,
    account_type TEXT NOT NULL DEFAULT 'EXPENSE', dre_section TEXT, dre_order INT DEFAULT 100,
    is_group BOOLEAN DEFAULT false, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(company_id,code))`)

  await pool.query(`CREATE TABLE IF NOT EXISTS transactions(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL, occurred_at TIMESTAMPTZ,
    description TEXT NOT NULL, normalized_party TEXT, direction TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL,
    gross_amount NUMERIC(14,2), fee_amount NUMERIC(14,2), net_amount NUMERIC(14,2), category TEXT,
    classification_confidence NUMERIC DEFAULT 0, status TEXT DEFAULT 'OPEN', external_id TEXT, raw JSONB,
    created_at TIMESTAMPTZ DEFAULT now())`)
  await addColumn('transactions', `classification_status TEXT DEFAULT 'PENDING'`)
  await addColumn('transactions', `classification_source TEXT`)
  await addColumn('transactions', `counterparty_document TEXT`)
  await addColumn('transactions', `account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL`)
  await addColumn('transactions', `competence_at DATE`)
  await addColumn('transactions', `due_at DATE`)
  await addColumn('transactions', `paid_at TIMESTAMPTZ`)
  await addColumn('transactions', `payment_method TEXT`)
  await addColumn('transactions', `financial_status TEXT DEFAULT 'PAID'`)
  await addColumn('transactions', `dre_impact BOOLEAN DEFAULT true`)
  await addColumn('transactions', `cash_impact BOOLEAN DEFAULT true`)
  await addColumn('transactions', `accounting_role TEXT DEFAULT 'BANK_MOVEMENT'`)
  await addColumn('transactions', `economic_key TEXT`)
  await addColumn('transactions', `source_page INT`)
  await addColumn('transactions', `custom_title TEXT`)

  await pool.query(`CREATE TABLE IF NOT EXISTS classification_rules(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), scope TEXT NOT NULL DEFAULT 'GLOBAL',
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE, pattern TEXT NOT NULL, normalized_party TEXT,
    category TEXT NOT NULL, confidence NUMERIC DEFAULT 100, use_count INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now())`)
  await addColumn('classification_rules', `direction TEXT NOT NULL DEFAULT 'ANY'`)
  await addColumn('classification_rules', `source TEXT DEFAULT 'MANUAL'`)
  await addColumn('classification_rules', `entity_document TEXT`)
  await addColumn('classification_rules', `confirmation_count INT DEFAULT 0`)
  await addColumn('classification_rules', `source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL`)
  await addColumn('classification_rules', `metadata JSONB DEFAULT '{}'::jsonb`)
  await addColumn('classification_rules', `updated_at TIMESTAMPTZ DEFAULT now()`)
  await addColumn('classification_rules', `account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL`)

  await pool.query(`CREATE TABLE IF NOT EXISTS global_rule_confirmations(
    rule_id UUID REFERENCES classification_rules(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY(rule_id,company_id))`)

  await pool.query(`CREATE TABLE IF NOT EXISTS company_accounts(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    label TEXT NOT NULL, institution TEXT, document TEXT, bank_code TEXT, agency TEXT, account TEXT,
    aliases JSONB DEFAULT '[]'::jsonb, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now())`)

  await pool.query(`CREATE TABLE IF NOT EXISTS expected_sources(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, label TEXT NOT NULL, frequency TEXT DEFAULT 'MONTHLY', active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(company_id,kind))`)

  await pool.query(`CREATE TABLE IF NOT EXISTS title_rewrite_rules(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL, normalized_party TEXT, custom_title TEXT NOT NULL, active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(company_id,pattern))`)

  await pool.query(`CREATE TABLE IF NOT EXISTS payables(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL, transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    origin_type TEXT NOT NULL DEFAULT 'MANUAL', supplier TEXT, supplier_document TEXT, description TEXT NOT NULL,
    issue_date DATE, due_date DATE NOT NULL, amount NUMERIC(14,2) NOT NULL, category TEXT,
    account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL, classification_status TEXT DEFAULT 'PENDING',
    classification_source TEXT, payment_status TEXT DEFAULT 'OPEN', paid_amount NUMERIC(14,2) DEFAULT 0,
    paid_at TIMESTAMPTZ, payment_method TEXT, invoice_ref TEXT, fingerprint TEXT NOT NULL, raw JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(company_id,fingerprint))`)

  await pool.query(`CREATE TABLE IF NOT EXISTS reconciliation_ignores(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE, reason TEXT, created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id,transaction_id))`)

  await pool.query(`CREATE TABLE IF NOT EXISTS pricing_models(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'SALE', lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    target_margin NUMERIC DEFAULT 20, markup NUMERIC DEFAULT 2, active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(company_id,name))`)

  await pool.query(`CREATE TABLE IF NOT EXISTS period_closures(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'CLOSED', closed_at TIMESTAMPTZ DEFAULT now(),
    closed_by TEXT DEFAULT 'MASTER', reopened_at TIMESTAMPTZ, reopened_by TEXT, snapshot JSONB DEFAULT '{}'::jsonb,
    UNIQUE(company_id,period_key))`)

  await pool.query(`CREATE TABLE IF NOT EXISTS reconciliation_links(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    left_transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    right_transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE, match_type TEXT,
    confidence NUMERIC DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id,left_transaction_id,right_transaction_id))`)

  await pool.query(`CREATE TABLE IF NOT EXISTS audit_log(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, details JSONB DEFAULT '{}'::jsonb,
    actor TEXT DEFAULT 'MASTER', created_at TIMESTAMPTZ DEFAULT now())`)


  await pool.query(`CREATE TABLE IF NOT EXISTS users(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL, name TEXT NOT NULL,
    password_hash TEXT, role TEXT NOT NULL DEFAULT 'OPERATOR', status TEXT NOT NULL DEFAULT 'ACTIVE',
    last_login_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users(lower(email))`)
  await pool.query(`CREATE TABLE IF NOT EXISTS user_companies(
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'OPERATOR', created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id,company_id))`)
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now())`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id,expires_at)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_companies_company ON user_companies(company_id,user_id)`)

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tx_company_party ON transactions(company_id,normalized_party,direction)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tx_counterparty_document ON transactions(company_id,counterparty_document)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(company_id,account_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tx_competence ON transactions(company_id,competence_at)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tx_occurred ON transactions(company_id,occurred_at)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tx_role ON transactions(company_id,accounting_role)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_files_period ON source_files(company_id,period_start,period_end,kind)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rules_company_party ON classification_rules(company_id,normalized_party,direction)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rules_global_document ON classification_rules(entity_document,direction) WHERE scope='GLOBAL'`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rules_global_party ON classification_rules(normalized_party,direction) WHERE scope='GLOBAL'`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chart_company ON chart_accounts(company_id,active,dre_order)`)

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())`)
  await pool.query(`INSERT INTO schema_meta(key,value,updated_at) VALUES('schema_version','0.6.1',now())
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`)

  // O banco do Claria nasceu antes do Drizzle. O bootstrap acima é intencionalmente idempotente para adotar bancos existentes;
  // daqui em diante, migrations versionadas ficam em server/drizzle e são executadas pelo migrador oficial do Drizzle.
  if (db) await migrate(db, { migrationsFolder })

  await pool.query(`UPDATE transactions SET category='Transferência entre contas próprias' WHERE category='Transferência entre contas'`)
  await pool.query(`UPDATE classification_rules SET category='Transferência entre contas próprias' WHERE category='Transferência entre contas'`)
  await pool.query(`UPDATE transactions SET category='Liquidação de cartão de crédito' WHERE category='Cartão de crédito' AND description ILIKE 'Pagamento de fatura%'`)
  await pool.query(`UPDATE chart_accounts SET name='Liquidação de cartão de crédito',updated_at=now() WHERE code='9.03' AND name='Cartão de crédito'`)
  await pool.query(`UPDATE classification_rules SET category='Liquidação de cartão de crédito',updated_at=now() WHERE category='Cartão de crédito' AND pattern ILIKE '%PAGAMENTO DE FATURA%'`)
  // v0.2.1: competência nunca fica sem referência. Para legados, a data do evento é o fallback oficial.
  await pool.query(`UPDATE transactions SET competence_at=occurred_at::date WHERE competence_at IS NULL AND occurred_at IS NOT NULL`)
  // Padroniza apenas rótulos conhecidos; não inventa PIX quando o extrato só informa transferência.
  await pool.query(`UPDATE transactions SET payment_method='Cartão de crédito' WHERE upper(COALESCE(payment_method,'')) IN ('CREDITO','CRÉDITO','CARTAO DE CREDITO','CARTÃO DE CRÉDITO')`)
  await pool.query(`UPDATE transactions SET payment_method='Cartão de débito' WHERE upper(COALESCE(payment_method,'')) IN ('DEBITO','DÉBITO','CARTAO DE DEBITO','CARTÃO DE DÉBITO')`)
  await pool.query(`UPDATE transactions SET payment_method='PIX' WHERE upper(COALESCE(payment_method,''))='PIX'`)
  await pool.query(`UPDATE transactions SET payment_method='Transferência' WHERE upper(COALESCE(payment_method,'')) IN ('TRANSFERENCIA','TRANSFERÊNCIA')`)

  const c = await pool.query('SELECT id FROM companies LIMIT 1')
  if (!c.rowCount) await pool.query(`INSERT INTO companies(name,document,sector,activity) VALUES ('Empresa Demonstração','','Comércio','Venda de produtos e serviços')`)
  const companies = await pool.query('SELECT id FROM companies')
  for (const row of companies.rows) await ensureDefaultChart(row.id)
  await seedRules()
  await migrateLegacyTransactions()
  return true
}

export async function ensureDefaultChart(companyId) {
  if (!pool || !companyId) return
  const existing = await pool.query(`SELECT code,name FROM chart_accounts WHERE company_id=$1`, [companyId])
  const byCode = new Map(existing.rows.map(r => [r.code, r]))
  const ids = new Map()
  const current = await pool.query(`SELECT id,code FROM chart_accounts WHERE company_id=$1`,[companyId])
  current.rows.forEach(r=>ids.set(r.code,r.id))
  for (const [code,name,parentCode,type,dreSection,order,isGroup] of defaultAccounts) {
    if (byCode.has(code)) continue
    const parentId = parentCode ? ids.get(parentCode) || null : null
    const r = await pool.query(`INSERT INTO chart_accounts(company_id,code,name,parent_id,account_type,dre_section,dre_order,is_group)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [companyId,code,name,parentId,type,dreSection,order,isGroup])
    ids.set(code,r.rows[0].id)
  }
}

async function seedRules() {
  const rules = [
    ['CELESC','CELESC','SAIDA','Energia elétrica',100], ['CASAN','CASAN','SAIDA','Água e saneamento',100],
    ['GOOGLE ADS','GOOGLE ADS','SAIDA','Marketing e anúncios',100], ['SUPERFRETE','SUPERFRETE','SAIDA','Fretes e entregas',100],
    ['LWSA','LWSA','SAIDA','Sistemas e tecnologia',90], ['RECEITA FEDERAL','RECEITA FEDERAL','SAIDA','Impostos sobre vendas',95],
    ['PAGAMENTO DE FATURA','CARTAO DE CREDITO','SAIDA','Liquidação de cartão de crédito',99]
  ]
  for (const r of rules) await pool.query(`INSERT INTO classification_rules(scope,pattern,normalized_party,direction,category,confidence,source,confirmation_count)
    SELECT 'GLOBAL',$1,$2,$3,$4,$5,'SEED',99 WHERE NOT EXISTS
    (SELECT 1 FROM classification_rules WHERE scope='GLOBAL' AND pattern=$1 AND direction=$3 AND category=$4)`, r)
}

function paymentMethodFromDescription(desc='') {
  const t = normalize(desc)
  if (t.includes('PIX')) return 'PIX'
  if (t.includes('CREDITO')) return 'Cartão de crédito'
  if (t.includes('DEBITO')) return 'Cartão de débito'
  if (t.includes('BOLETO')) return 'Boleto'
  if (t.includes('DINHEIRO')) return 'Dinheiro'
  if (t.includes('TRANSFERENCIA')) return 'Transferência'
  return null
}

async function migrateLegacyTransactions() {
  const r = await pool.query(`SELECT id,company_id,description,amount,direction,category,classification_confidence,raw,
    counterparty_document,account_id,occurred_at,competence_at,payment_method,accounting_role FROM transactions`)
  for (const t of r.rows) {
    const party = extractParty(t.description), doc = t.counterparty_document || extractDocument(t.description)
    let amount = Number(t.amount), direction = t.direction
    if (t.raw?.source === 'nubank_statement' && isIncomingTransfer(t.description) && amount < 0) { amount = Math.abs(amount); direction = 'ENTRADA' }
    const classificationStatus = (!t.category || t.category === 'A classificar') ? 'PENDING' : (Number(t.classification_confidence) >= 90 ? 'AUTO' : 'SUGGESTED')
    let accountId = t.account_id
    if (!accountId && t.category && t.category !== 'A classificar') accountId = (await findAccountByName(t.company_id,t.category))?.id || null
    const source = t.raw?.source || ''
    let role = t.accounting_role || 'BANK_MOVEMENT', dreImpact = true, cashImpact = true, financialStatus='PAID'
    if (source === 'pagbank_sales') { role='SALES_EVENT'; dreImpact=true; cashImpact=false }
    if (source === 'nubank_card') { role='CARD_PURCHASE'; dreImpact=true; cashImpact=false; financialStatus='OPEN' }
    if (/^Pagamento de fatura/i.test(t.description)) { role='CARD_SETTLEMENT'; dreImpact=false; cashImpact=true }
    if (t.category === 'Transferência entre contas próprias') { role='TRANSFER'; dreImpact=false; cashImpact=true }
    await pool.query(`UPDATE transactions SET normalized_party=$2,counterparty_document=$3,amount=$4,direction=$5,account_id=$7,
      classification_status=CASE WHEN classification_source IS NULL THEN $6 ELSE classification_status END,
      competence_at=COALESCE(competence_at,occurred_at::date),paid_at=COALESCE(paid_at,CASE WHEN $10 THEN occurred_at ELSE NULL END),
      payment_method=COALESCE(payment_method,$8),accounting_role=COALESCE(NULLIF(accounting_role,'BANK_MOVEMENT'),$9),
      dre_impact=$11,cash_impact=$12,financial_status=COALESCE(NULLIF(financial_status,''),$13) WHERE id=$1`,
      [t.id,party,doc,amount,direction,classificationStatus,accountId,paymentMethodFromDescription(t.description),role,cashImpact,dreImpact,cashImpact,financialStatus])
  }
}

export async function companyId() {
  if (!db) return null
  const rows = await db.select({ id: companies.id }).from(companies).orderBy(asc(companies.createdAt)).limit(1)
  return rows[0]?.id ?? null
}

export async function getCompany(id) {
  if (!db || !id) return null
  const rows = await db.select({ id: companies.id, name: companies.name, document: companies.document, sector: companies.sector, activity: companies.activity })
    .from(companies).where(eq(companies.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getCompanyAccounts(id) {
  if (!db || !id) return []
  return db.select({
    id: companyAccounts.id, label: companyAccounts.label, institution: companyAccounts.institution,
    document: companyAccounts.document, bank_code: companyAccounts.bankCode, agency: companyAccounts.agency,
    account: companyAccounts.account, aliases: companyAccounts.aliases, active: companyAccounts.active
  }).from(companyAccounts).where(and(eq(companyAccounts.companyId, id), eq(companyAccounts.active, true))).orderBy(asc(companyAccounts.createdAt))
}

export async function getChartAccounts(companyId, { includeInactive = false, includeGroups = true } = {}) {
  if (!db || !companyId) return []
  const conditions = [eq(chartAccounts.companyId, companyId)]
  if (!includeInactive) conditions.push(eq(chartAccounts.active, true))
  if (!includeGroups) conditions.push(eq(chartAccounts.isGroup, false))
  const rows = await db.select({
    id: chartAccounts.id, code: chartAccounts.code, name: chartAccounts.name, parent_id: chartAccounts.parentId,
    account_type: chartAccounts.accountType, dre_section: chartAccounts.dreSection, dre_order: chartAccounts.dreOrder,
    is_group: chartAccounts.isGroup, active: chartAccounts.active
  }).from(chartAccounts).where(and(...conditions)).orderBy(asc(chartAccounts.dreOrder), asc(chartAccounts.code), asc(chartAccounts.name))
  return rows
}

export async function findAccountByName(companyId, name) {
  if (!db || !companyId || !name) return null
  const rows = await db.select({
    id: chartAccounts.id, code: chartAccounts.code, name: chartAccounts.name, parent_id: chartAccounts.parentId,
    account_type: chartAccounts.accountType, dre_section: chartAccounts.dreSection, dre_order: chartAccounts.dreOrder,
    is_group: chartAccounts.isGroup, active: chartAccounts.active
  }).from(chartAccounts).where(and(eq(chartAccounts.companyId, companyId), eq(chartAccounts.active, true), eq(chartAccounts.isGroup, false), eq(chartAccounts.name, name))).limit(1)
  if (rows[0]) return rows[0]
  // Compatibilidade com classificações antigas que diferem apenas em caixa/espaços.
  const fallback = await pool.query(`SELECT id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active FROM chart_accounts WHERE company_id=$1 AND active=true AND is_group=false AND upper(trim(name))=upper(trim($2)) LIMIT 1`, [companyId, name])
  return fallback.rows[0] || null
}

export async function audit(companyId, action, entityType = null, entityId = null, details = {}, actor = 'MASTER') {
  if (!db || !companyId) return
  await db.insert(auditLog).values({
    companyId, action, entityType, entityId: entityId ? String(entityId) : null, details: details || {}, actor
  })
}
