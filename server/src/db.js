import pg from 'pg'
import { extractParty, isIncomingTransfer } from './services/entity.js'
const { Pool } = pg
const enabled = Boolean(process.env.DATABASE_URL)
export const pool = enabled ? new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined}) : null

export async function initDb(){
  if(!pool)return false
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
CREATE TABLE IF NOT EXISTS transactions(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL, occurred_at TIMESTAMPTZ,
  description TEXT NOT NULL, normalized_party TEXT, direction TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL,
  gross_amount NUMERIC(14,2), fee_amount NUMERIC(14,2), net_amount NUMERIC(14,2), category TEXT,
  classification_confidence NUMERIC DEFAULT 0, classification_status TEXT DEFAULT 'PENDING',
  classification_source TEXT, status TEXT DEFAULT 'OPEN', external_id TEXT, raw JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS classification_rules(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), scope TEXT NOT NULL DEFAULT 'GLOBAL',
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE, pattern TEXT NOT NULL,
  normalized_party TEXT, direction TEXT NOT NULL DEFAULT 'ANY', category TEXT NOT NULL,
  confidence NUMERIC DEFAULT 100, source TEXT DEFAULT 'MANUAL', use_count INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);
`)
  // Migração segura para bancos criados na v0.1.0.
  await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS sector TEXT; ALTER TABLE companies ADD COLUMN IF NOT EXISTS activity TEXT;`)
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS classification_status TEXT DEFAULT 'PENDING'; ALTER TABLE transactions ADD COLUMN IF NOT EXISTS classification_source TEXT;`)
  await pool.query(`ALTER TABLE classification_rules ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'ANY'; ALTER TABLE classification_rules ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'MANUAL';`)

  const c=await pool.query('SELECT id FROM companies LIMIT 1')
  if(!c.rowCount){await pool.query(`INSERT INTO companies(name,document,sector,activity) VALUES ('Empresa Demonstração','','Comércio','Venda de produtos e serviços')`)}
  await seedRules()
  await migrateLegacyTransactions()
  return true
}

async function seedRules(){
  const rules=[
    ['CELESC','CELESC','SAIDA','Energia elétrica',100],
    ['CASAN','CASAN','SAIDA','Água e saneamento',100],
    ['GOOGLE ADS','GOOGLE ADS','SAIDA','Marketing e anúncios',100],
    ['SUPERFRETE','SUPERFRETE','SAIDA','Fretes e entregas',100],
    ['LWSA','LWSA','SAIDA','Sistemas e tecnologia',90],
    ['RECEITA FEDERAL','RECEITA FEDERAL','SAIDA','Impostos e tributos',95],
    ['PAGAMENTO DE FATURA','CARTAO DE CREDITO','SAIDA','Cartão de crédito',96]
  ]
  for(const r of rules){
    await pool.query(`INSERT INTO classification_rules(scope,pattern,normalized_party,direction,category,confidence,source)
      SELECT 'GLOBAL',$1,$2,$3,$4,$5,'SEED'
      WHERE NOT EXISTS (SELECT 1 FROM classification_rules WHERE scope='GLOBAL' AND pattern=$1 AND direction=$3)`,r)
  }
}

async function migrateLegacyTransactions(){
  const r=await pool.query(`SELECT id,description,amount,direction,category,classification_confidence,raw FROM transactions`)
  for(const t of r.rows){
    const party=extractParty(t.description)
    let amount=Number(t.amount), direction=t.direction
    // Corrige o bug v0.1.0: "NU PAGAMENTOS" fazia transferência RECEBIDA virar negativa.
    if(t.raw?.source==='nubank_statement' && isIncomingTransfer(t.description) && amount < 0){amount=Math.abs(amount);direction='ENTRADA'}
    let classificationStatus = (!t.category || t.category==='A classificar') ? 'PENDING' : (Number(t.classification_confidence)>=90 ? 'AUTO' : 'SUGGESTED')
    await pool.query(`UPDATE transactions SET normalized_party=$2,amount=$3,direction=$4,classification_status=CASE WHEN classification_source IS NULL THEN $5 ELSE classification_status END WHERE id=$1`,[t.id,party,amount,direction,classificationStatus])
  }
}

export async function companyId(){if(!pool)return null;const r=await pool.query('SELECT id FROM companies ORDER BY created_at LIMIT 1');return r.rows[0]?.id}
export async function getCompany(id){if(!pool)return null;const r=await pool.query('SELECT id,name,document,sector,activity FROM companies WHERE id=$1',[id]);return r.rows[0]||null}
