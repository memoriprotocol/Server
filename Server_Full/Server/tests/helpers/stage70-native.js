'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function method(name,marker){const s=fs.readFileSync(path.join(__dirname,'../../../retail/client-reference/stage70',name+'.ts'),'utf8'),at=s.indexOf(marker);assert.ok(at>=0,marker);const begin=s.indexOf('function',at),open=s.indexOf('{',begin);let depth=0,q=null,esc=false;for(let i=open;i<s.length;i++){const c=s[i];if(q){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===q)q=null;continue;}if(c==='"'||c==="'"||c==='`'){q=c;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0)return s.slice(begin,i+1);}throw Error('INCOMPLETE_NATIVE_METHOD');}
function native(name,marker,ctx){return vm.runInNewContext('('+method(name,marker)+')',ctx);}
module.exports={method,native};
