import React,{useEffect,useState}from'react'

/**
 * Botão para ações assíncronas: desabilita durante a execução, mostra spinner e evita clique duplo.
 * Use no lugar de <button> sempre que onClick fizer uma requisição.
 */
export function AsyncButton({onClick,disabled,children,...rest}:React.ButtonHTMLAttributes<HTMLButtonElement>&{onClick?:(e:React.MouseEvent<HTMLButtonElement>)=>unknown}){
  const[pending,setPending]=useState(false)
  async function run(e:React.MouseEvent<HTMLButtonElement>){
    if(pending)return
    setPending(true)
    try{await onClick?.(e)}finally{setPending(false)}
  }
  return <button {...rest} disabled={disabled||pending} aria-busy={pending||undefined} onClick={run}>{pending&&<span className="spinner" aria-hidden="true"/>}{children}</button>
}

const FOCUSABLE='button:not([disabled]),[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function topModal():HTMLElement|null{
  const all=document.querySelectorAll<HTMLElement>('.modal-backdrop')
  return all.length?all[all.length-1]:null
}

function closeButton(backdrop:HTMLElement){
  return backdrop.querySelector<HTMLButtonElement>('.modal-head .icon-button,[data-modal-close],button[aria-label="Fechar"]')
}

/**
 * Comportamento acessível para todos os modais do app (que são <div className="modal-backdrop"> escritos à mão):
 * Esc fecha, Tab fica preso dentro do modal, o diálogo é anunciado e o foco volta ao elemento de origem ao fechar.
 */
export function useModalA11y(){
  useEffect(()=>{
    let opener:HTMLElement|null=null
    let current:HTMLElement|null=null
    const sync=()=>{
      const modal=topModal()
      if(modal&&modal!==current){
        if(!current)opener=document.activeElement as HTMLElement
        current=modal
        const dialog=modal.querySelector<HTMLElement>('.modal')||modal
        dialog.setAttribute('role','dialog')
        dialog.setAttribute('aria-modal','true')
        const title=dialog.querySelector<HTMLElement>('h2')
        if(title){if(!title.id)title.id='modal-title-'+Math.random().toString(36).slice(2);dialog.setAttribute('aria-labelledby',title.id)}
        const first=dialog.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled])')||closeButton(modal)
        requestAnimationFrame(()=>first?.focus())
      }else if(!modal&&current){
        current=null
        if(opener&&document.contains(opener))opener.focus()
        opener=null
      }
    }
    const observer=new MutationObserver(sync)
    observer.observe(document.body,{childList:true,subtree:true})
    const onKey=(e:KeyboardEvent)=>{
      const modal=topModal()
      if(!modal)return
      if(e.key==='Escape'){
        const close=closeButton(modal)
        if(close){e.preventDefault();close.click()}
        return
      }
      if(e.key==='Tab'){
        const items=[...modal.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el=>el.offsetParent!==null)
        if(!items.length)return
        const first=items[0],last=items[items.length-1]
        if(!modal.contains(document.activeElement)){e.preventDefault();first.focus();return}
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    }
    document.addEventListener('keydown',onKey)
    return()=>{observer.disconnect();document.removeEventListener('keydown',onKey)}
  },[])
}

/* ------------------------------------------------------------------------------------------------
 * Feedback (UX-005): substitui alert/confirm/prompt do navegador por toasts e diálogos próprios.
 * ------------------------------------------------------------------------------------------------ */
type Tone='success'|'error'|'warning'|'info'
type Toast={id:number,message:string,tone:Tone}
type DialogRequest={
  kind:'confirm'|'text',title:string,message?:string,confirmLabel:string,cancelLabel:string,danger:boolean,
  defaultValue?:string,typeToConfirm?:string,resolve:(value:any)=>void
}
let toasts:Toast[]=[],dialog:DialogRequest|null=null,seq=0
const listeners=new Set<()=>void>()
const emit=()=>listeners.forEach(l=>l())

export function notify(message:unknown,tone:Tone='info'){
  const text=String((message as any)?.message??message??'').trim()
  if(!text)return
  const id=++seq
  toasts=[...toasts.slice(-3),{id,message:text,tone}]
  emit()
  setTimeout(()=>{toasts=toasts.filter(t=>t.id!==id);emit()},tone==='error'?9000:5000)
}
export const notifySuccess=(m:unknown)=>notify(m,'success')
export const notifyError=(m:unknown)=>notify(m||'Não foi possível concluir a ação.','error')
export const notifyWarning=(m:unknown)=>notify(m,'warning')

function splitMessage(text:string){const[first,...rest]=String(text).split('\n');return{title:first.trim(),message:rest.join('\n').trim()||undefined}}

/** Confirmação assíncrona. A primeira linha do texto vira o título. Retorna true se o usuário confirmar. */
export function confirmAction(text:string,opts:{confirmLabel?:string,cancelLabel?:string,danger?:boolean,typeToConfirm?:string}={}):Promise<boolean>{
  return new Promise(resolve=>{
    dialog={kind:'confirm',...splitMessage(text),confirmLabel:opts.confirmLabel||'Confirmar',cancelLabel:opts.cancelLabel||'Cancelar',danger:Boolean(opts.danger),typeToConfirm:opts.typeToConfirm,resolve}
    emit()
  })
}

/** Pede um texto ao usuário. Retorna null se cancelar. */
export function askText(text:string,defaultValue='',opts:{confirmLabel?:string}={}):Promise<string|null>{
  return new Promise(resolve=>{
    dialog={kind:'text',...splitMessage(text),confirmLabel:opts.confirmLabel||'Confirmar',cancelLabel:'Cancelar',danger:false,defaultValue,resolve}
    emit()
  })
}

function useFeedbackState(){
  const[,force]=useState(0)
  useEffect(()=>{const l=()=>force(x=>x+1);listeners.add(l);return()=>{listeners.delete(l)}},[])
  return{toasts,dialog}
}

const TOAST_ICON:Record<Tone,string>={success:'✓',error:'!',warning:'!',info:'i'}

/** Montado uma única vez na raiz do app. */
export function FeedbackHost(){
  const{toasts:list,dialog:current}=useFeedbackState()
  const[value,setValue]=useState('')
  useEffect(()=>{setValue(current?.defaultValue||'')},[current])
  const close=(result:any)=>{const d=dialog;dialog=null;emit();d?.resolve(result)}
  const typedOk=!current?.typeToConfirm||value.trim().toUpperCase()===current.typeToConfirm.toUpperCase()
  return <>
    <div className="toast-region" role="status" aria-live="polite">
      {list.map(t=><div key={t.id} className={'toast '+t.tone} role={t.tone==='error'?'alert':undefined}>
        <span className="toast-icon" aria-hidden="true">{TOAST_ICON[t.tone]}</span>
        <span className="toast-text">{t.message}</span>
        <button className="toast-close" aria-label="Fechar aviso" onClick={()=>{toasts=toasts.filter(x=>x.id!==t.id);emit()}}>×</button>
      </div>)}
    </div>
    {current&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close(current.kind==='confirm'?false:null)}>
      <div className="modal card feedback-dialog">
        <div className="modal-head"><div><h2>{current.title}</h2>{current.message&&<p>{current.message}</p>}</div>
          <button className="icon-button" aria-label="Fechar" onClick={()=>close(current.kind==='confirm'?false:null)}>×</button></div>
        {(current.kind==='text'||current.typeToConfirm)&&<label className="feedback-input"><span>{current.typeToConfirm?`Digite ${current.typeToConfirm} para confirmar`:'Resposta'}</span>
          <input value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&typedOk)close(current.kind==='confirm'?true:value)}}/></label>}
        <div className="modal-actions">
          <button className="secondary" onClick={()=>close(current.kind==='confirm'?false:null)}>{current.cancelLabel}</button>
          <button className={current.danger?'danger-solid':'primary'} disabled={!typedOk} onClick={()=>close(current.kind==='confirm'?true:value)}>{current.confirmLabel}</button>
        </div>
      </div>
    </div>}
  </>
}

/** Menu "Mais ações" acessível: abre com clique/Enter, fecha com Esc ou clique fora. */
export function MoreMenu({label='Mais ações',items,disabled}:{label?:string,disabled?:boolean,items:{label:string,onSelect:()=>unknown,danger?:boolean,disabled?:boolean}[]}){
  const[open,setOpen]=useState(false)
  const ref=React.useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!open)return
    const onDoc=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);(ref.current?.querySelector('button') as HTMLButtonElement|null)?.focus()}}
    document.addEventListener('mousedown',onDoc);document.addEventListener('keydown',onKey)
    requestAnimationFrame(()=>(ref.current?.querySelector('[role="menuitem"]') as HTMLButtonElement|null)?.focus())
    return()=>{document.removeEventListener('mousedown',onDoc);document.removeEventListener('keydown',onKey)}
  },[open])
  return <div className="more-menu" ref={ref}>
    <button className="secondary small more-menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} disabled={disabled} onClick={()=>setOpen(o=>!o)}>⋯</button>
    {open&&<div className="more-menu-list" role="menu">{items.map(it=><button key={it.label} role="menuitem" className={it.danger?'danger':''} disabled={it.disabled} onClick={()=>{setOpen(false);it.onSelect()}}>{it.label}</button>)}</div>}
  </div>
}
