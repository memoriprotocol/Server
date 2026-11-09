'use strict';
const {proto}=require('./proto');
const contract=require('../CLIENT_CONTRACT_3127.json');
function encode(type,data){const schema=proto[type];if(!schema)throw Error('UNKNOWN_PROTO_TYPE '+type);const error=schema.verify(data);if(error)throw Error(type+': '+error);return Buffer.from(schema.encode(schema.create(data)).finish());}
function decode(type,bytes){return proto[type].decode(bytes);}
function typedError(route,message,code=1){const schema=proto[contract.responses[route]];if(!schema)return encode('FrameStepResp',{code,message});const obj={};if('code' in schema.prototype)obj.code=code;if('message' in schema.prototype)obj.message=message;return Buffer.from(schema.encode(obj).finish());}
module.exports={encode,decode,typedError,contract};
