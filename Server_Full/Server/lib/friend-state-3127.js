/* Adapted local-only transaction logic from user-provided later HeroLand server; independent 2024 wire adapter. */
'use strict';
const crypto = require('node:crypto');

class FriendError extends Error {
  constructor(code, message) { super(message); this.name = 'FriendError'; this.code = code; }
}
const fail = (code, text) => { throw new FriendError(code, text); };
const uid = p => Number(p?.uid);
const key = p => String(uid(p));
const dict = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const own = (obj, id) => Object.prototype.hasOwnProperty.call(dict(obj), id);
const has = (obj, id) => own(obj, id) && Boolean(obj[id]);
const clone = value => JSON.parse(JSON.stringify(value));

/** Owns only explicit relationships. A named/online player is NOT an implied friend.
 * Mutations are synchronous so one PlayerStore save is the commit boundary. Return
 * events are consumed by the wire layer only after commit; no network side effects
 * occur within a transaction. The game server's existing exclusive writer applies.
 */
function createFriendService(store, { now = Date.now, onRequest = () => {}, maxFriends = 200, maxRequests = 200 } = {}) {
  if (!store?.data?.players || typeof store.save !== 'function') throw TypeError('PlayerStore required');
  const list = () => Object.values(store.data.players);
  const find = id => list().find(p => uid(p) === Number(id)) || null;
  const validate = p => { if (!p || !Number.isSafeInteger(uid(p)) || uid(p) < 1 || find(uid(p)) !== p) fail(1001, 'player not found'); };
  const validatePair = (a, b) => { validate(a); validate(b); if (uid(a) === uid(b)) fail(1007, 'cannot target yourself'); };
  const blocked = (a, b) => has(a?.friendBlocks, key(b)) || has(b?.friendBlocks, key(a));
  const isFriend = (a, b) => !!a && !!b && uid(a) !== uid(b) && !blocked(a, b) && has(a.friends, key(b)) && has(b.friends, key(a));
  const assertFriend = (a, b) => { validatePair(a, b); if (blocked(a, b)) fail(1008, 'blocked'); if (!isFriend(a, b)) fail(1003, 'not friends'); };
  const accepted = a => list().filter(b => isFriend(a, b));
  const incoming = a => list().filter(b => uid(a) !== uid(b) && has(a.friendRequests, key(b)) && !isFriend(a, b) && !blocked(a, b));
  const ensure = p => {
    for (const field of ['friends', 'friendRequests', 'friendAdds', 'friendBlocks', 'friendMessages', 'friendReadAt']) p[field] = dict(p[field]);
    p.friendSchema = 1;
  };
  const subscribers = new Set();
  function transaction(people, edit) {
    const unique = [...new Set(people)];
    unique.forEach(validate);
    const snapshots = unique.map(clone);
    let result;
    try {
      unique.forEach(ensure);
      result = edit();
      store.save();
    } catch (error) {
      unique.forEach((p, i) => { for (const k of Object.keys(p)) delete p[k]; Object.assign(p, snapshots[i]); });
      throw error;
    }
    // The durable save above is the commit boundary. Listener failure must not
    // undo a persisted transaction or turn an acknowledged send into a retry.
    const change = { uids: unique.map(uid), result };
    for (const listener of subscribers) { try { listener(change); } catch (_) { /* isolated consumer */ } }
    return result;
  }
  const clearRequests = (a, b) => {
    delete a.friendRequests[key(b)]; delete a.friendAdds[key(b)];
    delete b.friendRequests[key(a)]; delete b.friendAdds[key(a)];
  };
  const clearRelationship = (a, b) => {
    delete a.friends[key(b)]; delete b.friends[key(a)]; clearRequests(a, b);
    // Conversations are not silently erased from durable storage. Their read/send
    // paths become inaccessible until both players explicitly become friends again.
  };
  return {
    find, isFriend, blocked, accepted, incoming,
    subscribe(listener) {
      if (typeof listener !== 'function') throw TypeError('listener required');
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    rows(a) {
      validate(a);
      return [...accepted(a).map(player => ({ player, status: undefined })),
        ...incoming(a).map(player => ({ player, status: 0 }))];
    },
    blockedPlayers(a) { validate(a); return list().filter(b => uid(a) !== uid(b) && has(a.friendBlocks, key(b))); },
    request(a, b, searchType = 1) {
      validatePair(a, b);
      if (blocked(a, b)) fail(1008, 'blocked');
      if (isFriend(a, b)) fail(1000, 'already friends');
      if (has(b.friendRequests, key(a))) fail(1002, 'request already pending');
      if (accepted(a).length >= maxFriends || accepted(b).length >= maxFriends) fail(1004, 'friend limit');
      if (incoming(b).length >= maxRequests || Object.keys(dict(a.friendAdds)).length >= maxRequests) fail(1216, 'request limit');
      return transaction([a, b], () => {
        const time = now();
        b.friendRequests[key(a)] = { uid: uid(a), name: String(a.name || ''), time, type: searchType };
        a.friendAdds[key(b)] = { uid: uid(b), name: String(b.name || ''), time, state: 0 };
        const progress = onRequest(a, b) || [];
        return { target: b, progress, events: [{ to: uid(b), kind: 'request', player: a, status: 0 }] };
      });
    },
    authorize(a, b, type) {
      if (type !== 1 && type !== 2) fail(1, 'invalid operation');
      validatePair(a, b);
      if (blocked(a, b)) fail(1008, 'blocked');
      if (!has(a.friendRequests, key(b))) fail(1009, 'no incoming request');
      if (type === 1 && (accepted(a).length >= maxFriends || accepted(b).length >= maxFriends)) fail(1004, 'friend limit');
      return transaction([a, b], () => {
        delete a.friendRequests[key(b)]; delete b.friendAdds[key(a)];
        if (type === 1) {
          clearRequests(a, b);
          a.friends[key(b)] = { uid: uid(b), since: now() };
          b.friends[key(a)] = { uid: uid(a), since: now() };
        }
        const events = [{ to: uid(b), kind: 'auth', type, player: a }];
        // Native refusal handling removes this peer from its local roster. Restore
        // the independently pending reverse request without promoting friendship.
        if (type === 2 && has(b.friendRequests, key(a))) events.push({to:uid(b),kind:'request',player:a,status:0});
        return { target: b, type, events };
      });
    },
    refuseAll(a) {
      validate(a);
      const pending = incoming(a);
      return transaction([a, ...pending], () => {
        for (const b of pending) { delete a.friendRequests[key(b)]; delete b.friendAdds[key(a)]; }
        return { events: pending.flatMap(b => [{ to: uid(b), kind: 'auth', type: 2, player: a }, ...(has(b.friendRequests,key(a)) ? [{to:uid(b),kind:'request',player:a,status:0}] : [])]) };
      });
    },
    remove(a, b) {
      validatePair(a, b);
      return transaction([a, b], () => { clearRelationship(a, b); return { target: b, events: [{ to: uid(b), kind: 'delete', id: uid(a) }] }; });
    },
    block(a, b, type) {
      if (type !== 1 && type !== 2) fail(1, 'invalid operation');
      validatePair(a, b);
      return transaction([a, b], () => {
        const events = [];
        if (type === 1) {
          a.friendBlocks[key(b)] = { uid: uid(b), since: now() };
          clearRelationship(a, b);
          events.push({ to: uid(b), kind: 'delete', id: uid(a) });
        } else { delete a.friendBlocks[key(b)]; }
        return { target: b, type, events };
      });
    },
    setStatus(a, type) {
      validate(a); if (type !== 0 && type !== 1) fail(1, 'invalid status');
      return transaction([a], () => { a.friendStatus = type; return { type, events: accepted(a).map(b => ({ to: uid(b), kind: 'status', player: a })) }; });
    },
    unread(a, b) {
      if (!isFriend(a, b)) return 0;
      const readAt = Number(dict(a.friendReadAt)[key(b)] || 0);
      return (dict(a.friendMessages)[key(b)] || []).filter(m => Number(m.uid) === uid(b) && Number(m.time) > readAt).length;
    },
    messages(a, b, since = 0) {
      assertFriend(a, b);
      if (!Number.isFinite(since) || since < 0) fail(1, 'invalid time');
      return (dict(a.friendMessages)[key(b)] || []).filter(m => Number(m.time) > since);
    },
    markRead(a, b, throughMsgId) {
      assertFriend(a, b);
      const history = dict(a.friendMessages)[key(b)] || [];
      let boundary;
      if (throughMsgId !== undefined) {
        boundary = history.find(m => m.msgId === throughMsgId);
        if (!boundary) fail(1, 'unknown read boundary');
      } else { boundary = history[history.length - 1]; }
      // A read acknowledges a displayed message, never future wall-clock time.
      const previous = Number(dict(a.friendReadAt)[key(b)] || 0);
      const time = Math.max(previous, Number(boundary?.time || 0));
      if (time === previous) return { id: uid(b), time };
      return transaction([a], () => { a.friendReadAt[key(b)] = time; return { id: uid(b), time }; });
    },
    chat(a, b, input) {
      assertFriend(a, b);
      const contents = String(input.contents || input.originContent || ''), emojiId = Number(input.emojiId || 0);
      if (contents.length > 1000) fail(31, 'message too long');
      if (!contents.trim() && !emojiId) fail(120, 'empty message');
      if (![emojiId, Number(input.requestItem || 0), Number(input.connectActivityId || 0)].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647)) fail(1, 'invalid message fields');
      const clientMessageId = input.clientMessageId == null ? '' : String(input.clientMessageId);
      if (clientMessageId && !/^[A-Za-z0-9_-]{8,100}$/.test(clientMessageId)) fail(1, 'invalid client message id');
      const history = dict(a.friendMessages)[key(b)] || [];
      const prior = clientMessageId && history.find(m => Number(m.uid) === uid(a) && m.clientMessageId === clientMessageId);
      if (prior) {
        if (prior.contents !== contents || prior.emojiId !== emojiId || prior.requestItem !== Number(input.requestItem || 0) || prior.connectActivityId !== Number(input.connectActivityId || 0)) fail(1, 'client message id conflict');
        return prior;
      }
      return transaction([a, b], () => {
        const clock = now();
        if (Number(a.friendLastChatAt || 0) && clock - a.friendLastChatAt < 250) fail(43, 'message rate limit');
        a.friendLastChatAt = clock;
        const lastTime = Math.max(0, ...history.map(m => Number(m.time) || 0));
        const time = Math.max(clock, lastTime + 1);
        const m = { uid: uid(a), name: String(a.name || ''), contents, time, msgId: crypto.randomUUID(),
          ...(clientMessageId ? { clientMessageId } : {}),
          headId: Number(a.headId || 1), headFrameId: Number(a.headFrameId || 1), emojiId,
          requestItem: Number(input.requestItem || 0), connectActivityId: Number(input.connectActivityId || 0) };
        for (const [p, peer] of [[a,b], [b,a]]) {
          const history = Array.isArray(p.friendMessages[key(peer)]) ? p.friendMessages[key(peer)] : [];
          p.friendMessages[key(peer)] = [...history.slice(-199), m];
        }
        return m;
      });
    },
  };
}
module.exports = { createFriendService, FriendError };

