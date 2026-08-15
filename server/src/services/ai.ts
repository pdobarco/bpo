import OpenAI from 'openai'

const FALLBACK_CATEGORIES=['Compra de mercadoria / insumos','Fretes e entregas','Embalagens','Marketing e anúncios','Sistemas e tecnologia','Energia elétrica','Água e saneamento','Aluguel e ocupação','Contabilidade e serviços profissionais','Serviços terceirizados','Material de escritório / gráfica','Taxas bancárias e financeiras','Folha / pessoas','Outras despesas']
const client=()=>new OpenAI({apiKey:process.env.OPENAI_API_KEY})
const model=()=>process.env.OPENAI_MODEL||'gpt-5.6-luna'

export async function suggestNegativeParties({company,groups,categories=FALLBACK_CATEGORIES}){
  if(process.env.AI_ENABLED!=='true'||!process.env.OPENAI_API_KEY||!groups?.length)return[]
  const allowed=[...new Set(categories.filter(Boolean))];if(!allowed.length)return[]
  const maxBatch=Math.max(1,Number(process.env.AI_MAX_BATCH||40)),selected=groups.slice(0,maxBatch),choices=[...allowed,'Revisar']
  const schema={type:'object',additionalProperties:false,properties:{suggestions:{type:'array',items:{type:'object',additionalProperties:false,properties:{party:{type:'string'},category:{type:'string',enum:choices},confidence:{type:'integer',minimum:0,maximum:100},reason:{type:'string'}},required:['party','category','confidence','reason']}}},required:['suggestions']}
  const input=JSON.stringify({company:{sector:company?.sector||'',activity:company?.activity||''},allowed_categories:allowed,parties:selected.map(g=>({party:g.normalizedParty,count:Number(g.count),total:Number(g.total),samples:g.samples?.slice(0,2)||[]}))})
  const response=await client().responses.create({model:model(),reasoning:{effort:'none'},store:false,max_output_tokens:2200,instructions:'Classifique favorecidos de SAÍDAS financeiras de uma empresa brasileira. Use somente as categorias permitidas. O setor/atividade é contexto, não prova. Quando o nome de pessoa física ou descrição não der evidência suficiente, use Revisar e confiança baixa. Seja conservador e curto.',input,text:{format:{type:'json_schema',name:'claria_classification_suggestions',strict:true,schema}}})
  try{return JSON.parse(response.output_text||'{}').suggestions||[]}catch{return[]}
}

export async function adaptUnknownPdf({text,company}){
  if(process.env.AI_ENABLED!=='true'||!process.env.OPENAI_API_KEY||!text)return null
  const maxChars=Math.max(5000,Number(process.env.AI_FILE_MAX_CHARS||30000)),inputText=String(text).slice(0,maxChars)
  const schema={type:'object',additionalProperties:false,properties:{document_type:{type:'string'},confidence:{type:'integer',minimum:0,maximum:100},transactions:{type:'array',maxItems:500,items:{type:'object',additionalProperties:false,properties:{date:{type:['string','null']},description:{type:'string'},amount:{type:'number'},direction:{type:'string',enum:['ENTRADA','SAIDA']},payment_method:{type:['string','null']}},required:['date','description','amount','direction','payment_method']}}},required:['document_type','confidence','transactions']}
  const response=await client().responses.create({model:model(),reasoning:{effort:'none'},store:false,max_output_tokens:6000,instructions:'Você é o adaptador de arquivos do Claria. Extraia somente movimentações financeiras claramente presentes no texto de um PDF. Não invente valores, datas ou descrições. amount deve ser positivo para ENTRADA e negativo para SAIDA. Datas em YYYY-MM-DD. Ignore saldos, subtotais e cabeçalhos. Se não houver segurança, retorne transactions vazio.',input:JSON.stringify({company:{sector:company?.sector||'',activity:company?.activity||''},pdf_text:inputText}),text:{format:{type:'json_schema',name:'claria_pdf_adaptation',strict:true,schema}}})
  try{return JSON.parse(response.output_text||'{}')}catch{return null}
}
