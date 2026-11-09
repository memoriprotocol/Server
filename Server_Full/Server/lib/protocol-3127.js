'use strict';
// Machine-readable transport coverage for *this* client, not a claim of gameplay implementation.
const {proto}=require('./proto');
const {contract,encode}=require('./codec');
const requestRoutes=Object.freeze(Object.keys(contract.requests));
const responseRoutes=Object.freeze(Object.keys(contract.responses));
function parseClientRequest(route,raw){
 const name=contract.requests[route];
 if(!name)return {known:false,type:null,value:null};
 if(!proto[name])throw Error('CLIENT_PROTO_MISSING:'+name);
 if(!Buffer.isBuffer(raw)||raw.length>1024*1024)throw Error('CLIENT_PROTO_SIZE');
 let value;try{value=proto[name].decode(raw);}catch(_){throw Error('INVALID_PROTOBUF:'+name);}
 const fault=proto[name].verify(value);
 if(fault)throw Error('INVALID_PROTOBUF:'+name+':'+fault);
 return {known:true,type:name,value};
}
function responseShape(route){const type=contract.responses[route];return {type:type||null,fields:type&&proto[type]?Object.keys(proto[type].prototype).filter(k=>k!=='toJSON'):[]};}
function rejection(route,reason='NOT_IMPLEMENTED',status=1){
 const shape=responseShape(route);
 if(!shape.type||!proto[shape.type])return {bytes:null,representable:false,type:null};
 const data={};
 if(shape.fields.includes('code'))data.code=status;
 if(shape.fields.includes('message'))data.message=String(reason).slice(0,180);
 if(shape.fields.includes('errorMsg'))data.errorMsg=String(reason).slice(0,180);
 if(shape.fields.includes('status')&&!shape.fields.includes('code'))data.status=status;
 let bytes;try{bytes=encode(shape.type,data);}catch(e){if(Object.hasOwn(data,'code'))data.code=1;else if(Object.hasOwn(data,'status'))data.status=1;bytes=encode(shape.type,data);}
 return {bytes,representable:shape.fields.some(f=>['code','status','errorMsg','message'].includes(f)),type:shape.type};
}
function catalog(){
 const requestSet=new Set(requestRoutes),responseSet=new Set(responseRoutes);
 return {clientVersion:'3.12.7',protobufRequestRoutes:requestRoutes.length,protobufResponseAndPushRoutes:responseRoutes.length,mappedBidirectional:[...requestSet].filter(k=>responseSet.has(k)).length,requestsWithNoNamedResponse:[...requestSet].filter(k=>!responseSet.has(k)),unmappedResponseAndPush:[...responseSet].filter(k=>!requestSet.has(k)),notes:'Codec cover != implemented gameplay. Voice SDK is Tencent GME; WebRTC signaling is separate.'};
}
module.exports={requestRoutes,responseRoutes,parseClientRequest,responseShape,rejection,catalog};
