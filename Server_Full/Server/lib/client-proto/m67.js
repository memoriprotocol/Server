// Extracted unchanged generated protobuf/runtime factory from client 3.12.7.
const factory=function(t,e,i,r,s){i.exports=u;var n=e("./reader");(u.prototype=Object.create(n.prototype)).constructor=u;var o=e("./util/minimal");function u(t){n.call(this,t)}u._configure=function(){o.Buffer&&(u.prototype._slice=o.Buffer.prototype.slice)},u.prototype.string=function(){var t=this.uint32();return this.buf.utf8Slice?this.buf.utf8Slice(this.pos,this.pos=Math.min(this.pos+t,this.len)):this.buf.toString("utf-8",this.pos,this.pos=Math.min(this.pos+t,this.len))},u._configure(),i.exports};
const paths={"./reader":"./m68.js","./util/minimal":"./m65.js"};
factory(module.exports,k=>require(paths[k]||k),module,__filename,__dirname);
