import pg from 'pg'
import { extractDocument, extractParty, isIncomingTransfer } from './services/entity.js'

const { Pool } = pg
const enabled = Boolean(process.env.DATABASE_URL)
export const pool = enabled ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
}) : null

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
  // code, name, parentCode, type, dreSection, order, isGroup
  ['1', 'Receitas', null, 'GROUP', null, 10, true],
  ['1.01', 'Receita de vendas', '1', 'REVENUE', 'RECEITA_BRUTA', 11, false],
  ['1.02', 'Outras receitas', '1', 'REVENUE', 'OUTRAS_RECEITAS_DESPESAS', 12, false],

  ['2', 'Deduções da receita', null, 'GROUP', null, 20, true],
  ['2.01', 'Impostos sobre vendas', '2', 'DEDUCTION', 'DEDUCOES_RECEITA', 21, false],
  ['2.02', 'Estorno / Reembolso', '2', 'DEDUCTION', 'DEDUCOES_RECEITA', 22, false],

  ['3', 'Custos e mercadorias', null, 'GROUP', null, 30, true],
  ['3.01', 'Compra de mercadoria / insumos', '3', 'COST', 'CUSTOS', 31, false],
  ['3.02', 'Fretes e entregas', '3', 'COST', 'CUSTOS', 32, false],

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
  ['9.03', 'Cartão de crédito', '9', 'TRANSFER', 'FORA_DRE', 93, false],
  ['9.04', 'Retirada do sócio', '9', 'EQUITY', 'FORA_DRE', 94, false]
]

export async function initDb() {
  if (!pool) return false
  await pool.query(`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS companies(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, document TEXT,
  sector TEXT, activity TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS source_files(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, hash TEXT NOT NULL, kind TEXT, status TEXT DEFAULT 'IMPORTED', record_count INT DEFAULT 0,
  confidence NUMERIC DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(company_id,hash)
);
CREATE TABLE IF NOT EXISTS chart_accounts(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT, name TEXT NOT NULL, parent_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL,
  account_type TEXT NOT NULL DEFAULT 'EXPENSE', dre_section TEXT, dre_order INT DEFAULT 100,
  is_group BOOLEAN DEFAULT false, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id,code)
);
CREATE TABLE IF NOT EXISTS transactions(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL, occurred_at TIMESTAMPTZ,
  description TEXT NOT NULL, normalized_party TEXT, counterparty_document TEXT, direction TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL,
  gross_amount NUMERIC(14,2), fee_amount NUMERIC(14,2), net_amount NUMERIC(14,2), category TEXT,
  account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL,
  classification_confidence NUMERIC DEFAULT 0, classification_status TEXT DEFAULT 'PENDING',
  classification_source TEXT, status TEXT DEFAULT 'OPEN', external_id TEXT, raw JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS classification_rules(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), scope TEXT NOT NULL DEFAULT 'GLOBAL',
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE, pattern TEXT NOT NULL,
  normalized_party TEXT, entity_document TEXT, direction TEXT NOT NULL DEFAULT 'ANY', category TEXT NOT NULL,
  account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL,
  confidence NUMERIC DEFAULT 100, source TEXT DEFAULT 'MANUAL', use_count INT DEFAULT 0,
  confirmation_count INT DEFAULT 0, source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS global_rule_confirmations(
  rule_id UUID REFERENCES classification_rules(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(rule_id,company_id)
);
CREATE TABLE IF NOT EXISTS company_accounts(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL, institution TEXT, document TEXT, bank_code TEXT, agency TEXT, account TEXT,
  aliases JSONB DEFAULT '[]'::jsonb, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tx_company_party ON transactions(company_id,normalized_party,direction);
CREATE INDEX IF NOT EXISTS idx_tx_counterparty_document ON transactions(company_id,counterparty_document);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(company_id,account_id);
CREATE INDEX IF NOT EXISTS idx_rules_company_party ON classification_rules(company_id,normalized_party,direction);
CREATE INDEX IF NOT EXISTS idx_rules_global_document ON classification_rules(entity_document,direction) WHERE scope='GLOBAL';
CREATE INDEX IF NOT EXISTS idx_rules_global_party ON classification_rules(normalized_party,direction) WHERE scope='GLOBAL';
CREATE INDEX IF NOT EXISTS idx_chart_company ON chart_accounts(company_id,active,dre_order);
`)

  // Migrações seguras para bancos das versões anteriores.
  await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS sector TEXT; ALTER TABLE companies ADD COLUMN IF NOT EXISTS activity TEXT;`)
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS classification_status TEXT DEFAULT 'PENDING'; ALTER TABLE transactions ADD COLUMN IF NOT EXISTS classification_source TEXT; ALTER TABLE transactions ADD COLUMN IF NOT EXISTS counterparty_document TEXT; ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;`)
  await pool.query(`ALTER TABLE classification_rules ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'ANY'; ALTER TABLE classification_rules ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'MANUAL'; ALTER TABLE classification_rules ADD COLUMN IF NOT EXISTS entity_document TEXT; ALTER TABLE classification_rules ADD COLUMN IF NOT EXISTS confirmation_count INT DEFAULT 0; ALTER TABLE classification_rules ADD COLUMN IF NOT EXISTS source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL; ALTER TABLE classification_rules ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb; ALTER TABLE classification_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(); ALTER TABLE classification_rules ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL;`)

  await pool.query(`UPDATE transactions SET category='Transferência entre contas próprias' WHERE category='Transferência entre contas'; UPDATE classification_rules SET category='Transferência entre contas próprias' WHERE category='Transferência entre contas';`)

  const c = await pool.query('SELECT id FROM companies LIMIT 1')
  if (!c.rowCount) {
    await pool.query(`INSERT INTO companies(name,document,sector,activity) VALUES ('Empresa Demonstração','','Comércio','Venda de produtos e serviços')`)
  }

  const companies = await pool.query('SELECT id FROM companies')
  for (const row of companies.rows) await ensureDefaultChart(row.id)
  await seedRules()
  await migrateLegacyTransactions()
  return true
}

export async function ensureDefaultChart(companyId) {
  if (!pool || !companyId) return
  const existing = await pool.query(`SELECT count(*)::int AS n FROM chart_accounts WHERE company_id=$1`, [companyId])
  if (existing.rows[0]?.n > 0) return
  const ids = new Map()
  for (const [code,name,parentCode,type,dreSection,order,isGroup] of defaultAccounts) {
    const parentId = parentCode ? ids.get(parentCode) || null : null
    const r = await pool.query(`INSERT INTO chart_accounts(company_id,code,name,parent_id,account_type,dre_section,dre_order,is_group)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [companyId,code,name,parentId,type,dreSection,order,isGroup])
    ids.set(code, r.rows[0].id)
  }
}

async function seedRules() {
  const rules = [
    ['CELESC','CELESC','SAIDA','Energia elétrica',100],
    ['CASAN','CASAN','SAIDA','Água e saneamento',100],
    ['GOOGLE ADS','GOOGLE ADS','SAIDA','Marketing e anúncios',100],
    ['SUPERFRETE','SUPERFRETE','SAIDA','Fretes e entregas',100],
    ['LWSA','LWSA','SAIDA','Sistemas e tecnologia',90],
    ['RECEITA FEDERAL','RECEITA FEDERAL','SAIDA','Impostos sobre vendas',95],
    ['PAGAMENTO DE FATURA','CARTAO DE CREDITO','SAIDA','Cartão de crédito',96]
  ]
  for (const r of rules) {
    await pool.query(`INSERT INTO classification_rules(scope,pattern,normalized_party,direction,category,confidence,source,confirmation_count)
      SELECT 'GLOBAL',$1,$2,$3,$4,$5,'SEED',99
      WHERE NOT EXISTS (SELECT 1 FROM classification_rules WHERE scope='GLOBAL' AND pattern=$1 AND direction=$3 AND category=$4)`, r)
  }
}

async function migrateLegacyTransactions() {
  const r = await pool.query(`SELECT id,company_id,description,amount,direction,category,classification_confidence,raw,counterparty_document,account_id FROM transactions`)
  for (const t of r.rows) {
    const party = extractParty(t.description)
    const doc = t.counterparty_document || extractDocument(t.description)
    let amount = Number(t.amount), direction = t.direction
    if (t.raw?.source === 'nubank_statement' && isIncomingTransfer(t.description) && amount < 0) {
      amount = Math.abs(amount); direction = 'ENTRADA'
    }
    const classificationStatus = (!t.category || t.category === 'A classificar') ? 'PENDING' : (Number(t.classification_confidence) >= 90 ? 'AUTO' : 'SUGGESTED')
    let accountId = t.account_id
    if (!accountId && t.category && t.category !== 'A classificar') {
      const a = await findAccountByName(t.company_id, t.category)
      accountId = a?.id || null
    }
    await pool.query(`UPDATE transactions SET normalized_party=$2,counterparty_document=$3,amount=$4,direction=$5,account_id=$7,
      classification_status=CASE WHEN classification_source IS NULL THEN $6 ELSE classification_status END WHERE id=$1`,
      [t.id,party,doc,amount,direction,classificationStatus,accountId])
  }
}

export async function companyId() {
  if (!pool) return null
  const r = await pool.query('SELECT id FROM companies ORDER BY created_at LIMIT 1')
  return r.rows[0]?.id
}

export async function getCompany(id) {
  if (!pool) return null
  const r = await pool.query('SELECT id,name,document,sector,activity FROM companies WHERE id=$1',[id])
  return r.rows[0] || null
}

export async function getCompanyAccounts(id) {
  if (!pool) return []
  const r = await pool.query(`SELECT id,label,institution,document,bank_code,agency,account,aliases,active FROM company_accounts WHERE company_id=$1 AND active=true ORDER BY created_at`,[id])
  return r.rows
}

export async function getChartAccounts(companyId, { includeInactive=false, includeGroups=true } = {}) {
  if (!pool) return []
  const where = [`company_id=$1`]
  if (!includeInactive) where.push(`active=true`)
  if (!includeGroups) where.push(`is_group=false`)
  const r = await pool.query(`SELECT id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active FROM chart_accounts WHERE ${where.join(' AND ')} ORDER BY dre_order,code NULLS LAST,name`, [companyId])
  return r.rows
}

export async function findAccountByName(companyId, name) {
  if (!pool || !companyId || !name) return null
  const r = await pool.query(`SELECT id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active FROM chart_accounts
    WHERE company_id=$1 AND active=true AND is_group=false AND upper(trim(name))=upper(trim($2)) LIMIT 1`, [companyId, name])
  return r.rows[0] || null
}
