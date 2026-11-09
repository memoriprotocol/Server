'use strict';
const fs=require('node:fs'),path=require('node:path');
class Players{
 constructor(file){this.file=file;fs.mkdirSync(path.dirname(file),{recursive:true});this.db=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};}
 ensure(u){if(!this.db[u.id]){this.db[u.id]={uid:u.id,name:'',coin:0,diamond:0,inventory:[],createdAt:new Date().toISOString().replace('T',' ').slice(0,19)};this.save();}return this.db[u.id];}
 isNameTaken(name,uid){return Object.values(this.db).some(x=>x.uid!==uid&&String(x.name).toLowerCase()===name.toLowerCase());}
 save(){const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.db,null,2),{mode:0o600});fs.renameSync(temp,this.file);}
}
module.exports={Players};
