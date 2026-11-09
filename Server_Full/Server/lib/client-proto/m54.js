// Extracted unchanged generated protobuf/runtime factory from client 3.12.7.
const factory=function(t,e,r,n,u){r.exports=function(t,e,r){var n=r||8192,u=n>>>1,s=null,c=n;return function(r){if(r<1||r>u)return t(r);c+r>n&&(s=t(n),c=0);var i=e.call(s,c,c+=r);return 7&c&&(c=1+(7|c)),i}},r.exports};
const paths={};
factory(module.exports,k=>require(paths[k]||k),module,__filename,__dirname);
