'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audit,classify}=require('../lib/coverage-3127');
const {proto}=require('../lib/proto');
const {contract}=require('../lib/codec');
const {SUPPORTED}=require('../lib/team-3127');
const {ACTIONS}=require('../lib/friends-3127');
test('all 226 client routes receive an explicit classification, not fake implemented status',()=>{
 const report=audit();assert.equal(report.catalogTotal,226);assert.equal(report.routes.length,226);
 assert.equal(new Set(report.routes.map(x=>x.route)).size,226);
 assert.equal(Object.values(report.counters).reduce((a,b)=>a+b,0),226);
 assert.ok(report.counters.unsupported>0);
 for(const row of report.routes){assert.ok(row.category in report.counters);if(row.requestType)assert.ok(proto[row.requestType],row.route);if(row.responseType)assert.ok(proto[row.responseType],row.route);}
});
test('known team/friend requests have correct bidirectional protobuf schema except notification-only getTeamMembers',()=>{
 for(const action of SUPPORTED){const route='battle.teamHandler.'+action;assert.ok(contract.requests[route],route);assert.ok(contract.responses[route]||action==='getTeamMembers',route);}
 for(const action of ACTIONS){const route='game.friendHandler.'+action;assert.ok(contract.requests[route],route);assert.ok(contract.responses[route],route);}
 assert.equal(classify('game.drawHandler.draw').category,'provisional');
 assert.equal(classify('battle.b.login').category,'unmapped');
 assert.equal(classify('battle.teamHandler.createTeam').category,'verified');
});
