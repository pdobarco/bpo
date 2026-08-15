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
import { initDb,pool,companyId,getCompany,getCompanyAccounts,getChartAccounts,findAccountByName,DRE_SECTIONS,audit } from './db.js'
import { parsePdf } from './parsers/pdf.js'
import { parseTabular } from './parsers/tabular.js'
import { parseSupplierBase } from './parsers/suppliers.js'
import { classify } from './services/classify.js'
import { suggestNegativeParties, adaptUnknownPdf } from './services/ai.js'
import { isLikelyBusinessName,normalize } from './services/entity.js'

const __dirname=path.dirname(fileURLToPath(import.meta.url))
const PORT=Number(process.env.PORT||3000),mb=Number(process.env.MAX_UPLOAD_MB||25)
const server=Fastify({logger:true,bodyLimit:Math.max(3,mb)*1024*1024})
await server.register(cors,{origin:true})
await server.register(multipart,{limits:{fileSize:mb*1024*1024,files:100}})

const bodySchemas: Record<string, any> = {
  'PUT /api/company': z.object({name:z.string().optional(),document:z.string().nullable().optional(),sector:z.string().nullable().optional(),activity:z.string().nullable().optional()}).passthrough(),
  'POST /api/chart-accounts': z.object({code:z.string().optional(),name:z.string().min(1),parentId:z.string().nullable().optional(),accountType:z.string().optional(),dreSection:z.string().optional(),isGroup:z.boolean().optional()}).passthrough(),
  'PUT /api/chart-accounts/:id': z.object({code:z.string().optional(),name:z.string().optional(),parentId:z.string().nullable().optional(),accountType:z.string().optional(),dreSection:z.string().nullable().optional(),isGroup:z.boolean().optional(),active:z.boolean().optional()}).passthrough(),
  'PATCH /api/transactions/:id': z.object({competenceAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),accountId:z.string().uuid().or(z.literal('')).nullable().optional(),updateRule:z.boolean().optional()}).passthrough(),
  'POST /api/company-accounts': z.object({label:z.string().min(1),institution:z.string().optional(),document:z.string().optional(),bankCode:z.string().optional(),agency:z.string().optional(),account:z.string().optional(),aliases:z.array(z.string()).optional()}).passthrough(),
  'POST /api/expected-sources': z.object({kind:z.string().min(1),label:z.string().min(1),active:z.boolean().optional()}).passthrough(),
  'POST /api/periods/close': z.object({period:z.string().regex(/^\d{4}-\d{2}$/),force:z.boolean().optional()}).passthrough(),
  'POST /api/periods/reopen': z.object({period:z.string().regex(/^\d{4}-\d{2}$/)}).passthrough(),
  'POST /api/review-groups/classify': z.object({normalizedParty:z.string().min(1),counterpartyDocument:z.string().nullable().optional(),direction:z.string().min(1),category:z.string().min(1),remember:z.boolean().optional(),onlyIds:z.array(z.string().uuid()).optional()}).passthrough(),
  'POST /api/review-groups/classify-batch': z.object({items:z.array(z.object({normalizedParty:z.string(),counterpartyDocument:z.string().nullable().optional(),direction:z.string(),category:z.string()})).max(100)}).passthrough()
}


function responseFacade(reply:any){
  const facade={
    status(code:any){reply.code(code);return facade},
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

function registerRoute(method:any,url:string,...handlers:any[]){
  server.route({method,url,handler:async(req,reply)=>{
    const schema=bodySchemas[`${method} ${url}`]
    if(schema){const parsed=schema.safeParse(req.body||{});if(!parsed.success)return reply.code(400).send({message:'Dados inválidos.',issues:parsed.error.issues});req.body=parsed.data}
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
  await pool.query(`UPDATE transactions SET dre_impact=true,cash_impact=false,accounting_role='CARD_PURCHASE',payment_method='Cartão de crédito' WHERE company_id=$1 AND raw->>'source'='nubank_card'`,[cid])
  await pool.query(`UPDATE transactions SET dre_impact=true,cash_impact=false,accounting_role='SALES_EVENT' WHERE company_id=$1 AND raw->>'source'='pagbank_sales'`,[cid])
  await pool.query(`UPDATE transactions t SET dre_impact=false,cash_impact=true,accounting_role='CASH_RECEIPT' WHERE t.company_id=$1 AND t.raw->>'source'='pagbank_statement' AND t.description ILIKE 'Vendas - Disponivel%' AND EXISTS(SELECT 1 FROM source_files sf WHERE sf.company_id=t.company_id AND sf.kind='PAGBANK_SALES' AND sf.period_start IS NOT NULL AND t.competence_at BETWEEN sf.period_start AND sf.period_end)`,[cid])
  await pool.query(`UPDATE transactions t SET dre_impact=true,cash_impact=true,accounting_role='SALES_EVENT_PROXY' WHERE t.company_id=$1 AND t.raw->>'source'='pagbank_statement' AND t.description ILIKE 'Vendas - Disponivel%' AND NOT EXISTS(SELECT 1 FROM source_files sf WHERE sf.company_id=t.company_id AND sf.kind='PAGBANK_SALES' AND sf.period_start IS NOT NULL AND t.competence_at BETWEEN sf.period_start AND sf.period_end)`,[cid])
  await pool.query(`UPDATE transactions c SET financial_status='PAID',paid_at=s.occurred_at FROM transactions s WHERE c.company_id=$1 AND s.company_id=c.company_id AND c.accounting_role='CARD_PURCHASE' AND c.due_at IS NOT NULL AND s.accounting_role='CARD_SETTLEMENT' AND abs((s.occurred_at::date-c.due_at::date))<=10 AND c.financial_status='OPEN'`,[cid])
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
  const keys=DRE_SECTIONS.filter(x=>x[0]!=='FORA_DRE'),sections=keys.map(([key,label])=>({key,label,months:Array(12).fill(0),accounts:[]}))
  for(let i=0;i<12;i++){for(const sec of monthDres[i].sections||[]){const target=sections.find(x=>x.key===sec.key);if(target)target.months[i]=n(sec.total)}}
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
async function reconciliationSummary(cid:any,range:any){
  await createReconciliationLinks(cid,range)
  const [groups,links,events,health]=await Promise.all([getReviewGroups(cid,range),pool.query(`SELECT rl.id,rl.confidence,rl.match_type,l.description left_description,l.amount left_amount,r.description right_description,r.amount right_amount FROM reconciliation_links rl JOIN transactions l ON l.id=rl.left_transaction_id JOIN transactions r ON r.id=rl.right_transaction_id WHERE rl.company_id=$1 AND l.competence_at BETWEEN $2::date AND $3::date ORDER BY rl.created_at DESC LIMIT 30`,[cid,range.from,range.to]),pool.query(`SELECT count(*)::int n FROM transactions WHERE company_id=$1 AND competence_at BETWEEN $2::date AND $3::date`,[cid,range.from,range.to]),sourceHealth(cid,range)])
  return{pending:groups.length,totalTransactions:n(events.rows[0]?.n),matches:links.rows,matched:links.rowCount,sourceHealth:health}
}
async function periodStatus(cid:any,range:any){
  const [health,groups,rec,unclassifiedValue,closed]=await Promise.all([sourceHealth(cid,range),getReviewGroups(cid,range),reconciliationSummary(cid,range),pool.query(`SELECT COALESCE(sum(abs(amount)),0)::numeric total FROM transactions WHERE company_id=$1 AND competence_at BETWEEN $2::date AND $3::date AND classification_status IN ('PENDING','SUGGESTED')`,[cid,range.from,range.to]),range.period?isClosed(cid,range.period):false])
  const fileReview=health.files.filter(f=>f.status!=='IMPORTED'||f.validation_status==='MISMATCH').length,pending=groups.length,missing=health.missing,hasData=health.files.length>0,penalty=Math.min(100,(hasData?0:100)+missing*20+fileReview*12+pending*3),quality=Math.max(0,100-penalty),ready=hasData&&missing===0&&fileReview===0&&pending===0
  return{period:range.period,quality,ready,closed,unclassifiedValue:n(unclassifiedValue.rows[0]?.total),steps:{files:{state:missing||fileReview?'WARN':'OK',text:!hasData?'Nenhum arquivo recebido':missing?`${missing} fonte(s) faltando`:fileReview?`${fileReview} arquivo(s) para revisar`:`${health.expected.length||health.files.length} fonte(s) conferidas`},transactions:{state:pending?'WARN':'OK',text:pending?`${pending} nome(s) para classificar`:'Classificações em dia'},reconciliation:{state:pending||missing?'WARN':'OK',text:pending?`${pending} pendência(s) — mesmas de Lançamentos`:'Sem pendências de classificação'},management:{state:ready?'OK':'WAIT',text:closed?'Período fechado':ready?'Pronto para fechar':'Aguardando conferência'}},sourceHealth:health,reconciliation:rec}
}

app.get('/api/company',async(req,res)=>{if(!pool)return res.json(demo.company);res.json(await getCompany(await companyId()))})
app.put('/api/company',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId(),{name,document,sector,activity}=req.body;await pool.query(`UPDATE companies SET name=COALESCE(NULLIF($2,''),name),document=COALESCE($3,document),sector=$4,activity=$5 WHERE id=$1`,[cid,name||'',document??null,sector??null,activity??null]);await auditSafe(cid,'COMPANY_UPDATED','company',cid,{sector,activity});res.json(await getCompany(cid))})
app.get('/api/categories',async(req,res)=>{if(!pool)return res.json(['Receita de vendas','Embalagens','Outras despesas']);const cid=await companyId(),rows=await getChartAccounts(cid,{includeGroups:false});res.json(rows.filter(a=>a.active).map(a=>a.name))})

app.get('/api/chart-accounts',async(req,res)=>{if(!pool)return res.json([]);res.json(await getChartAccounts(await companyId(),{includeInactive:true,includeGroups:true}))})
app.post('/api/chart-accounts',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId(),{code,name,parentId=null,accountType='EXPENSE',dreSection='DESPESAS_OPERACIONAIS',isGroup=false}=req.body;if(!name)return res.status(400).json({message:'Informe o nome da conta.'});try{const maxOrder=await pool.query(`SELECT COALESCE(max(dre_order),100) AS m FROM chart_accounts WHERE company_id=$1`,[cid]),r=await pool.query(`INSERT INTO chart_accounts(company_id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active) VALUES($1,NULLIF($2,''),$3,$4,$5,$6,$7,$8,true) RETURNING id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active`,[cid,code||'',name,parentId||null,accountType,isGroup?null:dreSection,n(maxOrder.rows[0]?.m)+1,Boolean(isGroup)]);await auditSafe(cid,'CHART_ACCOUNT_CREATED','chart_account',r.rows[0].id,r.rows[0]);res.json(r.rows[0])}catch(e){res.status(400).json({message:e.code==='23505'?'Já existe uma conta com esse código.':'Não foi possível criar a conta.'})}})
app.put('/api/chart-accounts/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId(),{code,name,parentId=null,accountType,dreSection,isGroup,active}=req.body,r=await pool.query(`UPDATE chart_accounts SET code=NULLIF($3,''),name=COALESCE(NULLIF($4,''),name),parent_id=$5,account_type=COALESCE($6,account_type),dre_section=CASE WHEN COALESCE($7,is_group) THEN NULL ELSE COALESCE($8,dre_section) END,is_group=COALESCE($7,is_group),active=COALESCE($9,active),updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active`,[req.params.id,cid,code??'',name??'',parentId||null,accountType??null,isGroup??null,dreSection??null,active??null]);if(!r.rowCount)return res.status(404).json({message:'Conta não encontrada.'});await auditSafe(cid,'CHART_ACCOUNT_UPDATED','chart_account',req.params.id,r.rows[0]);res.json(r.rows[0])})
app.delete('/api/chart-accounts/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId();await pool.query(`UPDATE chart_accounts SET active=false,updated_at=now() WHERE id=$1 AND company_id=$2`,[req.params.id,cid]);await auditSafe(cid,'CHART_ACCOUNT_DISABLED','chart_account',req.params.id,{});res.json({ok:true})})

app.get('/api/company-accounts',async(req,res)=>{if(!pool)return res.json([]);res.json(await getCompanyAccounts(await companyId()))})
app.post('/api/company-accounts',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId(),{label,institution,document,bankCode,agency,account,aliases=[]}=req.body;if(!label)return res.status(400).json({message:'Informe um nome para a conta.'});const r=await pool.query(`INSERT INTO company_accounts(company_id,label,institution,document,bank_code,agency,account,aliases) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id,label,institution,document,bank_code,agency,account,aliases,active`,[cid,label,institution||null,document||null,bankCode||null,agency||null,account||null,JSON.stringify(Array.isArray(aliases)?aliases:[])]);await auditSafe(cid,'COMPANY_ACCOUNT_CREATED','company_account',r.rows[0].id,r.rows[0]);res.json(r.rows[0])})
app.delete('/api/company-accounts/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId();await pool.query(`UPDATE company_accounts SET active=false WHERE id=$1 AND company_id=$2`,[req.params.id,cid]);res.json({ok:true})})

app.get('/api/expected-sources',async(req,res)=>{if(!pool)return res.json([]);const cid=await companyId(),r=await pool.query(`SELECT id,kind,label,frequency,active FROM expected_sources WHERE company_id=$1 ORDER BY label`,[cid]);res.json(r.rows)})
app.post('/api/expected-sources',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId(),{kind,label,active=true}=req.body;if(!kind||!label)return res.status(400).json({message:'Informe fonte e nome.'});const r=await pool.query(`INSERT INTO expected_sources(company_id,kind,label,active) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,kind) DO UPDATE SET label=excluded.label,active=excluded.active RETURNING *`,[cid,kind,label,active]);res.json(r.rows[0])})
app.delete('/api/expected-sources/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId();await pool.query(`UPDATE expected_sources SET active=false WHERE id=$1 AND company_id=$2`,[req.params.id,cid]);res.json({ok:true})})

app.get('/api/source-health',async(req,res)=>{if(!pool)return res.json({expected:[],files:[],missing:0,review:0});res.json(await sourceHealth(await companyId(),rangeFromQuery(req.query)))})
app.get('/api/period-status',async(req,res)=>{if(!pool)return res.json({quality:0,ready:false,steps:{}});res.json(await periodStatus(await companyId(),rangeFromQuery(req.query)))})

app.get('/api/dre',async(req,res)=>{if(!pool)return res.json({sections:[],result:demo.summary.result,revenue:demo.summary.revenue});res.json(await buildDre(await companyId(),rangeFromQuery(req.query)))})
app.get('/api/dre-comparative',async(req,res)=>{if(!pool)return res.json({year:new Date().getFullYear(),sections:[],result:[]});res.json(await buildDreComparative(await companyId(),req.query.year))})

app.get('/api/transactions',async(req,res)=>{
  if(!pool)return res.json({rows:[],total:0,inflow:0,outflow:0});
  try{
    const cid=await companyId(),range=rangeFromQuery(req.query),params=[cid,range.from,range.to],effectiveCompetence=`COALESCE(t.competence_at,t.occurred_at::date)`,where=[`t.company_id=$1`,`${effectiveCompetence} BETWEEN $2::date AND $3::date`]
    const add=(clause,value)=>{params.push(value);where.push(clause.replace('?',`$${params.length}`))}
    if(req.query.q){const q=`%${req.query.q}%`;params.push(q,q,q);where.push(`(t.description ILIKE $${params.length-2} OR t.category ILIKE $${params.length-1} OR t.normalized_party ILIKE $${params.length})`)}
    if(req.query.direction)add(`t.direction=?`,req.query.direction);if(req.query.category)add(`t.category=?`,req.query.category);if(req.query.paymentMethod)add(`t.payment_method=?`,req.query.paymentMethod);if(req.query.status)add(`t.financial_status=?`,req.query.status);if(req.query.sourceFile)add(`sf.id::text=?`,req.query.sourceFile)
    const sortMap={competence:effectiveCompetence,description:'t.description',paymentMethod:'t.payment_method',category:'t.category',status:'t.financial_status',amount:'t.amount'},sortExpr=sortMap[req.query.sort]||effectiveCompetence,sortOrder=String(req.query.order).toLowerCase()==='asc'?'ASC':'DESC',limit=Math.min(500,Math.max(20,Number(req.query.limit)||200)),offset=Math.max(0,Number(req.query.offset)||0)
    const summary=await pool.query(`SELECT count(*)::int n,COALESCE(sum(CASE WHEN t.amount>0 THEN t.amount ELSE 0 END),0)::numeric inflow,COALESCE(abs(sum(CASE WHEN t.amount<0 THEN t.amount ELSE 0 END)),0)::numeric outflow FROM transactions t LEFT JOIN source_files sf ON sf.id=t.source_file_id WHERE ${where.join(' AND ')}`,params)
    const rows=await pool.query(`SELECT t.id,t.occurred_at,t.competence_at,${effectiveCompetence} effective_competence_at,t.due_at,t.paid_at,t.description,t.normalized_party,t.counterparty_document,t.direction,t.amount,t.gross_amount,t.fee_amount,t.net_amount,t.category,t.account_id,t.payment_method,t.financial_status,t.classification_status,t.classification_source,t.classification_confidence,t.accounting_role,t.dre_impact,t.cash_impact,t.source_page,sf.id source_file_id,sf.name source_file_name,sf.kind source_kind FROM transactions t LEFT JOIN source_files sf ON sf.id=t.source_file_id WHERE ${where.join(' AND ')} ORDER BY ${sortExpr} ${sortOrder} NULLS LAST,t.occurred_at DESC,t.id DESC LIMIT ${limit} OFFSET ${offset}`,params)
    res.json({rows:rows.rows,total:n(summary.rows[0]?.n),inflow:n(summary.rows[0]?.inflow),outflow:n(summary.rows[0]?.outflow)})
  }catch(e){console.error('transactions',e);res.status(500).json({message:'Não foi possível carregar os lançamentos.',detail:process.env.NODE_ENV==='production'?undefined:e.message})}
})

app.patch('/api/transactions/:id',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'});
  try{
    const cid=await companyId(),id=req.params.id,current=await pool.query(`SELECT t.*,a.name account_name FROM transactions t LEFT JOIN chart_accounts a ON a.id=t.account_id WHERE t.id=$1 AND t.company_id=$2 LIMIT 1`,[id,cid]);
    if(!current.rowCount)return res.status(404).json({message:'Lançamento não encontrado.'});
    const before=current.rows[0],competenceAt=String(req.body.competenceAt||toDateOnly(before.competence_at)||toDateOnly(before.occurred_at)||'').slice(0,10),accountId=req.body.accountId||before.account_id||null,updateRule=Boolean(req.body.updateRule);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(competenceAt))return res.status(400).json({message:'Informe uma competência válida.'});
    const oldPeriod=String(toDateOnly(before.competence_at)||toDateOnly(before.occurred_at)||'').slice(0,7),newPeriod=competenceAt.slice(0,7);
    if((oldPeriod&&await isClosed(cid,oldPeriod))||(newPeriod!==oldPeriod&&await isClosed(cid,newPeriod)))return res.status(409).json({message:'O período está fechado. Reabra o mês antes de alterar o lançamento.'});
    let account=null;if(accountId){const ar=await pool.query(`SELECT id,name,dre_section FROM chart_accounts WHERE id=$1 AND company_id=$2 AND active=true AND is_group=false LIMIT 1`,[accountId,cid]);if(!ar.rowCount)return res.status(400).json({message:'Plano de Contas inválido.'});account=ar.rows[0]}
    const category=account?.name||before.category||'A classificar',dreImpact=account?account.dre_section!=='FORA_DRE':dreImpactForCategory(category),accountingRole=category==='Transferência entre contas próprias'?'TRANSFER':category==='Liquidação de cartão de crédito'?'CARD_SETTLEMENT':['TRANSFER','CARD_SETTLEMENT'].includes(before.accounting_role)?'BANK_MOVEMENT':before.accounting_role;
    const updated=await pool.query(`UPDATE transactions SET competence_at=$3::date,account_id=$4,category=$5,dre_impact=$6,accounting_role=$7,classification_status=CASE WHEN $4::uuid IS NULL THEN classification_status ELSE 'CONFIRMED' END,classification_source=CASE WHEN $4::uuid IS NULL THEN classification_source ELSE 'MANUAL_EDIT' END WHERE id=$1 AND company_id=$2 RETURNING *`,[id,cid,competenceAt,account?.id||null,category,dreImpact,accountingRole]);
    if(updateRule&&account&&before.normalized_party){await upsertCompanyRule({cid,party:String(before.normalized_party).toUpperCase().trim(),document:before.counterparty_document,direction:before.direction,category,accountId:account.id,source:'MANUAL_EDIT'})}
    await applyAccountingPolicy(cid);await auditSafe(cid,'TRANSACTION_EDITED','transaction',id,{before:{competenceAt:toDateOnly(before.competence_at)||toDateOnly(before.occurred_at),accountId:before.account_id,category:before.category},after:{competenceAt,accountId:account?.id||null,category},updateRule});
    res.json({ok:true,row:updated.rows[0]})
  }catch(e){console.error('transaction edit',e);res.status(500).json({message:'Não foi possível salvar a alteração.'})}
})

app.get('/api/dashboard',async(req,res)=>{
  if(!pool)return res.json(demo);try{const cid=await companyId(),range=rangeFromQuery(req.query),year=Number(range.from.slice(0,4)),[co,dre,groups,status,cash,months,payments]=await Promise.all([getCompany(cid),buildDre(cid,range),getReviewGroups(cid,range),periodStatus(cid,range),pool.query(`SELECT COALESCE(sum(CASE WHEN amount>0 AND cash_impact THEN amount ELSE 0 END),0)::numeric inflow,COALESCE(abs(sum(CASE WHEN amount<0 AND cash_impact THEN amount ELSE 0 END)),0)::numeric outflow FROM transactions WHERE company_id=$1 AND occurred_at::date BETWEEN $2::date AND $3::date`,[cid,range.from,range.to]),pool.query(`SELECT EXTRACT(MONTH FROM competence_at)::int m,COALESCE(sum(amount),0)::numeric total FROM transactions t JOIN chart_accounts a ON a.id=t.account_id WHERE t.company_id=$1 AND t.dre_impact=true AND a.dre_section='RECEITA_BRUTA' AND EXTRACT(YEAR FROM competence_at)=$2 GROUP BY m ORDER BY m`,[cid,year]),pool.query(`SELECT COALESCE(payment_method,'Não informado') method,COALESCE(sum(CASE WHEN amount>0 AND cash_impact THEN amount ELSE 0 END),0)::numeric received,COALESCE(abs(sum(CASE WHEN amount<0 AND cash_impact THEN amount ELSE 0 END)),0)::numeric paid FROM transactions WHERE company_id=$1 AND occurred_at::date BETWEEN $2::date AND $3::date GROUP BY payment_method ORDER BY received DESC`,[cid,range.from,range.to])]),monthArr=Array(12).fill(0);months.rows.forEach(x=>monthArr[x.m-1]=n(x.total));res.json({company:co,period:range,summary:{balance:n(cash.rows[0]?.inflow)-n(cash.rows[0]?.outflow),inflow:n(cash.rows[0]?.inflow),outflow:n(cash.rows[0]?.outflow),pending:groups.length,revenue:dre.revenue,result:dre.result,quality:status.quality,ready:status.ready,closed:status.closed,unclassifiedValue:status.unclassifiedValue},months:monthArr,payments:payments.rows,status:status.steps})}catch(e){console.error(e);res.json(demo)}})

app.get('/api/review-groups',async(req,res)=>{if(!pool)return res.json({groups:[]});res.json({groups:await getReviewGroups(await companyId(),rangeFromQuery(req.query))})})
app.post('/api/review-groups/classify',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId(),{normalizedParty,counterpartyDocument,direction,category,remember=true,onlyIds=[]}=req.body;if(!normalizedParty||!direction||!category)return res.status(400).json({message:'Informe nome, direção e categoria.'});const party=String(normalizedParty).toUpperCase().trim(),account=await ensureAccountForCategory(cid,category,direction);if(remember)await learnClassification({cid,party,document:counterpartyDocument,direction,category,source:'MANUAL',applyTransactions:true});else if(Array.isArray(onlyIds)&&onlyIds.length)await pool.query(`UPDATE transactions SET category=$2,account_id=$4,classification_confidence=100,classification_status='CONFIRMED',classification_source='MANUAL',dre_impact=$5 WHERE company_id=$1 AND id=ANY($3::uuid[]) AND NOT EXISTS (SELECT 1 FROM period_closures pc WHERE pc.company_id=transactions.company_id AND pc.period_key=to_char(transactions.competence_at,'YYYY-MM') AND pc.status='CLOSED')`,[cid,category,onlyIds,account?.id||null,dreImpactForCategory(category)]);await applyAccountingPolicy(cid);res.json({ok:true})})
app.post('/api/review-groups/classify-batch',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId(),items=Array.isArray(req.body.items)?req.body.items:[];let count=0;for(const item of items.slice(0,100)){if(!item.normalizedParty||!item.direction||!item.category)continue;await learnClassification({cid,party:String(item.normalizedParty).toUpperCase().trim(),document:item.counterpartyDocument,direction:item.direction,category:item.category,source:'MANUAL',applyTransactions:true});count++}await applyAccountingPolicy(cid);res.json({ok:true,count})})
app.post('/api/ai/suggest',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});try{const result=await runLunaForPending(await companyId(),rangeFromQuery(req.query));res.json({ok:true,...result})}catch(e){console.error('Luna',e);res.status(500).json({message:'A Luna não conseguiu sugerir agora. Você pode classificar manualmente.'})}})

app.get('/api/reconciliation',async(req,res)=>{if(!pool)return res.json({pending:0,matches:[],sourceHealth:{expected:[]}});res.json(await reconciliationSummary(await companyId(),rangeFromQuery(req.query)))})

app.post('/api/periods/close',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId(),range=rangeFromQuery({period:req.body.period});if(!range.period)return res.status(400).json({message:'Informe um mês.'});const st=await periodStatus(cid,range);if(!st.ready&&!req.body.force)return res.status(409).json({message:'Ainda existem pendências. Resolva Arquivos e Lançamentos antes de fechar.',status:st});const dreSnapshot=await buildDre(cid,range);await pool.query(`INSERT INTO period_closures(company_id,period_key,status,closed_at,closed_by,snapshot) VALUES($1,$2,'CLOSED',now(),'MASTER',$3::jsonb) ON CONFLICT(company_id,period_key) DO UPDATE SET status='CLOSED',closed_at=now(),closed_by='MASTER',snapshot=excluded.snapshot`,[cid,range.period,JSON.stringify({quality:st.quality,closedAt:new Date().toISOString(),dre:dreSnapshot})]);await auditSafe(cid,'PERIOD_CLOSED','period',range.period,{quality:st.quality});res.json({ok:true})})
app.post('/api/periods/reopen',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId(),period=req.body.period;await pool.query(`UPDATE period_closures SET status='OPEN',reopened_at=now(),reopened_by='MASTER' WHERE company_id=$1 AND period_key=$2`,[cid,period]);await auditSafe(cid,'PERIOD_REOPENED','period',period,{});res.json({ok:true})})
app.get('/api/audit',async(req,res)=>{if(!pool)return res.json([]);const cid=await companyId(),r=await pool.query(`SELECT action,entity_type,entity_id,details,actor,created_at FROM audit_log WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100`,[cid]);res.json(r.rows)})

app.post('/api/import',upload.array('files',100),async(req,res)=>{
  if(!req.uploadedFiles?.length)return res.status(400).json({message:'Nenhum arquivo recebido.'});if(!pool)return res.json({message:`${req.uploadedFiles.length} arquivo(s) lido(s). Configure DATABASE_URL para persistir.`})
  const cid=await companyId();let company=await getCompany(cid),imported=0,duplicates=0,records=0,supplierLearned=0,globalShared=0,newAccounts=0,reviewFiles=0
  for(const f of req.uploadedFiles){try{
    const hash=crypto.createHash('sha256').update(f.buffer).digest('hex'),exists=await pool.query('SELECT id FROM source_files WHERE company_id=$1 AND hash=$2',[cid,hash]);if(exists.rowCount){duplicates++;continue}const ext=path.extname(f.originalname).toLowerCase()
    if(['.xlsx','.xls','.csv'].includes(ext)){const supplierBase=parseSupplierBase(f.buffer);if(supplierBase.matched){const sf=await pool.query(`INSERT INTO source_files(company_id,name,hash,kind,status,status_detail,record_count,confidence,validation_status) VALUES($1,$2,$3,'SUPPLIER_BASE','IMPORTED','Base de fornecedores aprendida',$4,$5,'NOT_AVAILABLE') RETURNING id`,[cid,f.originalname,hash,supplierBase.records.length,supplierBase.confidence]),learned=await importSupplierRecords(cid,sf.rows[0].id,supplierBase.records);supplierLearned+=learned.learned;globalShared+=learned.shared;newAccounts+=learned.newAccounts;records+=supplierBase.records.length;imported++;await auditSafe(cid,'SUPPLIER_BASE_IMPORTED','source_file',sf.rows[0].id,{name:f.originalname,records:supplierBase.records.length});continue}}
    let parsed;if(ext==='.pdf')parsed=await parsePdf(f.buffer);else if(['.xlsx','.xls','.csv'].includes(ext))parsed=parseTabular(f.buffer);else continue
    if(ext==='.pdf'&&!parsed.transactions.length&&process.env.AI_ENABLED==='true'&&parsed.textForAi){
      try{const adapted=await adaptUnknownPdf({text:parsed.textForAi,company});if(adapted?.transactions?.length){parsed.kind=`AI_ADAPTED_${String(adapted.document_type||'PDF').toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`;parsed.confidence=adapted.confidence||70;parsed.transactions=adapted.transactions.map(x=>{const d=x.date?new Date(`${x.date}T12:00:00-03:00`):new Date();return{occurredAt:d,competenceAt:d,paidAt:d,description:x.description,amount:x.direction==='SAIDA'?-Math.abs(n(x.amount)):Math.abs(n(x.amount)),direction:x.direction,paymentMethod:x.payment_method||null,financialStatus:'PAID',raw:{source:'luna_pdf_adapter'}}});parsed.validation={status:'AI_ADAPTED'};parsed.metadata.periodStart=parsed.transactions.map(t=>toDateOnly(t.competenceAt)).sort()[0]||null;parsed.metadata.periodEnd=parsed.transactions.map(t=>toDateOnly(t.competenceAt)).sort().at(-1)||null}}
      catch(e){console.error('Luna file adapter',e.message)}
    }
    if(parsed.metadata?.document&&!company?.document){await pool.query(`UPDATE companies SET document=$2,name=CASE WHEN name='Empresa Demonstração' AND $3 IS NOT NULL THEN $3 ELSE name END WHERE id=$1`,[cid,parsed.metadata.document,parsed.metadata.name]);company=await getCompany(cid)}
    const txDates=parsed.transactions.map(t=>toDateOnly(t.competenceAt||t.occurredAt)).filter(Boolean).sort(),periodStart=parsed.metadata?.periodStart||txDates[0]||null,periodEnd=parsed.metadata?.periodEnd||txDates.at(-1)||null,periodKey=periodStart&&periodEnd&&periodStart.slice(0,7)===periodEnd.slice(0,7)?periodStart.slice(0,7):null
    if(periodKey&&await isClosed(cid,periodKey)){reviewFiles++;continue}
    let status='IMPORTED',detail='Arquivo lido e contabilizado';if(!parsed.transactions.length){status='REVIEW';detail='Arquivo reconhecido, mas nenhum lançamento foi extraído'}else if(parsed.validation?.status==='MISMATCH'){status='REVIEW';detail='Valores extraídos não fecham com os totais informados no arquivo';reviewFiles++}
    const sf=await pool.query(`INSERT INTO source_files(company_id,name,hash,kind,status,status_detail,record_count,confidence,validation_status,validation,period_start,period_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) RETURNING id`,[cid,f.originalname,hash,parsed.kind,status,detail,parsed.transactions.length,parsed.confidence,parsed.validation?.status||'NOT_AVAILABLE',JSON.stringify(parsed.validation||{}),periodStart,periodEnd]);await autoExpectedSource(cid,parsed.kind)
    for(const t of parsed.transactions){const c=await classify(t,cid,company);let role='BANK_MOVEMENT',dreImpact=dreImpactForCategory(c.category),cashImpact=true,financialStatus=t.financialStatus||'PAID';if(parsed.kind==='PAGBANK_SALES'){role='SALES_EVENT';dreImpact=true;cashImpact=false}if(parsed.kind==='NUBANK_CARD'){role='CARD_PURCHASE';dreImpact=true;cashImpact=false;financialStatus='OPEN'}if(c.category==='Transferência entre contas próprias'){role='TRANSFER';dreImpact=false}if(c.category==='Liquidação de cartão de crédito'){role='CARD_SETTLEMENT';dreImpact=false}
      const ins=await pool.query(`INSERT INTO transactions(company_id,source_file_id,occurred_at,competence_at,due_at,paid_at,description,normalized_party,counterparty_document,direction,amount,gross_amount,fee_amount,net_amount,category,account_id,classification_confidence,classification_status,classification_source,payment_method,financial_status,dre_impact,cash_impact,accounting_role,external_id,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb) RETURNING id`,[cid,sf.rows[0].id,t.occurredAt,t.competenceAt||t.occurredAt,t.dueAt||null,t.paidAt||null,t.description,c.normalized_party,c.counterparty_document,t.direction,t.amount,t.grossAmount??null,t.feeAmount??null,t.netAmount??null,c.category,c.account_id,c.confidence,c.status,c.source,t.paymentMethod||paymentMethod(t.description),financialStatus,dreImpact,cashImpact,role,t.externalId||null,JSON.stringify(t.raw||{})])
      if(parsed.kind==='PAGBANK_SALES'&&n(t.feeAmount)>0){const feeAccount=await ensureAccountForCategory(cid,'Taxas bancárias e financeiras','SAIDA');await pool.query(`INSERT INTO transactions(company_id,source_file_id,occurred_at,competence_at,description,normalized_party,direction,amount,category,account_id,classification_confidence,classification_status,classification_source,payment_method,financial_status,dre_impact,cash_impact,accounting_role,economic_key,raw) VALUES($1,$2,$3,$4,$5,'PAGBANK','SAIDA',$6,'Taxas bancárias e financeiras',$7,100,'AUTO','PARSER',$8,'PAID',true,false,'FEE',$9,$10::jsonb)`,[cid,sf.rows[0].id,t.occurredAt,t.competenceAt||t.occurredAt,`Taxa PagBank — ${t.description}`,-Math.abs(n(t.feeAmount)),feeAccount?.id||null,t.paymentMethod||paymentMethod(t.description),ins.rows[0].id,JSON.stringify({source:'pagbank_sales_fee',parentTransactionId:ins.rows[0].id})])}
      records++
    }
    imported++;await auditSafe(cid,'FILE_IMPORTED','source_file',sf.rows[0].id,{name:f.originalname,kind:parsed.kind,records:parsed.transactions.length,status})
  }catch(e){console.error('import error',f.originalname,e);reviewFiles++}}
  await applyAccountingPolicy(cid);let aiUpdated=0;try{if(process.env.AI_ENABLED==='true'){const r=await runLunaForPending(cid);aiUpdated=r.updated||0}}catch(e){console.error('automatic Luna',e)}const review=(await getReviewGroups(cid)).length,extras=[];if(supplierLearned)extras.push(`${supplierLearned} fornecedor(es) ensinaram o Claria`);if(globalShared)extras.push(`${globalShared} classificação(ões) alimentaram a biblioteca compartilhada`);if(newAccounts)extras.push(`${newAccounts} nova(s) conta(s) foram adicionadas ao Plano de Contas`);res.json({message:`Importação concluída: ${imported} arquivo(s), ${records} lançamento(s). ${duplicates?duplicates+' duplicado(s) ignorado(s). ':''}${reviewFiles?reviewFiles+' arquivo(s) precisam de revisão. ':''}${extras.length?extras.join('; ')+'. ':''}${aiUpdated?`Luna sugeriu ${aiUpdated} novo(s) nome(s). `:''}${review?review+' nome(s) precisam de confirmação.':'Classificações em dia.'}`})
})

app.post('/api/classification-rules',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId(),{pattern,category,scope='COMPANY',direction='ANY'}=req.body,party=String(pattern).toUpperCase(),account=scope==='GLOBAL'?null:await ensureAccountForCategory(cid,category,direction);await pool.query(`INSERT INTO classification_rules(scope,company_id,pattern,normalized_party,direction,category,account_id,confidence,source) VALUES($1,$2,$3,$3,$4,$5,$6,100,'MANUAL')`,[scope,scope==='GLOBAL'?null:cid,party,direction,category,account?.id||null]);res.json({ok:true})})

app.get('/api/health',async(req,res)=>{if(!pool)return res.json({ok:true,version:'0.3.3',database:'not_configured'});try{const r=await pool.query(`SELECT value FROM schema_meta WHERE key='schema_version' LIMIT 1`);res.json({ok:true,version:'0.3.3',database:'ok',schema:r.rows[0]?.value||'unknown'})}catch(e){res.status(503).json({ok:false,version:'0.3.3',database:'migration_failed',message:e.message})}})

const dist=path.resolve(__dirname,'../../client/dist')
async function start(){
  await initDb()
  if(fs.existsSync(dist)){
    await server.register(fastifyStatic,{root:dist,prefix:'/'})
    server.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({message:'Rota não encontrada.'}):reply.sendFile('index.html'))
  }
  await server.listen({port:PORT,host:'0.0.0.0'})
  console.log(`Claria v0.3.3 on :${PORT}`)
}
start().catch(e=>{console.error('Startup failed',e);process.exit(1)})
