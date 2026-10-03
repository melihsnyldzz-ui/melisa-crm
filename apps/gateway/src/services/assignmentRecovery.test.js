import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVerifiedChatwootAssignment } from './chatwootConversationService.js';
import { assertCrmPermission, canAccessConversation } from './crmAuthService.js';
for (const agentId of [19, null]) {
  test('assignment verified by GET and explicit nullable unassign: ' + agentId, async () => {
    const calls = [];
    const result = await applyVerifiedChatwootAssignment(55, agentId, async (url, options = {}) => {
      calls.push({ url, options });
      return options.method === 'POST' ? {} : { id: 55, meta: { assignee: agentId === null ? null : { id: agentId }, team: { id: 3 } } };
    });
    assert.equal(result.confirmed, true); assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].options.body, { assignee_id: agentId });
    assert.equal(calls[1].url, '/conversations/55'); assert.equal(calls[1].options.method, undefined);
  });
}
test('assignment wrong, absent or unreadable proof never reports success or retries POST', async () => {
  for (const proof of [{ id: 55, meta: { assignee: { id: 20 } } }, { id: 56, meta: { assignee: { id: 19 } } }, { id: 55, meta: {} }, new Error('synthetic GET timeout')]) {
    let posts = 0;
    await assert.rejects(applyVerifiedChatwootAssignment(55, 19, async (_, options = {}) => {
      if (options.method === 'POST') { posts++; return {}; }
      if (proof instanceof Error) throw proof;
      return proof;
    }), e => e.code.endsWith('ASSIGNMENT_UNCONFIRMED') && e.meta.automaticRetry === false);
    assert.equal(posts, 1);
  }
});
test('assignment timeout is ambiguous without repeat; invalid target makes no request', async () => {
  let calls = 0;
  const request = async () => { calls++; throw new Error('synthetic timeout'); };
  await assert.rejects(applyVerifiedChatwootAssignment(55, null, request), e => e.code.endsWith('ASSIGNMENT_UNCONFIRMED'));
  assert.equal(calls, 1);
  for (const args of [[0,19], [55,0], [55,undefined], [55,NaN]]) await assert.rejects(applyVerifiedChatwootAssignment(...args, request));
  assert.equal(calls, 1);
});
test('unassigned conversation remains visible to management and inaccessible to personnel; assign permission unchanged', () => {
  const staff = { role: 'personel', chatwootAgentId: 19, permissions: ['crm.view'] };
  assert.equal(canAccessConversation(staff, { chatwootAgentId: null }), false);
  assert.equal(canAccessConversation(staff, { chatwootAgentId: 19 }), true);
  assert.equal(canAccessConversation({ role: 'patron' }, { chatwootAgentId: null }), true);
  assert.throws(() => assertCrmPermission(staff, 'crm.assign'), e => e.statusCode === 403);
});
