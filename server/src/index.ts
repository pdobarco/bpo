import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { initDb,pool,getCompany,getCompanyAccounts,getChartAccounts,findAccountByName,DRE_SECTIONS,audit,ensureDefaultChart } from './db.js'
import { authenticateRequest,authPayload,bearerToken,createSession,destroySession,ensureMasterUser,hashPassword,linkMasterToCompany,masterEmail,resolveCompanyId,userCompanies,verifyPassword } from './auth.js'
import { parsePdf } from './parsers/pdf.js'
import { parseTabular } from './parsers/tabular.js'
import { parseSupplierBase } from './parsers/suppliers.js'
import { classify } from './services/classify.js'
import { suggestNegativeParties, adaptUnknownPdf, compareMarketProducts } from './services/ai.js'
import { registerV070Routes } from './v070.js'
import { isLikelyBusinessName,normalize } from './services/entity.js'
import * as XLSX from 'xlsx'

const __dirname=path.dirname(fileURLToPath(import.meta.url))
const PORT=Number(process.env.PORT||3000),mb=Number(process.env.MAX_UPLOAD_MB||25)
const server=Fastify({logger:true,bodyLimit:Math.max(3,mb)*1024*1024})
await server.register(cors,{origin:true})
await server.register(multipart,{limits:{fileSize:mb*1024*1024,files:100}})

const bodySchemas: Record<string, any> = {
  'PUT /api/company': z.object({name:z.string().optional(),document:z.string().nullable().optional(),sector:z.string().nullable().optional(),activity:z.string().nullable().optional()}).passthrough(),
  'POST /api/chart-accounts': z.object({code:z.string().optional(),name:z.string().min(1),parentId:z.string().nullable().optional(),accountType:z.string().optional(),dreSection:z.string().optional(),isGroup:z.boolean().optional()}).passthrough(),
  'PUT /api/chart-accounts/:id': z.object({code:z.string().optional(),name:z.string().optional(),parentId:z.string().nullable().optional(),accountType:z.string().optional(),dreSection:z.string().nullable().optional(),isGroup:z.boolean().optional(),active:z.boolean().optional()}).passthrough(),
  'PATCH /api/transactions/:id': z.object({competenceAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),accountId:z.string().uuid().or(z.literal('')).nullable().optional(),updateRule:z.boolean().optional(),customTitle:z.string().max(160).nullable().optional(),applyTitleRule:z.boolean().optional()}).passthrough(),
  'POST /api/transactions/confirm-batch': z.object({ids:z.array(z.string().uuid()).min(1).max(500)}),
  'POST /api/payables': z.object({supplier:z.string().optional(),supplierDocument:z.string().optional(),description:z.string().min(1),issueDate:z.string().optional(),dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),amount:z.number().positive(),category:z.string().optional(),accountId:z.string().uuid().or(z.literal('')).optional(),paymentMethod:z.string().optional(),invoiceRef:z.string().optional()}).passthrough(),
  'PATCH /api/payables/:id': z.object({supplier:z.string().optional(),description:z.string().optional(),dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),amount:z.number().positive().optional(),category:z.string().optional(),accountId:z.string().uuid().or(z.literal('')).nullable().optional(),paymentStatus:z.enum(['OPEN','SCHEDULED','PARTIAL','PAID','OVERDUE']).optional(),paidAmount:z.number().nonnegative().optional(),remember:z.boolean().optional()}).passthrough(),
  'POST /api/reconciliation/link': z.object({leftId:z.string().uuid(),rightId:z.string().uuid()}),
  'POST /api/reconciliation/mark-transfer': z.object({transactionId:z.string().uuid()}),
  'POST /api/reconciliation/ignore': z.object({transactionId:z.string().uuid(),reason:z.string().max(500).optional()}).passthrough(),
  'POST /api/company-accounts': z.object({label:z.string().min(1),institution:z.string().optional(),document:z.string().optional(),bankCode:z.string().optional(),agency:z.string().optional(),account:z.string().optional(),aliases:z.array(z.string()).optional()}).passthrough(),
  'POST /api/expected-sources': z.object({kind:z.string().min(1),label:z.string().min(1),active:z.boolean().optional()}).passthrough(),
  'POST /api/periods/close': z.object({period:z.string().regex(/^\d{4}-\d{2}$/),force:z.boolean().optional()}).passthrough(),
  'POST /api/periods/reopen': z.object({period:z.string().regex(/^\d{4}-\d{2}$/)}).passthrough(),
  'POST /api/review-groups/classify': z.object({normalizedParty:z.string().min(1),counterpartyDocument:z.string().nullable().optional(),direction:z.string().min(1),category:z.string().min(1),remember:z.boolean().optional(),onlyIds:z.array(z.string().uuid()).optional()}).passthrough(),
  'POST /api/review-groups/classify-batch': z.object({items:z.array(z.object({normalizedParty:z.string(),counterpartyDocument:z.string().nullable().optional(),direction:z.string(),category:z.string()})).max(100)}).passthrough(),
  'POST /api/auth/login': z.object({email:z.string().email(),password:z.string().min(1)}),
  'POST /api/auth/register': z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(8),companyName:z.string().min(2)}),
  'POST /api/admin/companies': z.object({name:z.string().min(2),document:z.string().optional(),sector:z.string().optional(),activity:z.string().optional()}),
  'PATCH /api/admin/companies/:id': z.object({name:z.string().optional(),document:z.string().nullable().optional(),sector:z.string().nullable().optional(),activity:z.string().nullable().optional(),active:z.boolean().optional()}).passthrough(),
  'POST /api/admin/users': z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(8),role:z.enum(['MASTER','ADMIN','OPERATOR','VIEWER']).default('OPERATOR'),companyIds:z.array(z.string().uuid()).default([])}),
  'PATCH /api/admin/users/:id': z.object({name:z.string().optional(),role:z.enum(['MASTER','ADMIN','OPERATOR','VIEWER']).optional(),status:z.enum(['ACTIVE','INACTIVE']).optional(),password:z.string().min(8).optional(),companyIds:z.array(z.string().uuid()).optional()}).passthrough(),
  'POST /api/pricing/models': z.object({name:z.string().min(1),mode:z.enum(['SALE','COST']).default('SALE'),lines:z.array(z.any()).default([]),targetMargin:z.number().optional(),markup:z.number().optional()}).passthrough(),
  'PUT /api/pricing/models/:id': z.object({name:z.string().min(1),mode:z.enum(['SALE','COST']).default('SALE'),lines:z.array(z.any()).default([]),targetMargin:z.number().optional(),markup:z.number().optional()}).passthrough(),
  'POST /api/pricing/market-compare': z.object({product:z.string().min(2),brand:z.string().optional(),category:z.string().optional(),referencePrice:z.number().optional()}).passthrough(),
  'POST /api/pricing/export': z.object({rows:z.array(z.any()).max(5000),lines:z.array(z.any()).optional(),modelName:z.string().optional()}).passthrough()
}


function responseFacade(reply:any){
  const facade={
    status(code:any){reply.code(code);return facade},
    header(name:any,value:any){reply.header(name,value);return facade},
    send(payload:any){return reply.send(payload)},
    json(payload:any){return reply.send(payload)}
  }
  return facade
}

async function collectUploads(req:any){
  const files=[]
  for await(const part of req.files()){
    const buffer=await part.toBuffer()
    files.push({buffer,originalname:part.filename||'arquivo',mimetype:part.mimetype||'application/octet-stream'})
  }
  req.uploadedFiles=files
}

function isPublicApi(url:string){return url==='/api/health'||url==='/api/auth/status'||url==='/api/auth/login'||url==='/api/auth/register'||url==='/api/demo/session'}
function registerRoute(method:any,url:string,...handlers:any[]){
  server.route({method,url,handler:async(req:any,reply:any)=>{
    const schema=bodySchemas[`${method} ${url}`]
    if(schema){const parsed=schema.safeParse(req.body||{});if(!parsed.success)return reply.code(400).send({message:'Dados inválidos.',issues:parsed.error.issues});req.body=parsed.data}
    if(!isPublicApi(url)){
      const auth=await authenticateRequest(req)
      if(!auth)return reply.code(401).send({message:'Sessão inválida ou expirada.'})
      req.auth=auth
      if(url.startsWith('/api/admin/')&&auth.role!=='MASTER')return reply.code(403).send({message:'Apenas o usuário master pode acessar esta área.'})
      if(auth.role==='VIEWER'&&method!=='GET'&&!url.startsWith('/api/auth/'))return reply.code(403).send({message:'Seu perfil é somente leitura.'})
      const adminOnlyPrefixes=['/api/company','/api/chart-accounts','/api/company-accounts','/api/expected-sources','/api/periods/']
      if(auth.role==='OPERATOR'&&method!=='GET'&&adminOnlyPrefixes.some(prefix=>url.startsWith(prefix)))return reply.code(403).send({message:'Esta ação exige perfil ADMIN ou MASTER.'})
      if(!url.startsWith('/api/admin/')&&!url.startsWith('/api/auth/')){
        req.companyId=await resolveCompanyId(req)
        if(!req.companyId)return reply.code(403).send({message:'Usuário sem empresa disponível.'})
      }
    }
    for(let i=0;i<handlers.length-1;i++)await handlers[i](req,reply)
    return handlers.at(-1)(req,responseFacade(reply))
  }})
}
const app={
  get:(url,...handlers)=>registerRoute('GET',url,...handlers),
  post:(url,...handlers)=>registerRoute('POST',url,...handlers),
  put:(url,...handlers)=>registerRoute('PUT',url,...handlers),
  patch:(url,...handlers)=>registerRoute('PATCH',url,...handlers),
  delete:(url,...handlers)=>registerRoute('DELETE',url,...handlers)
}
const upload={array:(..._args:any[])=>collectUploads}
registerV070Routes(app)

const demo={company:{id:'demo',name:'Encantê Natural',sector:'Comércio',activity:'Produtos naturais'},summary:{balance:5731.62,inflow:11096.69,outflow:13113.60,pending:2,revenue:10601,result:-6999,quality:91},months:[2379,6490,10562,19005,14445,19278,10601,0],files:[],tx:[]}
const n=(v:any)=>Number(v||0),cleanDocument=(v:any)=>String(v||'').replace(/\D/g,'')
const pad=(x:any)=>String(x).padStart(2,'0')
const toDateOnly=(d:any)=>{if(!d)return null;const x=d instanceof Date?d:new Date(d);return Number.isNaN(x.getTime())?null:`${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`}
const isoMonth=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`

function rangeFromQuery(q:any={}){
  if(q.from&&q.to)return{from:String(q.from).slice(0,10),to:String(q.to).slice(0,10),period:null}
  const p=/^\d{4}-\d{2}$/.test(q.period||'')?q.period:isoMonth(new Date())
  const [y,m]=p.split('-').map(Number),last=new Date(y,m,0).getDate()
  return{from:`${y}-${pad(m)}-01`,to:`${y}-${pad(m)}-${pad(last)}`,period:p}
}
function rangeSql(column:any,range:any,start=2){return{clause:`${column}::date BETWEEN $${start}::date AND $${start+1}::date`,values:[range.from,range.to]}}
function dreSectionLabel(key:any){return DRE_SECTIONS.find(x=>x[0]===key)?.[1]||key||'Não mapeado'}
function paymentMethod(desc:any='') {const t=normalize(desc);if(t.includes('PIX'))return'PIX';if(t.includes('CREDITO'))return'Cartão de crédito';if(t.includes('DEBITO'))return'Cartão de débito';if(t.includes('BOLETO'))return'Boleto';if(t.includes('TRANSFER'))return'Transferência';return null}

async function isClosed(cid:any,period:any){if(!period)return false;const r=await pool.query(`SELECT status FROM period_closures WHERE company_id=$1 AND period_key=$2 AND status='CLOSED'`,[cid,period]);return Boolean(r.rowCount)}
async function auditSafe(cid:any,...args:any[]){try{await (audit as any)(cid,...args)}catch(e){console.error('audit',e.message)}}

async function getReviewGroups(cid:any,range:any=null){
  const params=[cid],where=[`company_id=$1`,`classification_status IN ('PENDING','SUGGESTED')`]
  if(range){where.push(`competence_at BETWEEN $2::date AND $3::date`);params.push(range.from,range.to)}
  const r=await pool.query(`SELECT id,normalized_party,counterparty_document,direction,amount,description,category,account_id,classification_confidence,classification_status,classification_source,competence_at
    FROM transactions WHERE ${where.join(' AND ')} ORDER BY competence_at DESC,occurred_at DESC`,params)
  const map=new Map<string,any>()
  for(const row of r.rows){const party=row.normalized_party||row.description,key=`${row.direction}|${party}`;if(!map.has(key))map.set(key,{normalizedParty:party,counterpartyDocument:row.counterparty_document||null,direction:row.direction,count:0,total:0,category:row.category||'A classificar',accountId:row.account_id||null,confidence:0,source:row.classification_source||null,samples:[],ids:[],shareable:false});const g=map.get(key);g.count++;g.total+=n(row.amount);g.confidence=Math.max(g.confidence,n(row.classification_confidence));g.ids.push(row.id);if(!g.counterpartyDocument&&row.counterparty_document)g.counterpartyDocument=row.counterparty_document;if(g.samples.length<2&&!g.samples.includes(row.description))g.samples.push(row.description);if(row.category&&row.category!=='A classificar')g.category=row.category;if(row.account_id)g.accountId=row.account_id;if(row.classification_source)g.source=row.classification_source}
  for(const g of map.values()){const d=cleanDocument(g.counterpartyDocument);g.shareable=g.direction==='SAIDA'&&(d.length===14||isLikelyBusinessName(g.normalizedParty))}
  return[...map.values()].sort((a,b)=>b.count-a.count||Math.abs(b.total)-Math.abs(a.total))
}

async function ensureAccountForCategory(cid:any,category:any,direction:any='SAIDA'){
  if(!category||category==='A classificar'||category==='Revisar')return null
  let account=await findAccountByName(cid,category);if(account)return account
  const text=normalize(category);let section=direction==='ENTRADA'?'RECEITA_BRUTA':'DESPESAS_OPERACIONAIS',type=direction==='ENTRADA'?'REVENUE':'EXPENSE',parentName=direction==='ENTRADA'?'Receitas':'Despesas operacionais'
  if(/MERCADOR|INSUM|CMV|CUSTO|FRETE|EMBALAG/.test(text)){section='CUSTOS';type='COST';parentName='Custos e mercadorias'}
  if(/TRANSFER|APORTE|EMPRESTIMO|LIQUIDACAO DE CARTAO|RETIRADA/.test(text)){section='FORA_DRE';type='TRANSFER';parentName='Movimentações fora da DRE'}
  if(/TAXA BANC|JURO|FINANCEIR/.test(text)){section='RESULTADO_FINANCEIRO';type='FINANCIAL';parentName='Financeiro'}
  if(/ESTORNO|REEMBOLSO|DEDU/.test(text)){section='DEDUCOES_RECEITA';type='DEDUCTION';parentName='Deduções da receita'}
  const parent=await pool.query(`SELECT id FROM chart_accounts WHERE company_id=$1 AND active=true AND is_group=true AND upper(name)=upper($2) LIMIT 1`,[cid,parentName]),maxOrder=await pool.query(`SELECT COALESCE(max(dre_order),100) AS m FROM chart_accounts WHERE company_id=$1`,[cid])
  const r=await pool.query(`INSERT INTO chart_accounts(company_id,name,parent_id,account_type,dre_section,dre_order,is_group,active) VALUES($1,$2,$3,$4,$5,$6,false,true) RETURNING id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active`,[cid,category,parent.rows[0]?.id||null,type,section,n(maxOrder.rows[0]?.m)+1]);return r.rows[0]
}
async function upsertCompanyRule({cid,party,document,direction,category,accountId,source='MANUAL',sourceFileId=null}:any){await pool.query(`DELETE FROM classification_rules WHERE scope='COMPANY' AND company_id=$1 AND normalized_party=$2 AND direction=$3`,[cid,party,direction]);await pool.query(`INSERT INTO classification_rules(scope,company_id,pattern,normalized_party,entity_document,direction,category,account_id,confidence,source,source_file_id) VALUES('COMPANY',$1,$2,$2,$3,$4,$5,$6,100,$7,$8)`,[cid,party,document||null,direction,category,accountId||null,source,sourceFileId])}
async function promoteGlobalRule({cid,party,document,direction,category,source='MANUAL',sourceFileId=null}:any){
  const doc=cleanDocument(document),blocked=new Set(['Transferência entre contas próprias','Aporte / Empréstimo','Liquidação de cartão de crédito','Retirada do sócio']),shareable=direction==='SAIDA'&&!blocked.has(category)&&(doc.length===14||isLikelyBusinessName(party));if(!shareable)return false
  let rule=await pool.query(`SELECT id FROM classification_rules WHERE scope='GLOBAL' AND normalized_party=$1 AND direction=$2 AND category=$3 LIMIT 1`,[party,direction,category]),ruleId
  if(!rule.rowCount){const ins=await pool.query(`INSERT INTO classification_rules(scope,pattern,normalized_party,entity_document,direction,category,confidence,source,confirmation_count,source_file_id) VALUES('GLOBAL',$1,$1,$2,$3,$4,80,$5,0,$6) RETURNING id`,[party,doc.length===14?doc:null,direction,category,source,sourceFileId]);ruleId=ins.rows[0].id}else ruleId=rule.rows[0].id
  await pool.query(`INSERT INTO global_rule_confirmations(rule_id,company_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[ruleId,cid]);const count=await pool.query(`SELECT count(*)::int AS n FROM global_rule_confirmations WHERE rule_id=$1`,[ruleId]),confirmations=n(count.rows[0]?.n),confidence=Math.min(99,72+confirmations*8);await pool.query(`UPDATE classification_rules SET entity_document=COALESCE(entity_document,$2),confirmation_count=$3,confidence=GREATEST(confidence,$4),updated_at=now() WHERE id=$1`,[ruleId,doc.length===14?doc:null,confirmations,confidence]);return true
}
function dreImpactForCategory(category:any){return !['Transferência entre contas próprias','Aporte / Empréstimo','Liquidação de cartão de crédito','Retirada do sócio'].includes(category)}
async function learnClassification({cid,party,document,direction,category,source='MANUAL',sourceFileId=null,applyTransactions=true}:any){
  const account=await ensureAccountForCategory(cid,category,direction);await upsertCompanyRule({cid,party,document,direction,category,accountId:account?.id,source,sourceFileId})
  if(applyTransactions)await pool.query(`UPDATE transactions SET category=$4,account_id=$5,classification_confidence=100,classification_status='CONFIRMED',classification_source=$6,dre_impact=$7,accounting_role=CASE WHEN $4='Transferência entre contas próprias' THEN 'TRANSFER' WHEN $4='Liquidação de cartão de crédito' THEN 'CARD_SETTLEMENT' ELSE accounting_role END WHERE company_id=$1 AND normalized_party=$2 AND direction=$3 AND NOT EXISTS (SELECT 1 FROM period_closures pc WHERE pc.company_id=transactions.company_id AND pc.period_key=to_char(transactions.competence_at,'YYYY-MM') AND pc.status='CLOSED')`,[cid,party,direction,category,account?.id||null,source,dreImpactForCategory(category)])
  const shared=await promoteGlobalRule({cid,party,document,direction,category,source,sourceFileId});await auditSafe(cid,'CLASSIFICATION_CONFIRMED','counterparty',party,{direction,category,source,shared});return{account,shared}
}
async function importSupplierRecords(cid:any,sourceFileId:any,records:any[]){let learned=0,shared=0,newAccounts=0;for(const rec of records.slice(0,5000)){const before=await findAccountByName(cid,rec.category),out=await learnClassification({cid,party:rec.normalizedParty,document:rec.document,direction:rec.direction,category:rec.category,source:'SUPPLIER_EXCEL',sourceFileId,applyTransactions:true});if(!before&&out.account)newAccounts++;if(out.shared)shared++;learned++}return{learned,shared,newAccounts}}
async function runLunaForPending(cid:any,range:any=null){if(!pool)return{updated:0,skipped:true};const company=await getCompany(cid),accounts=await getChartAccounts(cid,{includeGroups:false}),categories=[...new Set<string>(accounts.filter((a:any)=>a.active&&a.dre_section!=='FORA_DRE').map((a:any)=>String(a.name)))],groups=(await getReviewGroups(cid,range)).filter(g=>g.direction==='SAIDA'&&(g.category==='A classificar'||g.source!=='AI'));if(!groups.length)return{updated:0};const suggestions=await suggestNegativeParties({company,groups,categories});let updated=0;for(const s of suggestions){const party=String(s.party||'').trim().toUpperCase(),group=groups.find(g=>g.normalizedParty===party);if(!group)continue;const category=s.category==='Revisar'?'A classificar':s.category,confidence=Math.max(0,Math.min(100,n(s.confidence))),account=category==='A classificar'?null:await ensureAccountForCategory(cid,category,'SAIDA');await pool.query(`UPDATE transactions SET category=$4,account_id=$6,classification_confidence=$5,classification_status='SUGGESTED',classification_source='AI' WHERE company_id=$1 AND normalized_party=$2 AND direction=$3 AND classification_status IN ('PENDING','SUGGESTED') AND NOT EXISTS (SELECT 1 FROM period_closures pc WHERE pc.company_id=transactions.company_id AND pc.period_key=to_char(transactions.competence_at,'YYYY-MM') AND pc.status='CLOSED')`,[cid,party,'SAIDA',category,confidence,account?.id||null]);updated++}return{updated}}

async function applyAccountingPolicy(cid:any){
  await pool.query(`UPDATE transactions SET dre_impact=false,cash_impact=true,accounting_role='TRANSFER' WHERE company_id=$1 AND category='Transferência entre contas próprias'`,[cid])
  await pool.query(`UPDATE transactions SET dre_impact=false,cash_impact=true,accounting_role='CARD_SETTLEMENT',category='Liquidação de cartão de crédito' WHERE company_id=$1 AND (description ILIKE 'Pagamento de fatura%' OR accounting_role='CARD_SETTLEMENT')`,[cid])
  await pool.query(`UPDATE transactions SET dre_impact=false,cash_impact=true,accounting_role='INVESTMENT_TRANSFER',category='Transferência entre contas próprias' WHERE company_id=$1 AND (description ILIKE 'Renda Fixa - Aplicação em CDB%' OR description ILIKE 'Renda Fixa - Resgate de CDB%')`,[cid])
  await pool.query(`UPDATE transactions SET dre_impact=true,cash_impact=false,accounting_role='CARD_PURCHASE',payment_method='Cartão de crédito' WHERE company_id=$1 AND raw->>'source'='nubank_card'`,[cid])
  await pool.query(`UPDATE transactions SET dre_impact=true,cash_impact=false,accounting_role='SALES_EVENT' WHERE company_id=$1 AND raw->>'source'='pagbank_sales'`,[cid])
  await pool.query(`UPDATE transactions t SET dre_impact=false,cash_impact=true,accounting_role='CASH_RECEIPT' WHERE t.company_id=$1 AND t.raw->>'source'='pagbank_statement' AND t.description ILIKE 'Vendas - Disponivel%' AND EXISTS(SELECT 1 FROM source_files sf WHERE sf.company_id=t.company_id AND sf.kind='PAGBANK_SALES' AND sf.period_start IS NOT NULL AND t.competence_at BETWEEN sf.period_start AND sf.period_end)`,[cid])
  await pool.query(`UPDATE transactions t SET dre_impact=true,cash_impact=true,accounting_role='SALES_EVENT_PROXY' WHERE t.company_id=$1 AND t.raw->>'source'='pagbank_statement' AND t.description ILIKE 'Vendas - Disponivel%' AND NOT EXISTS(SELECT 1 FROM source_files sf WHERE sf.company_id=t.company_id AND sf.kind='PAGBANK_SALES' AND sf.period_start IS NOT NULL AND t.competence_at BETWEEN sf.period_start AND sf.period_end)`,[cid])
  await pool.query(`UPDATE transactions c SET financial_status='PAID',paid_at=s.occurred_at FROM transactions s WHERE c.company_id=$1 AND s.company_id=c.company_id AND c.accounting_role='CARD_PURCHASE' AND c.due_at IS NOT NULL AND s.accounting_role='CARD_SETTLEMENT' AND abs((s.occurred_at::date-c.due_at::date))<=10 AND c.financial_status='OPEN'`,[cid])
}

async function applyTitleRules(cid:any){
  await pool.query(`UPDATE transactions t SET custom_title=r.custom_title FROM title_rewrite_rules r
    WHERE t.company_id=$1 AND r.company_id=t.company_id AND r.active=true AND t.custom_title IS NULL
      AND ((r.normalized_party IS NOT NULL AND upper(COALESCE(t.normalized_party,''))=upper(r.normalized_party))
        OR (r.normalized_party IS NULL AND upper(t.description) LIKE upper(r.pattern)))`,[cid])
}

async function persistParsedTransactions(cid:any,sourceFileId:any,parsed:any,company:any){
  let insertedForFile=0
  for(const t of parsed.transactions||[]){
    const c=await classify(t,cid,company)
    let role='BANK_MOVEMENT',dreImpact=dreImpactForCategory(c.category),cashImpact=true,financialStatus=t.financialStatus||'PAID'
    if(parsed.kind==='PAGBANK_SALES'){role='SALES_EVENT';dreImpact=true;cashImpact=false}
    if(parsed.kind==='NUBANK_CARD'){role='CARD_PURCHASE';dreImpact=true;cashImpact=false;financialStatus='OPEN'}
    if(c.category==='Transferência entre contas próprias'){role='TRANSFER';dreImpact=false}
    if(c.category==='Liquidação de cartão de crédito'){role='CARD_SETTLEMENT';dreImpact=false}
    if(/^Renda Fixa - (Aplicação|Resgate) em CDB/i.test(t.description||'')){role='INVESTMENT_TRANSFER';dreImpact=false;c.category='Transferência entre contas próprias'}
    const titleRule=await pool.query(`SELECT custom_title FROM title_rewrite_rules WHERE company_id=$1 AND active=true AND ((normalized_party IS NOT NULL AND upper(normalized_party)=upper($2)) OR (normalized_party IS NULL AND upper($3) LIKE upper(pattern))) ORDER BY normalized_party NULLS LAST LIMIT 1`,[cid,c.normalized_party||'',t.description||''])
    const ins=await pool.query(`INSERT INTO transactions(company_id,source_file_id,occurred_at,competence_at,due_at,paid_at,description,custom_title,normalized_party,counterparty_document,direction,amount,gross_amount,fee_amount,net_amount,category,account_id,classification_confidence,classification_status,classification_source,payment_method,financial_status,dre_impact,cash_impact,accounting_role,external_id,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb) RETURNING id`,[cid,sourceFileId,t.occurredAt,t.competenceAt||t.occurredAt,t.dueAt||null,t.paidAt||null,t.description,titleRule.rows[0]?.custom_title||null,c.normalized_party,c.counterparty_document,t.direction,t.amount,t.grossAmount??null,t.feeAmount??null,t.netAmount??null,c.category,c.account_id,c.confidence,c.status,c.source,t.paymentMethod||paymentMethod(t.description),financialStatus,dreImpact,cashImpact,role,t.externalId||null,JSON.stringify(t.raw||{})])
    if(parsed.kind==='PAGBANK_SALES'&&n(t.feeAmount)>0){
      const feeAccount=await ensureAccountForCategory(cid,'Taxas bancárias e financeiras','SAIDA')
      await pool.query(`INSERT INTO transactions(company_id,source_file_id,occurred_at,competence_at,description,normalized_party,direction,amount,category,account_id,classification_confidence,classification_status,classification_source,payment_method,financial_status,dre_impact,cash_impact,accounting_role,economic_key,raw) VALUES($1,$2,$3,$4,$5,'PAGBANK','SAIDA',$6,'Taxas bancárias e financeiras',$7,100,'AUTO','PARSER',$8,'PAID',true,false,'FEE',$9,$10::jsonb)`,[cid,sourceFileId,t.occurredAt,t.competenceAt||t.occurredAt,`Taxa PagBank — ${t.description}`,-Math.abs(n(t.feeAmount)),feeAccount?.id||null,t.paymentMethod||paymentMethod(t.description),ins.rows[0].id,JSON.stringify({source:'pagbank_sales_fee',parentTransactionId:ins.rows[0].id})])
    }
    insertedForFile++
  }
  await applyTitleRules(cid)
  return insertedForFile
}

function payableFingerprint(cid:any,row:any){return crypto.createHash('sha256').update([cid,row.originType||'',row.supplier||'',row.description||'',row.issueDate||'',row.dueDate||'',Number(row.amount||0).toFixed(2),row.invoiceRef||''].join('|')).digest('hex')}
function normalizeHeader(v:any){return normalize(String(v||'')).replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')}
function payableNumber(v:any){if(typeof v==='number')return Math.abs(v);const x=String(v??'').replace(/R\$\s?/gi,'').replace(/\s/g,'');const y=x.includes(',')?x.replace(/\./g,'').replace(',','.'):x;return Math.abs(Number(y.replace(/[^0-9.-]/g,''))||0)}
function payableDate(v:any){if(!v)return null;if(v instanceof Date&&!Number.isNaN(v.getTime()))return toDateOnly(v);const s=String(v).trim(),br=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(br)return`${br[3]}-${pad(br[2])}-${pad(br[1])}`;const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return iso?`${iso[1]}-${iso[2]}-${iso[3]}`:null}
function parsePayablesSpreadsheet(buffer:Buffer){
  const wb=XLSX.read(buffer,{type:'buffer',cellDates:true}),out:any[]=[]
  const aliases:any={supplier:['FORNECEDOR','FAVORECIDO','BENEFICIARIO','RAZAO_SOCIAL','NOME'],document:['CNPJ','CPF','DOCUMENTO','CPF_CNPJ'],description:['DESCRICAO','HISTORICO','TITULO','DOCUMENTO_DESCRICAO'],issue:['DATA_EMISSAO','EMISSAO','DATA'],due:['VENCIMENTO','DATA_VENCIMENTO','DT_VENCIMENTO'],amount:['VALOR','VALOR_TITULO','VLR','TOTAL'],category:['CATEGORIA','CLASSIFICACAO','PLANO_DE_CONTAS','CONTA'],payment:['FORMA_PAGAMENTO','MEIO_PAGAMENTO'],invoice:['NUMERO','NUMERO_DOCUMENTO','NF','NOTA_FISCAL','CODIGO']}
  for(const sheet of wb.SheetNames){const rows:any[]=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{defval:''});if(!rows.length)continue;const headers=Object.keys(rows[0]),find=(key:string)=>headers.find(h=>aliases[key].includes(normalizeHeader(h)))
    const cols:any={};for(const k of Object.keys(aliases))cols[k]=find(k)
    if(!cols.due||!cols.amount)continue
    for(const r of rows){const amount=payableNumber(r[cols.amount]);const dueDate=payableDate(r[cols.due]);if(!amount||!dueDate)continue;out.push({originType:'SYSTEM_EXCEL',supplier:String(r[cols.supplier]||'').trim(),supplierDocument:String(r[cols.document]||'').trim(),description:String(r[cols.description]||r[cols.supplier]||'Conta a pagar').trim(),issueDate:payableDate(r[cols.issue])||dueDate,dueDate,amount,category:String(r[cols.category]||'').trim()||null,paymentMethod:String(r[cols.payment]||'').trim()||null,invoiceRef:String(r[cols.invoice]||'').trim()||null,raw:{sheet,row:r}})}
  }
  return out
}
async function ensurePayableTransaction(cid:any,p:any,company:any){
  if(p.transactionId)return p.transactionId
  const issue=p.issueDate||p.dueDate,amount=-Math.abs(n(p.amount)),desc=p.description||p.supplier||'Conta a pagar'
  const existing=await pool.query(`SELECT id FROM transactions WHERE company_id=$1 AND direction='SAIDA' AND abs(amount-$2::numeric)<0.01 AND COALESCE(competence_at,occurred_at::date)=$3::date AND upper(description)=upper($4) LIMIT 1`,[cid,amount,issue,desc])
  if(existing.rowCount)return existing.rows[0].id
  const fake={description:desc,amount,direction:'SAIDA'},c=await classify(fake,cid,company),category=p.category||c.category,account=p.accountId?{id:p.accountId}:await ensureAccountForCategory(cid,category,'SAIDA')
  const r=await pool.query(`INSERT INTO transactions(company_id,source_file_id,occurred_at,competence_at,due_at,description,normalized_party,counterparty_document,direction,amount,category,account_id,classification_confidence,classification_status,classification_source,payment_method,financial_status,dre_impact,cash_impact,accounting_role,raw) VALUES($1,$2,$3::date,$3::date,$4::date,$5,$6,$7,'SAIDA',$8,$9,$10,$11,$12,$13,$14,'OPEN',true,false,'PAYABLE',$15::jsonb) RETURNING id`,[cid,p.sourceFileId||null,issue,p.dueDate,desc,c.normalized_party,p.supplierDocument||c.counterparty_document,amount,category,account?.id||c.account_id||null,p.category?100:c.confidence,p.category?'CONFIRMED':c.status,p.category?'PAYABLE_IMPORT':c.source,p.paymentMethod||null,JSON.stringify({source:'payables',originType:p.originType,invoiceRef:p.invoiceRef})])
  return r.rows[0].id
}
async function insertPayable(cid:any,row:any,company:any){
  const dueDate=payableDate(row.dueDate),issueDate=payableDate(row.issueDate)||dueDate;if(!dueDate||!n(row.amount))return{inserted:false,reason:'missing_data'}
  const supplier=String(row.supplier||row.description||'').trim(),fake={description:row.description||supplier||'Conta a pagar',amount:-Math.abs(n(row.amount)),direction:'SAIDA'},c=await classify(fake,cid,company),category=row.category||c.category,account=row.accountId?{id:row.accountId}:await ensureAccountForCategory(cid,category,'SAIDA')
  const payload={...row,supplier,issueDate,dueDate,amount:Math.abs(n(row.amount)),category,accountId:account?.id||c.account_id||null},fingerprint=payableFingerprint(cid,payload)
  const txId=await ensurePayableTransaction(cid,{...payload,transactionId:row.transactionId},company)
  if(txId&&category&&category!=='A classificar')await pool.query(`UPDATE transactions SET category=$3,account_id=COALESCE($4,account_id),classification_status=CASE WHEN $4::uuid IS NOT NULL THEN 'CONFIRMED' ELSE classification_status END,classification_source=CASE WHEN $4::uuid IS NOT NULL THEN 'PAYABLE_IMPORT' ELSE classification_source END WHERE id=$1 AND company_id=$2`,[txId,cid,category,payload.accountId||null])
  const r=await pool.query(`INSERT INTO payables(company_id,source_file_id,transaction_id,origin_type,supplier,supplier_document,description,issue_date,due_date,amount,category,account_id,classification_status,classification_source,payment_status,payment_method,invoice_ref,fingerprint,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb) ON CONFLICT(company_id,fingerprint) DO NOTHING RETURNING id`,[cid,row.sourceFileId||null,txId,row.originType||'MANUAL',supplier||null,row.supplierDocument||null,row.description||supplier||'Conta a pagar',issueDate,dueDate,payload.amount,category,payload.accountId,row.category?'CONFIRMED':c.status,row.category?'PAYABLE_IMPORT':c.source,row.paymentStatus||'OPEN',row.paymentMethod||null,row.invoiceRef||null,fingerprint,JSON.stringify(row.raw||{})])
  return{inserted:Boolean(r.rowCount),id:r.rows[0]?.id,transactionId:txId}
}

async function buildDre(cid:any,range:any){
  if(range?.period){const closed=await pool.query(`SELECT snapshot FROM period_closures WHERE company_id=$1 AND period_key=$2 AND status='CLOSED' LIMIT 1`,[cid,range.period]);if(closed.rowCount&&closed.rows[0]?.snapshot?.dre)return closed.rows[0].snapshot.dre}
  const accounts=await getChartAccounts(cid,{includeGroups:false}),sums=await pool.query(`SELECT account_id,COALESCE(sum(amount),0)::numeric AS total FROM transactions WHERE company_id=$1 AND account_id IS NOT NULL AND dre_impact=true AND competence_at BETWEEN $2::date AND $3::date GROUP BY account_id`,[cid,range.from,range.to]),sumMap=new Map<any,number>(sums.rows.map((r:any)=>[r.account_id,n(r.total)])),sectionOrder=new Map<any,number>(DRE_SECTIONS.map((x:any)=>[x[0],Number(x[2])])),sections=DRE_SECTIONS.filter(x=>x[0]!=='FORA_DRE').map(([key,label,order])=>({key,label,order,accounts:[],total:0})),sectionMap=new Map(sections.map(s=>[s.key,s]))
  for(const a of accounts){if(!a.dre_section||a.dre_section==='FORA_DRE')continue;const sec=sectionMap.get(a.dre_section)||sectionMap.get('OUTRAS_RECEITAS_DESPESAS'),amount=Number(sumMap.get(a.id)||0);sec.accounts.push({id:a.id,code:a.code,name:a.name,amount,order:a.dre_order});sec.total=Number(sec.total)+amount}
  for(const s of sections)s.accounts.sort((a,b)=>a.order-b.order||String(a.code||'').localeCompare(String(b.code||'')));sections.sort((a,b)=>(sectionOrder.get(a.key)||100)-(sectionOrder.get(b.key)||100));const result=sections.reduce((a,s)=>a+s.total,0),revenue=sectionMap.get('RECEITA_BRUTA')?.total||0;return{sections,result,revenue,period:range}
}
async function buildDreComparative(cid:any,year:any){
  const y=Number(year)||new Date().getFullYear(),monthDres=[]
  for(let m=1;m<=12;m++){const last=new Date(y,m,0).getDate(),period=`${y}-${pad(m)}`;monthDres.push(await buildDre(cid,{from:`${period}-01`,to:`${period}-${pad(last)}`,period}))}
  const baseAccounts=await getChartAccounts(cid,{includeGroups:false}),keys=DRE_SECTIONS.filter(x=>x[0]!=='FORA_DRE')
  const sections=keys.map(([key,label,order])=>({key,label,order,months:Array(12).fill(0),accounts:baseAccounts.filter((a:any)=>a.active&&a.dre_section===key).sort((a:any,b:any)=>n(a.dre_order)-n(b.dre_order)||String(a.code||'').localeCompare(String(b.code||''))).map((a:any)=>({id:a.id,code:a.code,name:a.name,months:Array(12).fill(0)}))}))
  for(let i=0;i<12;i++){
    for(const sec of monthDres[i].sections||[]){
      const target=sections.find((x:any)=>x.key===sec.key);if(!target)continue;target.months[i]=n(sec.total)
      for(const a of sec.accounts||[]){const ta=target.accounts.find((x:any)=>x.id===a.id);if(ta)ta.months[i]=n(a.amount)}
    }
  }
  const result=monthDres.map(d=>n(d.result));return{year:y,sections,result}
}

async function autoExpectedSource(cid:any,kind:any){const labels={NUBANK_STATEMENT:'Nubank — Conta',NUBANK_CARD:'Nubank — Cartão',PAGBANK_STATEMENT:'PagBank — Conta',PAGBANK_SALES:'PagBank — Vendas',TABULAR:'Planilha financeira'};if(!labels[kind])return;await pool.query(`INSERT INTO expected_sources(company_id,kind,label) VALUES($1,$2,$3) ON CONFLICT(company_id,kind) DO NOTHING`,[cid,kind,labels[kind]])}
async function sourceHealth(cid:any,range:any){
  const expected=await pool.query(`SELECT id,kind,label,active FROM expected_sources WHERE company_id=$1 AND active=true ORDER BY label`,[cid]),files=await pool.query(`SELECT id,name,kind,status,status_detail,record_count,confidence,validation_status,validation,period_start,period_end,created_at FROM source_files WHERE company_id=$1 AND (period_start IS NULL OR period_end IS NULL OR (period_start<=$3::date AND period_end>=$2::date)) ORDER BY created_at DESC`,[cid,range.from,range.to])
  const list=expected.rows.map(e=>{const matches=files.rows.filter(f=>f.kind===e.kind&&(!f.period_start||!f.period_end||(toDateOnly(f.period_start)<=range.to&&toDateOnly(f.period_end)>=range.from)));const best=matches[0];return{...e,state:!best?'MISSING':best.status==='IMPORTED'&&best.validation_status!=='MISMATCH'?'OK':'REVIEW',file:best||null}})
  return{expected:list,files:files.rows,missing:list.filter(x=>x.state==='MISSING').length,review:list.filter(x=>x.state==='REVIEW').length}
}

async function createReconciliationLinks(cid:any,range:any){
  const events=await pool.query(`SELECT id,competence_at,occurred_at,amount,net_amount,accounting_role,description FROM transactions WHERE company_id=$1 AND competence_at BETWEEN $2::date AND $3::date ORDER BY competence_at,id`,[cid,range.from,range.to])
  const sales=events.rows.filter(x=>x.accounting_role==='SALES_EVENT'),receipts=events.rows.filter(x=>['CASH_RECEIPT'].includes(x.accounting_role)),used=new Set();let made=0
  for(const s of sales){const target=n(s.net_amount)||n(s.amount);let best=null,bestDiff=99;for(const r of receipts){if(used.has(r.id))continue;const diff=Math.abs(n(r.amount)-target);const days=Math.abs((new Date(r.occurred_at||r.competence_at).getTime()-new Date(s.occurred_at||s.competence_at).getTime())/86400000);if(diff<=0.02&&days<=10&&days<bestDiff){best=r;bestDiff=days}}if(best){used.add(best.id);await pool.query(`INSERT INTO reconciliation_links(company_id,left_transaction_id,right_transaction_id,match_type,confidence) VALUES($1,$2,$3,'SALE_RECEIPT',$4) ON CONFLICT DO NOTHING`,[cid,s.id,best.id,Math.max(90,100-bestDiff)]);made++}}
  return made
}
async function bridgeDiagnostics(cid:any,range:any){
  const [events,links,ignores]=await Promise.all([
    pool.query(`SELECT id,competence_at,occurred_at,due_at,description,amount,direction,accounting_role,category FROM transactions WHERE company_id=$1 AND competence_at BETWEEN $2::date AND $3::date AND accounting_role IN ('SALES_EVENT','CARD_PURCHASE','TRANSFER') ORDER BY competence_at,id`,[cid,range.from,range.to]),
    pool.query(`SELECT left_transaction_id,right_transaction_id FROM reconciliation_links WHERE company_id=$1`,[cid]),
    pool.query(`SELECT transaction_id FROM reconciliation_ignores WHERE company_id=$1`,[cid])
  ])
  const linkedLeft=new Map(links.rows.map((x:any)=>[String(x.left_transaction_id),String(x.right_transaction_id)])),ignored=new Set(ignores.rows.map((x:any)=>String(x.transaction_id))),details:any[]=[]
  const txById=new Map(events.rows.map((x:any)=>[String(x.id),x]))
  for(const t of events.rows.filter((x:any)=>x.accounting_role==='SALES_EVENT')){
    if(ignored.has(String(t.id)))continue
    const rightId=linkedLeft.get(String(t.id))
    let right:any=rightId?txById.get(rightId):null
    if(rightId&&!right){const rr=await pool.query(`SELECT id,description,amount,occurred_at,competence_at FROM transactions WHERE company_id=$1 AND id=$2 LIMIT 1`,[cid,rightId]);right=rr.rows[0]||null}
    let candidates:any[]=[]
    if(!right){const c=await pool.query(`SELECT id,description,amount,occurred_at,competence_at FROM transactions WHERE company_id=$1 AND id<>$2 AND cash_impact=true AND direction='ENTRADA' AND abs(abs(amount)-$3::numeric)<=0.05 AND abs(COALESCE(occurred_at::date,competence_at)-$4::date)<=10 ORDER BY abs(COALESCE(occurred_at::date,competence_at)-$4::date),id LIMIT 6`,[cid,t.id,Math.abs(n(t.amount)),toDateOnly(t.occurred_at||t.competence_at)]);candidates=c.rows}
    details.push({id:`sale:${t.id}`,type:'SALE_RECEIPT',label:'Venda → recebimento',transactionId:t.id,date:toDateOnly(t.competence_at),leftDescription:t.description,leftAmount:n(t.amount),status:rightId?'FOUND':'MISSING',rightId,rightDescription:right?.description||null,rightAmount:right?n(right.amount):null,reason:rightId?'Venda vinculada ao recebimento correspondente.':candidates.length?'Encontramos possíveis recebimentos, mas nenhum vínculo seguro foi confirmado.':'Encontramos a venda, mas não localizamos uma entrada correspondente no período esperado.',candidates})
  }
  const cards=events.rows.filter((x:any)=>x.accounting_role==='CARD_PURCHASE'&&x.due_at&&!ignored.has(String(x.id))),byDue=new Map<string,any[]>()
  for(const t of cards){const k=toDateOnly(t.due_at)||'sem-data',a=byDue.get(k)||[];a.push(t);byDue.set(k,a)}
  for(const [due,items] of byDue){const total=items.reduce((a:any,x:any)=>a+Math.abs(n(x.amount)),0),sett=await pool.query(`SELECT id,description,amount,occurred_at,competence_at FROM transactions WHERE company_id=$1 AND accounting_role='CARD_SETTLEMENT' AND abs(abs(amount)-$2::numeric)<=0.05 AND abs(COALESCE(occurred_at::date,competence_at)-$3::date)<=10 ORDER BY abs(COALESCE(occurred_at::date,competence_at)-$3::date) LIMIT 6`,[cid,total,due]),found=sett.rows[0]
    details.push({id:`card:${due}`,type:'CARD_SETTLEMENT',label:'Fatura do cartão → pagamento',transactionId:items[0]?.id,date:due,leftDescription:`${items.length} compra(s) com vencimento ${due}`,leftAmount:-total,status:found?'FOUND':'MISSING',rightId:found?.id||null,rightDescription:found?.description||null,rightAmount:found?n(found.amount):null,reason:found?'O pagamento da fatura foi localizado e o valor fecha com as compras.':sett.rows.length?'Há possíveis pagamentos, mas o valor não fecha exatamente com a fatura.':'As compras da fatura foram encontradas, mas não localizamos o pagamento correspondente.',candidates:sett.rows})
  }
  const usedTransfers=new Set<string>()
  for(const t of events.rows.filter((x:any)=>x.accounting_role==='TRANSFER')){
    if(ignored.has(String(t.id))||usedTransfers.has(String(t.id)))continue
    const cand=await pool.query(`SELECT id,description,amount,occurred_at,competence_at FROM transactions WHERE company_id=$1 AND id<>$2 AND accounting_role='TRANSFER' AND direction<>$3 AND abs(abs(amount)-$4::numeric)<=0.01 AND abs(COALESCE(occurred_at::date,competence_at)-$5::date)<=2 ORDER BY abs(COALESCE(occurred_at::date,competence_at)-$5::date) LIMIT 6`,[cid,t.id,t.direction,Math.abs(n(t.amount)),toDateOnly(t.occurred_at||t.competence_at)]),found=cand.rows.find((x:any)=>!usedTransfers.has(String(x.id)))||null
    usedTransfers.add(String(t.id));if(found)usedTransfers.add(String(found.id))
    details.push({id:`transfer:${t.id}`,type:'OWN_TRANSFER',label:'Transferência entre contas',transactionId:t.id,date:toDateOnly(t.competence_at),leftDescription:t.description,leftAmount:n(t.amount),status:found?'FOUND':'MISSING',rightId:found?.id||null,rightDescription:found?.description||null,rightAmount:found?n(found.amount):null,reason:found?'A contrapartida da transferência foi localizada.':'Encontramos apenas um lado da transferência entre contas próprias.',candidates:found?[found]:cand.rows})
  }
  return details.slice(0,100)
}
async function reconciliationSummary(cid:any,range:any){
  await createReconciliationLinks(cid,range)
  const [groups,links,events,health,bridges]=await Promise.all([getReviewGroups(cid,range),pool.query(`SELECT rl.id,rl.confidence,rl.match_type,l.description left_description,l.amount left_amount,r.description right_description,r.amount right_amount FROM reconciliation_links rl JOIN transactions l ON l.id=rl.left_transaction_id JOIN transactions r ON r.id=rl.right_transaction_id WHERE rl.company_id=$1 AND l.competence_at BETWEEN $2::date AND $3::date ORDER BY rl.created_at DESC LIMIT 30`,[cid,range.from,range.to]),pool.query(`SELECT count(*)::int n FROM transactions WHERE company_id=$1 AND competence_at BETWEEN $2::date AND $3::date`,[cid,range.from,range.to]),sourceHealth(cid,range),bridgeDiagnostics(cid,range)])
  const bridgeFound=bridges.filter((x:any)=>x.status==='FOUND').length,bridgeMissing=bridges.filter((x:any)=>x.status==='MISSING').length
  return{pending:groups.length,totalTransactions:n(events.rows[0]?.n),matches:links.rows,matched:links.rowCount,sourceHealth:health,bridgesExpected:bridges.length,bridgesFound:bridgeFound,bridgesMissing:bridgeMissing,bridgeDetails:bridges}
}

async function periodStatus(cid:any,range:any){
  const [health,groups,rec,unclassifiedValue,closed]=await Promise.all([sourceHealth(cid,range),getReviewGroups(cid,range),reconciliationSummary(cid,range),pool.query(`SELECT COALESCE(sum(abs(amount)),0)::numeric total FROM transactions WHERE company_id=$1 AND competence_at BETWEEN $2::date AND $3::date AND classification_status IN ('PENDING','SUGGESTED')`,[cid,range.from,range.to]),range.period?isClosed(cid,range.period):false])
  const fileReview=health.files.filter(f=>f.status!=='IMPORTED'||f.validation_status==='MISMATCH').length,pending=groups.length,missing=health.missing,hasData=health.files.length>0,penalty=Math.min(100,(hasData?0:100)+missing*20+fileReview*12+pending*3),quality=Math.max(0,100-penalty),ready=hasData&&missing===0&&fileReview===0&&pending===0
  return{period:range.period,quality,ready,closed,unclassifiedValue:n(unclassifiedValue.rows[0]?.total),steps:{files:{state:missing||fileReview?'WARN':'OK',text:!hasData?'Nenhum arquivo recebido':missing?`${missing} fonte(s) faltando`:fileReview?`${fileReview} arquivo(s) para revisar`:`${health.expected.length||health.files.length} fonte(s) conferidas`},transactions:{state:pending?'WARN':'OK',text:pending?`${pending} nome(s) para classificar`:'Classificações em dia'},reconciliation:{state:pending||missing?'WARN':'OK',text:pending?`${pending} pendência(s) — mesmas de Lançamentos`:'Sem pendências de classificação'},management:{state:ready?'OK':'WAIT',text:closed?'Período fechado':ready?'Pronto para fechar':'Aguardando conferência'}},sourceHealth:health,reconciliation:rec}
}


app.get('/api/auth/status',async(req,res)=>{
  if(!pool)return res.json({ready:false,masterEmail:masterEmail(),masterReady:false})
  const r=await pool.query(`SELECT password_hash IS NOT NULL AS ready FROM users WHERE lower(email)=lower($1) LIMIT 1`,[masterEmail()])
  res.json({ready:true,masterEmail:masterEmail(),masterReady:Boolean(r.rows[0]?.ready)})
})
app.post('/api/auth/login',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado.'})
  const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'')
  const r=await pool.query(`SELECT id,email,name,password_hash,role,status FROM users WHERE lower(email)=lower($1) LIMIT 1`,[email])
  const user=r.rows[0]
  if(!user||user.status!=='ACTIVE'||!verifyPassword(password,user.password_hash))return res.status(401).json({message:'E-mail ou senha inválidos.'})
  const session=await createSession(user.id)
  await pool.query(`UPDATE users SET last_login_at=now(),updated_at=now() WHERE id=$1`,[user.id])
  const payload=await authPayload({id:user.id,email:user.email,name:user.name,role:user.role,status:user.status})
  res.json({token:session.token,expiresAt:session.expiresAt,...payload})
})
app.post('/api/auth/register',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado.'})
  const {name,password,companyName}=req.body,email=String(req.body.email||'').trim().toLowerCase()
  if(email===masterEmail())return res.status(409).json({message:'O usuário master é ativado pelas variáveis seguras do Railway.'})
  const exists=await pool.query(`SELECT 1 FROM users WHERE lower(email)=lower($1) LIMIT 1`,[email])
  if(exists.rowCount)return res.status(409).json({message:'Já existe uma conta com este e-mail.'})
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    const company=await client.query(`INSERT INTO companies(name,active,is_demo) VALUES($1,true,false) RETURNING id,name,document,sector,activity,active`,[companyName])
    const user=await client.query(`INSERT INTO users(email,name,password_hash,role,status) VALUES($1,$2,$3,'ADMIN','ACTIVE') RETURNING id,email,name,role,status`,[email,name,hashPassword(password)])
    await client.query(`INSERT INTO user_companies(user_id,company_id,role) VALUES($1,$2,'ADMIN')`,[user.rows[0].id,company.rows[0].id])
    await client.query('COMMIT')
    await ensureDefaultChart(company.rows[0].id)
    await linkMasterToCompany(company.rows[0].id)
    const session=await createSession(user.rows[0].id)
    const payload=await authPayload(user.rows[0])
    res.json({token:session.token,expiresAt:session.expiresAt,...payload})
  }catch(e:any){await client.query('ROLLBACK');console.error('register',e);res.status(400).json({message:'Não foi possível criar a conta.'})}finally{client.release()}
})
app.get('/api/auth/me',async(req,res)=>res.json(await authPayload(req.auth)))
app.post('/api/auth/logout',async(req,res)=>{await destroySession(bearerToken(req));res.json({ok:true})})

app.get('/api/admin/companies',async(req,res)=>{
  const r=await pool.query(`SELECT c.id,c.name,c.document,c.sector,c.activity,c.active,c.created_at,count(uc.user_id)::int user_count
    FROM companies c LEFT JOIN user_companies uc ON uc.company_id=c.id
    WHERE COALESCE(c.is_demo,false)=false GROUP BY c.id ORDER BY c.active DESC,c.name`)
  res.json(r.rows)
})
app.post('/api/admin/companies',async(req,res)=>{
  const {name,document='',sector='',activity=''}=req.body
  const r=await pool.query(`INSERT INTO companies(name,document,sector,activity,active,is_demo) VALUES($1,$2,$3,$4,true,false) RETURNING id,name,document,sector,activity,active`,[name,document,sector,activity])
  await ensureDefaultChart(r.rows[0].id);await linkMasterToCompany(r.rows[0].id)
  res.json(r.rows[0])
})
app.patch('/api/admin/companies/:id',async(req,res)=>{
  const {name,document,sector,activity,active}=req.body
  const r=await pool.query(`UPDATE companies SET name=COALESCE(NULLIF($2,''),name),document=COALESCE($3,document),sector=COALESCE($4,sector),activity=COALESCE($5,activity),active=COALESCE($6,active) WHERE id=$1 AND COALESCE(is_demo,false)=false RETURNING id,name,document,sector,activity,active`,[req.params.id,name??'',document??null,sector??null,activity??null,active??null])
  if(!r.rowCount)return res.status(404).json({message:'Empresa não encontrada.'});res.json(r.rows[0])
})
app.get('/api/admin/users',async(req,res)=>{
  const r=await pool.query(`SELECT u.id,u.email,u.name,u.role,u.status,u.last_login_at,u.created_at,
    COALESCE(json_agg(json_build_object('id',c.id,'name',c.name,'role',uc.role) ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL),'[]'::json) companies
    FROM users u LEFT JOIN user_companies uc ON uc.user_id=u.id LEFT JOIN companies c ON c.id=uc.company_id AND COALESCE(c.is_demo,false)=false
    GROUP BY u.id ORDER BY CASE WHEN u.role='MASTER' THEN 0 ELSE 1 END,u.name`)
  res.json(r.rows)
})
app.post('/api/admin/users',async(req,res)=>{
  const {name,password,role,companyIds}=req.body,email=String(req.body.email||'').trim().toLowerCase()
  if(role==='MASTER'&&email!==masterEmail())return res.status(400).json({message:'O perfil MASTER está reservado ao usuário master configurado.'})
  try{
    const r=await pool.query(`INSERT INTO users(email,name,password_hash,role,status) VALUES($1,$2,$3,$4,'ACTIVE') RETURNING id,email,name,role,status`,[email,name,hashPassword(password),role])
    for(const cid of companyIds||[])await pool.query(`INSERT INTO user_companies(user_id,company_id,role) SELECT $1,id,$3 FROM companies WHERE id=$2 AND active=true ON CONFLICT(user_id,company_id) DO UPDATE SET role=excluded.role`,[r.rows[0].id,cid,role])
    res.json(r.rows[0])
  }catch(e:any){res.status(400).json({message:e.code==='23505'?'Já existe um usuário com este e-mail.':'Não foi possível criar o usuário.'})}
})
app.patch('/api/admin/users/:id',async(req,res)=>{
  const current=await pool.query(`SELECT id,email,role FROM users WHERE id=$1 LIMIT 1`,[req.params.id]);if(!current.rowCount)return res.status(404).json({message:'Usuário não encontrado.'})
  const isPrimaryMaster=String(current.rows[0].email).toLowerCase()===masterEmail()
  const {name,role,status,password,companyIds}=req.body
  if(isPrimaryMaster&&(role&&role!=='MASTER'||status&&status!=='ACTIVE'))return res.status(400).json({message:'O usuário master principal deve permanecer ativo como MASTER.'})
  const nextRole=isPrimaryMaster?'MASTER':(role||current.rows[0].role)
  await pool.query(`UPDATE users SET name=COALESCE(NULLIF($2,''),name),role=$3,status=COALESCE($4,status),password_hash=CASE WHEN $5::text IS NULL THEN password_hash ELSE $5 END,updated_at=now() WHERE id=$1`,[req.params.id,name??'',nextRole,status??null,password?hashPassword(password):null])
  if(Array.isArray(companyIds)){
    await pool.query(`DELETE FROM user_companies WHERE user_id=$1`,[req.params.id])
    for(const cid of companyIds)await pool.query(`INSERT INTO user_companies(user_id,company_id,role) SELECT $1,id,$3 FROM companies WHERE id=$2 AND active=true ON CONFLICT DO NOTHING`,[req.params.id,cid,nextRole])
    if(isPrimaryMaster)await pool.query(`INSERT INTO user_companies(user_id,company_id,role) SELECT $1,id,'MASTER' FROM companies WHERE active=true AND COALESCE(is_demo,false)=false ON CONFLICT(user_id,company_id) DO UPDATE SET role='MASTER'`,[req.params.id])
  }
  res.json({ok:true})
})

app.get('/api/company',async(req,res)=>{if(!pool)return res.json(demo.company);res.json(await getCompany(req.companyId))})
app.put('/api/company',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,{name,document,sector,activity}=req.body;await pool.query(`UPDATE companies SET name=COALESCE(NULLIF($2,''),name),document=COALESCE($3,document),sector=$4,activity=$5 WHERE id=$1`,[cid,name||'',document??null,sector??null,activity??null]);await auditSafe(cid,'COMPANY_UPDATED','company',cid,{sector,activity});res.json(await getCompany(cid))})
app.get('/api/categories',async(req,res)=>{if(!pool)return res.json(['Receita de vendas','Embalagens','Outras despesas']);const cid=req.companyId,rows=await getChartAccounts(cid,{includeGroups:false});res.json(rows.filter(a=>a.active).map(a=>a.name))})

app.get('/api/chart-accounts',async(req,res)=>{if(!pool)return res.json([]);res.json(await getChartAccounts(req.companyId,{includeInactive:true,includeGroups:true}))})
app.post('/api/chart-accounts',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,{code,name,parentId=null,accountType='EXPENSE',dreSection='DESPESAS_OPERACIONAIS',isGroup=false}=req.body;if(!name)return res.status(400).json({message:'Informe o nome da conta.'});try{const maxOrder=await pool.query(`SELECT COALESCE(max(dre_order),100) AS m FROM chart_accounts WHERE company_id=$1`,[cid]),r=await pool.query(`INSERT INTO chart_accounts(company_id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active) VALUES($1,NULLIF($2,''),$3,$4,$5,$6,$7,$8,true) RETURNING id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active`,[cid,code||'',name,parentId||null,accountType,isGroup?null:dreSection,n(maxOrder.rows[0]?.m)+1,Boolean(isGroup)]);await auditSafe(cid,'CHART_ACCOUNT_CREATED','chart_account',r.rows[0].id,r.rows[0]);res.json(r.rows[0])}catch(e){res.status(400).json({message:e.code==='23505'?'Já existe uma conta com esse código.':'Não foi possível criar a conta.'})}})
app.put('/api/chart-accounts/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,{code,name,parentId=null,accountType,dreSection,isGroup,active}=req.body,r=await pool.query(`UPDATE chart_accounts SET code=NULLIF($3,''),name=COALESCE(NULLIF($4,''),name),parent_id=$5,account_type=COALESCE($6,account_type),dre_section=CASE WHEN COALESCE($7,is_group) THEN NULL ELSE COALESCE($8,dre_section) END,is_group=COALESCE($7,is_group),active=COALESCE($9,active),updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active`,[req.params.id,cid,code??'',name??'',parentId||null,accountType??null,isGroup??null,dreSection??null,active??null]);if(!r.rowCount)return res.status(404).json({message:'Conta não encontrada.'});await auditSafe(cid,'CHART_ACCOUNT_UPDATED','chart_account',req.params.id,r.rows[0]);res.json(r.rows[0])})
app.delete('/api/chart-accounts/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId;await pool.query(`UPDATE chart_accounts SET active=false,updated_at=now() WHERE id=$1 AND company_id=$2`,[req.params.id,cid]);await auditSafe(cid,'CHART_ACCOUNT_DISABLED','chart_account',req.params.id,{});res.json({ok:true})})

app.get('/api/company-accounts',async(req,res)=>{if(!pool)return res.json([]);res.json(await getCompanyAccounts(req.companyId))})
app.post('/api/company-accounts',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,{label,institution,document,bankCode,agency,account,aliases=[]}=req.body;if(!label)return res.status(400).json({message:'Informe um nome para a conta.'});const r=await pool.query(`INSERT INTO company_accounts(company_id,label,institution,document,bank_code,agency,account,aliases) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id,label,institution,document,bank_code,agency,account,aliases,active`,[cid,label,institution||null,document||null,bankCode||null,agency||null,account||null,JSON.stringify(Array.isArray(aliases)?aliases:[])]);await auditSafe(cid,'COMPANY_ACCOUNT_CREATED','company_account',r.rows[0].id,r.rows[0]);res.json(r.rows[0])})
app.delete('/api/company-accounts/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId;await pool.query(`UPDATE company_accounts SET active=false WHERE id=$1 AND company_id=$2`,[req.params.id,cid]);res.json({ok:true})})


function pricingHeader(v:any){return normalize(String(v||'')).replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')}
function pricingNumber(v:any){if(typeof v==='number')return v;const s=String(v??'').trim().replace(/R\$\s?/gi,'').replace(/\s/g,'');if(!s)return 0;const normalized=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;const out=Number(normalized);return Number.isFinite(out)?out:0}
function pricingWorkbookBuffer(rows:any[],lines:any[]=[],modelName='Precificação Clara'){
  const wb=XLSX.utils.book_new()
  const data=rows.map((r:any)=>({codigo:r.codigo||'',produto:r.produto||'',marca:r.marca||'',categoria:r.categoria||'',custo:Number(r.custo||0),preco_venda:Number(r.preco_venda||r.precoVenda||0),preco_sugerido:Number(r.preco_sugerido||r.precoSugerido||0),markup:Number(r.markup||0),margem_contribuicao_rs:Number(r.margem_contribuicao_rs||r.mcValue||0),margem_contribuicao_pct:Number(r.margem_contribuicao_pct||r.mcPct||0),status:r.status||'',observacao:r.observacao||''}))
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),'Produtos')
  if(lines?.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(lines.map((l:any)=>({despesa:l.name||l.nome||'',base:l.basis||l.base||'',valor:Number(l.value||l.valor||0)}))),'Lógica')
  const info=XLSX.utils.aoa_to_sheet([['Modelo',modelName],['Gerado em',new Date().toLocaleString('pt-BR')]])
  XLSX.utils.book_append_sheet(wb,info,'Informações')
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx'})
}

app.get('/api/pricing/models',async(req,res)=>{if(!pool)return res.json([]);const r=await pool.query(`SELECT id,name,mode,lines,target_margin,markup,active,created_at,updated_at FROM pricing_models WHERE company_id=$1 AND active=true ORDER BY name`,[req.companyId]);res.json(r.rows)})
app.post('/api/pricing/models',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const {name,mode='SALE',lines=[],targetMargin=20,markup=2}=req.body;const r=await pool.query(`INSERT INTO pricing_models(company_id,name,mode,lines,target_margin,markup) VALUES($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT(company_id,name) DO UPDATE SET mode=excluded.mode,lines=excluded.lines,target_margin=excluded.target_margin,markup=excluded.markup,active=true,updated_at=now() RETURNING *`,[req.companyId,name,mode,JSON.stringify(lines),targetMargin,markup]);await auditSafe(req.companyId,'PRICING_MODEL_SAVED','pricing_model',r.rows[0].id,{name});res.json(r.rows[0])})
app.put('/api/pricing/models/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const {name,mode='SALE',lines=[],targetMargin=20,markup=2}=req.body;const r=await pool.query(`UPDATE pricing_models SET name=$3,mode=$4,lines=$5::jsonb,target_margin=$6,markup=$7,updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING *`,[req.params.id,req.companyId,name,mode,JSON.stringify(lines),targetMargin,markup]);if(!r.rowCount)return res.status(404).json({message:'Modelo não encontrado.'});res.json(r.rows[0])})
app.delete('/api/pricing/models/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});await pool.query(`UPDATE pricing_models SET active=false,updated_at=now() WHERE id=$1 AND company_id=$2`,[req.params.id,req.companyId]);res.json({ok:true})})
app.get('/api/pricing/template',async(req,res)=>{const rows=[{codigo:'PROD001',produto:'Produto exemplo',custo:32.50,preco_venda:79.90,categoria:'Categoria exemplo',marca:'Marca exemplo',observacao:'Opcional'}],buffer=pricingWorkbookBuffer(rows,[],'Modelo de importação');res.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition','attachment; filename="modelo-precificacao-clara.xlsx"').send(buffer)})
app.post('/api/pricing/import',collectUploads,async(req,res)=>{const file=req.uploadedFiles?.[0];if(!file)return res.status(400).json({message:'Selecione uma planilha Excel.'});try{const wb=XLSX.read(file.buffer,{type:'buffer'}),ws=wb.Sheets[wb.SheetNames[0]],raw=XLSX.utils.sheet_to_json(ws,{defval:''}) as any[];if(!raw.length)return res.status(400).json({message:'A planilha não possui produtos.'});const rows=raw.map((row:any)=>{const m:any={};for(const [k,v] of Object.entries(row))m[pricingHeader(k)]=v;return{codigo:String(m.CODIGO||''),produto:String(m.PRODUTO||m.DESCRICAO_DO_ITEM||m.DESCRICAO||''),custo:pricingNumber(m.CUSTO),preco_venda:pricingNumber(m.PRECO_VENDA||m.PRECO||0),categoria:String(m.CATEGORIA||''),marca:String(m.MARCA||''),observacao:String(m.OBSERVACAO||m.OBSERVACOES||'')}}).filter((r:any)=>r.produto);if(!rows.length)return res.status(400).json({message:'Não encontramos a coluna produto. Baixe o modelo ou use um cabeçalho como Produto/Descrição do Item.'});const headers=Object.keys(raw[0]||{});res.json({rows,headers,count:rows.length,mapped:{produto:true,custo:rows.some((r:any)=>r.custo>0),precoVenda:rows.some((r:any)=>r.preco_venda>0)}})}catch(e:any){res.status(400).json({message:'Não foi possível ler a planilha.',detail:e?.message||String(e)})}})
app.post('/api/pricing/export',async(req,res)=>{const buffer=pricingWorkbookBuffer(req.body.rows||[],req.body.lines||[],req.body.modelName||'Precificação Clara');res.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition','attachment; filename="precificacao-clara.xlsx"').send(buffer)})
app.post('/api/pricing/market-compare',async(req,res)=>{const out=await compareMarketProducts(req.body);res.json(out)})

app.get('/api/payables',async(req,res)=>{if(!pool)return res.json({rows:[],summary:{},bySupplier:[],byCategory:[]});const cid=req.companyId,from=String(req.query.from||new Date().toISOString().slice(0,10)),to=String(req.query.to||new Date(Date.now()+120*86400000).toISOString().slice(0,10)),status=String(req.query.status||'');const params:any[]=[cid,from,to],where=[`p.company_id=$1`,`p.due_date BETWEEN $2::date AND $3::date`];if(status){params.push(status);where.push(`p.payment_status=$${params.length}`)}const r=await pool.query(`SELECT p.*,a.code account_code,a.name account_name,sf.name source_file_name,t.financial_status transaction_financial_status FROM payables p LEFT JOIN chart_accounts a ON a.id=p.account_id LEFT JOIN source_files sf ON sf.id=p.source_file_id LEFT JOIN transactions t ON t.id=p.transaction_id WHERE ${where.join(' AND ')} ORDER BY p.due_date,p.supplier,p.id`,params),today=new Date().toISOString().slice(0,10);for(const row of r.rows){if(row.transaction_financial_status==='PAID')row.payment_status='PAID';else if(row.payment_status==='OPEN'&&String(row.due_date).slice(0,10)<today)row.payment_status='OVERDUE'}const open=r.rows.filter((x:any)=>!['PAID'].includes(x.payment_status)),total=open.reduce((a:any,x:any)=>a+n(x.amount)-n(x.paid_amount),0),overdue=open.filter((x:any)=>String(x.due_date).slice(0,10)<today).reduce((a:any,x:any)=>a+n(x.amount)-n(x.paid_amount),0),by=(key:string)=>{const m=new Map<string,number>();for(const x of open){const k=String(x[key]||'Não informado');m.set(k,(m.get(k)||0)+n(x.amount)-n(x.paid_amount))}return[...m].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)};res.json({rows:r.rows,summary:{total,overdue,count:open.length},bySupplier:by('supplier'),byCategory:by('category')})})
app.get('/api/payables/template',async(req,res)=>{const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([['fornecedor','cnpj_cpf','descricao','data_emissao','vencimento','valor','categoria','forma_pagamento','numero_documento'],['Fornecedor Exemplo','12.345.678/0001-90','Compra de mercadoria','01/09/2026','15/09/2026',1250.50,'Compra de mercadoria / insumos','Boleto','NF-1234']]);XLSX.utils.book_append_sheet(wb,ws,'Contas a Pagar');const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});res.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition','attachment; filename="modelo-contas-a-pagar-clara.xlsx"').send(buffer)})
app.post('/api/payables/import',upload.array('files',30),async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});if(!req.uploadedFiles?.length)return res.status(400).json({message:'Nenhum arquivo recebido.'});const cid=req.companyId,company=await getCompany(cid),results:any[]=[];let inserted=0,duplicates=0;for(const f of req.uploadedFiles){try{const ext=path.extname(f.originalname).toLowerCase(),hash='payables-'+crypto.createHash('sha256').update(f.buffer).digest('hex');let rows:any[]=[],kind='PAYABLES_TABULAR';if(ext==='.pdf'){const parsed=await parsePdf(f.buffer);if(parsed.kind!=='NUBANK_CARD')throw new Error('Nesta tela, PDF deve ser uma fatura de cartão reconhecida. Para outros documentos use Arquivos.');kind='PAYABLES_CARD';rows=(parsed.transactions||[]).map((t:any)=>({originType:'CARD_INVOICE',supplier:t.description,description:t.description,issueDate:toDateOnly(t.occurredAt),dueDate:toDateOnly(t.dueAt),amount:Math.abs(n(t.amount)),paymentMethod:'Cartão de crédito',invoiceRef:f.originalname,raw:t.raw}))}else if(['.xlsx','.xls','.csv'].includes(ext)){rows=parsePayablesSpreadsheet(f.buffer)}else throw new Error('Formato não suportado.');if(!rows.length)throw new Error('Nenhuma conta a pagar foi reconhecida.');let sf=await pool.query(`SELECT id FROM source_files WHERE company_id=$1 AND hash=$2 LIMIT 1`,[cid,hash]);if(!sf.rowCount)sf=await pool.query(`INSERT INTO source_files(company_id,name,hash,kind,status,status_detail,record_count,confidence,validation_status,content,mime_type,import_scope) VALUES($1,$2,$3,$4,'IMPORTED','Importado em Contas a Pagar',$5,95,'NOT_AVAILABLE',$6,$7,'PAYABLES') RETURNING id`,[cid,f.originalname,hash,kind,rows.length,f.buffer,f.mimetype]);let fileInserted=0;for(const row of rows){const out=await insertPayable(cid,{...row,sourceFileId:sf.rows[0].id},company);out.inserted?(inserted++,fileInserted++):duplicates++}results.push({name:f.originalname,status:'IMPORTED',records:fileInserted,duplicates:rows.length-fileInserted})}catch(e:any){results.push({name:f.originalname,status:'ERROR',detail:e?.message||String(e)})}}await applyAccountingPolicy(cid);res.json({message:`Contas a Pagar: ${inserted} título(s) importado(s)${duplicates?`, ${duplicates} duplicado(s) ignorado(s)`:''}.`,inserted,duplicates,results})})
app.post('/api/payables',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,company=await getCompany(cid),out=await insertPayable(cid,{originType:'MANUAL',supplier:req.body.supplier,supplierDocument:req.body.supplierDocument,description:req.body.description,issueDate:req.body.issueDate||req.body.dueDate,dueDate:req.body.dueDate,amount:req.body.amount,category:req.body.category||null,accountId:req.body.accountId||null,paymentMethod:req.body.paymentMethod||null,invoiceRef:req.body.invoiceRef||null,raw:{source:'manual'}},company);if(!out.inserted)return res.status(409).json({message:'Este lançamento já existe em Contas a Pagar.'});await auditSafe(cid,'PAYABLE_CREATED','payable',out.id,{description:req.body.description,amount:req.body.amount});res.json({ok:true,id:out.id})})
app.patch('/api/payables/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,current=await pool.query(`SELECT * FROM payables WHERE id=$1 AND company_id=$2 LIMIT 1`,[req.params.id,cid]);if(!current.rowCount)return res.status(404).json({message:'Conta a pagar não encontrada.'});const before=current.rows[0],accountId=req.body.accountId===undefined?before.account_id:(req.body.accountId||null);let account=null;if(accountId){const a=await pool.query(`SELECT id,name FROM chart_accounts WHERE id=$1 AND company_id=$2 AND active=true AND is_group=false`,[accountId,cid]);account=a.rows[0]||null}const category=req.body.category||account?.name||before.category,paidAmount=req.body.paidAmount===undefined?n(before.paid_amount):n(req.body.paidAmount),paymentStatus=req.body.paymentStatus||(paidAmount>=n(req.body.amount||before.amount)?'PAID':paidAmount>0?'PARTIAL':before.payment_status);const r=await pool.query(`UPDATE payables SET supplier=COALESCE($3,supplier),description=COALESCE($4,description),due_date=COALESCE($5::date,due_date),amount=COALESCE($6,amount),category=COALESCE($7,category),account_id=$8,payment_status=$9,paid_amount=$10,paid_at=CASE WHEN $9='PAID' THEN COALESCE(paid_at,now()) ELSE paid_at END,classification_status=CASE WHEN $7 IS NOT NULL THEN 'CONFIRMED' ELSE classification_status END,classification_source=CASE WHEN $7 IS NOT NULL THEN 'MANUAL' ELSE classification_source END,updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING *`,[req.params.id,cid,req.body.supplier??null,req.body.description??null,req.body.dueDate??null,req.body.amount??null,category,accountId,paymentStatus,paidAmount]);if(before.transaction_id)await pool.query(`UPDATE transactions SET category=COALESCE($3,category),account_id=$4,financial_status=CASE WHEN $5='PAID' THEN 'PAID' ELSE financial_status END,paid_at=CASE WHEN $5='PAID' THEN COALESCE(paid_at,now()) ELSE paid_at END,classification_status=CASE WHEN $3 IS NOT NULL THEN 'CONFIRMED' ELSE classification_status END,classification_source=CASE WHEN $3 IS NOT NULL THEN 'PAYABLE_EDIT' ELSE classification_source END WHERE id=$1 AND company_id=$2`,[before.transaction_id,cid,category,accountId,paymentStatus]);if(req.body.remember&&category&&before.supplier){await learnClassification({cid,party:String(before.supplier).toUpperCase(),document:before.supplier_document,direction:'SAIDA',category,source:'PAYABLE_EDIT',applyTransactions:true})}await auditSafe(cid,'PAYABLE_UPDATED','payable',req.params.id,{category,paymentStatus});res.json(r.rows[0])})
app.delete('/api/payables/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,r=await pool.query(`DELETE FROM payables WHERE id=$1 AND company_id=$2 RETURNING transaction_id`,[req.params.id,cid]);if(!r.rowCount)return res.status(404).json({message:'Conta a pagar não encontrada.'});if(r.rows[0].transaction_id){const t=await pool.query(`SELECT raw->>'source' source FROM transactions WHERE id=$1 AND company_id=$2`,[r.rows[0].transaction_id,cid]);if(t.rows[0]?.source==='payables')await pool.query(`DELETE FROM transactions WHERE id=$1 AND company_id=$2`,[r.rows[0].transaction_id,cid])}res.json({ok:true})})

app.get('/api/expected-sources',async(req,res)=>{if(!pool)return res.json([]);const cid=req.companyId,r=await pool.query(`SELECT id,kind,label,frequency,active FROM expected_sources WHERE company_id=$1 ORDER BY label`,[cid]);res.json(r.rows)})
app.post('/api/expected-sources',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,{kind,label,active=true}=req.body;if(!kind||!label)return res.status(400).json({message:'Informe fonte e nome.'});const r=await pool.query(`INSERT INTO expected_sources(company_id,kind,label,active) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,kind) DO UPDATE SET label=excluded.label,active=excluded.active RETURNING *`,[cid,kind,label,active]);res.json(r.rows[0])})
app.delete('/api/expected-sources/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId;await pool.query(`UPDATE expected_sources SET active=false WHERE id=$1 AND company_id=$2`,[req.params.id,cid]);res.json({ok:true})})

app.get('/api/source-health',async(req,res)=>{if(!pool)return res.json({expected:[],files:[],missing:0,review:0});res.json(await sourceHealth(req.companyId,rangeFromQuery(req.query)))})
app.get('/api/source-files',async(req,res)=>{if(!pool)return res.json({files:[]});const r=await pool.query(`SELECT id,name,kind,status,status_detail,record_count,confidence,validation_status,validation,period_start,period_end,created_at,processed_at FROM source_files WHERE company_id=$1 ORDER BY created_at DESC`,[req.companyId]);res.json({files:r.rows})})

app.get('/api/source-files/:id/review',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,f=await pool.query(`SELECT id,name,kind,status,status_detail,record_count,confidence,validation_status,validation,period_start,period_end,created_at,processed_at,(content IS NOT NULL) can_reprocess FROM source_files WHERE id=$1 AND company_id=$2 LIMIT 1`,[req.params.id,cid]);if(!f.rowCount)return res.status(404).json({message:'Arquivo não encontrado.'});const tx=await pool.query(`SELECT id,occurred_at,competence_at,due_at,description,custom_title,normalized_party,amount,direction,category,classification_status,source_page FROM transactions WHERE company_id=$1 AND source_file_id=$2 ORDER BY COALESCE(competence_at,occurred_at::date),id LIMIT 500`,[cid,req.params.id]);res.json({file:f.rows[0],transactions:tx.rows})})
app.post('/api/source-files/:id/confirm',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,r=await pool.query(`UPDATE source_files SET status='IMPORTED',validation_status='ACCEPTED_OVERRIDE',status_detail='Conferido e aceito manualmente',processed_at=now() WHERE id=$1 AND company_id=$2 RETURNING id`,[req.params.id,cid]);if(!r.rowCount)return res.status(404).json({message:'Arquivo não encontrado.'});await auditSafe(cid,'SOURCE_FILE_ACCEPTED','source_file',req.params.id,{});res.json({ok:true})})
app.post('/api/source-files/:id/ignore-transaction',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,id=String(req.body?.transactionId||'');const r=await pool.query(`UPDATE transactions SET status='IGNORED',dre_impact=false,cash_impact=false,classification_status='CONFIRMED',classification_source='FILE_REVIEW_IGNORE' WHERE id=$1 AND company_id=$2 AND source_file_id=$3 RETURNING id`,[id,cid,req.params.id]);if(!r.rowCount)return res.status(404).json({message:'Linha não encontrada.'});await auditSafe(cid,'SOURCE_FILE_LINE_IGNORED','transaction',id,{sourceFileId:req.params.id});res.json({ok:true})})
app.delete('/api/source-files/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId;await pool.query(`DELETE FROM receivables WHERE company_id=$1 AND source_file_id=$2`,[cid,req.params.id]);await pool.query(`DELETE FROM payables WHERE company_id=$1 AND source_file_id=$2`,[cid,req.params.id]);await pool.query(`DELETE FROM transactions WHERE company_id=$1 AND source_file_id=$2`,[cid,req.params.id]);const r=await pool.query(`DELETE FROM source_files WHERE id=$1 AND company_id=$2 RETURNING id`,[req.params.id,cid]);if(!r.rowCount)return res.status(404).json({message:'Arquivo não encontrado.'});await auditSafe(cid,'SOURCE_FILE_DISCARDED','source_file',req.params.id,{});res.json({ok:true})})
app.post('/api/source-files/:id/reprocess',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,f=await pool.query(`SELECT id,name,content,mime_type FROM source_files WHERE id=$1 AND company_id=$2 LIMIT 1`,[req.params.id,cid]);if(!f.rowCount)return res.status(404).json({message:'Arquivo não encontrado.'});if(!f.rows[0].content)return res.status(409).json({message:'Este arquivo é anterior à versão que armazena o conteúdo para reprocessamento. Envie-o novamente.'});try{const ext=path.extname(f.rows[0].name).toLowerCase(),parsed=ext==='.pdf'?await parsePdf(f.rows[0].content):parseTabular(f.rows[0].content),company=await getCompany(cid),dates=(parsed.transactions||[]).map((t:any)=>toDateOnly(t.competenceAt||t.occurredAt)).filter(Boolean).sort(),periodStart=parsed.metadata?.periodStart||dates[0]||null,periodEnd=parsed.metadata?.periodEnd||dates.at(-1)||null,status=!parsed.transactions?.length||parsed.validation?.status==='MISMATCH'?'REVIEW':'IMPORTED',detail=!parsed.transactions?.length?'Nenhum lançamento foi extraído':parsed.validation?.status==='MISMATCH'?'Reprocessado, mas os totais ainda apresentam divergência':'Reprocessado com sucesso';await pool.query(`DELETE FROM transactions WHERE company_id=$1 AND source_file_id=$2`,[cid,req.params.id]);const count=await persistParsedTransactions(cid,req.params.id,parsed,company);await pool.query(`UPDATE source_files SET kind=$3,status=$4,status_detail=$5,record_count=$6,confidence=$7,validation_status=$8,validation=$9::jsonb,period_start=$10,period_end=$11,processed_at=now() WHERE id=$1 AND company_id=$2`,[req.params.id,cid,parsed.kind,status,detail,count,parsed.confidence,parsed.validation?.status||'NOT_AVAILABLE',JSON.stringify(parsed.validation||{}),periodStart,periodEnd]);await applyAccountingPolicy(cid);await auditSafe(cid,'SOURCE_FILE_REPROCESSED','source_file',req.params.id,{count,status});res.json({ok:true,count,status,detail})}catch(e:any){res.status(400).json({message:'Não foi possível reprocessar o arquivo.',detail:e?.message||String(e)})}})
app.get('/api/period-status',async(req,res)=>{if(!pool)return res.json({quality:0,ready:false,steps:{}});res.json(await periodStatus(req.companyId,rangeFromQuery(req.query)))})

app.get('/api/dre',async(req,res)=>{if(!pool)return res.json({sections:[],result:demo.summary.result,revenue:demo.summary.revenue});res.json(await buildDre(req.companyId,rangeFromQuery(req.query)))})
app.get('/api/dre-comparative',async(req,res)=>{if(!pool)return res.json({year:new Date().getFullYear(),sections:[],result:[]});res.json(await buildDreComparative(req.companyId,req.query.year))})

app.get('/api/transactions',async(req,res)=>{
  if(!pool)return res.json({rows:[],total:0,inflow:0,outflow:0});
  try{
    const cid=req.companyId,range=rangeFromQuery(req.query),params=[cid,range.from,range.to],effectiveCompetence=`COALESCE(t.competence_at,t.occurred_at::date)`,where=[`t.company_id=$1`,`${effectiveCompetence} BETWEEN $2::date AND $3::date`]
    const add=(clause,value)=>{params.push(value);where.push(clause.replace('?',`$${params.length}`))}
    if(req.query.q){const q=`%${req.query.q}%`;params.push(q,q,q);where.push(`(t.description ILIKE $${params.length-2} OR t.category ILIKE $${params.length-1} OR t.normalized_party ILIKE $${params.length})`)}
    if(req.query.direction)add(`t.direction=?`,req.query.direction);if(req.query.category)add(`t.category=?`,req.query.category);if(req.query.paymentMethod)add(`t.payment_method=?`,req.query.paymentMethod);if(req.query.status)add(`t.financial_status=?`,req.query.status);if(req.query.sourceFile)add(`sf.id::text=?`,req.query.sourceFile)
    const sortMap={competence:effectiveCompetence,description:'t.description',paymentMethod:'t.payment_method',category:'t.category',status:'t.financial_status',amount:'t.amount'},sortExpr=sortMap[req.query.sort]||effectiveCompetence,sortOrder=String(req.query.order).toLowerCase()==='asc'?'ASC':'DESC',limit=Math.min(500,Math.max(20,Number(req.query.limit)||200)),offset=Math.max(0,Number(req.query.offset)||0)
    const summary=await pool.query(`SELECT count(*)::int n,COALESCE(sum(CASE WHEN t.amount>0 THEN t.amount ELSE 0 END),0)::numeric inflow,COALESCE(abs(sum(CASE WHEN t.amount<0 THEN t.amount ELSE 0 END)),0)::numeric outflow FROM transactions t LEFT JOIN source_files sf ON sf.id=t.source_file_id WHERE ${where.join(' AND ')}`,params)
    const rows=await pool.query(`SELECT t.id,t.occurred_at,t.competence_at,${effectiveCompetence} effective_competence_at,t.due_at,t.paid_at,t.description,t.custom_title,t.normalized_party,t.counterparty_document,t.direction,t.amount,t.gross_amount,t.fee_amount,t.net_amount,t.category,t.account_id,t.payment_method,t.financial_status,t.classification_status,t.classification_source,t.classification_confidence,t.accounting_role,t.dre_impact,t.cash_impact,t.source_page,sf.id source_file_id,sf.name source_file_name,sf.kind source_kind FROM transactions t LEFT JOIN source_files sf ON sf.id=t.source_file_id WHERE ${where.join(' AND ')} ORDER BY ${sortExpr} ${sortOrder} NULLS LAST,t.occurred_at DESC,t.id DESC LIMIT ${limit} OFFSET ${offset}`,params)
    res.json({rows:rows.rows,total:n(summary.rows[0]?.n),inflow:n(summary.rows[0]?.inflow),outflow:n(summary.rows[0]?.outflow)})
  }catch(e){console.error('transactions',e);res.status(500).json({message:'Não foi possível carregar os lançamentos.',detail:process.env.NODE_ENV==='production'?undefined:e.message})}
})

app.patch('/api/transactions/:id',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'});
  try{
    const cid=req.companyId,id=req.params.id,current=await pool.query(`SELECT t.*,a.name account_name FROM transactions t LEFT JOIN chart_accounts a ON a.id=t.account_id WHERE t.id=$1 AND t.company_id=$2 LIMIT 1`,[id,cid]);
    if(!current.rowCount)return res.status(404).json({message:'Lançamento não encontrado.'});
    const before=current.rows[0],competenceAt=String(req.body.competenceAt||toDateOnly(before.competence_at)||toDateOnly(before.occurred_at)||'').slice(0,10),accountId=req.body.accountId||before.account_id||null,updateRule=Boolean(req.body.updateRule),customTitle=req.body.customTitle===undefined?before.custom_title:String(req.body.customTitle||'').trim()||null,applyTitleRule=Boolean(req.body.applyTitleRule);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(competenceAt))return res.status(400).json({message:'Informe uma competência válida.'});
    const oldPeriod=String(toDateOnly(before.competence_at)||toDateOnly(before.occurred_at)||'').slice(0,7),newPeriod=competenceAt.slice(0,7);
    if((oldPeriod&&await isClosed(cid,oldPeriod))||(newPeriod!==oldPeriod&&await isClosed(cid,newPeriod)))return res.status(409).json({message:'O período está fechado. Reabra o mês antes de alterar o lançamento.'});
    let account=null;if(accountId){const ar=await pool.query(`SELECT id,name,dre_section FROM chart_accounts WHERE id=$1 AND company_id=$2 AND active=true AND is_group=false LIMIT 1`,[accountId,cid]);if(!ar.rowCount)return res.status(400).json({message:'Plano de Contas inválido.'});account=ar.rows[0]}
    const category=account?.name||before.category||'A classificar',dreImpact=account?account.dre_section!=='FORA_DRE':dreImpactForCategory(category),accountingRole=category==='Transferência entre contas próprias'?'TRANSFER':category==='Liquidação de cartão de crédito'?'CARD_SETTLEMENT':['TRANSFER','CARD_SETTLEMENT'].includes(before.accounting_role)?'BANK_MOVEMENT':before.accounting_role;
    const updated=await pool.query(`UPDATE transactions SET competence_at=$3::date,account_id=$4,category=$5,dre_impact=$6,accounting_role=$7,custom_title=$8,classification_status=CASE WHEN $4::uuid IS NULL THEN classification_status ELSE 'CONFIRMED' END,classification_source=CASE WHEN $4::uuid IS NULL THEN classification_source ELSE 'MANUAL_EDIT' END WHERE id=$1 AND company_id=$2 RETURNING *`,[id,cid,competenceAt,account?.id||null,category,dreImpact,accountingRole,customTitle]);
    if(updateRule&&account&&before.normalized_party){await upsertCompanyRule({cid,party:String(before.normalized_party).toUpperCase().trim(),document:before.counterparty_document,direction:before.direction,category,accountId:account.id,source:'MANUAL_EDIT'})}
    if(applyTitleRule&&customTitle){const party=String(before.normalized_party||'').trim(),pattern=party||`%${String(before.description||'').trim()}%`;await pool.query(`INSERT INTO title_rewrite_rules(company_id,pattern,normalized_party,custom_title,active) VALUES($1,$2,$3,$4,true) ON CONFLICT(company_id,pattern) DO UPDATE SET normalized_party=excluded.normalized_party,custom_title=excluded.custom_title,active=true,updated_at=now()`,[cid,pattern,party||null,customTitle]);if(party)await pool.query(`UPDATE transactions SET custom_title=$3 WHERE company_id=$1 AND upper(COALESCE(normalized_party,''))=upper($2)`,[cid,party,customTitle])}
    await applyAccountingPolicy(cid);await auditSafe(cid,'TRANSACTION_EDITED','transaction',id,{before:{competenceAt:toDateOnly(before.competence_at)||toDateOnly(before.occurred_at),accountId:before.account_id,category:before.category,customTitle:before.custom_title},after:{competenceAt,accountId:account?.id||null,category,customTitle},updateRule,applyTitleRule});
    res.json({ok:true,row:updated.rows[0]})
  }catch(e){console.error('transaction edit',e);res.status(500).json({message:'Não foi possível salvar a alteração.'})}
})

app.post('/api/transactions/confirm-batch',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,ids=req.body.ids||[];const r=await pool.query(`UPDATE transactions SET classification_status='CONFIRMED',classification_source=COALESCE(classification_source,'BULK_CONFIRM') WHERE company_id=$1 AND id=ANY($2::uuid[]) AND account_id IS NOT NULL AND category IS NOT NULL AND category<>'A classificar' AND NOT EXISTS (SELECT 1 FROM period_closures pc WHERE pc.company_id=transactions.company_id AND pc.period_key=to_char(transactions.competence_at,'YYYY-MM') AND pc.status='CLOSED') RETURNING id`,[cid,ids]);await auditSafe(cid,'TRANSACTIONS_BULK_CONFIRMED','transaction','batch',{requested:ids.length,confirmed:r.rowCount});res.json({ok:true,requested:ids.length,confirmed:r.rowCount,skipped:ids.length-r.rowCount})})

app.get('/api/dashboard',async(req,res)=>{
  if(!pool)return res.json(demo);try{const cid=req.companyId,range=rangeFromQuery(req.query),year=Number(range.from.slice(0,4)),[co,dre,groups,status,cash,months,payments]=await Promise.all([getCompany(cid),buildDre(cid,range),getReviewGroups(cid,range),periodStatus(cid,range),pool.query(`SELECT COALESCE(sum(CASE WHEN amount>0 AND cash_impact THEN amount ELSE 0 END),0)::numeric inflow,COALESCE(abs(sum(CASE WHEN amount<0 AND cash_impact THEN amount ELSE 0 END)),0)::numeric outflow FROM transactions WHERE company_id=$1 AND occurred_at::date BETWEEN $2::date AND $3::date`,[cid,range.from,range.to]),pool.query(`SELECT EXTRACT(MONTH FROM competence_at)::int m,COALESCE(sum(amount),0)::numeric total FROM transactions t JOIN chart_accounts a ON a.id=t.account_id WHERE t.company_id=$1 AND t.dre_impact=true AND a.dre_section='RECEITA_BRUTA' AND EXTRACT(YEAR FROM competence_at)=$2 GROUP BY m ORDER BY m`,[cid,year]),pool.query(`SELECT COALESCE(payment_method,'Não informado') method,COALESCE(sum(CASE WHEN amount>0 AND cash_impact THEN amount ELSE 0 END),0)::numeric received,COALESCE(abs(sum(CASE WHEN amount<0 AND cash_impact THEN amount ELSE 0 END)),0)::numeric paid FROM transactions WHERE company_id=$1 AND occurred_at::date BETWEEN $2::date AND $3::date GROUP BY payment_method ORDER BY received DESC`,[cid,range.from,range.to])]),monthArr=Array(12).fill(0);months.rows.forEach(x=>monthArr[x.m-1]=n(x.total));res.json({company:co,period:range,summary:{balance:n(cash.rows[0]?.inflow)-n(cash.rows[0]?.outflow),inflow:n(cash.rows[0]?.inflow),outflow:n(cash.rows[0]?.outflow),pending:groups.length,revenue:dre.revenue,result:dre.result,quality:status.quality,ready:status.ready,closed:status.closed,unclassifiedValue:status.unclassifiedValue},months:monthArr,payments:payments.rows,status:status.steps})}catch(e){console.error(e);res.json(demo)}})

app.get('/api/review-groups',async(req,res)=>{if(!pool)return res.json({groups:[]});res.json({groups:await getReviewGroups(req.companyId,rangeFromQuery(req.query))})})
app.post('/api/review-groups/classify',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,{normalizedParty,counterpartyDocument,direction,category,remember=true,onlyIds=[]}=req.body;if(!normalizedParty||!direction||!category)return res.status(400).json({message:'Informe nome, direção e categoria.'});const party=String(normalizedParty).toUpperCase().trim(),account=await ensureAccountForCategory(cid,category,direction);if(remember)await learnClassification({cid,party,document:counterpartyDocument,direction,category,source:'MANUAL',applyTransactions:true});else if(Array.isArray(onlyIds)&&onlyIds.length)await pool.query(`UPDATE transactions SET category=$2,account_id=$4,classification_confidence=100,classification_status='CONFIRMED',classification_source='MANUAL',dre_impact=$5 WHERE company_id=$1 AND id=ANY($3::uuid[]) AND NOT EXISTS (SELECT 1 FROM period_closures pc WHERE pc.company_id=transactions.company_id AND pc.period_key=to_char(transactions.competence_at,'YYYY-MM') AND pc.status='CLOSED')`,[cid,category,onlyIds,account?.id||null,dreImpactForCategory(category)]);await applyAccountingPolicy(cid);res.json({ok:true})})
app.post('/api/review-groups/classify-batch',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,items=Array.isArray(req.body.items)?req.body.items:[];let count=0;for(const item of items.slice(0,100)){if(!item.normalizedParty||!item.direction||!item.category)continue;await learnClassification({cid,party:String(item.normalizedParty).toUpperCase().trim(),document:item.counterpartyDocument,direction:item.direction,category:item.category,source:'MANUAL',applyTransactions:true});count++}await applyAccountingPolicy(cid);res.json({ok:true,count})})
app.post('/api/ai/suggest',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});try{const result=await runLunaForPending(req.companyId,rangeFromQuery(req.query));res.json({ok:true,...result})}catch(e){console.error('Luna',e);res.status(500).json({message:'A Luna não conseguiu sugerir agora. Você pode classificar manualmente.'})}})

app.get('/api/reconciliation',async(req,res)=>{if(!pool)return res.json({pending:0,matches:[],sourceHealth:{expected:[]}});res.json(await reconciliationSummary(req.companyId,rangeFromQuery(req.query)))})

app.post('/api/reconciliation/link',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,{leftId,rightId}=req.body;const rows=await pool.query(`SELECT id FROM transactions WHERE company_id=$1 AND id=ANY($2::uuid[])`,[cid,[leftId,rightId]]);if(rows.rowCount<2)return res.status(400).json({message:'Um dos lançamentos não pertence à empresa.'});await pool.query(`INSERT INTO reconciliation_links(company_id,left_transaction_id,right_transaction_id,match_type,confidence) VALUES($1,$2,$3,'MANUAL',100) ON CONFLICT(company_id,left_transaction_id,right_transaction_id) DO UPDATE SET match_type='MANUAL',confidence=100`,[cid,leftId,rightId]);await auditSafe(cid,'RECONCILIATION_MANUAL_LINK','transaction',leftId,{rightId});res.json({ok:true})})
app.post('/api/reconciliation/mark-transfer',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,id=req.body.transactionId,account=await ensureAccountForCategory(cid,'Transferência entre contas próprias','SAIDA');const r=await pool.query(`UPDATE transactions SET category='Transferência entre contas próprias',account_id=$3,classification_status='CONFIRMED',classification_source='MANUAL_RECONCILIATION',dre_impact=false,cash_impact=true,accounting_role='TRANSFER' WHERE id=$1 AND company_id=$2 RETURNING id`,[id,cid,account?.id||null]);if(!r.rowCount)return res.status(404).json({message:'Lançamento não encontrado.'});await auditSafe(cid,'RECONCILIATION_MARKED_TRANSFER','transaction',id,{});res.json({ok:true})})
app.post('/api/reconciliation/ignore',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,{transactionId,reason='Ignorado pelo usuário'}=req.body;await pool.query(`INSERT INTO reconciliation_ignores(company_id,transaction_id,reason) SELECT $1,id,$3 FROM transactions WHERE id=$2 AND company_id=$1 ON CONFLICT(company_id,transaction_id) DO UPDATE SET reason=excluded.reason`,[cid,transactionId,reason]);await auditSafe(cid,'RECONCILIATION_IGNORED','transaction',transactionId,{reason});res.json({ok:true})})
app.post('/api/reconciliation/reprocess',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const range=rangeFromQuery(req.query);await createReconciliationLinks(req.companyId,range);res.json(await reconciliationSummary(req.companyId,range))})

app.post('/api/periods/close',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,range=rangeFromQuery({period:req.body.period});if(!range.period)return res.status(400).json({message:'Informe um mês.'});const st=await periodStatus(cid,range);if(!st.ready&&!req.body.force)return res.status(409).json({message:'Ainda existem pendências. Resolva Arquivos e Lançamentos antes de fechar.',status:st});const dreSnapshot=await buildDre(cid,range);await pool.query(`INSERT INTO period_closures(company_id,period_key,status,closed_at,closed_by,snapshot) VALUES($1,$2,'CLOSED',now(),'MASTER',$3::jsonb) ON CONFLICT(company_id,period_key) DO UPDATE SET status='CLOSED',closed_at=now(),closed_by='MASTER',snapshot=excluded.snapshot`,[cid,range.period,JSON.stringify({quality:st.quality,closedAt:new Date().toISOString(),dre:dreSnapshot})]);await auditSafe(cid,'PERIOD_CLOSED','period',range.period,{quality:st.quality});res.json({ok:true})})
app.post('/api/periods/reopen',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,period=req.body.period;await pool.query(`UPDATE period_closures SET status='OPEN',reopened_at=now(),reopened_by='MASTER' WHERE company_id=$1 AND period_key=$2`,[cid,period]);await auditSafe(cid,'PERIOD_REOPENED','period',period,{});res.json({ok:true})})
app.get('/api/audit',async(req,res)=>{if(!pool)return res.json([]);const cid=req.companyId,r=await pool.query(`SELECT action,entity_type,entity_id,details,actor,created_at FROM audit_log WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100`,[cid]);res.json(r.rows)})

app.post('/api/import',upload.array('files',100),async(req,res)=>{
  if(!req.uploadedFiles?.length)return res.status(400).json({message:'Nenhum arquivo recebido.'})
  if(!pool)return res.json({message:`${req.uploadedFiles.length} arquivo(s) lido(s). Configure DATABASE_URL para persistir.`})

  const cid=req.companyId,syncMode=String(req.query?.mode||'').toLowerCase()==='sync'
  let company=await getCompany(cid),processedFiles=0,duplicates=0,retriedFiles=0,records=0,supplierLearned=0,globalShared=0,newAccounts=0,reviewFiles=0,failedFiles=0
  const results:any[]=[],newSourceFileIds:string[]=[],seenHashes=new Set<string>()
  const previousFiles=syncMode?(await pool.query(`SELECT id,hash,name FROM source_files WHERE company_id=$1 AND COALESCE(import_scope,'GENERAL')='GENERAL' ORDER BY created_at`,[cid])).rows:[]
  const previousIds=new Set(previousFiles.map((x:any)=>String(x.id))),originalHashes=new Map(previousFiles.map((x:any)=>[String(x.id),String(x.hash)]))

  for(const f of req.uploadedFiles){
    const hash=crypto.createHash('sha256').update(f.buffer).digest('hex')
    let currentSourceFileId:string|null=null
    try{
      if(seenHashes.has(hash)){duplicates++;results.push({name:f.originalname,status:'DUPLICATE',records:0,detail:'Arquivo repetido dentro da pasta selecionada.'});continue}
      seenHashes.add(hash)
      const exists=await pool.query('SELECT id,name,status,record_count,validation_status,kind,status_detail,hash FROM source_files WHERE company_id=$1 AND hash=$2',[cid,hash])
      if(exists.rowCount){
        const previous=exists.rows[0]
        if(syncMode&&previousIds.has(String(previous.id))){
          // Libera a restrição de hash sem apagar a base anterior. A base antiga só é removida
          // depois que toda a nova pasta terminar com sucesso.
          await pool.query(`UPDATE source_files SET hash=$3 WHERE company_id=$1 AND id=$2`,[cid,previous.id,`sync-old-${crypto.randomUUID()}-${hash}`])
        }else{
          const previousCount=n(previous.record_count)
          const retryable=previousCount===0&&(previous.status!=='IMPORTED'||previous.validation_status==='ERROR'||previous.kind==='UNKNOWN')
          if(retryable){
            await pool.query('DELETE FROM transactions WHERE company_id=$1 AND source_file_id=$2',[cid,previous.id])
            await pool.query('DELETE FROM source_files WHERE company_id=$1 AND id=$2',[cid,previous.id])
            retriedFiles++
            console.log('reprocessing failed import',{companyId:cid,file:f.originalname,previousId:previous.id,previousStatus:previous.status,previousValidation:previous.validation_status})
          }else{
            duplicates++
            results.push({name:f.originalname,status:'DUPLICATE',records:0,detail:'Arquivo já processado para esta empresa.'})
            continue
          }
        }
      }

      const ext=path.extname(f.originalname).toLowerCase()

      if(['.xlsx','.xls','.csv'].includes(ext)){
        const supplierBase=parseSupplierBase(f.buffer)
        if(supplierBase.matched){
          const sf=await pool.query(`INSERT INTO source_files(company_id,name,hash,kind,status,status_detail,record_count,confidence,validation_status,content,mime_type) VALUES($1,$2,$3,'SUPPLIER_BASE','IMPORTED','Base de fornecedores aprendida',$4,$5,'NOT_AVAILABLE',$6,$7) RETURNING id`,[cid,f.originalname,hash,supplierBase.records.length,supplierBase.confidence,f.buffer,f.mimetype])
          newSourceFileIds.push(String(sf.rows[0].id))
          const learned=await importSupplierRecords(cid,sf.rows[0].id,supplierBase.records)
          supplierLearned+=learned.learned;globalShared+=learned.shared;newAccounts+=learned.newAccounts;records+=supplierBase.records.length;processedFiles++
          results.push({name:f.originalname,status:'IMPORTED',kind:'SUPPLIER_BASE',records:supplierBase.records.length})
          await auditSafe(cid,'SUPPLIER_BASE_IMPORTED','source_file',sf.rows[0].id,{name:f.originalname,records:supplierBase.records.length})
          continue
        }
      }

      let parsed:any
      if(ext==='.pdf')parsed=await parsePdf(f.buffer)
      else if(['.xlsx','.xls','.csv'].includes(ext))parsed=parseTabular(f.buffer)
      else throw new Error(`Formato não suportado: ${ext||'sem extensão'}`)

      if(ext==='.pdf'&&!parsed.transactions.length&&process.env.AI_ENABLED==='true'&&parsed.textForAi){
        try{
          const adapted=await adaptUnknownPdf({text:parsed.textForAi,company})
          if(adapted?.transactions?.length){
            parsed.kind=`AI_ADAPTED_${String(adapted.document_type||'PDF').toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`
            parsed.confidence=adapted.confidence||70
            parsed.transactions=adapted.transactions.map((x:any)=>{const d=x.date?new Date(`${x.date}T12:00:00-03:00`):new Date();return{occurredAt:d,competenceAt:d,paidAt:d,description:x.description,amount:x.direction==='SAIDA'?-Math.abs(n(x.amount)):Math.abs(n(x.amount)),direction:x.direction,paymentMethod:x.payment_method||null,financialStatus:'PAID',raw:{source:'luna_pdf_adapter'}}})
            parsed.validation={status:'AI_ADAPTED'}
            parsed.metadata.periodStart=parsed.transactions.map((t:any)=>toDateOnly(t.competenceAt)).filter(Boolean).sort()[0]||null
            parsed.metadata.periodEnd=parsed.transactions.map((t:any)=>toDateOnly(t.competenceAt)).filter(Boolean).sort().at(-1)||null
          }
        }catch(e:any){console.error('Luna file adapter',e.message)}
      }

      if(parsed.metadata?.document&&!company?.document){
        await pool.query(`UPDATE companies SET document=$2::text,name=CASE WHEN name='Empresa Demonstração' THEN COALESCE($3::text,name) ELSE name END WHERE id=$1`,[cid,parsed.metadata.document,parsed.metadata.name??null])
        company=await getCompany(cid)
      }

      // IMPORTANT: the selected UI month never participates in import acceptance.
      // Period metadata is stored only so month filters can later display the right data.
      console.log('import parsed',{companyId:cid,file:f.originalname,kind:parsed.kind,transactions:parsed.transactions.length,validation:parsed.validation?.status||'NOT_AVAILABLE'})

      const txDates=parsed.transactions.map((t:any)=>toDateOnly(t.competenceAt||t.occurredAt)).filter(Boolean).sort()
      const periodStart=parsed.metadata?.periodStart||txDates[0]||null
      const periodEnd=parsed.metadata?.periodEnd||txDates.at(-1)||null

      let status='IMPORTED',detail='Arquivo lido e contabilizado'
      if(!parsed.transactions.length){status='REVIEW';detail='Arquivo reconhecido, mas nenhum lançamento foi extraído';reviewFiles++}
      else if(parsed.validation?.status==='MISMATCH'){status='REVIEW';detail='Arquivo importado, mas a conferência automática encontrou divergência nos totais';reviewFiles++}

      const sf=await pool.query(`INSERT INTO source_files(company_id,name,hash,kind,status,status_detail,record_count,confidence,validation_status,validation,period_start,period_end,content,mime_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14) RETURNING id`,[cid,f.originalname,hash,parsed.kind,status,detail,parsed.transactions.length,parsed.confidence,parsed.validation?.status||'NOT_AVAILABLE',JSON.stringify(parsed.validation||{}),periodStart,periodEnd,f.buffer,f.mimetype])
      currentSourceFileId=sf.rows[0].id
      newSourceFileIds.push(String(sf.rows[0].id))
      await autoExpectedSource(cid,parsed.kind)

      const insertedForFile=await persistParsedTransactions(cid,sf.rows[0].id,parsed,company)
      records+=insertedForFile
      processedFiles++
      results.push({name:f.originalname,status,kind:parsed.kind,records:insertedForFile,validation:parsed.validation?.status||'NOT_AVAILABLE',detail})
      await auditSafe(cid,'FILE_IMPORTED','source_file',sf.rows[0].id,{name:f.originalname,kind:parsed.kind,records:insertedForFile,status,validation:parsed.validation?.status||'NOT_AVAILABLE'})
    }catch(e:any){
      console.error('import error',f.originalname,e)
      failedFiles++;reviewFiles++
      const detail=`Falha no processamento: ${String(e?.message||e||'erro desconhecido').slice(0,500)}`
      try{
        // Never leave partial financial rows behind when a file fails midway.
        if(currentSourceFileId)await pool.query('DELETE FROM transactions WHERE company_id=$1 AND source_file_id=$2',[cid,currentSourceFileId])
        const failedSf=await pool.query(`INSERT INTO source_files(company_id,name,hash,kind,status,status_detail,record_count,confidence,validation_status,validation,content,mime_type) VALUES($1,$2,$3,'UNKNOWN','REVIEW',$4,0,0,'ERROR',$5::jsonb,$6,$7) ON CONFLICT(company_id,hash) DO UPDATE SET status='REVIEW',status_detail=excluded.status_detail,record_count=0,validation_status='ERROR',validation=excluded.validation,content=excluded.content,mime_type=excluded.mime_type,processed_at=now() RETURNING id`,[cid,f.originalname,hash,detail,JSON.stringify({error:String(e?.message||e||'erro desconhecido')}),f.buffer,f.mimetype])
        if(failedSf.rows[0]?.id)newSourceFileIds.push(String(failedSf.rows[0].id))
      }catch(persistError:any){console.error('failed to persist review file',f.originalname,persistError)}
      results.push({name:f.originalname,status:'ERROR',records:0,detail})
    }
  }

  if(syncMode){
    const hardReview=results.some((x:any)=>x.status==='ERROR'||(x.status==='REVIEW'&&n(x.records)===0))
    if(failedFiles>0||hardReview){
      // A nova pasta não fica pela metade: remove a tentativa e restaura integralmente a base anterior.
      if(newSourceFileIds.length){
        await pool.query(`DELETE FROM classification_rules WHERE company_id=$1 AND source_file_id=ANY($2::uuid[])`,[cid,newSourceFileIds])
        await pool.query(`DELETE FROM transactions WHERE company_id=$1 AND source_file_id=ANY($2::uuid[])`,[cid,newSourceFileIds])
        await pool.query(`DELETE FROM source_files WHERE company_id=$1 AND id=ANY($2::uuid[])`,[cid,newSourceFileIds])
      }
      for(const old of previousFiles){const original=originalHashes.get(String(old.id));if(original)await pool.query(`UPDATE source_files SET hash=$3 WHERE company_id=$1 AND id=$2`,[cid,old.id,original])}
      return res.json({message:'Sincronização não aplicada: pelo menos um arquivo não pôde ser lido com segurança. A base anterior foi preservada.',received:req.uploadedFiles.length,processedFiles:0,records:0,duplicates,reviewFiles,failedFiles,syncMode:true,syncApplied:false,results})
    }
    if(previousFiles.length){
      const ids=previousFiles.map((x:any)=>String(x.id))
      await pool.query(`DELETE FROM transactions WHERE company_id=$1 AND source_file_id=ANY($2::uuid[])`,[cid,ids])
      await pool.query(`DELETE FROM source_files WHERE company_id=$1 AND id=ANY($2::uuid[])`,[cid,ids])
    }
    await auditSafe(cid,'FOLDER_SYNC_APPLIED','source_files','folder',{received:req.uploadedFiles.length,previousFiles:previousFiles.length,newFiles:newSourceFileIds.length})
  }

  await applyAccountingPolicy(cid)
  let aiUpdated=0
  try{if(process.env.AI_ENABLED==='true'){const r=await runLunaForPending(cid);aiUpdated=r.updated||0}}catch(e){console.error('automatic Luna',e)}
  const review=(await getReviewGroups(cid)).length,extras=[]
  if(supplierLearned)extras.push(`${supplierLearned} fornecedor(es) ensinaram o Clara`)
  if(globalShared)extras.push(`${globalShared} classificação(ões) alimentaram a biblioteca compartilhada`)
  if(newAccounts)extras.push(`${newAccounts} nova(s) conta(s) foram adicionadas ao Plano de Contas`)

  const received=req.uploadedFiles.length
  const prefix=syncMode?'Sincronização concluída':'Importação concluída'
  const syncText=syncMode?` A pasta agora é a base atual: ${previousFiles.length} arquivo(s) anterior(es) foram substituídos. `:''
  const summary=`${prefix}: ${received} arquivo(s) recebido(s), ${processedFiles} processado(s), ${records} lançamento(s).${syncText}${retriedFiles?retriedFiles+' falha(s) anterior(es) reprocessada(s). ':''}${duplicates?duplicates+' duplicado(s) ignorado(s). ':''}${reviewFiles?reviewFiles+' arquivo(s) precisam de revisão. ':''}${extras.length?extras.join('; ')+'. ':''}${aiUpdated?`Luna sugeriu ${aiUpdated} novo(s) nome(s). `:''}${review?review+' nome(s) precisam de confirmação.':'Classificações em dia.'}`
  res.json({message:summary,received,processedFiles,records,duplicates,retriedFiles,reviewFiles,failedFiles,syncMode,syncApplied:syncMode?true:undefined,results})
})

app.post('/api/classification-rules',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,{pattern,category,scope='COMPANY',direction='ANY'}=req.body,party=String(pattern).toUpperCase(),account=scope==='GLOBAL'?null:await ensureAccountForCategory(cid,category,direction);await pool.query(`INSERT INTO classification_rules(scope,company_id,pattern,normalized_party,direction,category,account_id,confidence,source) VALUES($1,$2,$3,$3,$4,$5,$6,100,'MANUAL')`,[scope,scope==='GLOBAL'?null:cid,party,direction,category,account?.id||null]);res.json({ok:true})})

app.get('/api/health',async(req,res)=>{if(!pool)return res.json({ok:true,version:'0.7.1',database:'not_configured'});try{const r=await pool.query(`SELECT value FROM schema_meta WHERE key='schema_version' LIMIT 1`);res.json({ok:true,version:'0.7.1',database:'ok',schema:r.rows[0]?.value||'unknown'})}catch(e){res.status(503).json({ok:false,version:'0.7.1',database:'migration_failed',message:e.message})}})

const dist=path.resolve(__dirname,'../../client/dist')
async function start(){
  await initDb()
  await ensureMasterUser()
  if(fs.existsSync(dist)){
    await server.register(fastifyStatic,{root:dist,prefix:'/'})
    server.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({message:'Rota não encontrada.'}):reply.sendFile('index.html'))
  }
  await server.listen({port:PORT,host:'0.0.0.0'})
  console.log(`Clara BPO v0.7.1 on :${PORT}`)
}
start().catch(e=>{console.error('Startup failed',e);process.exit(1)})
