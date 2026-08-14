import { pool } from '../db.js'
import { extractParty, normalize, isIncomingTransfer, isOutgoingTransfer } from './entity.js'

export async function classify(transaction, companyId, company = null) {
  const description = transaction?.description || ''
  const txt = normalize(description)
  const direction = transaction?.direction || (Number(transaction?.amount) >= 0 ? 'ENTRADA' : 'SAIDA')
  const party = extractParty(description)

  if (pool) {
    // 1) Regra aprendida da empresa: entidade + direção. É a regra mais forte.
    const exact = await pool.query(`
      SELECT category, normalized_party, confidence, scope, source
      FROM classification_rules
      WHERE company_id=$1 AND scope='COMPANY'
        AND normalized_party=$2
        AND (direction=$3 OR direction='ANY')
      ORDER BY CASE WHEN direction=$3 THEN 0 ELSE 1 END, confidence DESC
      LIMIT 1`, [companyId, party, direction])
    if (exact.rowCount) return {...exact.rows[0], normalized_party: party, status:'CONFIRMED'}

    // 2) Biblioteca global compartilhada: marcas/fornecedores reconhecíveis.
    const global = await pool.query(`
      SELECT category, normalized_party, confidence, scope, source
      FROM classification_rules
      WHERE scope='GLOBAL'
        AND (direction=$2 OR direction='ANY')
        AND $1 LIKE '%' || pattern || '%'
      ORDER BY confidence DESC, length(pattern) DESC
      LIMIT 1`, [txt, direction])
    if (global.rowCount) return {...global.rows[0], normalized_party: global.rows[0].normalized_party || party, status:'AUTO'}
  }

  // 3) Transferência entre contas próprias: CNPJ/CPF ou nome da própria empresa na descrição.
  if (isIncomingTransfer(description) || isOutgoingTransfer(description)) {
    const ownDocument = String(company?.document || '').replace(/\D/g, '')
    const descDigits = String(description).replace(/\D/g, '')
    const ownName = normalize(company?.name || '')
    const ownByDocument = ownDocument.length >= 8 && descDigits.includes(ownDocument)
    const ownByName = ownName.length >= 6 && txt.includes(ownName)
    if (ownByDocument || ownByName) {
      return {category:'Transferência entre contas', normalized_party:party, confidence:99, scope:'COMPANY', source:'HEURISTIC', status:'AUTO'}
    }
  }

  // 4) Entrada positiva de pessoa/entidade desconhecida: normalmente receita, mas exige confirmação.
  if (direction === 'ENTRADA' && isIncomingTransfer(description)) {
    return {category:'Receita de vendas', normalized_party:party, confidence:78, scope:null, source:'HEURISTIC', status:'SUGGESTED'}
  }

  return {category:'A classificar', normalized_party:party, confidence:0, scope:null, source:null, status:'PENDING'}
}
