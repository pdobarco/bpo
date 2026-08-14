import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { initDb,pool,companyId,getCompany } from './db.js'
import { parsePdf } from './parsers/pdf.js'
import { parseTabular } from './parsers/tabular.js'
import { classify } from './services/classify.js'
import { DEFAULT_CATEGORIES, suggestNegativeParties } from './services/ai.js'

const __dirname=path.dirname(fileURLToPath(import.meta.url))
const app=express()
const PORT=process.env.PORT||3000
const mb=Number(process.env.MAX_UPLOAD_MB||25)
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:mb*1024*1024,files:100}})
app.use(cors())
app.use(express.json({limit:'2mb'}))

const demo={
  company:{id:'demo',name:'Encantê Natural',sector:'Comércio',activity:'Produtos naturais'},
  summary:{balance:5731.62,inflow:11096.69,outflow:13113.60,pending:5,revenue:10601,result:-6999},
  months:[2379,6490,10562,19005,14445,19278,10601],
  files:[{name:'Extrato PagBank Julho.pdf',type:'Extrato bancário',count:35,status:'Importado'},{name:'Extrato Nubank Julho.pdf',type:'Extrato bancário',count:48,status:'Importado'}],
  tx:[
    {id:'1',date:'31/07/2026',description:'Transferência Recebida Raissa Rafaela Dias da Silva',normalizedParty:'RAISSA RAFAELA DIAS DA SILVA',amount:179,type:'ENTRADA',category:'Receita de vendas',confidence:78,status:'SUGGESTED',source:'HEURISTIC'},
    {id:'2',date:'23/07/2026',description:'EPLACE COPIADORA E GRAFICA RAPIDA',normalizedParty:'EPLACE COPIADORA E GRAFICA RAPIDA',amount:-133.2,type:'SAIDA',category:'Material de escritório / gráfica',confidence:91,status:'SUGGESTED',source:'AI'},
    {id:'3',date:'22/07/2026',description:'ARMARINHOS LIDER',normalizedParty:'ARMARINHOS LIDER',amount:-89,type:'SAIDA',category:'Compra de mercadoria / insumos',confidence:84,status:'SUGGESTED',source:'AI'}
  ]
}

const n=v=>Number(v||0)

async function getReviewGroups(cid){
  const r=await pool.query(`SELECT id,normalized_party,direction,amount,description,category,classification_confidence,classification_status,classification_source
    FROM transactions WHERE company_id=$1 AND classification_status IN ('PENDING','SUGGESTED') ORDER BY occurred_at DESC`,[cid])
  const map=new Map()
  for(const row of r.rows){
    const party=row.normalized_party||row.description
    const key=`${row.direction}|${party}`
    if(!map.has(key))map.set(key,{normalizedParty:party,direction:row.direction,count:0,total:0,category:row.category||'A classificar',confidence:0,source:row.classification_source||null,samples:[],ids:[]})
    const g=map.get(key);g.count++;g.total+=n(row.amount);g.confidence=Math.max(g.confidence,n(row.classification_confidence));g.ids.push(row.id)
    if(g.samples.length<2&&!g.samples.includes(row.description))g.samples.push(row.description)
    if(row.category&&row.category!=='A classificar')g.category=row.category
    if(row.classification_source)g.source=row.classification_source
  }
  return [...map.values()].sort((a,b)=>b.count-a.count||Math.abs(b.total)-Math.abs(a.total))
}

async function runLunaForPending(cid){
  if(!pool)return {updated:0,skipped:true}
  const company=await getCompany(cid)
  const groups=(await getReviewGroups(cid)).filter(g=>g.direction==='SAIDA'&&(g.category==='A classificar'||g.source!=='AI'))
  if(!groups.length)return {updated:0}
  const suggestions=await suggestNegativeParties({company,groups,categories:DEFAULT_CATEGORIES})
  let updated=0
  for(const s of suggestions){
    const party=String(s.party||'').trim().toUpperCase()
    const group=groups.find(g=>g.normalizedParty===party)
    if(!group)continue
    const category=s.category==='Revisar'?'A classificar':s.category
    const confidence=Math.max(0,Math.min(100,n(s.confidence)))
    await pool.query(`UPDATE transactions SET category=$4,classification_confidence=$5,classification_status='SUGGESTED',classification_source='AI'
      WHERE company_id=$1 AND normalized_party=$2 AND direction=$3 AND classification_status IN ('PENDING','SUGGESTED')`,[cid,party,'SAIDA',category,confidence])
    updated++
  }
  return {updated}
}

app.get('/api/health',(req,res)=>res.json({ok:true,version:'0.1.1',db:Boolean(pool),ai:process.env.AI_ENABLED==='true',model:process.env.OPENAI_MODEL||'gpt-5.6-luna'}))

app.get('/api/company',async(req,res)=>{if(!pool)return res.json(demo.company);const cid=await companyId();res.json(await getCompany(cid))})
app.put('/api/company',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=await companyId();const {name,document,sector,activity}=req.body;await pool.query(`UPDATE companies SET name=COALESCE(NULLIF($2,''),name),document=COALESCE($3,document),sector=$4,activity=$5 WHERE id=$1`,[cid,name||'',document??null,sector??null,activity??null]);res.json(await getCompany(cid))})
app.get('/api/categories',(req,res)=>res.json(['Receita de vendas','Cartão de crédito',...DEFAULT_CATEGORIES.filter(x=>x!=='Revisar')]))

app.get('/api/dashboard',async(req,res)=>{
  if(!pool)return res.json(demo)
  try{
    const cid=await companyId()
    const [co,tx,files,groups]=await Promise.all([
      getCompany(cid),
      pool.query(`SELECT id,occurred_at,description,normalized_party,amount,direction,category,classification_confidence,classification_status,classification_source FROM transactions WHERE company_id=$1 ORDER BY occurred_at DESC LIMIT 150`,[cid]),
      pool.query(`SELECT name,kind,record_count,status FROM source_files WHERE company_id=$1 ORDER BY created_at DESC LIMIT 20`,[cid]),
      getReviewGroups(cid)
    ])
    if(!tx.rowCount&&!files.rowCount)return res.json({...demo,company:co||demo.company})
    const rows=tx.rows
    const inflow=rows.filter(x=>n(x.amount)>0).reduce((a,x)=>a+n(x.amount),0)
    const outflow=Math.abs(rows.filter(x=>n(x.amount)<0).reduce((a,x)=>a+n(x.amount),0))
    const operational=rows.filter(x=>x.category!=='Transferência entre contas')
    const revenue=operational.filter(x=>n(x.amount)>0).reduce((a,x)=>a+n(x.amount),0)
    const operatingOut=Math.abs(operational.filter(x=>n(x.amount)<0).reduce((a,x)=>a+n(x.amount),0))
    res.json({company:co,summary:{balance:inflow-outflow,inflow,outflow,pending:groups.length,revenue,result:revenue-operatingOut},months:demo.months,
      files:files.rows.map(f=>({name:f.name,type:f.kind,count:f.record_count,status:f.status==='IMPORTED'?'Importado':'Revisar'})),
      tx:rows.map(t=>({id:t.id,date:t.occurred_at?new Date(t.occurred_at).toLocaleDateString('pt-BR'):'',description:t.description,normalizedParty:t.normalized_party,amount:n(t.amount),type:t.direction,category:t.category||'A classificar',confidence:n(t.classification_confidence),status:t.classification_status,source:t.classification_source}))})
  }catch(e){console.error(e);res.json(demo)}
})

app.get('/api/review-groups',async(req,res)=>{if(!pool)return res.json({groups:[]});const cid=await companyId();res.json({groups:await getReviewGroups(cid)})})

app.post('/api/review-groups/classify',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  const cid=await companyId();const {normalizedParty,direction,category,remember=true,onlyIds=[]}=req.body
  if(!normalizedParty||!direction||!category)return res.status(400).json({message:'Informe nome, direção e categoria.'})
  const party=String(normalizedParty).toUpperCase().trim()
  if(remember){
    await pool.query(`DELETE FROM classification_rules WHERE scope='COMPANY' AND company_id=$1 AND normalized_party=$2 AND direction=$3`,[cid,party,direction])
    await pool.query(`INSERT INTO classification_rules(scope,company_id,pattern,normalized_party,direction,category,confidence,source) VALUES('COMPANY',$1,$2,$2,$3,$4,100,'MANUAL')`,[cid,party,direction,category])
    await pool.query(`UPDATE transactions SET category=$4,classification_confidence=100,classification_status='CONFIRMED',classification_source='MANUAL' WHERE company_id=$1 AND normalized_party=$2 AND direction=$3`,[cid,party,direction,category])
  }else if(Array.isArray(onlyIds)&&onlyIds.length){
    await pool.query(`UPDATE transactions SET category=$2,classification_confidence=100,classification_status='CONFIRMED',classification_source='MANUAL' WHERE company_id=$1 AND id=ANY($3::uuid[])`,[cid,category,onlyIds])
  }
  res.json({ok:true})
})

app.post('/api/review-groups/classify-batch',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  const cid=await companyId();const items=Array.isArray(req.body.items)?req.body.items:[];let count=0
  for(const item of items.slice(0,100)){
    if(!item.normalizedParty||!item.direction||!item.category)continue
    const party=String(item.normalizedParty).toUpperCase().trim()
    await pool.query(`DELETE FROM classification_rules WHERE scope='COMPANY' AND company_id=$1 AND normalized_party=$2 AND direction=$3`,[cid,party,item.direction])
    await pool.query(`INSERT INTO classification_rules(scope,company_id,pattern,normalized_party,direction,category,confidence,source) VALUES('COMPANY',$1,$2,$2,$3,$4,100,'MANUAL')`,[cid,party,item.direction,item.category])
    await pool.query(`UPDATE transactions SET category=$4,classification_confidence=100,classification_status='CONFIRMED',classification_source='MANUAL' WHERE company_id=$1 AND normalized_party=$2 AND direction=$3`,[cid,party,item.direction,item.category])
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
  const cid=await companyId();let company=await getCompany(cid);let imported=0,duplicates=0,records=0
  for(const f of req.files){
    try{
      const hash=crypto.createHash('sha256').update(f.buffer).digest('hex')
      const exists=await pool.query('SELECT id FROM source_files WHERE company_id=$1 AND hash=$2',[cid,hash]);if(exists.rowCount){duplicates++;continue}
      const ext=path.extname(f.originalname).toLowerCase();let parsed
      if(ext==='.pdf')parsed=await parsePdf(f.buffer);else if(['.xlsx','.xls','.csv'].includes(ext))parsed=parseTabular(f.buffer);else continue
      if(parsed.metadata?.document && !company?.document){await pool.query(`UPDATE companies SET document=$2,name=CASE WHEN name='Empresa Demonstração' AND $3 IS NOT NULL THEN $3 ELSE name END WHERE id=$1`,[cid,parsed.metadata.document,parsed.metadata.name]);company=await getCompany(cid)}
      const sf=await pool.query(`INSERT INTO source_files(company_id,name,hash,kind,status,record_count,confidence) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[cid,f.originalname,hash,parsed.kind,parsed.confidence<70?'REVIEW':'IMPORTED',parsed.transactions.length,parsed.confidence])
      for(const t of parsed.transactions){
        const c=await classify(t,cid,company)
        await pool.query(`INSERT INTO transactions(company_id,source_file_id,occurred_at,description,normalized_party,direction,amount,gross_amount,fee_amount,net_amount,category,classification_confidence,classification_status,classification_source,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[cid,sf.rows[0].id,t.occurredAt,t.description,c.normalized_party,t.direction,t.amount,t.grossAmount??null,t.feeAmount??null,t.netAmount??null,c.category,c.confidence,c.status,c.source,t.raw||{}])
      }
      imported++;records+=parsed.transactions.length
    }catch(e){console.error('import error',f.originalname,e)}
  }
  let aiUpdated=0
  try{if(process.env.AI_ENABLED==='true'){const r=await runLunaForPending(cid);aiUpdated=r.updated||0}}catch(e){console.error('automatic Luna suggestions failed',e)}
  const review=(await getReviewGroups(cid)).length
  res.json({message:`Importação concluída: ${imported} arquivo(s), ${records} registro(s). ${duplicates?duplicates+' duplicado(s) ignorado(s). ':''}${aiUpdated?`Luna sugeriu ${aiUpdated} novo(s) nome(s). `:''}${review?review+' nome(s) precisam de confirmação.':'Tudo classificado.'}`})
})

app.post('/api/classification-rules',async(req,res)=>{
  if(!pool)return res.status(503).json({message:'Banco não configurado'})
  const cid=await companyId();const {pattern,category,scope='COMPANY',direction='ANY'}=req.body
  await pool.query(`INSERT INTO classification_rules(scope,company_id,pattern,normalized_party,direction,category,confidence,source) VALUES($1,$2,$3,$4,$5,$6,100,'MANUAL')`,[scope,scope==='GLOBAL'?null:cid,String(pattern).toUpperCase(),String(pattern).toUpperCase(),direction,category])
  res.json({ok:true})
})

const dist=path.resolve(__dirname,'../../client/dist')
if(fs.existsSync(dist)){app.use(express.static(dist));app.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')))}
initDb().then(()=>app.listen(PORT,()=>console.log(`Claria v0.1.1 on :${PORT}`))).catch(e=>{console.error('DB init failed',e);app.listen(PORT,()=>console.log(`Claria sem DB on :${PORT}`))})
