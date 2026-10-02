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
