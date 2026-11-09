// Extracted unchanged generated protobuf/runtime factory from client 3.12.7.
const factory=function(t,e,s,i,n){function r(){this._listeners={}}s.exports=r,r.prototype.on=function(t,e,s){return(this._listeners[t]||(this._listeners[t]=[])).push({fn:e,ctx:s||this}),this},r.prototype.off=function(t,e){if(void 0===t)this._listeners={};else if(void 0===e)this._listeners[t]=[];else for(var s=this._listeners[t],i=0;i<s.length;)s[i].fn===e?s.splice(i,1):++i;return this},r.prototype.emit=function(t){var e=this._listeners[t];if(e){for(var s=[],i=1;i<arguments.length;)s.push(arguments[i++]);for(i=0;i<e.length;)e[i].fn.apply(e[i++].ctx,s)}return this},s.exports};
const paths={};
factory(module.exports,k=>require(paths[k]||k),module,__filename,__dirname);
