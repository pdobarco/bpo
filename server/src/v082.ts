import {pool} from './db.js'

const n=(v:any)=>Number(v||0)
const pad=(v:any)=>String(v).padStart(2,'0')
const iso=(v:any)=>{if(!v)return null;if(v instanceof Date&&!Number.isNaN(v.getTime()))return`${v.getFullYear()}-${pad(v.getMonth()+1)}-${pad(v.getDate())}`;const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[1]}-${m[2]}-${m[3]}`:null}

export function registerV082Routes(app:any){
  app.get('/api/payables-v082',async(req:any,res:any)=>{
    if(!pool)return res.json({rows:[],summary:{}})
    const today=new Date().toISOString().slice(0,10),from=String(req.query?.from||today),to=String(req.query?.to||today)
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return res.status(400).json({message:'Informe um período válido.'})
    const r=await pool.query(`SELECT p.*,a.code account_code,a.name account_name,sf.name source_file_name,t.financial_status transaction_financial_status,t.paid_at transaction_paid_at,COALESCE(p.paid_at,t.paid_at) effective_paid_at
      FROM payables p
      LEFT JOIN chart_accounts a ON a.id=p.account_id
      LEFT JOIN source_files sf ON sf.id=p.source_file_id
      LEFT JOIN transactions t ON t.id=p.transaction_id
      WHERE p.company_id=$1 AND (p.due_date BETWEEN $2::date AND $3::date OR COALESCE(p.paid_at,t.paid_at)::date BETWEEN $2::date AND $3::date)
      ORDER BY COALESCE(p.due_date,COALESCE(p.paid_at,t.paid_at)::date),p.supplier,p.id`,[req.companyId,from,to])
    for(const row of r.rows){
      if(row.transaction_financial_status==='PAID')row.payment_status='PAID'
      else if(row.payment_status==='OPEN'&&iso(row.due_date)&&iso(row.due_date)!<today)row.payment_status='OVERDUE'
    }
    const inDueRange=(x:any)=>{const d=iso(x.due_date)||'';return d>=from&&d<=to}
    const paidInRange=(x:any)=>{const d=iso(x.effective_paid_at)||'';return d>=from&&d<=to}
    const open=r.rows.filter((x:any)=>x.payment_status!=='PAID'&&inDueRange(x))
    const total=open.reduce((a:number,x:any)=>a+n(x.amount)-n(x.paid_amount),0)
    const overdue=open.filter((x:any)=>(iso(x.due_date)||'')<today).reduce((a:number,x:any)=>a+n(x.amount)-n(x.paid_amount),0)
    const paidRows=r.rows.filter((x:any)=>x.payment_status==='PAID'&&paidInRange(x))
    const paid=paidRows.reduce((a:number,x:any)=>a+(n(x.paid_amount)||n(x.amount)),0)
    res.json({from,to,rows:r.rows,summary:{total,overdue,count:open.length,paid,paidCount:paidRows.length}})
  })

  app.get('/api/receivables-v082',async(req:any,res:any)=>{
    if(!pool)return res.json({rows:[],summary:{}})
    const today=new Date().toISOString().slice(0,10),from=String(req.query?.from||today),to=String(req.query?.to||today)
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return res.status(400).json({message:'Informe um período válido.'})
    const r=await pool.query(`SELECT r.*,sf.name source_file_name
      FROM receivables r
      LEFT JOIN source_files sf ON sf.id=r.source_file_id
      WHERE r.company_id=$1 AND (r.due_date BETWEEN $2::date AND $3::date OR r.received_at::date BETWEEN $2::date AND $3::date OR (r.receipt_status<>'RECEIVED' AND r.due_date IS NULL))
      ORDER BY r.receipt_status='RECEIVED',r.due_date NULLS FIRST,r.issue_date`,[req.companyId,from,to])
    for(const row of r.rows){const due=iso(row.due_date);if(row.receipt_status==='OPEN'&&due&&due<today)row.receipt_status='OVERDUE'}
    const inDueRange=(x:any)=>{const d=iso(x.due_date)||'';return d>=from&&d<=to}
    const receivedInRange=(x:any)=>{const d=iso(x.received_at)||'';return d>=from&&d<=to}
    const open=r.rows.filter((x:any)=>x.receipt_status!=='RECEIVED'&&inDueRange(x))
    const total=open.reduce((a:number,x:any)=>a+n(x.amount)-n(x.received_amount),0)
    const undated=r.rows.filter((x:any)=>x.receipt_status!=='RECEIVED'&&!x.due_date).reduce((a:number,x:any)=>a+n(x.amount)-n(x.received_amount),0)
    const overdue=open.filter((x:any)=>(iso(x.due_date)||'')<today).reduce((a:number,x:any)=>a+n(x.amount)-n(x.received_amount),0)
    const receivedRows=r.rows.filter((x:any)=>x.receipt_status==='RECEIVED'&&receivedInRange(x))
    const received=receivedRows.reduce((a:number,x:any)=>a+(n(x.received_amount)||n(x.amount)),0)
    res.json({from,to,rows:r.rows,summary:{total,undated,overdue,count:open.length,received,receivedCount:receivedRows.length}})
  })
}
