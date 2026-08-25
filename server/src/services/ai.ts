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
  const response=await client().responses.create({model:model(),reasoning:{effort:'none'},store:false,max_output_tokens:2200,instructions:'Classifique favorecidos de SAÍDAS financeiras de uma empresa brasileira. Use somente as categorias permitidas. O setor/atividade é contexto, não prova. Quando o nome de pessoa física ou descrição não der evidência suficiente, use Revisar e confiança baixa. Seja conservador e curto.',input,text:{format:{type:'json_schema',name:'clara_classification_suggestions',strict:true,schema}}})
  try{return JSON.parse(response.output_text||'{}').suggestions||[]}catch{return[]}
}

export async function adaptUnknownPdf({text,company}){
  if(process.env.AI_ENABLED!=='true'||!process.env.OPENAI_API_KEY||!text)return null
  const maxChars=Math.max(5000,Number(process.env.AI_FILE_MAX_CHARS||30000)),inputText=String(text).slice(0,maxChars)
  const schema={type:'object',additionalProperties:false,properties:{document_type:{type:'string'},confidence:{type:'integer',minimum:0,maximum:100},transactions:{type:'array',maxItems:500,items:{type:'object',additionalProperties:false,properties:{date:{type:['string','null']},description:{type:'string'},amount:{type:'number'},direction:{type:'string',enum:['ENTRADA','SAIDA']},payment_method:{type:['string','null']}},required:['date','description','amount','direction','payment_method']}}},required:['document_type','confidence','transactions']}
  const response=await client().responses.create({model:model(),reasoning:{effort:'none'},store:false,max_output_tokens:6000,instructions:'Você é o adaptador de arquivos do Clara. Extraia somente movimentações financeiras claramente presentes no texto de um PDF. Não invente valores, datas ou descrições. amount deve ser positivo para ENTRADA e negativo para SAIDA. Datas em YYYY-MM-DD. Ignore saldos, subtotais e cabeçalhos. Se não houver segurança, retorne transactions vazio.',input:JSON.stringify({company:{sector:company?.sector||'',activity:company?.activity||''},pdf_text:inputText}),text:{format:{type:'json_schema',name:'clara_pdf_adaptation',strict:true,schema}}})
  try{return JSON.parse(response.output_text||'{}')}catch{return null}
}

export async function compareMarketProducts({product,brand='',category='',referencePrice=0}){
  if(process.env.AI_ENABLED!=='true'||!process.env.OPENAI_API_KEY||!product)return{enabled:false,results:[],summary:'Ative a Luna nas configurações do servidor para pesquisar preços de mercado.'}
  const schema={type:'object',additionalProperties:false,properties:{summary:{type:'string'},results:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,properties:{product:{type:'string'},source:{type:'string'},url:{type:'string'},price:{type:['number','null']},condition:{type:'string'},similarity:{type:'integer',minimum:0,maximum:100},note:{type:'string'}},required:['product','source','url','price','condition','similarity','note']}}},required:['summary','results']}
  try{
    const response=await (client().responses.create as any)({
      model:model(),reasoning:{effort:'none'},store:false,max_output_tokens:2600,
      tools:[{type:'web_search'}],
      instructions:'Você é a Luna, assistente de precificação da Clara BPO. Pesquise na internet produtos realmente comparáveis no Brasil. Não invente preço nem URL. Priorize lojas e fabricantes reconhecíveis e resultados recentes. Compare características, marca, categoria e unidade/quantidade. Preços são apenas referência de mercado. Retorne somente o JSON estruturado solicitado.',
      input:JSON.stringify({product,brand,category,reference_price:Number(referencePrice||0),country:'Brasil',currency:'BRL'}),
      text:{format:{type:'json_schema',name:'clara_market_comparison',strict:true,schema}}
    })
    const out=JSON.parse(response.output_text||'{}')
    return{enabled:true,summary:out.summary||'',results:Array.isArray(out.results)?out.results:[]}
  }catch(e:any){
    console.error('market compare',e?.message||e)
    return{enabled:true,results:[],summary:'A Luna não conseguiu concluir a pesquisa de mercado agora. Tente novamente em alguns instantes.'}
  }
}
