import React,{useEffect,useState}from'react'
import{Landmark}from'lucide-react'
import{apiJson}from'./api'
const BRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
export function CashAvailabilityCard({onClick}:any){const[value,setValue]=useState<number|null>(null),[source,setSource]=useState('Carregando saldo...');useEffect(()=>{apiJson('/api/cash-flow-v080').then((x:any)=>{setValue(Number(x.available||0));setSource(x.availabilitySource==='BANK_BALANCES'?'Saldo dos extratos bancários':'Estimativa pelas movimentações')}).catch(()=>{setValue(null);setSource('Abra Fluxo de Caixa para conferir')})},[]);return <button className="kpi-card green clickable" onClick={onClick}><div className="kpi-icon"><Landmark/></div><div><span>Caixa Disponível</span><strong>{value===null?'—':BRL.format(value)}</strong><small>{source}</small></div></button>}
