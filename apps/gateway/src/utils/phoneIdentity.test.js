import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePhoneIdentity } from './phoneIdentity.js';

test('resolves Slovenia instead of returning an unknown WhatsApp label', () => {
  const identity = resolvePhoneIdentity('+38649166719');
  assert.equal(identity.countryCode, 'SI');
  assert.equal(identity.countryName, 'Slovenya');
  assert.equal(identity.flag, '🇸🇮');
});

test('normalizes a local Turkish mobile number', () => {
  const identity = resolvePhoneIdentity('0532 123 45 67');
  assert.equal(identity.normalizedPhone, '905321234567');
  assert.equal(identity.countryCode, 'TR');
  assert.equal(identity.language, 'Turkce');
});

test('fails closed when a phone cannot be proven', () => {
  const identity = resolvePhoneIdentity('123');
  assert.equal(identity.countryCode, '');
  assert.equal(identity.verified, false);
});
