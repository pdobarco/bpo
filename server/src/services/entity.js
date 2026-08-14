export const normalize = s => (s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim()

const transferPrefixes = [
  /^TRANSFERENCIA RECEBIDA PELO PIX\s+/,
  /^TRANSFERENCIA RECEBIDA\s+/,
  /^TRANSFERENCIA ENVIADA PELO PIX\s+/,
  /^TRANSFERENCIA ENVIADA\s+/,
  /^PIX RECEBIDO\s+/,
  /^PIX ENVIADO\s+/,
  /^PAGAMENTO DE BOLETO EFETUADO\s+/,
  /^PAGAMENTO DE BOLETO\s+/
]

export function extractParty(description = '') {
  const original = String(description).replace(/\s+/g, ' ').trim()
  let text = normalize(original)
  if (/^PAGAMENTO DE FATURA/.test(text)) return 'CARTAO DE CREDITO'
  for (const rx of transferPrefixes) {
    if (rx.test(text)) { text = text.replace(rx, '').trim(); break }
  }
  const firstSep = text.indexOf(' - ')
  if (firstSep > 2) text = text.slice(0, firstSep)
  text = text
    .replace(/\s+-?\s*PARCELA\s+\d+\/\d+.*$/i, '')
    .replace(/\s+AGENCIA:.*$/i, '')
    .replace(/\s+CONTA:.*$/i, '')
    .replace(/\s+\*{2,}\.?[\d.-]+.*$/i, '')
    .replace(/\s+/g, ' ').trim()
  return text.slice(0, 140) || normalize(original).slice(0, 140)
}

export function isIncomingTransfer(description = '') { return /^(TRANSFERENCIA RECEBIDA|PIX RECEBIDO)/.test(normalize(description)) }
export function isOutgoingTransfer(description = '') { return /^(TRANSFERENCIA ENVIADA|PIX ENVIADO)/.test(normalize(description)) }
