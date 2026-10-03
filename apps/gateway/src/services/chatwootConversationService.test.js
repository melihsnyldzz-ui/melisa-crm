import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { assignChatwootConversation } from './chatwootConversationService.js';

test('Chatwoot assignment uses the selected CRM-linked agent', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = {
    ...env.chatwoot,
    agentPersonnelMap: new Map(env.chatwoot.agentPersonnelMap),
  };
  const requests = [];
  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.apiAccessToken = 'test-token';
  env.chatwoot.agentPersonnelMap = new Map([[7, 19]]);

  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ id: 41, meta: { assignee: { id: 19 } } }), { status: 200 });
  };

  try {
    const result = await assignChatwootConversation({
      conversationId: 41,
      assignee: { id: 7, username: 'ahmet', displayName: 'Ahmet', employeeId: 70 },
    });
    assert.equal(requests[0].url, 'http://chatwoot.local/api/v1/accounts/2/conversations/41/assignments');
    assert.equal(requests[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[0].options.body), { assignee_id: 19 });
    assert.equal(requests[1].options.method, 'GET');
    assert.equal(result.confirmed, true);
    assert.equal(result.assignedUserId, 7);
    assert.equal(result.chatwootAgentId, 19);
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
  }
});

test('Chatwoot assignment fails closed for an invalid CRM agent', async () => {
  const originalMap = env.chatwoot.agentPersonnelMap;
  env.chatwoot.agentPersonnelMap = new Map();
  try {
    await assert.rejects(
      () => assignChatwootConversation({ conversationId: 41, assignee: { id: 7 } }),
      (error) => error.code === 'WHATSAPP_CRM_CHATWOOT_ASSIGNEE_NOT_MAPPED' && error.statusCode === 409,
    );
  } finally {
    env.chatwoot.agentPersonnelMap = originalMap;
  }
});
