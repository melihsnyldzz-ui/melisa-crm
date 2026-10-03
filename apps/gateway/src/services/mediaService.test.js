import assert from 'node:assert/strict';
import test from 'node:test';
import { getCrmMessageMedia } from './mediaService.js';

test('external Chatwoot message media uses its direct URL instead of the local UUID repository', async () => {
  await assert.rejects(
    () => getCrmMessageMedia(1089),
    (error) => error.code === 'WHATSAPP_CRM_EXTERNAL_MEDIA_DIRECT' && error.statusCode === 404,
  );
});
