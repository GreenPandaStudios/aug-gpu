import assert from 'node:assert/strict';
import {lstatSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const adapter=path=>path.startsWith('native/')&&!path.split('/').some(part=>part.startsWith('.')||['licenses','target'].includes(part))&&/\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|rs|m|mm|S)$/.test(path);
export function verifyCompatibilityInputs(root,manifest,tree,originalFile){
 assert.equal(tree.truncated,false,'Original source inventory is incomplete');
 const canonical=path=>assert.ok(!lstatSync(join(root,path)).isSymbolicLink(),'Compatibility inputs must not contain symbolic links: '+path);
 for(const path of ['aug-package.json','native.abi.json','native',manifest.source])canonical(path);
 const collect=(directory,select,skip)=>{const paths=[];const walk=folder=>{for(const entry of readdirSync(join(root,folder),{withFileTypes:true})){
  if(skip?.(entry.name))continue;
  const path=folder+'/'+entry.name;canonical(path);
  if(entry.isDirectory())walk(path);else if(entry.isFile()&&select(path))paths.push(path);
 }};walk(directory);return paths.sort();};
 const binding=path=>path.startsWith(manifest.source+'/')&&path.endsWith('.aug');
 const bindings=collect(manifest.source,binding);
 const native=collect('native',adapter,name=>name.startsWith('.')||['licenses','target'].includes(name));
 const original=select=>tree.tree.filter(file=>file.type==='blob'&&select(file.path)).map(file=>file.path).sort();
 assert.deepEqual(bindings,original(binding),'A compatibility release cannot add or remove August bindings');
 assert.deepEqual(native,original(adapter),'A compatibility release cannot add or remove native adapter source');
 for(const path of ['native.abi.json','native/sources.lock.json',...bindings,...native]){
  canonical(path);assert.equal(readFileSync(join(root,path)).equals(originalFile(path)),true,'Compatibility input changed: '+path);
 }
 return {bindings,native};
}
