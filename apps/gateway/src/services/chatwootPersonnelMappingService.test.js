import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { getChatwootPersonnelMapping } from './chatwootPersonnelMappingService.js';

test('CRM personnel maps to Chatwoot agents explicitly and by unique identity', async () => {
  const originalFetch = global.fetch;
  const originalUsers = env.auth.users;
  const originalChatwoot = {
    ...env.chatwoot,
    agentPersonnelMap: new Map(env.chatwoot.agentPersonnelMap),
  };
  env.auth.users = [
    { id: 'crm-7', username: 'ahmet', displayName: 'Ahmet Yilmaz', role: 'personel', active: true, passwordHash: 'scrypt$salt$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', chatwootAgentId: 19 },
    { id: 'crm-8', username: 'semih', displayName: 'Semih Kaya', role: 'personel', active: true, passwordHash: 'scrypt$salt$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', chatwootAgentId: null },
  ];
  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.apiAccessToken = 'test-token';
  env.chatwoot.agentPersonnelMap = new Map([[7, 19]]);

  global.fetch = async () => {
    return new Response(JSON.stringify([
      { id: 19, name: 'Ahmet Agent', available_name: 'Ahmet', email: 'agent@example.com' },
      { id: 20, name: 'Semih', available_name: 'Semih', email: 'semih@example.com' },
    ]), { status: 200 });
  };

  try {
    const result = await getChatwootPersonnelMapping();
    assert.equal(result.summary.mapped, 2);
    assert.equal(result.mappings[0].mappingState, 'explicit');
    assert.equal(result.mappings[0].chatwootAgentId, 19);
    assert.equal(result.mappings[1].mappingState, 'automatic');
    assert.equal(result.mappings[1].chatwootAgentId, 20);
    assert.equal(result.readOnly, true);
  } finally {
    global.fetch = originalFetch;
    env.auth.users = originalUsers;
    Object.assign(env.chatwoot, originalChatwoot);
  }
});
