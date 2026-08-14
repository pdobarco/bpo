import OpenAI from 'openai'

const FALLBACK_CATEGORIES = [
  'Compra de mercadoria / insumos','Fretes e entregas','Marketing e anúncios','Sistemas e tecnologia',
  'Energia elétrica','Água e saneamento','Aluguel e ocupação','Contabilidade e serviços profissionais',
  'Serviços terceirizados','Material de escritório / gráfica','Taxas bancárias e financeiras','Folha / pessoas','Outras despesas'
]

export async function suggestNegativeParties({company, groups, categories = FALLBACK_CATEGORIES}) {
  if (process.env.AI_ENABLED !== 'true' || !process.env.OPENAI_API_KEY || !groups?.length) return []
  const allowed = [...new Set(categories.filter(Boolean))]
  if (!allowed.length) return []
  const maxBatch = Math.max(1, Number(process.env.AI_MAX_BATCH || 40))
  const selected = groups.slice(0, maxBatch)
  const client = new OpenAI({apiKey:process.env.OPENAI_API_KEY})
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna'
  const choices = [...allowed,'Revisar']

  const schema = {
    type:'object', additionalProperties:false,
    properties:{suggestions:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      party:{type:'string'}, category:{type:'string',enum:choices}, confidence:{type:'integer',minimum:0,maximum:100}, reason:{type:'string'}
    },required:['party','category','confidence','reason']}}}, required:['suggestions']
  }

  const input = JSON.stringify({
    company:{sector:company?.sector || '', activity:company?.activity || ''},
    allowed_categories:allowed,
    parties:selected.map(g=>({party:g.normalizedParty,count:Number(g.count),total:Number(g.total),samples:g.samples?.slice(0,2) || []}))
  })

  const response = await client.responses.create({
    model,
    reasoning:{effort:'none'},
    store:false,
    max_output_tokens:2200,
    instructions:'Classifique favorecidos de SAÍDAS financeiras de uma empresa brasileira. Use somente as categorias permitidas. O setor/atividade é contexto, não prova. Quando o nome de pessoa física ou descrição não der evidência suficiente, use Revisar e confiança baixa. Seja conservador e curto.',
    input,
    text:{format:{type:'json_schema',name:'claria_classification_suggestions',strict:true,schema}}
  })

  try { return JSON.parse(response.output_text || '{}').suggestions || [] }
  catch { return [] }
}
