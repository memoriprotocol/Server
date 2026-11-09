// Original 3.12.7 ShopModel.getCanGiveShopItems; decoded strings, body unchanged.
const _0x850095=()=>{};
const _0x27768b=value=>{const it=value[Symbol.iterator]();return ()=>it.next();};
const _0x5c63ad={newUp:4},_0x48b897={present:64,hideInShop:512};
const _0x30ef30={isCanShow:item=>!(item.saleType & 512)};
module.exports=function(){var _0x5a25e3=_0x850095;for(var _0x1d3795,_0x2d4db3=[],_0x2a3f5d=_0x27768b(this["itemMap"]);!(_0x1d3795=_0x2a3f5d())["done"];){var _0x743031=_0x1d3795["value"],_0x4d2bf8=_0x743031[0x0],_0x22ac07=_0x743031[0x1];if(_0x4d2bf8!==_0x5c63ad['newUp'])for(var _0x118dc0,_0x5a1b7a=_0x27768b(_0x22ac07["itemList"]);!(_0x118dc0=_0x5a1b7a())["done"];){var _0x22f7df=_0x118dc0["value"];(_0x22f7df["saleType"]&_0x48b897['present'])==_0x48b897['present']&&(_0x22f7df["saleType"]&_0x48b897["hideInShop"])!==_0x48b897["hideInShop"]&&_0x30ef30['isCanShow'](_0x22f7df)&&_0x2d4db3['push'](_0x22f7df);}}return _0x2d4db3;};
