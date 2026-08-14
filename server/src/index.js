import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { initDb, pool, companyId, getCompany, getCompanyAccounts, getChartAccounts, findAccountByName, DRE_SECTIONS } from './db.js'
import { parsePdf } from './parsers/pdf.js'
import { parseTabular } from './parsers/tabular.js'
import { parseSupplierBase } from './parsers/suppliers.js'
import { classify } from './services/classify.js'
import { suggestNegativeParties } from './services/ai.js'
import { isLikelyBusinessName, normalize } from './services/entity.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000
const mb = Number(process.env.MAX_UPLOAD_MB || 25)
const upload = multer({ storage:multer.memoryStorage(), limits:{ fileSize:mb*1024*1024, files:100 } })
app.use(cors())
app.use(express.json({limit:'2mb'}))

const demo = {
  company:{id:'demo',name:'Encantê Natural',sector:'Comércio',activity:'Produtos naturais'},
  summary:{balance:5731.62,inflow:11096.69,outflow:13113.60,pending:5,revenue:10601,result:-6999},
  months:[2379,6490,10562,19005,14445,19278,10601],
  files:[{name:'Extrato PagBank Julho.pdf',type:'Extrato bancário',count:35,status:'Importado'},{name:'Base fornecedores.xlsx',type:'Base de fornecedores',count:42,status:'Importado'}],
  tx:[
    {id:'1',date:'31/07/2026',description:'Transferência Recebida Raissa Rafaela Dias da Silva',normalizedParty:'RAISSA RAFAELA DIAS DA SILVA',amount:179,type:'ENTRADA',category:'Receita de vendas',confidence:78,status:'SUGGESTED',source:'HEURISTIC'},
    {id:'2',date:'23/07/2026',description:'EPLACE COPIADORA E GRAFICA RAPIDA',normalizedParty:'EPLACE COPIADORA E GRAFICA RAPIDA',amount:-133.2,type:'SAIDA',category:'Material de escritório / gráfica',confidence:91,status:'SUGGESTED',source:'AI'}
  ]
}

const n = v => Number(v || 0)
const cleanDocument = v => String(v || '').replace(/\D/g,'')

function dreSectionLabel(key) {
  return DRE_SECTIONS.find(x => x[0] === key)?.[1] || key || 'Não mapeado'
}

async function getReviewGroups(cid) {
  const r = await pool.query(`SELECT id,normalized_party,counterparty_document,direction,amount,description,category,account_id,classification_confidence,classification_status,classification_source
    FROM transactions WHERE company_id=$1 AND classification_status IN ('PENDING','SUGGESTED') ORDER BY occurred_at DESC`,[cid])
  const map = new Map()
  for (const row of r.rows) {
    const party = row.normalized_party || row.description
    const key = `${row.direction}|${party}`
    if (!map.has(key)) map.set(key,{normalizedParty:party,counterpartyDocument:row.counterparty_document||null,direction:row.direction,count:0,total:0,category:row.category||'A classificar',accountId:row.account_id||null,confidence:0,source:row.classification_source||null,samples:[],ids:[],shareable:false})
    const g = map.get(key)
    g.count++; g.total += n(row.amount); g.confidence = Math.max(g.confidence,n(row.classification_confidence)); g.ids.push(row.id)
    if (!g.counterpartyDocument && row.counterparty_document) g.counterpartyDocument = row.counterparty_document
    if (g.samples.length < 2 && !g.samples.includes(row.description)) g.samples.push(row.description)
    if (row.category && row.category !== 'A classificar') g.category = row.category
    if (row.account_id) g.accountId = row.account_id
    if (row.classification_source) g.source = row.classification_source
  }
  for (const g of map.values()) {
    const d = cleanDocument(g.counterpartyDocument)
    g.shareable = g.direction === 'SAIDA' && (d.length === 14 || isLikelyBusinessName(g.normalizedParty))
  }
  return [...map.values()].sort((a,b)=>b.count-a.count || Math.abs(b.total)-Math.abs(a.total))
}

async function ensureAccountForCategory(cid, category, direction='SAIDA') {
  if (!category || category === 'A classificar' || category === 'Revisar') return null
  let account = await findAccountByName(cid, category)
  if (account) return account
  const text = normalize(category)
  let section = direction === 'ENTRADA' ? 'RECEITA_BRUTA' : 'DESPESAS_OPERACIONAIS'
  let type = direction === 'ENTRADA' ? 'REVENUE' : 'EXPENSE'
  let parentName = direction === 'ENTRADA' ? 'Receitas' : 'Despesas operacionais'
  if (/MERCADOR|INSUM|CMV|CUSTO|FRETE/.test(text)) { section='CUSTOS'; type='COST'; parentName='Custos e mercadorias' }
  if (/TRANSFER|APORTE|EMPRESTIMO|CARTAO DE CREDITO|RETIRADA/.test(text)) { section='FORA_DRE'; type='TRANSFER'; parentName='Movimentações fora da DRE' }
  if (/TAXA BANC|JURO|FINANCEIR/.test(text)) { section='RESULTADO_FINANCEIRO'; type='FINANCIAL'; parentName='Financeiro' }
  if (/ESTORNO|REEMBOLSO|DEDU/.test(text)) { section='DEDUCOES_RECEITA'; type='DEDUCTION'; parentName='Deduções da receita' }
  const parent = await pool.query(`SELECT id FROM chart_accounts WHERE company_id=$1 AND active=true AND is_group=true AND upper(name)=upper($2) LIMIT 1`,[cid,parentName])
  const maxOrder = await pool.query(`SELECT COALESCE(max(dre_order),100) AS m FROM chart_accounts WHERE company_id=$1`,[cid])
  const r = await pool.query(`INSERT INTO chart_accounts(company_id,name,parent_id,account_type,dre_section,dre_order,is_group,active)
    VALUES($1,$2,$3,$4,$5,$6,false,true) RETURNING id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active`,
    [cid,category,parent.rows[0]?.id||null,type,section,n(maxOrder.rows[0]?.m)+1])
  return r.rows[0]
}

async function upsertCompanyRule({cid,party,document,direction,category,accountId,source='MANUAL',sourceFileId=null}) {
  await pool.query(`DELETE FROM classification_rules WHERE scope='COMPANY' AND company_id=$1 AND normalized_party=$2 AND direction=$3`,[cid,party,direction])
  await pool.query(`INSERT INTO classification_rules(scope,company_id,pattern,normalized_party,entity_document,direction,category,account_id,confidence,source,source_file_id)
    VALUES('COMPANY',$1,$2,$2,$3,$4,$5,$6,100,$7,$8)`,[cid,party,document||null,direction,category,accountId||null,source,sourceFileId])
}

async function promoteGlobalRule({cid,party,document,direction,category,source='MANUAL',sourceFileId=null}) {
  const doc = cleanDocument(document)
  const blocked = new Set(['Transferência entre contas próprias','Aporte / Empréstimo','Cartão de crédito','Retirada do sócio'])
  const shareable = direction === 'SAIDA' && !blocked.has(category) && (doc.length === 14 || isLikelyBusinessName(party))
  if (!shareable) return false
  let rule = await pool.query(`SELECT id FROM classification_rules WHERE scope='GLOBAL' AND normalized_party=$1 AND direction=$2 AND category=$3 LIMIT 1`,[party,direction,category])
  let ruleId
  if (!rule.rowCount) {
    const ins = await pool.query(`INSERT INTO classification_rules(scope,pattern,normalized_party,entity_document,direction,category,confidence,source,confirmation_count,source_file_id)
      VALUES('GLOBAL',$1,$1,$2,$3,$4,80,$5,0,$6) RETURNING id`,[party,doc.length===14?doc:null,direction,category,source,sourceFileId])
    ruleId = ins.rows[0].id
  } else ruleId = rule.rows[0].id
  await pool.query(`INSERT INTO global_rule_confirmations(rule_id,company_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[ruleId,cid])
  const count = await pool.query(`SELECT count(*)::int AS n FROM global_rule_confirmations WHERE rule_id=$1`,[ruleId])
  const confirmations = n(count.rows[0]?.n)
  const confidence = Math.min(99,72 + confirmations*8)
  await pool.query(`UPDATE classification_rules SET entity_document=COALESCE(entity_document,$2),confirmation_count=$3,confidence=GREATEST(confidence,$4),updated_at=now() WHERE id=$1`,[ruleId,doc.length===14?doc:null,confirmations,confidence])
  return true
}

async function learnClassification({cid,party,document,direction,category,source='MANUAL',sourceFileId=null,applyTransactions=true}) {
  const account = await ensureAccountForCategory(cid,category,direction)
  await upsertCompanyRule({cid,party,document,direction,category,accountId:account?.id,source,sourceFileId})
  if (applyTransactions) {
    await pool.query(`UPDATE transactions SET category=$4,account_id=$5,classification_confidence=100,classification_status='CONFIRMED',classification_source=$6
      WHERE company_id=$1 AND normalized_party=$2 AND direction=$3`,[cid,party,direction,category,account?.id||null,source])
  }
  const shared = await promoteGlobalRule({cid,party,document,direction,category,source,sourceFileId})
  return {account,shared}
}

async function importSupplierRecords(cid, sourceFileId, records) {
  let learned = 0, shared = 0, newAccounts = 0
  for (const rec of records.slice(0,5000)) {
    const before = await findAccountByName(cid,rec.category)
    const out = await learnClassification({cid,party:rec.normalizedParty,document:rec.document,direction:rec.direction,category:rec.category,source:'SUPPLIER_EXCEL',sourceFileId,applyTransactions:true})
    if (!before && out.account) newAccounts++
    if (out.shared) shared++
    learned++
  }
  return {learned,shared,newAccounts}
}

async function runLunaForPending(cid) {
  if (!pool) return {updated:0,skipped:true}
  const company = await getCompany(cid)
  const accounts = await getChartAccounts(cid,{includeGroups:false})
  const categories = [...new Set(accounts.filter(a=>a.active && a.dre_section!=='FORA_DRE').map(a=>a.name))]
  const groups = (await getReviewGroups(cid)).filter(g=>g.direction==='SAIDA'&&(g.category==='A classificar'||g.source!=='AI'))
  if (!groups.length) return {updated:0}
  const suggestions = await suggestNegativeParties({company,groups,categories})
  let updated = 0
  for (const s of suggestions) {
    const party = String(s.party||'').trim().toUpperCase()
    const group = groups.find(g=>g.normalizedParty===party)
    if (!group) continue
    const category = s.category==='Revisar'?'A classificar':s.category
    const confidence = Math.max(0,Math.min(100,n(s.confidence)))
    const account = category==='A classificar' ? null : await ensureAccountForCategory(cid,category,'SAIDA')
    await pool.query(`UPDATE transactions SET category=$4,account_id=$6,classification_confidence=$5,classification_status='SUGGESTED',classification_source='AI'
      WHERE company_id=$1 AND normalized_party=$2 AND direction=$3 AND classification_status IN ('PENDING','SUGGESTED')`,[cid,party,'SAIDA',category,confidence,account?.id||null])
    updated++
  }
  return {updated}
}

async function buildDre(cid) {
  const accounts = await getChartAccounts(cid,{includeGroups:false})
  const sums = await pool.query(`SELECT account_id,COALESCE(sum(amount),0)::numeric AS total FROM transactions WHERE company_id=$1 AND account_id IS NOT NULL GROUP BY account_id`,[cid])
  const sumMap = new Map(sums.rows.map(r=>[r.account_id,n(r.total)]))
  const sectionOrder = new Map(DRE_SECTIONS.map(x=>[x[0],x[2]]))
  const sections = DRE_SECTIONS.filter(x=>x[0]!=='FORA_DRE').map(([key,label,order])=>({key,label,order,accounts:[],total:0}))
  const sectionMap = new Map(sections.map(s=>[s.key,s]))
  for (const a of accounts) {
    if (!a.dre_section || a.dre_section==='FORA_DRE') continue
    const sec = sectionMap.get(a.dre_section) || sectionMap.get('OUTRAS_RECEITAS_DESPESAS')
    const amount = sumMap.get(a.id) || 0
    sec.accounts.push({id:a.id,code:a.code,name:a.name,amount,order:a.dre_order})
    sec.total += amount
  }
  for (const s of sections) s.accounts.sort((a,b)=>a.order-b.order || String(a.code||'').localeCompare(String(b.code||'')))
  sections.sort((a,b)=>(sectionOrder.get(a.key)||100)-(sectionOrder.get(b.key)||100))
  const result = sections.reduce((a,s)=>a+s.total,0)
  const revenue = sectionMap.get('RECEITA_BRUTA')?.total || 0
  return {sections,result,revenue}
}

app.get('/api/company',async(req,res)=>{if(!pool)return res.json(demo.company);const cid=await companyId();res.json(await getCompany(cid))})
app.put('/api/company',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId();const {name,document,sector,activity}=req.body;await pool.query(`UPDATE companies SET name=COALESCE(NULLIF($2,''),name),document=COALESCE($3,document),sector=$4,activity=$5 WHERE id=$1`,[cid,name||'',document??null,sector??null,activity??null]);res.json(await getCompany(cid))})

app.get('/api/categories',async(req,res)=>{
  if(!pool)return res.json(['Receita de vendas','Compra de mercadoria / insumos','Fretes e entregas','Marketing e anúncios','Transferência entre contas próprias','Outras despesas'])
  const cid=await companyId();const rows=await getChartAccounts(cid,{includeGroups:false});res.json(rows.filter(a=>a.active).map(a=>a.name))
})

app.get('/api/chart-accounts',async(req,res)=>{
  if(!pool)return res.json([])
  const cid=await companyId();res.json(await getChartAccounts(cid,{includeInactive:true,includeGroups:true}))
})

app.post('/api/chart-accounts',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  const cid=await companyId();const {code,name,parentId=null,accountType='EXPENSE',dreSection='DESPESAS_OPERACIONAIS',isGroup=false}=req.body
  if(!name)return res.status(400).json({message:'Informe o nome da conta.'})
  try{
    const maxOrder=await pool.query(`SELECT COALESCE(max(dre_order),100) AS m FROM chart_accounts WHERE company_id=$1`,[cid])
    const r=await pool.query(`INSERT INTO chart_accounts(company_id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active)
      VALUES($1,NULLIF($2,''),$3,$4,$5,$6,$7,$8,true) RETURNING id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active`,[cid,code||'',name,parentId||null,accountType,isGroup?null:dreSection,n(maxOrder.rows[0]?.m)+1,Boolean(isGroup)])
    res.json(r.rows[0])
  }catch(e){res.status(400).json({message:e.code==='23505'?'Já existe uma conta com esse código.':'Não foi possível criar a conta.'})}
})

app.put('/api/chart-accounts/:id',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  const cid=await companyId();const {code,name,parentId=null,accountType,dreSection,isGroup,active}=req.body
  const r=await pool.query(`UPDATE chart_accounts SET code=NULLIF($3,''),name=COALESCE(NULLIF($4,''),name),parent_id=$5,
    account_type=COALESCE($6,account_type),dre_section=CASE WHEN COALESCE($7,is_group) THEN NULL ELSE COALESCE($8,dre_section) END,
    is_group=COALESCE($7,is_group),active=COALESCE($9,active),updated_at=now() WHERE id=$1 AND company_id=$2
    RETURNING id,code,name,parent_id,account_type,dre_section,dre_order,is_group,active`,[req.params.id,cid,code??'',name??'',parentId||null,accountType??null,isGroup??null,dreSection??null,active??null])
  if(!r.rowCount)return res.status(404).json({message:'Conta não encontrada.'});res.json(r.rows[0])
})

app.delete('/api/chart-accounts/:id',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  const cid=await companyId();await pool.query(`UPDATE chart_accounts SET active=false,updated_at=now() WHERE id=$1 AND company_id=$2`,[req.params.id,cid]);res.json({ok:true})
})

app.get('/api/company-accounts',async(req,res)=>{if(!pool)return res.json([]);const cid=await companyId();res.json(await getCompanyAccounts(cid))})
app.post('/api/company-accounts',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  const cid=await companyId();const {label,institution,document,bankCode,agency,account,aliases=[]}=req.body
  if(!label)return res.status(400).json({message:'Informe um nome para a conta.'})
  const r=await pool.query(`INSERT INTO company_accounts(company_id,label,institution,document,bank_code,agency,account,aliases) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id,label,institution,document,bank_code,agency,account,aliases,active`,[cid,label,institution||null,document||null,bankCode||null,agency||null,account||null,JSON.stringify(Array.isArray(aliases)?aliases:[])])
  res.json(r.rows[0])
})
app.delete('/api/company-accounts/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId();await pool.query(`UPDATE company_accounts SET active=false WHERE id=$1 AND company_id=$2`,[req.params.id,cid]);res.json({ok:true})})

app.get('/api/dre',async(req,res)=>{if(!pool)return res.json({sections:[],result:demo.summary.result,revenue:demo.summary.revenue});const cid=await companyId();res.json(await buildDre(cid))})

app.get('/api/dashboard',async(req,res)=>{
  if(!pool)return res.json(demo)
  try{
    const cid=await companyId()
    const [co,tx,files,groups,dre] = await Promise.all([
      getCompany(cid),
      pool.query(`SELECT id,occurred_at,description,normalized_party,amount,direction,category,classification_confidence,classification_status,classification_source FROM transactions WHERE company_id=$1 ORDER BY occurred_at DESC LIMIT 150`,[cid]),
      pool.query(`SELECT name,kind,record_count,status FROM source_files WHERE company_id=$1 ORDER BY created_at DESC LIMIT 20`,[cid]),
      getReviewGroups(cid),
      buildDre(cid)
    ])
    if(!tx.rowCount&&!files.rowCount)return res.json({...demo,company:co||demo.company})
    const rows=tx.rows
    const inflow=rows.filter(x=>n(x.amount)>0).reduce((a,x)=>a+n(x.amount),0)
    const outflow=Math.abs(rows.filter(x=>n(x.amount)<0).reduce((a,x)=>a+n(x.amount),0))
    res.json({company:co,summary:{balance:inflow-outflow,inflow,outflow,pending:groups.length,revenue:dre.revenue,result:dre.result},months:demo.months,
      files:files.rows.map(f=>({name:f.name,type:f.kind==='SUPPLIER_BASE'?'Base de fornecedores':f.kind,count:f.record_count,status:f.status==='IMPORTED'?'Importado':'Revisar'})),
      tx:rows.map(t=>({id:t.id,date:t.occurred_at?new Date(t.occurred_at).toLocaleDateString('pt-BR'):'',description:t.description,normalizedParty:t.normalized_party,amount:n(t.amount),type:t.direction,category:t.category||'A classificar',confidence:n(t.classification_confidence),status:t.classification_status,source:t.classification_source}))})
  }catch(e){console.error(e);res.json(demo)}
})

app.get('/api/review-groups',async(req,res)=>{if(!pool)return res.json({groups:[]});const cid=await companyId();res.json({groups:await getReviewGroups(cid)})})

app.post('/api/review-groups/classify',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  const cid=await companyId();const {normalizedParty,counterpartyDocument,direction,category,remember=true,onlyIds=[]}=req.body
  if(!normalizedParty||!direction||!category)return res.status(400).json({message:'Informe nome, direção e categoria.'})
  const party=String(normalizedParty).toUpperCase().trim()
  const account=await ensureAccountForCategory(cid,category,direction)
  if(remember){
    await learnClassification({cid,party,document:counterpartyDocument,direction,category,source:'MANUAL',applyTransactions:true})
  }else if(Array.isArray(onlyIds)&&onlyIds.length){
    await pool.query(`UPDATE transactions SET category=$2,account_id=$4,classification_confidence=100,classification_status='CONFIRMED',classification_source='MANUAL' WHERE company_id=$1 AND id=ANY($3::uuid[])`,[cid,category,onlyIds,account?.id||null])
  }
  res.json({ok:true})
})

app.post('/api/review-groups/classify-batch',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  const cid=await companyId();const items=Array.isArray(req.body.items)?req.body.items:[];let count=0
  for(const item of items.slice(0,100)){
    if(!item.normalizedParty||!item.direction||!item.category)continue
    await learnClassification({cid,party:String(item.normalizedParty).toUpperCase().trim(),document:item.counterpartyDocument,direction:item.direction,category:item.category,source:'MANUAL',applyTransactions:true})
    count++
  }
  res.json({ok:true,count})
})

app.post('/api/ai/suggest',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  try{const cid=await companyId();const result=await runLunaForPending(cid);res.json({ok:true,...result})}catch(e){console.error('Luna error',e);res.status(500).json({message:'A Luna não conseguiu sugerir agora. Você pode classificar manualmente sem perder o fluxo.'})}
})

app.post('/api/import',upload.array('files',100),async(req,res)=>{
  if(!req.files?.length)return res.status(400).json({message:'Nenhum arquivo recebido.'})
  if(!pool)return res.json({message:`${req.files.length} arquivo(s) lido(s). Configure DATABASE_URL para persistir os registros.`})
  const cid=await companyId();let company=await getCompany(cid);let imported=0,duplicates=0,records=0,supplierLearned=0,globalShared=0,newAccounts=0
  for(const f of req.files){
    try{
      const hash=crypto.createHash('sha256').update(f.buffer).digest('hex')
      const exists=await pool.query('SELECT id FROM source_files WHERE company_id=$1 AND hash=$2',[cid,hash]);if(exists.rowCount){duplicates++;continue}
      const ext=path.extname(f.originalname).toLowerCase()

      // Excel/CSV pode ser uma base de fornecedores/classificação. Se for, ensina o SQL e não cria lançamentos.
      if(['.xlsx','.xls','.csv'].includes(ext)){
        const supplierBase=parseSupplierBase(f.buffer)
        if(supplierBase.matched){
          const sf=await pool.query(`INSERT INTO source_files(company_id,name,hash,kind,status,record_count,confidence) VALUES($1,$2,$3,'SUPPLIER_BASE','IMPORTED',$4,$5) RETURNING id`,[cid,f.originalname,hash,supplierBase.records.length,supplierBase.confidence])
          const learned=await importSupplierRecords(cid,sf.rows[0].id,supplierBase.records)
          supplierLearned+=learned.learned;globalShared+=learned.shared;newAccounts+=learned.newAccounts;records+=supplierBase.records.length;imported++;continue
        }
      }

      let parsed
      if(ext==='.pdf')parsed=await parsePdf(f.buffer)
      else if(['.xlsx','.xls','.csv'].includes(ext))parsed=parseTabular(f.buffer)
      else continue
      if(parsed.metadata?.document && !company?.document){await pool.query(`UPDATE companies SET document=$2,name=CASE WHEN name='Empresa Demonstração' AND $3 IS NOT NULL THEN $3 ELSE name END WHERE id=$1`,[cid,parsed.metadata.document,parsed.metadata.name]);company=await getCompany(cid)}
      const sf=await pool.query(`INSERT INTO source_files(company_id,name,hash,kind,status,record_count,confidence) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[cid,f.originalname,hash,parsed.kind,parsed.confidence<70?'REVIEW':'IMPORTED',parsed.transactions.length,parsed.confidence])
      for(const t of parsed.transactions){
        const c=await classify(t,cid,company)
        await pool.query(`INSERT INTO transactions(company_id,source_file_id,occurred_at,description,normalized_party,counterparty_document,direction,amount,gross_amount,fee_amount,net_amount,category,account_id,classification_confidence,classification_status,classification_source,raw)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[cid,sf.rows[0].id,t.occurredAt,t.description,c.normalized_party,c.counterparty_document,t.direction,t.amount,t.grossAmount??null,t.feeAmount??null,t.netAmount??null,c.category,c.account_id,c.confidence,c.status,c.source,t.raw||{}])
      }
      imported++;records+=parsed.transactions.length
    }catch(e){console.error('import error',f.originalname,e)}
  }
  let aiUpdated=0
  try{if(process.env.AI_ENABLED==='true'){const r=await runLunaForPending(cid);aiUpdated=r.updated||0}}catch(e){console.error('automatic Luna suggestions failed',e)}
  const review=(await getReviewGroups(cid)).length
  const extras=[]
  if(supplierLearned)extras.push(`${supplierLearned} fornecedor(es) ensinaram o Claria`)
  if(globalShared)extras.push(`${globalShared} classificação(ões) puderam alimentar a biblioteca compartilhada`)
  if(newAccounts)extras.push(`${newAccounts} nova(s) conta(s) foram adicionadas ao Plano de Contas`)
  res.json({message:`Importação concluída: ${imported} arquivo(s), ${records} registro(s). ${duplicates?duplicates+' duplicado(s) ignorado(s). ':''}${extras.length?extras.join('; ')+'. ':''}${aiUpdated?`Luna sugeriu ${aiUpdated} novo(s) nome(s). `:''}${review?review+' nome(s) precisam de confirmação.':'Tudo classificado.'}`})
})

app.post('/api/classification-rules',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  const cid=await companyId();const {pattern,category,scope='COMPANY',direction='ANY'}=req.body
  const party=String(pattern).toUpperCase();const account=scope==='GLOBAL'?null:await ensureAccountForCategory(cid,category,direction)
  await pool.query(`INSERT INTO classification_rules(scope,company_id,pattern,normalized_party,direction,category,account_id,confidence,source) VALUES($1,$2,$3,$3,$4,$5,$6,100,'MANUAL')`,[scope,scope==='GLOBAL'?null:cid,party,direction,category,account?.id||null])
  res.json({ok:true})
})

app.get('/api/health', async (req,res)=>{
  if(!pool) return res.json({ok:true,version:'0.1.3',database:'not_configured'})
  try{
    const r=await pool.query(`SELECT value FROM schema_meta WHERE key='schema_version' LIMIT 1`)
    res.json({ok:true,version:'0.1.3',database:'ok',schema:r.rows[0]?.value||'unknown'})
  }catch(e){
    res.status(503).json({ok:false,version:'0.1.3',database:'migration_failed',message:e.message})
  }
})

const dist=path.resolve(__dirname,'../../client/dist')
if(fs.existsSync(dist)){app.use(express.static(dist));app.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')))}
initDb()
  .then(()=>app.listen(PORT,()=>console.log(`Claria v0.1.3 on :${PORT}`)))
  .catch(e=>{
    console.error('DB init failed',e)
    // Com DATABASE_URL configurada, não iniciamos uma aplicação parcialmente migrada.
    // O Railway reinicia o serviço e mantém o erro explícito no log, evitando endpoints
    // que consultem tabelas ainda inexistentes e derrubem o processo depois.
    process.exit(1)
  })
