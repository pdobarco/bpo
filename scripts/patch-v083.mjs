import fs from 'node:fs'

const read=p=>fs.readFileSync(p,'utf8')
const write=(p,s)=>fs.writeFileSync(p,s)
const replaceIf=(src,from,to)=>{if(src.includes(to))return src;if(!src.includes(from))throw new Error(`text not found: ${from}`);return src.replace(from,to)}

let main=read('client/src/main.tsx')
main=replaceIf(main,"import{ReconciliationPageV080}from'./v080'","import{ReconciliationPageV083}from'./v083'")
main=main.replaceAll('ReconciliationPageV080','ReconciliationPageV083')
main=replaceIf(main,"const APP_VERSION='0.8.2'","const APP_VERSION='0.8.3'")
write('client/src/main.tsx',main)

let v080=read('server/src/v080.ts')
v080=replaceIf(v080,'async function autoReconcile(cid:string,from:string,to:string)','export async function autoReconcile(cid:string,from:string,to:string)')
write('server/src/v080.ts',v080)

let server=read('server/src/index.ts')
server=replaceIf(server,"import { registerV082Routes } from './v082.js'","import { registerV082Routes } from './v082.js'\nimport { registerV083Routes,initV083Schema } from './v083.js'")
server=replaceIf(server,'registerV082Routes(app)','registerV082Routes(app)\nregisterV083Routes(app)')
server=replaceIf(server,'  await initV080Schema()','  await initV080Schema()\n  await initV083Schema()')
server=server.replaceAll("version:'0.8.0'","version:'0.8.3'")
write('server/src/index.ts',server)

for(const p of ['package.json','client/package.json','server/package.json','client/package-lock.json','server/package-lock.json']){
  let s=read(p)
  s=s.replaceAll('"version": "0.8.2"','"version": "0.8.3"')
  write(p,s)
}

console.log('v0.8.3 integration applied')
