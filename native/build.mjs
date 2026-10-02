#!/usr/bin/env node
// Explicit maintainer build. August consumers never execute this file.
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,cpSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {nativeSourceIdentity} from './source-identity.mjs';
const root=resolve(import.meta.dirname,'..'),manifest=JSON.parse(readFileSync(join(root,'aug-package.json'))),name=manifest.name.split('/').at(-1).slice(4),lock=JSON.parse(readFileSync(join(root,'native/sources.lock.json')));
const packageVersion=JSON.parse(readFileSync(join(root,'aug-package.json'))).version;
if(process.platform==='linux')throw new Error('This release qualifies Metal on macOS ARM64. CUDA artifacts require qualification on an NVIDIA host.');
if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Build target is macOS ARM64');
const cache=join(root,'.aug-build/native'),out=join(cache,'artifact');mkdirSync(cache,{recursive:true});rmSync(out,{recursive:true,force:true});mkdirSync(join(out,'lib'),{recursive:true});mkdirSync(join(out,'licenses'),{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(command,args,options={})=>{const r=spawnSync(command,args,{encoding:'utf8',cwd:root,...options});if(r.status!==0)throw new Error(r.stderr||r.error?.message||command+' failed');return r.stdout.replaceAll(root,'/aug-native/aug-'+name);};
const cc=process.env.AUG_CC??'/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang';
const sdk=process.env.SDKROOT??'/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk';
const flags=['-isysroot',sdk,'-mmacosx-version-min=14.0','-O2','-g','-fPIC','-fvisibility=hidden','-ffile-prefix-map='+root+'=/aug-native/aug-'+name,'-I'+join(root,'native/include')];
const stem={pytorch:'torch',sqlite:'sqlite',zlib:'zlib',blake3:'blake3',gpu:'gpu'}[name],library='lib/libaug_'+stem+'.1.dylib',target=join(out,library);
run(cc,[...flags,'-fno-objc-arc','-dynamiclib','-Wl,-install_name,@rpath/libaug_gpu.1.dylib',join(root,'native/src/metal.m'),'-framework','Metal','-framework','Foundation','-o',target]);
const licenseFolder=join(root,'native/licenses');if(existsSync(licenseFolder))cpSync(licenseFolder,join(out,'licenses'),{recursive:true});
copyFileSync(join(root,'LICENSE'),join(out,'licenses/august-adapter.txt'));copyFileSync(join(root,'THIRD_PARTY_NOTICES.md'),join(out,'THIRD_PARTY_NOTICES.md'));
const libs=readdirSync(join(out,'lib'),{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort(),closure=libs.map(file=>({path:'lib/'+file,sha256:hash(readFileSync(join(out,'lib',file))),loadCommands:run('/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/otool',['-L',join(out,'lib',file)]),platform:run('/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/otool',['-l',join(out,'lib',file)])}));
writeFileSync(join(out,'runtime-files.json'),JSON.stringify({format:1,files:closure},null,2)+'\n');
if(hash(readFileSync(join(root,'native/src/metal.m')))!==lock.upstream.sourceRevision)throw new Error('Reviewed adapter digest changed; update sources.lock.json after review');
const sourceIdentity=nativeSourceIdentity(root);
writeFileSync(join(out,'provenance.json'),JSON.stringify({format:1,source:sourceIdentity,package:basename(root),target:lock.target,minimumOS:lock.minimumOS,inputs:lock,compiler:run(cc,['--version']).trim(),adapter:hash(readFileSync(join(root,'native/src/metal.m'))),runtimeInspection:'runtime-files.json'},null,2)+'\n');
writeFileSync(join(out,'sbom.json'),JSON.stringify({format:1,upstream:lock.upstream,runtimeFiles:closure.map(f=>({path:f.path,sha256:f.sha256})),componentNotices:existsSync(join(out,'licenses/provenance.json'))?JSON.parse(readFileSync(join(out,'licenses/provenance.json'))):undefined,licenseFiles:readdirSync(join(out,'licenses')),cargo:name==='blake3'?readFileSync(join(root,'native/Cargo.lock'),'utf8'):undefined},null,2)+'\n');
for(const entry of readdirSync(join(out,'lib'),{withFileTypes:true}))if(entry.isDirectory())rmSync(join(out,'lib',entry.name),{recursive:true});
const files={};let unpacked=0;const walk=(folder,prefix='')=>{for(const entry of readdirSync(folder,{withFileTypes:true})){const path=prefix+entry.name;if(entry.isDirectory())walk(join(folder,entry.name),path+'/');else{const bytes=readFileSync(join(folder,entry.name));unpacked+=bytes.length;files[path]=hash(bytes);}}};walk(out);
writeFileSync(join(out,'files.json'),JSON.stringify({format:1,files},null,2)+'\n');unpacked+=readFileSync(join(out,'files.json')).length;
const archive=join(cache,'native-macos-arm64.tar.gz');run('/usr/bin/tar',['-czf',archive,'-C',out,...readdirSync(out).sort()],{env:{...process.env,COPYFILE_DISABLE:'1'}});
const bytes=readFileSync(archive),descriptor=readFileSync(join(root,'native.abi.json'));
const artifact={id:'macos-arm64',target:{triple:lock.target,os:'macos',arch:'arm64',minimumOS:'14.0',cpuBaseline:'armv8-a',libc:'libSystem',...(name==='pytorch'?{cxxRuntime:'system-libc++',cxxABI:'apple-libc++',features:['cpu','float64']}:{})},url:'https://github.com/GreenPandaStudios/aug-'+name+'/releases/download/v'+packageVersion+'/native-macos-arm64.tar.gz',sha256:hash(bytes),maximumDownloadBytes:bytes.length,maximumUnpackedBytes:unpacked,link:{kind:'dynamic',libraries:[library]},runtime:{files:libs.map(f=>'lib/'+f),closureManifest:'runtime-files.json',relocation:'loader-relative'},components:[{id:lock.upstream.repository,version:lock.upstream.version,compatibilityKey:'aug-'+name+'-runtime',linkage:'dynamic',required:true}],fileManifest:'files.json',provenance:'provenance.json',notices:'THIRD_PARTY_NOTICES.md'};
const compiler=process.env.AUG_COMPILER_VERSION??manifest.compiler;
writeFileSync(join(root,'aug-package.json'),JSON.stringify({...manifest,compiler,native:{...manifest.native,bindingsSha256:hash(descriptor),artifacts:manifest.native.artifacts.filter(entry=>entry.id!==artifact.id).concat(artifact).sort((a,b)=>a.id.localeCompare(b.id))}},null,2)+'\n');
writeFileSync(join(cache,'candidate.json'),JSON.stringify({source:sourceIdentity,package:manifest.name,version:packageVersion,artifact,hardwareTestsExecuted:!process.argv.includes('--compile-only')},null,2)+'\n');
if(!process.argv.includes('--compile-only')&&existsSync(join(root,'native/tests/client.c'))){const client=join(cache,'native-client');run(cc,[...flags,'-std=c11',join(root,'native/tests/client.c'),target,'-Wl,-rpath,'+join(out,'lib'),'-o',client]);console.log(run(client,[]).trim());}
console.log(JSON.stringify({artifact:archive,sha256:artifact.sha256,download:bytes.length,unpacked}));
