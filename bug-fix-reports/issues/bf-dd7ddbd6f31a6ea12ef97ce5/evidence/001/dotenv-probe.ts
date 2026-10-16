import { readFile,writeFile } from "node:fs/promises";
import {join} from "node:path";
const root=join(import.meta.dirname,"installed-app");
const child=Bun.spawn([process.execPath,"dev"],{cwd:root,stdout:"pipe",stderr:"pipe"});
let text="";const readers=[child.stdout,child.stderr].map(async s=>{for await(const b of s)text+=new TextDecoder().decode(b);});
const get=async()=>{try{const r=await fetch("http://127.0.0.1:15762/hello?name=Probe",{signal:AbortSignal.timeout(1000)});return {status:r.status,text:await r.text()};}catch(e){return {error:String(e)}}};
async function until(label,fn,ms=25000){const end=Date.now()+ms;while(Date.now()<end){if(child.exitCode!==null)throw new Error(`CLI exited ${child.exitCode}: ${text.slice(-5000)}`);if(await fn())return;await Bun.sleep(50);}throw new Error("TIMEOUT "+label+" "+text.slice(-5000));}
let result=0;
try{
await until("initial",async()=>{const r=await get();return r.text?.includes("Hello, Probe!");});
console.log(JSON.stringify({phase:"initial",pid:child.pid,response:await get()}));
const envPath=join(root,"src/platform/env.ts"); const original=await readFile(envPath,"utf8");
await writeFile(envPath,original.replace("LOG_LEVEL:","RECOVERY_REQUIRED: env.string(),\n  LOG_LEVEL:"));
await until("error",()=>text.includes("Reload failed"));
console.log(JSON.stringify({phase:"rejected",exit:child.exitCode,response:await get(),log:text.slice(-5000)}));
const before=text.length;
await writeFile(join(root,".env.local"),"RECOVERY_REQUIRED=repaired\n");
await until("dotenv recovery",()=>text.slice(before).includes("Compiled in"),12000);
console.log(JSON.stringify({phase:"recovered",exit:child.exitCode,response:await get()}));
}catch(e){console.error(e);result=1;}finally{
child.kill("SIGTERM");await Promise.race([child.exited,Bun.sleep(5000)]);if(child.exitCode===null)child.kill("SIGKILL");await child.exited;await Promise.all(readers);await Bun.write(join(import.meta.dirname,"dotenv-cli.log"),text);console.log(JSON.stringify({phase:"cleanup",exit:child.exitCode}));}
process.exitCode=result;
