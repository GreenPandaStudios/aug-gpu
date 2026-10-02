#!/usr/bin/env node
// Explicit hardware qualification against a reviewed compiler candidate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),compiler=resolve(process.argv[2]??'');
if(!process.argv[2])throw new Error('Pass the reviewed compiler directory. Prepare its LLVM tools and runtime first.');
const module=async name=>import(pathToFileURL(join(compiler,'src',name+(existsSync(join(compiler,'src',name+'.js'))?'.js':'.ts'))));
const {installPackages}=await module('package-manager'),{loadProject}=await module('project'),{checkProject}=await module('checker'),{compileLLVM}=await module('llvm-native'),{discoverTests,checkUnitTests}=await module('testing');
const candidate=JSON.parse(readFileSync(join(root,'.aug-build/native/candidate.json'))),app=join(root,'examples/add');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(readFileSync(join(root,'.aug-build/native/native-macos-arm64.tar.gz'))),candidate.artifact.sha256);
installPackages(app,false,true);
const checked=checkProject(loadProject(app));assert.deepEqual(checked.diagnostics.filter(d=>d.severity!=='warning'),[]);
const native=[{directory:join(root,'.aug-build/native/artifact'),libraries:candidate.artifact.link.libraries,runtimeFiles:[]}],outcomes=[];
for(const release of [false,true]){
 const compiled=compileLLVM(checked,{release,native});
 const result=spawnSync(compiled.output,[],{encoding:'utf8',timeout:30000,env:{...process.env,AUG_WORKERS:'2',PATH:'/nonexistent',SDKROOT:'/nonexistent',DEVELOPER_DIR:'/nonexistent'}});
 assert.equal(result.status,0,result.stderr||result.error?.message);assert.equal(result.stdout,'5\n7\n9\n11\n22\n');outcomes.push({optimization:release?'release':'debug',stdout:result.stdout,passed:true});
}
const project=loadProject(root),tests=discoverTests(project);assert.deepEqual(tests.diagnostics,[]);assert.ok(tests.tests.length>=2);
for(const [index,item] of checkUnitTests(project,tests.tests).entries()){
 assert.deepEqual(item.checked.diagnostics.filter(d=>d.severity!=='warning'),[]);
 const compiled=compileLLVM(item.checked,{testIndex:index,native});const result=spawnSync(compiled.output,[],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr||result.error?.message);
}
const cc=process.env.AUG_CC??'/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang';
const client=join(root,'.aug-build/native/hardware-client');
const built=spawnSync(cc,['-isysroot',process.env.SDKROOT??'/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk','-I'+join(root,'native/include'),join(root,'native/tests/client.c'),join(root,'.aug-build/native/artifact/lib/libaug_gpu.1.dylib'),'-Wl,-rpath,'+join(root,'.aug-build/native/artifact/lib'),'-o',client],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
const tested=spawnSync(client,[],{encoding:'utf8',timeout:30000});assert.equal(tested.status,0,tested.stderr);
const files=['native/src/metal.m','native/tests/client.c','native.abi.json','examples/add/compute.aug','examples/add/main.aug','native/qualify.mjs'];
writeFileSync(join(root,'native/hardware-qualification.json'),JSON.stringify({format:1,target:'aarch64-apple-darwin',operation:'Real Metal addition from two isolated August workers',transport:'reviewed local candidate; public repository download is a separate gate',compiler:JSON.parse(readFileSync(join(compiler,'package.json'))).version,artifactSha256:candidate.artifact.sha256,sourceFiles:Object.fromEntries(files.map(file=>[file,sha(readFileSync(join(root,file)))])),toolingUnavailableDuringWorkerExample:true,outcomes,sameFileTests:tests.tests.length,nativeClientPassed:true},null,2)+'\n');
console.log('Real Metal worker examples and same-file resource tests passed.');
