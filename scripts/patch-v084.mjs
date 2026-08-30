import fs from 'node:fs'

const read=p=>fs.readFileSync(p,'utf8')
const write=(p,s)=>fs.writeFileSync(p,s)
const replaceIf=(src,from,to)=>{if(src.includes(to))return src;if(!src.includes(from))throw new Error(`text not found: ${from}`);return src.replace(from,to)}

let files=read('client/src/v070.tsx')
files=replaceIf(files,'processed.slice(0,3).map((f:any)=>','processed.map((f:any)=>')
write('client/src/v070.tsx',files)

let main=read('client/src/main.tsx')
main=replaceIf(main,"const APP_VERSION='0.8.3'","const APP_VERSION='0.8.4'")
main=replaceIf(main,"[filters,setFilters]=useState<any>({q:'',direction:'',category:'',paymentMethod:'',status:'',classification:'PENDING'})","[filters,setFilters]=useState<any>({q:'',direction:'',category:'',paymentMethod:'',status:'',classification:''})")
write('client/src/main.tsx',main)

let v080=read('server/src/v080.ts')
const originalDup="async function importOne(cid:string,type:string,f:any,company:any){const fileHash=hash(f.buffer),dup=await pool!.query(`SELECT id FROM source_files WHERE company_id=$1 AND hash=$2 LIMIT 1`,[cid,fileHash]);if(dup.rowCount)return{name:f.originalname,status:'DUPLICATE',detail:'Arquivo já importado.'};const ext=path.extname(f.originalname).toLowerCase();"
const v1Dup="async function importOne(cid:string,type:string,f:any,company:any){const fileHash=hash(f.buffer),dup=await pool!.query(`SELECT id,kind,status,status_detail,record_count,validation_status FROM source_files WHERE company_id=$1 AND hash=$2 LIMIT 1`,[cid,fileHash]);if(dup.rowCount){const d=dup.rows[0],records=n(d.record_count),label=TYPES[d.kind]||d.kind||'outra origem';if(d.kind!==type)return{name:f.originalname,status:'DUPLICATE',kind:d.kind,records,sourceFileId:d.id,detail:`Este conteúdo já foi importado como ${label}. Para trocar a função, descarte a importação anterior e processe novamente.`};if(d.status==='IMPORTED'&&records>0)return{name:f.originalname,status:'DUPLICATE',kind:d.kind,records,sourceFileId:d.id,detail:`Arquivo já importado como ${label} (${records} registro(s)).`};return{name:f.originalname,status:'REVIEW',kind:d.kind,records,sourceFileId:d.id,detail:`Este arquivo já foi enviado, mas a importação anterior ficou com ${records} registro(s). Abra o diagnóstico do arquivo e use Reprocessar.`}}const ext=path.extname(f.originalname).toLowerCase();"
const v2Dup="async function importOne(cid:string,type:string,f:any,company:any){const fileHash=hash(f.buffer),dup=await pool!.query(`SELECT id,kind,status,status_detail,record_count,validation_status FROM source_files WHERE company_id=$1 AND hash=$2 LIMIT 1`,[cid,fileHash]);if(dup.rowCount){const d=dup.rows[0],records=n(d.record_count),label=TYPES[d.kind]||d.kind||'outra origem';if(d.kind!==type)return{name:f.originalname,status:'DUPLICATE',kind:d.kind,records,sourceFileId:d.id,detail:`Este conteúdo já foi importado como ${label}. Para trocar a função, descarte a importação anterior e processe novamente.`};const retryable=records===0||d.status!=='IMPORTED'||d.validation_status==='ERROR';if(retryable){await pool!.query(`DELETE FROM receivables WHERE company_id=$1 AND source_file_id=$2`,[cid,d.id]);await pool!.query(`DELETE FROM payables WHERE company_id=$1 AND source_file_id=$2`,[cid,d.id]);await pool!.query(`DELETE FROM transactions WHERE company_id=$1 AND source_file_id=$2`,[cid,d.id]);await pool!.query(`DELETE FROM source_files WHERE company_id=$1 AND id=$2`,[cid,d.id])}else return{name:f.originalname,status:'DUPLICATE',kind:d.kind,records,sourceFileId:d.id,detail:`Arquivo já importado como ${label} (${records} registro(s)).`}}const ext=path.extname(f.originalname).toLowerCase();"
const v3Dup="async function importOne(cid:string,type:string,f:any,company:any){const fileHash=hash(f.buffer),dup=await pool!.query(`SELECT sf.id,sf.name,sf.kind,sf.status,sf.status_detail,sf.record_count,sf.validation_status,(SELECT count(*)::int FROM transactions t WHERE t.company_id=sf.company_id AND t.source_file_id=sf.id) transaction_count FROM source_files sf WHERE sf.company_id=$1 AND sf.hash=$2 LIMIT 1`,[cid,fileHash]);if(dup.rowCount){const d=dup.rows[0],records=n(d.record_count),txCount=n(d.transaction_count),label=TYPES[d.kind]||d.kind||'outra origem';if(d.kind!==type)return{name:f.originalname,status:'DUPLICATE',kind:d.kind,records,sourceFileId:d.id,detail:`Este conteúdo já foi importado como ${label}. Para trocar a função, descarte a importação anterior e processe novamente.`};const retryable=records===0||txCount===0||d.status!=='IMPORTED'||d.validation_status==='ERROR';if(retryable){await pool!.query(`DELETE FROM receivables WHERE company_id=$1 AND source_file_id=$2`,[cid,d.id]);await pool!.query(`DELETE FROM payables WHERE company_id=$1 AND source_file_id=$2`,[cid,d.id]);await pool!.query(`DELETE FROM transactions WHERE company_id=$1 AND source_file_id=$2`,[cid,d.id]);await pool!.query(`DELETE FROM source_files WHERE company_id=$1 AND id=$2`,[cid,d.id])}else{const renamed=String(d.name||'')!==String(f.originalname||'');if(renamed)await pool!.query(`UPDATE source_files SET name=$3 WHERE company_id=$1 AND id=$2`,[cid,d.id,f.originalname]);return{name:f.originalname,status:'DUPLICATE',kind:d.kind,records,sourceFileId:d.id,detail:renamed?`Arquivo já importado como ${label} (${records} registro(s)). Nome atualizado para ${f.originalname}.`:`Arquivo já importado como ${label} (${records} registro(s)).`}}}const ext=path.extname(f.originalname).toLowerCase();"
if(!v080.includes(v3Dup)){
  if(v080.includes(v2Dup))v080=v080.replace(v2Dup,v3Dup)
  else if(v080.includes(v1Dup))v080=v080.replace(v1Dup,v3Dup)
  else if(v080.includes(originalDup))v080=v080.replace(originalDup,v3Dup)
  else throw new Error('duplicate import block not found')
}
write('server/src/v080.ts',v080)

let server=read('server/src/index.ts')
server=server.replaceAll("version:'0.8.3'","version:'0.8.4'")
write('server/src/index.ts',server)

for(const p of ['package.json','client/package.json','server/package.json','client/package-lock.json','server/package-lock.json']){
  let s=read(p)
  s=s.replaceAll('"version": "0.8.3"','"version": "0.8.4"')
  write(p,s)
}

console.log('v0.8.4 visibility/import patch applied')
