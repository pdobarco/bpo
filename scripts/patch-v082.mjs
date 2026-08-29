import fs from 'node:fs'

const read=p=>fs.readFileSync(p,'utf8')
const write=(p,s)=>fs.writeFileSync(p,s)
const replaceOnce=(src,from,to)=>{if(!src.includes(from))throw new Error(`text not found: ${from}`);return src.replace(from,to)}
const stripMarker=(src,start,end)=>{const a=src.indexOf(start);if(a<0)return src;const b=src.indexOf(end,a);return b<0?src:src.slice(0,a)+src.slice(b+end.length)}

let main=read('client/src/main.tsx')
main=replaceOnce(main,"import{CashFlowPageV080,PayablesPageV080,ReceivablesPageV080,ReconciliationPageV080}from'./v080'","import{ReconciliationPageV080}from'./v080'\nimport{CashFlowPageV082,PayablesPageV082,ReceivablesPageV082}from'./v082'")
main=main.replaceAll('CashFlowPageV080','CashFlowPageV082').replaceAll('PayablesPageV080','PayablesPageV082').replaceAll('ReceivablesPageV080','ReceivablesPageV082')
main=replaceOnce(main,"const APP_VERSION='0.8.1'","const APP_VERSION='0.8.2'")
write('client/src/main.tsx',main)

let server=read('server/src/index.ts')
server=replaceOnce(server,"import { registerV080ExtraRoutes } from './v080extra.js'","import { registerV080ExtraRoutes } from './v080extra.js'\nimport { registerV082Routes } from './v082.js'")
server=replaceOnce(server,'registerV080ExtraRoutes(app)','registerV080ExtraRoutes(app)\nregisterV082Routes(app)')
write('server/src/index.ts',server)

let styles=read('client/src/styles.css')
styles=stripMarker(styles,'/* v0.8.2 executive typography */','/* end v0.8.2 executive typography */')
styles+=`\n/* v0.8.2 executive typography */
html,body,#root{font-size:14px}
body{font-weight:400;letter-spacing:-.005em}
b,strong{font-weight:600}
.page-title h1{font-size:clamp(1.45rem,2vw,1.8rem)!important;line-height:1.16!important;font-weight:600!important;letter-spacing:-.025em!important}
.page-title p{font-size:.9rem!important;line-height:1.5!important;font-weight:400!important}
.eyebrow{font-size:.68rem!important;font-weight:600!important;letter-spacing:.08em!important}
.card-head b{font-size:.93rem!important;font-weight:600!important;letter-spacing:-.01em!important}
.card-head span{font-size:.76rem!important;font-weight:400!important}
.kpi-card>div>span{font-size:.76rem!important;font-weight:500!important}
.kpi-card strong{font-size:1.38rem!important;line-height:1.15!important;font-weight:600!important;letter-spacing:-.025em!important}
.kpi-card small{font-size:.72rem!important;line-height:1.35!important;font-weight:400!important}
.tr,.tx-table{font-size:.82rem!important}
.tr.head,.tr.head b,.tx-table .head{font-size:.72rem!important;font-weight:600!important;letter-spacing:.015em!important}
button,input,select,textarea{font-size:.82rem}
button{font-weight:500!important}
.pill{font-size:.69rem!important;font-weight:600!important}
.sidebar nav button,.nav-item{font-size:.82rem!important;font-weight:500!important}
/* end v0.8.2 executive typography */\n`
write('client/src/styles.css',styles)

for(const p of ['package.json','client/package.json','server/package.json','client/package-lock.json','server/package-lock.json']){
  let s=read(p)
  s=s.replaceAll('"version": "0.8.1"','"version": "0.8.2"')
  write(p,s)
}

console.log('v0.8.2 integration applied')
