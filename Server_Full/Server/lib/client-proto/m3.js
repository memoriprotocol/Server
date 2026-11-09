// Extracted unchanged generated protobuf/runtime factory from client 3.12.7.
const factory=function(r,e,t,i,n){var u=r;function f(){u.util._configure(),u.Writer._configure(u.BufferWriter),u.Reader._configure(u.BufferReader)}u.build="minimal",u.Writer=e("./writer"),u.BufferWriter=e("./writer_buffer"),u.Reader=e("./reader"),u.BufferReader=e("./reader_buffer"),u.util=e("./util/minimal"),u.rpc=e("./rpc"),u.roots=e("./roots"),u.configure=f,f(),t.exports};
const paths={"./writer":"./m74.js","./writer_buffer":"./m73.js","./reader":"./m68.js","./reader_buffer":"./m67.js","./util/minimal":"./m65.js","./rpc":"./m70.js","./roots":"./m69.js"};
factory(module.exports,k=>require(paths[k]||k),module,__filename,__dirname);
