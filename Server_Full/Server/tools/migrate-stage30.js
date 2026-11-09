'use strict';
// Optional layout migration. Never run automatically from server startup.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const LEGACY=['lib','config','data','local-update','tools','tests'];
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(dir,prefix=''){const result=[];if(!fs.existsSync(dir))return result;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('SYMLINK_NOT_MIGRATED '+path.join(prefix,entry.name));const relative=path.join(prefix,entry.name);if(entry.isDirectory())result.push(...files(path.join(dir,entry.name),relative));else if(entry.isFile())result.push(relative);}return result;}
function plan(root){
 root=path.resolve(root);if(!fs.existsSync(path.join(root,'Server/lib/game.js')))throw Error('UPDATED_SERVER_FOLDER_REQUIRED');
 const legacy=LEGACY.filter(name=>fs.existsSync(path.join(root,name)));
 for(const name of legacy)if(!fs.lstatSync(path.join(root,name)).isDirectory()||fs.lstatSync(path.join(root,name)).isSymbolicLink())throw Error('LEGACY_PATH_NOT_DIRECTORY '+name);
 const copy=[],matching=[];
 for(const relative of files(path.join(root,'data'))){const source=path.join(root,'data',relative),destination=path.join(root,'Server/data',relative),sha256=digest(source);if(fs.existsSync(destination)){if(!fs.statSync(destination).isFile()||digest(destination)!==sha256)throw Error('DESTINATION_CONFLICT Server/data/'+relative);matching.push(relative);}else copy.push({relative,sha256});}
 return{root,legacy,copy,matching};
}
function apply(root){
 const p=plan(root);if(!p.legacy.length)return{changed:false,legacy:[],copied:0};
 const backup=path.join(p.root,'retail/migration-backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8));
 fs.mkdirSync(backup,{recursive:true});const created=[],moved=[];
 try{
  for(const entry of p.copy){const source=path.join(p.root,'data',entry.relative),destination=path.join(p.root,'Server/data',entry.relative);if(digest(source)!==entry.sha256)throw Error('SOURCE_CHANGED '+entry.relative);fs.mkdirSync(path.dirname(destination),{recursive:true});const fd=fs.openSync(destination,'wx',0o600);created.push({...entry,destination});try{fs.writeFileSync(fd,fs.readFileSync(source));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  for(const name of p.legacy){fs.renameSync(path.join(p.root,name),path.join(backup,name));moved.push(name);}
  fs.writeFileSync(path.join(backup,'migration.json'),JSON.stringify({legacy:p.legacy,copied:p.copy.map(r=>r.relative),matching:p.matching},null,2)+'\n',{flag:'wx',mode:0o600});
  return{changed:true,backup,legacy:p.legacy,copied:p.copy.length};
 }catch(error){
  for(const name of moved.reverse())if(!fs.existsSync(path.join(p.root,name)))fs.renameSync(path.join(backup,name),path.join(p.root,name));
  for(const entry of created.reverse())if(fs.existsSync(entry.destination)&&digest(entry.destination)===entry.sha256)fs.unlinkSync(entry.destination);
  throw error;
 }
}
if(require.main===module){try{const args=process.argv.slice(2);if(args.some(a=>a!=='--apply'))throw Error('USAGE: node Server/tools/migrate-stage30.js [--apply]');const root=path.resolve(__dirname,'../..');if(args.includes('--apply'))console.log(JSON.stringify(apply(root),null,2));else{console.log(JSON.stringify({mode:'PLAN_ONLY',...plan(root)},null,2));console.log('No files changed. Stop the server, then run again with --apply to migrate.');}}catch(error){console.error('[MIGRATION]',error.message);process.exitCode=1;}}
module.exports={plan,apply};
