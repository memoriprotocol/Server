'use strict';
// Source of truth is the literal-route catalog shipped with the 2024 client.
// "codec available" is not equivalent to "gameplay implemented".
const {proto}=require('./proto');
const {contract}=require('./codec');
const catalog=require('../CLIENT_ROUTES_3127.json');
const {SUPPORTED:teamRoutes}=require('./team-3127');
const {ACTIONS:friendRoutes}=require('./friends-3127');
const {responseTypes:initialRoutes}=require('./initial');
const {safe:queryRoutes}=require('./query-3127');
const {routes:bagRoutes}=require('./bag');
const localCommerce=new Set(['game.shopHandler.queryShopItem','game.shopHandler.buyShopItem','game.drawHandler.draw','game.drawHandler.drawWeapon','game.drawHandler.getWeapons']);
const explicit=new Set([
 'connector.entryHandler.heartbeat','connector.entryHandler.login',
 'game.gameHandler.setName','game.gameHandler.getCoin','game.gameHandler.getDiamond',
 'game.gameHandler.getServers','game.gameHandler.getBatchServers','game.gameHandler.getNominateServer','game.gameHandler.getGuideServers',
 'game.gameHandler.playerInfo',
 'game.gameHandler.enterBattle','game.gameHandler.exitBattle','game.gameHandler.enterGuide','game.gameHandler.exitGuide',
 'battle.iob.enter','battle.iob.reEnter','battle.iob.frame','battle.iob.heartbeat','battle.iob.getEquipments','battle.iob.getEquipmentsByUID','battle.iob.getNextSwitchSeasonTime',
 'battle.iob.teammatesLocReq','battle.iob.queryNearbyPlayers','battle.iob.getFubenInfo','battle.iob.getCurrentFubenInfo','battle.iob.getDoubleDropActivity',
]);
const notes={
 verified:'Использует реальные protobuf-схемы, проверку авторизации и серверное состояние. Полная идентичность игровому серверу не заявляется.',
 provisional:'Начальные данные или ограниченный ответ, не полная игровая механика.',
 unsupported:'Маршрут известен, но операция не реализована; при наличии поля ошибки возвращается отказ, иначе сервер не подтверждает её успех.',
 unmapped:'У клиента нет подтверждённой пары protobuf/ответа в текущем контракте. Требуется проверка сетевого вызова в игровом Index.',
};
function classify(route){
 const req=contract.requests[route]||null,rsp=contract.responses[route]||null;
 let category='unsupported',service=null;
 if(!req||!rsp){category='unmapped';}
 const teamAction=route.startsWith('battle.teamHandler.')&&route.slice('battle.teamHandler.'.length);
 const friendAction=route.startsWith('game.friendHandler.')&&route.slice('game.friendHandler.'.length);
 if(teamAction&&teamRoutes.has(teamAction)){category='verified';service='teams';}
 else if(friendAction&&friendRoutes.has(friendAction)){category='verified';service='friends';}
 else if(bagRoutes.has(route)){category='verified';service='inventory';}
 else if(explicit.has(route)){category='provisional';service=route.startsWith('battle.')?'world':'lobby';}
 else if(localCommerce.has(route)){category='provisional';service='local-commerce';}
 else if(Object.hasOwn(initialRoutes,route)){category='provisional';service='boot';}
 else if(Object.hasOwn(queryRoutes,route)){category='provisional';service='read';}
 // A protobuf pair can be missing even for a known notification-only handler.
 if((!req||!rsp)&&!service)category='unmapped';
 return {route,requestType:req,responseType:rsp,requestCodec:!!(req&&proto[req]),responseCodec:!!(rsp&&proto[rsp]),category,service,note:notes[category]};
}
function audit(){const rows=catalog.routes.map(classify);const counters={verified:0,provisional:0,unsupported:0,unmapped:0};for(const r of rows)counters[r.category]++;
 return {clientVersion:'3.12.7',catalogTotal:catalog.total,contractRequestTypes:Object.keys(contract.requests).length,contractResponseAndPushTypes:Object.keys(contract.responses).length,counters,routes:rows};}
module.exports={audit,classify,explicit};
