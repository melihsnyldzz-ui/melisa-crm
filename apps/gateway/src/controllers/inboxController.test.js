import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { getInboxController } from './inboxController.js';

test('invalid inbox views fail before integration fallback or data access', async () => {
  const oldFallback = env.chatwoot.inboxFallbackEnabled;
  env.chatwoot.inboxFallbackEnabled = true;
  try {
    for (const view of ['', 'unknown', ['bootstrap'], { mode: 'bootstrap' }, null]) {
      let error;
      await getInboxController({ query: { view } }, {
        status() { assert.fail('invalid view must not return a fallback response'); },
        json() { assert.fail('invalid view must not expose inbox data'); },
      }, value => { error = value; });
      assert.equal(error?.statusCode, 400);
      assert.equal(error?.code, 'WHATSAPP_CRM_INBOX_VIEW_INVALID');
    }
  } finally {
    env.chatwoot.inboxFallbackEnabled = oldFallback;
  }
});
