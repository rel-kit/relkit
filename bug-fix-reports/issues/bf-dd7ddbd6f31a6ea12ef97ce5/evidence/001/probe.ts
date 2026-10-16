import { Effect, Layer } from "effect";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { migrationFixture } from "/Users/mustafaelsayed/Workspace/relkit/packages/cli/tests/migration/fixture.ts";
import { makeDevLocalCompilerEffect } from "/Users/mustafaelsayed/Workspace/relkit/packages/cli/src/commands/dev-local-compiler.ts";
import { buildCapabilitiesLayer } from "/Users/mustafaelsayed/Workspace/relkit/packages/cli/src/services/project-capabilities.ts";
import { projectLiveLayer } from "/Users/mustafaelsayed/Workspace/relkit/packages/cli/src/services/project.service.ts";
import { devSessionCapabilitiesLayer } from "/Users/mustafaelsayed/Workspace/relkit/packages/cli/src/commands/dev-session-engine.ts";
import { acquireDevSessionEffect } from "/Users/mustafaelsayed/Workspace/relkit/packages/cli/src/commands/dev.ts";
const events=[];
const emit=(x)=>{events.push(x);console.log(JSON.stringify(x));};
const io=(f)=>Effect.tryPromise({try:f,catch:e=>e});
async function until(label, check, ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(await check())return;await Bun.sleep(50);}throw new Error("TIMEOUT "+label);}
await Effect.runPromise(Effect.gen(function*(){
 const root=yield* migrationFixture;
 emit({root,pid:process.pid});
 const compiler=yield* makeDevLocalCompilerEffect({projectRoot:root,localEnabled:false});
 const session=yield* acquireDevSessionEffect({projectRoot:root,compile:compiler.compile,sourceChangedEffect:()=>compiler.invalidateEffect,localServicesEffect:compiler.closeEffect,stablePort:0,inspector:false,installSignalHandlers:false,logger:{human:false,json:false},onRecord:emit});
 yield* session.nativeEngine.watch;
 const url="http://127.0.0.1:"+session.backendPort+"/";
 const get=async()=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});return {status:r.status,text:await r.text()};}catch(e){return {error:String(e)}}};
 emit({initial:yield* io(get),port:session.backendPort,active:session.active?.process?.pid});
 const path=join(root,"src/hello/functions/hello.function.ts");
 const original=yield* io(()=>readFile(path,"utf8"));
 const servicePath=join(root,"src/hello/service.ts");
 const service=yield* io(()=>readFile(servicePath,"utf8"));
 const configPath=join(root,"relkit.config.ts");
 const config=yield* io(()=>readFile(configPath,"utf8"));
 const cases=[
 {name:"syntax error",bad:()=>writeFile(path,"export default ("),restore:()=>writeFile(path,original.replace('=> "hello"','=> "recovered-syntax"')),expected:"recovered-syntax"},
 {name:"invalid service descriptor",bad:()=>writeFile(servicePath,"export default { invalid: true };"),restore:async()=>{await writeFile(servicePath,service);await writeFile(path,original.replace('=> "hello"','=> "recovered-descriptor"'));},expected:"recovered-descriptor"},
 {name:"missing import",bad:()=>writeFile(servicePath,service.replace('./functions/hello.function.js','./functions/missing.function.js')),restore:async()=>{await writeFile(servicePath,service);await writeFile(path,original.replace('=> "hello"','=> "recovered-import"'));},expected:"recovered-import"},
 {name:"invalid app config",bad:()=>writeFile(configPath,"export default { invalid: true };"),restore:async()=>{await writeFile(configPath,config);await writeFile(path,original.replace('=> "hello"','=> "recovered-config"'));},expected:"recovered-config"},
 ];
 for(const scenario of cases){
 const start=events.length;emit({case:scenario.name,phase:"bad-edit"});
 yield* io(scenario.bad);
 yield* io(()=>until("diagnostic "+scenario.name,()=>session.isStopping||events.slice(start).some(x=>x.message==="dev.generation.failed")));
 emit({case:scenario.name,phase:"rejected",stopping:session.isStopping,state:session.stateMachine.state,response:yield* io(get)});
 yield* io(scenario.restore);
 yield* io(()=>until("recover "+scenario.name,async()=>{const r=await get();return r.status===200&&r.text.includes(scenario.expected);}));
 emit({case:scenario.name,phase:"recovered",stopping:session.isStopping,state:session.stateMachine.state,response:yield* io(get)});
 }
}).pipe(Effect.scoped,Effect.provide(Layer.mergeAll(buildCapabilitiesLayer,projectLiveLayer,devSessionCapabilitiesLayer)),Effect.timeout("100 seconds"))).catch(e=>{console.error(e);process.exitCode=1;});
