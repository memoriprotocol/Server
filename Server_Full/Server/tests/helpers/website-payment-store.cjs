#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class LocalPaymentStore {
  constructor(file, secret) {
    this.file = path.resolve(file);
    this.secret = String(secret || '');
    this.data = { version: 1, nextSequence: 1, orders: {}, settings: {} };
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw && typeof raw === 'object') {
        this.data = {
          version: 1,
          nextSequence: Number(raw.nextSequence || 1),
          orders: raw.orders && typeof raw.orders === 'object' ? raw.orders : {},
        settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
        };
        if (!Number.isSafeInteger(this.data.nextSequence) || this.data.nextSequence < 1) this.data.nextSequence = 1;
      }
    } catch (e) {
      console.error('[LOCAL PAYMENTS] Failed to load store:', e.message);
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  _clone(row) {
    return row ? JSON.parse(JSON.stringify(row)) : null;
  }

  signPayload(payload) {
    const raw = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', this.secret || 'LOCAL_PAYMENT_SECRET_NOT_CONFIGURED').update(raw).digest('base64url');
    return `${raw}.${sig}`;
  }

  verifyToken(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const raw = parts[0], provided = parts[1];
    const expected = crypto.createHmac('sha256', this.secret || 'LOCAL_PAYMENT_SECRET_NOT_CONFIGURED').update(raw).digest('base64url');
    const a = Buffer.from(provided), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (!payload || typeof payload !== 'object') return null;
      const exp = Number(payload.exp || 0);
      if (exp && Date.now() > exp) return null;
      return payload;
    } catch {
      return null;
    }
  }

  createOrderFromPayload(payload) {
    const orderId = String(payload?.orderId || '').trim();
    const uid = Number(payload?.uid || 0);
    const payId = Number(payload?.payId || 0);
    const amount = Number(payload?.amount || 0);
    const currency = String(payload?.currency || 'CNY').slice(0, 8);
    if (!/^[A-Za-z0-9._-]{6,160}$/.test(orderId) || !Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(payId) || payId < 1 || !Number.isFinite(amount) || amount <= 0) {
      throw Object.assign(new Error('INVALID_PAYMENT_ORDER'), { code: 'INVALID_PAYMENT_ORDER' });
    }
    const existing = this.data.orders[orderId];
    if (existing) {
      if (Number(existing.uid) !== uid || Number(existing.payId) !== payId || Number(existing.amount) !== amount || String(existing.currency) !== currency) {
        throw Object.assign(new Error('PAYMENT_ORDER_MISMATCH'), { code: 'PAYMENT_ORDER_MISMATCH' });
      }
      return this._clone(existing);
    }

    const now = new Date().toISOString();
    const row = {
      id: orderId,
      sequence: this.data.nextSequence++,
      status: 'pending',
      uid,
      playerName: String(payload.playerName || '').slice(0, 64),
      payId,
      amount,
      currency,
      language: String(payload.language || 'en').slice(0, 12),
      source: 'game.marketHandler.buyMall',
      createdAt: now,
      updatedAt: now,
      paidAt: null,
      cancelledAt: null,
      provider: 'local-hosted',
      providerOrderId: null,
      note: '',
    };
    this.data.orders[orderId] = row;
    this._save();
    return this._clone(row);
  }

  createDiamondTopupOrder({ orderId, accountId, playerName, packageId, diamonds, amount = 0, currency = 'CNY', language = 'en' }) {
    const id = String(orderId || '').trim();
    const account = Number(accountId || 0);
    const gems = Math.trunc(Number(diamonds || 0));
    const price = Number(amount || 0);
    if (!/^[A-Za-z0-9._-]{8,160}$/.test(id) || !Number.isSafeInteger(account) || account < 1 || !Number.isSafeInteger(gems) || gems < 1 || gems > 1_000_000_000 || !Number.isFinite(price) || price < 0) {
      throw Object.assign(new Error('INVALID_DIAMOND_TOPUP_ORDER'), { code: 'INVALID_DIAMOND_TOPUP_ORDER' });
    }
    const existing = this.data.orders[id];
    if (existing) {
      if (existing.type !== 'diamond-topup' || Number(existing.uid) !== account || Number(existing.diamonds || 0) !== gems || String(existing.packageId || '') !== String(packageId || '')) {
        throw Object.assign(new Error('DIAMOND_TOPUP_ORDER_MISMATCH'), { code: 'DIAMOND_TOPUP_ORDER_MISMATCH' });
      }
      return this._clone(existing);
    }
    const now = new Date().toISOString();
    const row = {
      id,
      sequence: this.data.nextSequence++,
      type: 'diamond-topup',
      status: 'pending',
      uid: account,
      accountId: account,
      playerName: String(playerName || '').slice(0, 64),
      payId: 0,
      packageId: String(packageId || '').slice(0, 64),
      diamonds: gems,
      amount: price,
      currency: String(currency || 'CNY').slice(0, 8),
      language: String(language || 'en').slice(0, 12),
      source: 'website.diamond-topup',
      createdAt: now,
      updatedAt: now,
      paidAt: null,
      cancelledAt: null,
      diamondGranted: false,
      diamondGrantedAt: null,
      diamondBalanceAfter: null,
      diamondGrantActor: null,
      provider: 'local-hosted',
      providerOrderId: null,
      note: '',
    };
    this.data.orders[id] = row;
    this._save();
    return this._clone(row);
  }

  markDiamondGranted(id, balanceAfter, actor = 'payment') {
    const key = String(id || '');
    const row = this.data.orders[key];
    if (!row) throw Object.assign(new Error('PAYMENT_ORDER_NOT_FOUND'), { code: 'PAYMENT_ORDER_NOT_FOUND' });
    if (row.type !== 'diamond-topup') throw Object.assign(new Error('NOT_DIAMOND_TOPUP_ORDER'), { code: 'NOT_DIAMOND_TOPUP_ORDER' });
    const now = new Date().toISOString();
    row.diamondGranted = true;
    row.diamondGrantedAt = row.diamondGrantedAt || now;
    row.diamondBalanceAfter = Number.isFinite(Number(balanceAfter)) ? Math.max(0, Math.trunc(Number(balanceAfter))) : row.diamondBalanceAfter;
    row.diamondGrantActor = String(actor || 'payment').slice(0, 128);
    row.updatedAt = now;
    row.note = row.note || 'Diamonds granted to game account.';
    this._save();
    return this._clone(row);
  }

  updateDiamondGrantFailure(id, message) {
    const key = String(id || '');
    const row = this.data.orders[key];
    if (!row) return null;
    row.diamondGrantError = String(message || '').slice(0, 500);
    row.updatedAt = new Date().toISOString();
    this._save();
    return this._clone(row);
  }

  getTestMode(fallback = false) {
    return typeof this.data.settings.testMode === 'boolean' ? this.data.settings.testMode : !!fallback;
  }
  getSetting(key, fallback = null) {
    const k = String(key || '');
    if (!k) return fallback;
    return Object.prototype.hasOwnProperty.call(this.data.settings, k) ? this.data.settings[k] : fallback;
  }

  setSetting(key, value) {
    const k = String(key || '');
    if (!k) throw Object.assign(new Error('INVALID_PAYMENT_SETTING'), { code: 'INVALID_PAYMENT_SETTING' });
    this.data.settings[k] = value;
    this._save();
    return value;
  }

  getStripePriceId(cacheKey) {
    const map = this.data.settings.stripePrices && typeof this.data.settings.stripePrices === 'object' ? this.data.settings.stripePrices : {};
    return String(map[String(cacheKey || '')] || '') || null;
  }

  setStripePriceId(cacheKey, priceId) {
    const key = String(cacheKey || '');
    const id = String(priceId || '');
    if (!key || !id) throw Object.assign(new Error('INVALID_STRIPE_PRICE_CACHE'), { code: 'INVALID_STRIPE_PRICE_CACHE' });
    if (!this.data.settings.stripePrices || typeof this.data.settings.stripePrices !== 'object') this.data.settings.stripePrices = {};
    this.data.settings.stripePrices[key] = id;
    this._save();
    return id;
  }

  attachStripeSession(id, data = {}) {
    const key = String(id || '');
    const row = this.data.orders[key];
    if (!row) throw Object.assign(new Error('PAYMENT_ORDER_NOT_FOUND'), { code: 'PAYMENT_ORDER_NOT_FOUND' });
    if (data.sessionId) row.stripeSessionId = String(data.sessionId);
    if (data.clientSecret) row.stripeClientSecret = String(data.clientSecret);
    if (data.priceId) row.stripePriceId = String(data.priceId);
    if (Number.isFinite(Number(data.usdBaseCents))) row.usdBaseCents = Math.max(1, Math.trunc(Number(data.usdBaseCents)));
    row.provider = 'stripe';
    row.providerMode = data.livemode === true ? 'live' : data.livemode === false ? 'test' : row.providerMode || null;
    row.updatedAt = new Date().toISOString();
    this._save();
    return this._clone(row);
  }

  markStripePaid(id, data = {}) {
    const key = String(id || '');
    const row = this.data.orders[key];
    if (!row) throw Object.assign(new Error('PAYMENT_ORDER_NOT_FOUND'), { code: 'PAYMENT_ORDER_NOT_FOUND' });
    if (row.status === 'cancelled') throw Object.assign(new Error('PAYMENT_ORDER_CANCELLED'), { code: 'PAYMENT_ORDER_CANCELLED' });
    if (row.status !== 'paid') {
      row.status = 'paid';
      row.paidAt = row.paidAt || new Date().toISOString();
    }
    row.updatedAt = new Date().toISOString();
    row.provider = 'stripe';
    if (data.sessionId) row.stripeSessionId = String(data.sessionId);
    if (data.paymentIntentId) row.stripePaymentIntentId = String(data.paymentIntentId);
    if (data.chargeId) row.stripeChargeId = String(data.chargeId);
    if (data.currency) row.chargedCurrency = String(data.currency).slice(0, 8);
    if (Number.isFinite(Number(data.amountTotal))) row.chargedAmountMinor = Math.max(0, Math.trunc(Number(data.amountTotal)));
    if (data.livemode != null) row.providerMode = data.livemode ? 'live' : 'test';
    if (data.currencyConversion && typeof data.currencyConversion === 'object') row.currencyConversion = data.currencyConversion;
    row.providerPaidAt = row.providerPaidAt || row.paidAt;
    this._save();
    return this._clone(row);
  }


  setTestMode(enabled, actor = 'admin', note = '') {
    const now = new Date().toISOString();
    this.data.settings.testMode = !!enabled;
    this.data.settings.testModeUpdatedAt = now;
    this.data.settings.testModeUpdatedBy = String(actor || '').slice(0, 128);
    this.data.settings.testModeNote = String(note || '').slice(0, 500);
    this._save();
    return {
      enabled: !!this.data.settings.testMode,
      updatedAt: now,
      updatedBy: this.data.settings.testModeUpdatedBy,
      note: this.data.settings.testModeNote,
    };
  }

  getOrder(id) {
    return this._clone(this.data.orders[String(id || '')]);
  }

  listOrders(limit = 200) {
    const n = Math.max(1, Math.min(500, Number(limit) || 200));
    return Object.values(this.data.orders)
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0) || Number(b.sequence || 0) - Number(a.sequence || 0))
      .slice(0, n)
      .map(x => this._clone(x));
  }

  markPaid(id, actor = 'admin', note = '') {
    const key = String(id || '');
    const row = this.data.orders[key];
    if (!row) throw Object.assign(new Error('PAYMENT_ORDER_NOT_FOUND'), { code: 'PAYMENT_ORDER_NOT_FOUND' });
    if (row.status === 'cancelled') throw Object.assign(new Error('PAYMENT_ORDER_CANCELLED'), { code: 'PAYMENT_ORDER_CANCELLED' });
    if (row.status !== 'paid') {
      row.status = 'paid';
      row.paidAt = new Date().toISOString();
      row.updatedAt = row.paidAt;
    }
    row.note = String(note || '').slice(0, 500);
    row.paidBy = String(actor || '').slice(0, 128);
    this._save();
    return this._clone(row);
  }

  cancel(id, actor = 'admin', note = '') {
    const key = String(id || '');
    const row = this.data.orders[key];
    if (!row) throw Object.assign(new Error('PAYMENT_ORDER_NOT_FOUND'), { code: 'PAYMENT_ORDER_NOT_FOUND' });
    if (row.status === 'paid') throw Object.assign(new Error('PAYMENT_ORDER_ALREADY_PAID'), { code: 'PAYMENT_ORDER_ALREADY_PAID' });
    if (row.status !== 'cancelled') {
      row.status = 'cancelled';
      row.cancelledAt = new Date().toISOString();
      row.updatedAt = row.cancelledAt;
    }
    row.note = String(note || '').slice(0, 500);
    row.cancelledBy = String(actor || '').slice(0, 128);
    this._save();
    return this._clone(row);
  }
}

function localizedPayment(locale, key) {
  const ru = {
    title: 'Оплата Hero’s Land',
    payment: 'Оплата',
    product: 'Платёжный продукт',
    player: 'Игрок',
    uid: 'UID',
    amount: 'Сумма',
    order: 'Заказ',
    status: 'Статус',
    pending: 'Ожидает оплаты',
    paid: 'Оплачено',
    cancelled: 'Отменено',
    local: 'Локальный платёжный шлюз',
    note: 'Тестовая оплата отключена. Безопасная оплата проходит через Stripe; данные карты напрямую на сервер Hero’s Land не отправляются.',
    refresh: 'Обновить статус',
    cardTitle: 'Безопасная оплата',
    providerMissing: 'Реальный платёжный провайдер ещё не настроен.',
    stripeLoadError: 'Не удалось загрузить форму Stripe.',
    stripeCreateError: 'Не удалось создать платёжную сессию.',
    test: 'Оплатить — ТЕСТ БЕСПЛАТНО',
    adminTitle: 'Платежи',
    markPaid: 'Отметить оплачено',
    cancel: 'Отменить',
    noOrders: 'Заказов пока нет.',
    testMode: 'Тестовая оплата',
    testModeOn: 'ВКЛ — оплата бесплатно',
    testModeOff: 'ВЫКЛ — требуется оплата',
    testModeDesc: 'Когда режим включён, кнопка «Оплатить» сразу переводит заказ в статус «Оплачено» без списания денег. Настройка сохраняется после перезапуска сайта.',
     stripeReady: 'Stripe: подключён',
     stripeNotReady: 'Stripe: не настроен',
     enableTestMode: 'Включить тестовые платежи',
     disableTestMode: 'Выключить тестовые платежи',
    topup: 'Пополнить счёт',
    diamonds: 'Diamond',
    diamondBalance: 'Баланс Diamond',
    diamondTopupTitle: 'Пополнение счёта',
    diamondTopupDesc: 'Выберите пакет Diamond. В тестовом режиме оплата бесплатна, а Diamond сразу зачисляются в игру.',
    topupFree: 'Получить бесплатно · ТЕСТ',
    topupCreateOrder: 'Создать заказ',
    topupDisabled: 'Тестовая оплата выключена. Подключите платёжный провайдер для реальных платежей.',
    topupGranted: 'Diamond зачислены',
    topupBalance: 'Новый баланс: {balance}',
    topupPackage: '{diamonds} Diamond · {amount} {currency}',
  };
  const en = {
    title: 'Hero’s Land Payment',
    payment: 'Payment',
    product: 'Payment product',
    player: 'Player',
    uid: 'UID',
    amount: 'Amount',
    order: 'Order',
    status: 'Status',
    pending: 'Pending',
    paid: 'Paid',
    cancelled: 'Cancelled',
    local: 'Local payment gateway',
    note: 'Test payments are disabled. Secure card/payment details are collected by Stripe; Hero’s Land server does not receive raw card data.',
    refresh: 'Refresh status',
    cardTitle: 'Secure payment',
    providerMissing: 'The real payment provider is not configured yet.',
    stripeLoadError: 'Stripe payment form could not be loaded.',
    stripeCreateError: 'Stripe payment session could not be created.',
    test: 'Pay — FREE TEST',
    adminTitle: 'Payments',
    markPaid: 'Mark paid',
    cancel: 'Cancel',
    noOrders: 'No orders yet.',
    testMode: 'Test payments',
    testModeOn: 'ON — payments are free',
    testModeOff: 'OFF — payment required',
    testModeDesc: 'When enabled, the Pay button immediately marks the order as paid without charging money. The setting survives website restarts.',
    stripeReady: 'Stripe: ready',
    stripeNotReady: 'Stripe: not configured',
     enableTestMode: 'Enable test payments',
     disableTestMode: 'Disable test payments',
    topup: 'Top up account',
    diamonds: 'Diamond',
    diamondBalance: 'Diamond balance',
    diamondTopupTitle: 'Top up account',
    diamondTopupDesc: 'Choose a Diamond package. In test mode payment is free and Diamonds are credited to the game immediately.',
    topupFree: 'Claim free · TEST',
    topupCreateOrder: 'Create order',
    topupDisabled: 'Test payments are disabled. Connect a real payment provider for live payments.',
    topupGranted: 'Diamonds credited',
    topupBalance: 'New balance: {balance}',
    topupPackage: '{diamonds} Diamond · {amount} {currency}',
  };
  const tr = String(locale || '').toLowerCase().startsWith('ru') ? ru : en;
  return tr[key] || key;
}

module.exports = { LocalPaymentStore, localizedPayment };
