import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractDocument, extractParty, isIncomingTransfer, isOutgoingTransfer, isLikelyBusinessName, accountMatchesDescription } from '../src/services/entity.js'

test('extractDocument reconhece CNPJ e CPF formatados', () => {
  assert.equal(extractDocument('PIX ENVIADO ACME LTDA 12.345.678/0001-90'), '12345678000190')
  assert.equal(extractDocument('Transferência para 123.456.789-09'), '12345678909')
  assert.equal(extractDocument('Sem documento'), null)
})

test('extractParty remove prefixos de transferência e sufixos bancários', () => {
  assert.equal(extractParty('Transferência recebida pelo Pix JOÃO DA SILVA - 123.456.789-09'), 'JOAO DA SILVA')
  assert.equal(extractParty('Pagamento de fatura'), 'CARTAO DE CREDITO')
  assert.equal(extractParty('LOJA X - Parcela 2/3'), 'LOJA X')
})

test('detecta direção de transferências', () => {
  assert.ok(isIncomingTransfer('Pix recebido Fulano'))
  assert.ok(isOutgoingTransfer('Transferência enviada pelo Pix Ciclano'))
  assert.ok(!isIncomingTransfer('Pagamento de boleto'))
})

test('isLikelyBusinessName diferencia empresa de pessoa física', () => {
  assert.ok(isLikelyBusinessName('Distribuidora Alfa LTDA'))
  assert.ok(!isLikelyBusinessName('Maria Souza'))
})

test('accountMatchesDescription identifica conta própria', () => {
  const account = { document: '12.345.678/0001-90', account: '12345-6', agency: '0001', label: 'Conta principal', aliases: ['MINHA EMPRESA'] }
  assert.ok(accountMatchesDescription(account, 'TED enviada 12345678000190'))
  assert.ok(accountMatchesDescription(account, 'Transferência MINHA EMPRESA'))
  assert.ok(!accountMatchesDescription(account, 'Pagamento fornecedor qualquer'))
})
