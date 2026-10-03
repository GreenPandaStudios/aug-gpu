import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyCompatibilityInputs} from './compatibility-inputs.mjs';
test('compatibility releases reject changed or removed Objective-C adapters and source-root links',()=>{
 const root=mkdtempSync(join(tmpdir(),'aug-compatibility-'));
 try{
  mkdirSync(join(root,'native/src'),{recursive:true});mkdirSync(join(root,'src'));
  const files={'aug-package.json':'{}','native.abi.json':'{}','native/sources.lock.json':'{}','native/src/metal.m':'original Metal','native/src/wrapper.mm':'original C++','src/export.aug':'export example','src/example.aug':'example()'};
  for(const [path,value]of Object.entries(files))writeFileSync(join(root,path),value);
  const tree={truncated:false,tree:Object.keys(files).map(path=>({type:'blob',path}))};
  const original=path=>Buffer.from(files[path]);const verify=()=>verifyCompatibilityInputs(root,{source:'src'},tree,original);
  assert.equal(verify().native.length,2);
  writeFileSync(join(root,'native/src/metal.m'),'changed Metal');assert.throws(verify,/input changed: native\/src\/metal.m/);
  writeFileSync(join(root,'native/src/metal.m'),files['native/src/metal.m']);
  rmSync(join(root,'native/src/wrapper.mm'));assert.throws(verify,/add or remove native adapter source/);
  writeFileSync(join(root,'native/src/wrapper.mm'),files['native/src/wrapper.mm']);
  rmSync(join(root,'src'),{recursive:true});symlinkSync(join(root,'native'),join(root,'src'));
  assert.throws(verify,/symbolic links: src/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
