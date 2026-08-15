import { z } from 'zod'

export const TOKEN_KEY='clara_token'
export const COMPANY_KEY='clara_company_id'

const nullableString=z.string().nullable().optional()
export const transactionRowSchema=z.object({
  id:z.string(),occurred_at:nullableString,competence_at:nullableString,effective_competence_at:nullableString,due_at:nullableString,paid_at:nullableString,
  description:z.string(),normalized_party:nullableString,counterparty_document:nullableString,direction:z.string(),amount:z.coerce.number(),category:nullableString,
  account_id:nullableString,account_code:nullableString,account_name:nullableString,payment_method:nullableString,financial_status:nullableString,
  classification_status:nullableString,classification_source:nullableString,classification_confidence:z.coerce.number().nullable().optional(),accounting_role:nullableString,
  dre_impact:z.boolean().nullable().optional(),cash_impact:z.boolean().nullable().optional(),source_file_id:nullableString,source_file_name:nullableString,source_kind:nullableString,
  source_page:z.coerce.number().nullable().optional()
}).passthrough()
export const transactionsResponseSchema=z.object({rows:z.array(transactionRowSchema).default([]),total:z.coerce.number().default(0),inflow:z.coerce.number().default(0),outflow:z.coerce.number().default(0)}).passthrough()
export type TransactionRow=z.infer<typeof transactionRowSchema>
export type TransactionsResponse=z.infer<typeof transactionsResponseSchema>

export async function apiFetch(input:RequestInfo|URL,init:RequestInit={}){
  const headers=new Headers(init.headers||{})
  const token=localStorage.getItem(TOKEN_KEY)
  const companyId=localStorage.getItem(COMPANY_KEY)
  if(token)headers.set('Authorization',`Bearer ${token}`)
  if(companyId)headers.set('x-company-id',companyId)
  return fetch(input,{...init,headers})
}

export async function readError(response:Response){
  try{const body=await response.json();return body?.message||`Erro HTTP ${response.status}`}catch{return `Erro HTTP ${response.status}`}
}

export async function apiJson<T=any>(url:string,init:RequestInit={}):Promise<T>{
  const response=await apiFetch(url,init)
  if(!response.ok)throw new Error(await readError(response))
  return response.json()
}

export async function fetchJson<T>(url:string,schema:z.ZodType<T>):Promise<T>{
  const payload=await apiJson(url)
  const parsed=schema.safeParse(payload)
  if(!parsed.success){console.error('Resposta inválida da API',url,parsed.error.flatten());throw new Error('A API retornou dados em formato inesperado.')}
  return parsed.data
}

export async function fetchTransactions(params:Record<string,string>){
  const search=new URLSearchParams(Object.entries(params).filter(([,value])=>value!==''))
  return fetchJson(`/api/transactions?${search.toString()}`,transactionsResponseSchema)
}
