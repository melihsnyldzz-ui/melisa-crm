import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { authenticateCrmUser, createPasswordHash, verifyCrmAccessToken } from '../services/crmAuthService.js';
import { ERP_ORIGIN } from '../services/erpSourceContract.mjs';
import { catalogAccess } from '../services/crmCatalogAccess.mjs';
import { crmTranslationRateLimit } from '../middleware/security.js';

test('real sales-draft route uses auth, trusted Chatwoot DTO and suggestion-only Responses', async t => {
  const original = { auth: { ...env.auth }, chatwoot: { ...env.chatwoot },
    translation: { ...env.translation }, whatsapp: { ...env.whatsapp } };
  const environment = Object.fromEntries(['CRM_AI_SALES_MODE', 'CRM_AI_SALES_CONVERSATION_ID',
    'CRM_AI_SALES_TEST_PEER', 'CRM_AI_SALES_RULES_FILE', 'CRM_PAID_AI_ENABLED'].map(key => [key, process.env[key]]));
  const guardedFetch = globalThis.fetch;
  const password = 'Synthetic-sales-route-2026!';
  Object.assign(env.auth, { jwtSecret: 'synthetic-sales-route-secret-longer-than-thirty-two',
    issuer: 'synthetic-sales-route', audience: 'synthetic-sales-client', personnelCanSend: false,
    users: ['patron', 'personel'].map(role => ({ id: `sales-${role}`, username: `sales-${role}`,
      displayName: `Fixture ${role}`, role, active: true, chatwootAgentId: role === 'personel' ? 3 : 1,
      passwordHash: createPasswordHash(password, `sales-route-${role}`) })) });
  Object.assign(env.chatwoot, { baseUrl: 'http://sales-chatwoot.invalid', accountId: 2, inboxId: 1,
    apiAccessToken: 'synthetic-chatwoot-token', inboxReadEnabled: true });
  Object.assign(env.whatsapp, { provider: 'evolution', sendEnabled: false });
  Object.assign(env.translation, { apiKey: 'synthetic-model-key', model: 'synthetic-model' });
  process.env.CRM_AI_SALES_MODE = 'copilot';
  process.env.CRM_PAID_AI_ENABLED = 'true';
  process.env.CRM_AI_SALES_CONVERSATION_ID = '55';
  process.env.CRM_AI_SALES_TEST_PEER = '905387217733';
  delete process.env.CRM_AI_SALES_RULES_FILE;

  let assignment = 3, modelCalls = 0, conversationReads = 0, modelBody, modelFailure = null,
    afterModel = () => {}, duringFirstRead = () => {}, duringSecondRead = () => {}, duringFirstPostModelRead = () => {}, postModelReads = 0, chatwootFailure = false, phone = '+905387217733',
    plannerQueries = [], catalogReads = 0, catalogFailure = false, price = 196, afterCatalog = () => {},
    selectProducts = false, priceChangesOnReadback = false, newMessage = false, proposalSequence = [], proposalCalls = 0;
  const draft = () => ({ action: 'reply', reply: 'Which age range do you need?',
    summaryTr: 'Yaş aralığı soruluyor.', productIds: [], lines: [], handoffReason: '' });
  const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url === 'https://api.openai.com/v1/responses') {
      modelCalls++;
      modelBody = JSON.parse(options.body);
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      if (modelFailure) return new Response('RAW_PROVIDER_INTERNAL_SENTINEL', { status: modelFailure });
      const planner = Boolean(modelBody.text.format.schema.properties.queries);
      afterModel();
      const generated = planner ? { queries: plannerQueries } : proposalSequence[proposalCalls++]
        || (selectProducts ? { ...draft(), action: 'recommend', productIds: ['vega-101'] } : draft());
      return json({ status: 'completed', output: [{ type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(generated) }] }] });
    }
    const catalogUrl = new URL(url);
    if (catalogUrl.origin === new URL(ERP_ORIGIN).origin && catalogUrl.pathname.startsWith('/api/crm-catalog/products')) {
      catalogReads++;
      assert.equal(options.method, 'GET');
      if (catalogFailure) return new Response('RAW_CATALOG_FAILURE', { status: 503 });
      const actor = verifyCrmAccessToken(options.headers.authorization.slice(7));
      const single = catalogUrl.pathname.endsWith('/vega-101');
      const product = { id: 'vega-101', stockCode: '41140', productName: 'Synthetic catalog fixture',
        salePrice: single && priceChangesOnReadback ? price + 1 : price, currency: 'TRY',
        stockQuantity: 99, isPassive: false, isActive: true, imageUrl: '/uploads/vega-products/fixture.jpg' };
      const filters = { search: catalogUrl.searchParams.get('search') || '', brand: null, category: null, hasImage: false };
      const metadata = { source: 'crm-existing-stock-select-only', sourceDatabaseVerified: true,
        productDatabaseVerified: true, imageDatabaseVerified: true, imageDatabaseName: 'MELISA_ERP_V2',
        productDatabaseName: 'VEGA2026', verifiedCrmActorId: actor.id, verifiedCrmRole: actor.role,
        page: 1, limit: 8, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
        totalPhotoEligible: 1, photoEligibility: 'guarded-existing-ui-reference', filters,
        facets: { scope: 'current-query-excluding-own-facet', brands: [], categories: [] } };
      afterCatalog();
      return json({ success: true, data: single ? product : [product], meta: metadata });
    }
    if (url.startsWith('http://sales-chatwoot.invalid/')) {
      assert.equal(options.method || 'GET', 'GET', 'AI must never send or write to Chatwoot');
      if (chatwootFailure) throw new Error('RAW_CHATWOOT_INTERNAL_SENTINEL');
      if (url.endsWith('/conversations/55/messages')) return json({ payload: [
        { id: 101, content: 'I need baby clothing for my shop.', message_type: 0, created_at: 1700000000 },
        { id: 102, content: 'PRIVATE_NOTE_SENTINEL', private: true, message_type: 1, created_at: 1700000001 },
        ...(newMessage ? [{ id: 103, content: 'New customer need', message_type: 0, created_at: 1700000002 }] : []),
      ] });
      if (url.endsWith('/conversations/55')) {
        conversationReads++;
        if (conversationReads === 1) duringFirstRead();
        if (conversationReads === 2) duringSecondRead();
        // Personnel detail adds a fresh assignment read before the model; target the
        // semantic model/readback boundary instead of the second metadata request.
        if (modelCalls > 0 && ++postModelReads === 1) duringFirstPostModelRead();
        return json({ id: 55, inbox_id: 1, status: 'open',
          meta: { sender: { name: 'Fixture', phone_number: phone },
            assignee: { id: assignment, name: `Fixture agent ${assignment}` } } });
      }
      throw new Error(`Unexpected mock Chatwoot read: ${url}`);
    }
    return guardedFetch(input, options);
  };
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const token = role => authenticateCrmUser({ username: `sales-${role}`, password }).accessToken;
  const request = async ({ conversationId = '55', authorization = `Bearer ${token('patron')}`, body = {} } = {}) => {
    const response = await guardedFetch(`http://127.0.0.1:${server.address().port}/crm/conversations/${conversationId}/sales-draft`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
      body: JSON.stringify({aiIntent:{userInitiated:true,action:'manual'},...body}),
    });
    return { status: response.status, body: await response.json() };
  };
  const reset = () => {
    // Independent HTTP cases must not consume each other's production-configured per-user budget.
    crmTranslationRateLimit.resetKey('crm-translation:sales-patron');
    crmTranslationRateLimit.resetKey('crm-translation:sales-personel');
    assignment = 3; modelCalls = 0; conversationReads = 0; modelBody = null;
    modelFailure = null; afterModel = () => {}; chatwootFailure = false;
    duringFirstRead = () => {}; duringSecondRead = () => {}; duringFirstPostModelRead = () => {}; postModelReads = 0; phone = '+905387217733';
    plannerQueries = []; catalogReads = 0; catalogFailure = false; price = 196; afterCatalog = () => {};
    selectProducts = false; priceChangesOnReadback = false; newMessage = false;
    proposalSequence = []; proposalCalls = 0;
    process.env.CRM_AI_SALES_MODE = 'copilot';
    process.env.CRM_PAID_AI_ENABLED = 'true'; process.env.CRM_AI_SALES_CONVERSATION_ID = '55';
    process.env.CRM_AI_SALES_TEST_PEER = '905387217733';
    env.auth.personnelCanSend = false;
    env.auth.users.forEach(user => { user.active = true; });
    env.auth.users[1].chatwootAgentId = 3;
  };
  try {
    await t.test('missing token and missing send permission stop before Chatwoot/model', async () => {
      reset();
      assert.equal((await request({ authorization: null })).status, 401);
      assert.equal((await request({ authorization: `Bearer ${token('personel')}` })).status, 403);
      assert.equal(conversationReads, 0); assert.equal(modelCalls, 0);
    });
    await t.test('server TEST scope rejects another conversation before any read', async () => {
      reset();
      const result = await request({ conversationId: '56' });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'AI_SALES_CONVERSATION_FORBIDDEN');
      assert.equal(conversationReads, 0); assert.equal(modelCalls, 0);
    });
    await t.test('same numeric conversation for another real phone is rejected before model', async () => {
      reset(); phone = '+15555550123';
      const result = await request({ body: { phone: '+905387217733' } });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'AI_SALES_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 0);
    });
    await t.test('real conversation permission stops unassigned staff before model', async () => {
      reset(); env.auth.personnelCanSend = true; assignment = 4;
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'WHATSAPP_CRM_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 0);
    });
    await t.test('staff binding changed during first Chatwoot read blocks model data access', async () => {
      reset(); env.auth.personnelCanSend = true;
      duringFirstRead = () => { env.auth.users[1].chatwootAgentId = 4; };
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'WHATSAPP_CRM_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 0); assert.equal(conversationReads, 2);
    });
    await t.test('browser facts are ignored, server reads twice and returns a human-reviewed draft', async () => {
      reset();
      const result = await request({ body: { messages: ['CLIENT_HISTORY_SENTINEL'],
        products: [{ unitPriceMinor: 1 }], policy: { autoSend: true }, country: 'CLIENT_COUNTRY_SENTINEL' } });
      assert.equal(result.status, 200); assert.equal(conversationReads, 3); assert.equal(modelCalls, 2);
      assert.equal(catalogReads, 0); assert.deepEqual(result.body.data.recommendedProducts, []);
      assert.equal(result.body.data.reply, draft().reply); assert.equal(result.body.data.requiresHumanReview, true);
      assert.equal(result.body.data.autoSend, false); assert.equal(result.body.data.erpWrite, false);
      assert.equal(result.body.data.conversationId, '55'); assert.match(result.body.data.conversationRevision, /^[a-f0-9]{64}$/);
      assert.equal(result.body.meta.readOnly, true); assert.equal(modelBody.store, false); assert.equal(modelBody.tools, undefined);
      const context = JSON.parse(modelBody.input[1].content);
      assert.deepEqual(context.products, []); assert.equal(context.policy.minimumOrder, null);
      assert.equal(context.policy.autoSend, false); assert.equal(context.recentMessages.length, 1);
      const serialized = JSON.stringify(modelBody);
      assert.ok(!serialized.includes('CLIENT_HISTORY_SENTINEL')); assert.ok(!serialized.includes('CLIENT_COUNTRY_SENTINEL'));
      assert.ok(!serialized.includes('PRIVATE_NOTE_SENTINEL')); assert.ok(!serialized.includes('905387217733'));
    });
    await t.test('real route policy revision matches reader GET, amounts remain server cards and changes invalidate drafts', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'crm-sales-policy-preview-fixture-'));
      const path = join(directory, 'rules.json');
      const policy = { version: 'fixture-business-v1', minimumOrderMode: 'amount', minimumOrder: { amountMinor: 123456, currency: 'EUR' },
        countryRules: [{ country: 'Irak', minimumOrderMode: 'amount', minimumOrder: { amountMinor: 789123, currency: 'USD' }, notes: 'Personel teyidi.' }],
        shippingTerms: '', salesNotes: '', telegramUrl: null };
      try {
        reset(); await writeFile(path, JSON.stringify(policy)); process.env.CRM_AI_SALES_RULES_FILE = path;
        const reader = await guardedFetch(`http://127.0.0.1:${server.address().port}/crm/sales-rules`, {
          headers: { authorization: `Bearer ${token('personel')}` },
        });
        assert.equal(reader.status, 200); const current = (await reader.json()).data;
        assert.equal(current.writable, false);
        const result = await request();
        assert.equal(result.status, 200); assert.equal(result.body.data.policyFacts.revision, current.revision);
        assert.equal(result.body.data.policyFacts.minimumOrder.amountMinor, 123456);
        assert.equal(result.body.data.policyFacts.countryRules[0].minimumOrder.amountMinor, 789123);
        assert.equal(result.body.data.policyFacts.requiresStaffConfirmation, true);
        const context = JSON.parse(modelBody.input[1].content);
        assert.equal(context.policy.minimumOrderMode, 'amount'); assert.equal(context.policy.countrySelection, 'unverified');
        assert.equal(JSON.stringify(context.policy).includes('123456'), false);
        assert.equal(JSON.stringify(context.policy).includes('789123'), false);
        assert.equal(modelCalls, 2); assert.deepEqual(result.body.data.recommendedProducts, []);
        reset(); afterModel = () => writeFileSync(path, JSON.stringify({ ...policy, salesNotes: 'Owner changed terms.' }));
        const stale = await request({ body: { catalogSearch: '41140' } });
        assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'AI_POLICY_CHANGED');
        assert.equal(stale.body.data, undefined); assert.equal(modelCalls, 1);
      } finally {
        delete process.env.CRM_AI_SALES_RULES_FILE;
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        assert.match(basename(directory), /^crm-sales-policy-preview-fixture-/);
        await rm(directory, { recursive: true, force: true });
      }
    });
    await t.test('real DTO assignment changed during model invalidates a patron suggestion', async () => {
      reset(); afterModel = () => { assignment = 4; };
      const result = await request();
      assert.equal(result.status, 409); assert.equal(result.body.error.code, 'AI_CONVERSATION_CHANGED');
      assert.equal(conversationReads, 2);
    });
    await t.test('staff access is rechecked after model generation', async () => {
      reset(); env.auth.personnelCanSend = true; afterModel = () => { assignment = 4; };
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'WHATSAPP_CRM_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 1); assert.equal(conversationReads, 3);
    });
    await t.test('phone changed during model request rejects generated suggestion', async () => {
      reset(); afterModel = () => { phone = '+15555550123'; };
      const result = await request();
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'AI_SALES_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 1); assert.equal(conversationReads, 2);
    });
    await t.test('disabled staff account during model request is rejected by fresh JWT validation', async () => {
      reset(); env.auth.personnelCanSend = true; afterModel = () => { env.auth.users[1].active = false; };
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 401); assert.equal(result.body.error.code, 'AUTH_TOKEN_INVALID');
      assert.equal(modelCalls, 1);
    });
    await t.test('send permission revoked during final Chatwoot read is rejected', async () => {
      reset(); env.auth.personnelCanSend = true; duringFirstPostModelRead = () => { env.auth.personnelCanSend = false; };
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'WHATSAPP_CRM_PERMISSION_DENIED');
      assert.equal(modelCalls, 1); assert.equal(conversationReads, 4); assert.equal(postModelReads, 2);
    });
    await t.test('staff binding changed during final Chatwoot read rejects result', async () => {
      reset(); env.auth.personnelCanSend = true;
      duringFirstPostModelRead = () => { env.auth.users[1].chatwootAgentId = 4; };
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'WHATSAPP_CRM_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 1); assert.equal(conversationReads, 4); assert.equal(postModelReads, 2);
    });
    await t.test('mode disabled during awaited final Chatwoot read rejects result', async () => {
      reset(); duringSecondRead = () => { process.env.CRM_AI_SALES_MODE = 'off'; };
      const result = await request();
      assert.equal(result.status, 503); assert.equal(result.body.error.code, 'AI_SALES_DISABLED');
      assert.equal(modelCalls, 1); assert.equal(conversationReads, 2);
    });
    await t.test('scope changed mid-generation rejects the result', async () => {
      reset(); afterModel = () => { delete process.env.CRM_AI_SALES_CONVERSATION_ID; };
      const result = await request();
      assert.equal(result.status, 409); assert.equal(result.body.error.code, 'AI_SALES_SCOPE_CHANGED');
    });
    await t.test('provider rate limit remains safe and is not retried', async () => {
      reset(); modelFailure = 429;
      const result = await request();
      assert.equal(result.status, 429); assert.equal(result.body.error.code, 'AI_SALES_PROVIDER_FAILED');
      assert.equal(modelCalls, 1); assert.ok(!JSON.stringify(result.body).includes('RAW_PROVIDER_INTERNAL_SENTINEL'));
      assert.ok(!JSON.stringify(result.body).includes('synthetic-model-key'));
    });
    await t.test('unexpected upstream errors do not escape through the generic error handler', async () => {
      reset(); chatwootFailure = true;
      const result = await request();
      assert.equal(result.status, 502); assert.equal(result.body.error.code, 'AI_SALES_UNAVAILABLE');
      assert.ok(!JSON.stringify(result.body).includes('RAW_CHATWOOT_INTERNAL_SENTINEL')); assert.equal(modelCalls, 0);
    });
    await t.test('mode defaults off and makes zero external mock calls', async () => {
      reset(); delete process.env.CRM_AI_SALES_MODE;
      const result = await request();
      assert.equal(result.status, 503); assert.equal(result.body.error.code, 'AI_SALES_DISABLED');
      assert.equal(conversationReads, 0); assert.equal(modelCalls, 0);
    });
    await t.test('human search locator uses real guarded catalog and re-read price cards without planner', async () => {
      reset(); selectProducts = true;
      const result = await request({ body: { catalogSearch: '41140', salePrice: 1, products: [{ id: 'forged' }] } });
      assert.equal(result.status, 200); assert.equal(modelCalls, 1); assert.equal(catalogReads, 2);
      assert.deepEqual(result.body.data.recommendedProducts, [{ id: 'vega-101', stockCode: '41140',
        productName: 'Synthetic catalog fixture', salePrice: 196, currency: 'TRY', priceBasis: 'per-item', photoEligible: true }]);
      assert.equal(result.body.data.catalogFacts.stockFreshness, 'unverified');
      assert.equal(result.body.data.catalogFacts.seriesVerified, false);
      assert.equal(Date.parse(result.body.data.catalogFacts.expiresAt) - Date.parse(result.body.data.catalogFacts.fetchedAt), 300_000);
      assert.deepEqual(JSON.parse(modelBody.input[1].content).catalogSelectors, ['41140']);
      assert.equal(JSON.parse(modelBody.input[1].content).recordedProducts[0].salePrice, undefined);
      assert.equal(JSON.parse(modelBody.input[1].content).recordedProducts[0].priceAvailable, true);
      assert.equal(JSON.parse(modelBody.input[1].content).recordedProducts[0].stockQuantity, undefined);
    });
    await t.test('conversation-driven planner is bounded and feeds the same trusted catalog path', async () => {
      reset(); plannerQueries = ['41140']; selectProducts = true;
      const result = await request();
      assert.equal(result.status, 200); assert.equal(modelCalls, 2); assert.equal(catalogReads, 2);
      assert.equal(result.body.data.recommendedProducts[0].stockCode, '41140');
    });
    await t.test('real observed manual-search reply without cards is corrected once into an authoritative card', async () => {
      reset(); selectProducts = true;
      proposalSequence = [{ ...draft(), reply: 'This costs 196 TRY.', summaryTr: 'Fiyatı 196 TRY.' },
        { ...draft(), action: 'recommend', productIds: ['vega-101'] }];
      const result = await request({ body: { catalogSearch: '41140' } });
      assert.equal(result.status, 200); assert.equal(modelCalls, 2); assert.equal(proposalCalls, 2);
      assert.equal(result.body.data.recommendedProducts[0].salePrice, 196);
      assert.equal(result.body.data.action, 'recommend'); assert.equal(result.body.data.reply.includes('196'), false);
      assert.deepEqual(modelBody.text.format.schema.properties.productIds.items.enum, ['vega-101']);
    });
    await t.test('schema-valid manual recommend with empty IDs is corrected before returning a product card', async () => {
      reset(); selectProducts = true;
      proposalSequence = [{ ...draft(), action: 'recommend', productIds: [] },
        { ...draft(), action: 'recommend', productIds: ['vega-101'] }];
      const result = await request({ body: { catalogSearch: '41140' } });
      assert.equal(result.status, 200); assert.equal(modelCalls, 2); assert.equal(proposalCalls, 2);
      assert.equal(result.body.data.recommendedProducts[0].stockCode, '41140');
      assert.equal(result.body.data.recommendedProducts[0].salePrice, 196);
    });
    await t.test('persistent model price prose never becomes successful preview and has at most one correction', async () => {
      reset(); selectProducts = true;
      proposalSequence = Array.from({ length: 2 }, () => ({ ...draft(), action: 'recommend', productIds: ['vega-101'], reply: '196 TRY per piece.' }));
      const result = await request({ body: { catalogSearch: '41140' } });
      assert.equal(result.status, 502); assert.equal(result.body.error.code, 'AI_PRICE_PROSE_FORBIDDEN');
      assert.equal(modelCalls, 2); assert.equal(catalogReads, 1); assert.equal(result.body.data, undefined);
    });
    await t.test('fresh conversation change before correction blocks the second proposal call', async () => {
      reset(); afterModel = () => { assignment = 4; };
      const result = await request({ body: { catalogSearch: '41140' } });
      assert.equal(result.status, 409); assert.equal(result.body.error.code, 'AI_CONVERSATION_CHANGED');
      assert.equal(modelCalls, 1); assert.equal(proposalCalls, 1);
    });
    await t.test('catalog outage for requested products fails explicitly before proposal call', async () => {
      reset(); catalogFailure = true;
      const result = await request({ body: { catalogSearch: '41140' } });
      assert.equal(result.status, 502); assert.equal(result.body.error.code, 'AI_CATALOG_UNAVAILABLE');
      assert.equal(modelCalls, 0); assert.ok(!JSON.stringify(result.body).includes('RAW_CATALOG_FAILURE'));
    });
    await t.test('price changed on ID readback rejects stale proposed card', async () => {
      reset(); selectProducts = true; priceChangesOnReadback = true;
      const result = await request({ body: { catalogSearch: '41140' } });
      assert.equal(result.status, 409); assert.equal(result.body.error.code, 'AI_CATALOG_CHANGED');
      assert.equal(modelCalls, 1); assert.equal(catalogReads, 2);
    });
    await t.test('assignment changed while catalog waits stops before proposal model', async () => {
      reset(); afterCatalog = () => { assignment = 4; };
      const result = await request({ body: { catalogSearch: '41140' } });
      assert.equal(result.status, 409); assert.equal(result.body.error.code, 'AI_CONVERSATION_CHANGED');
      assert.equal(modelCalls, 0);
    });
    await t.test('new incoming message while catalog waits stops before proposal model', async () => {
      reset(); afterCatalog = () => { newMessage = true; };
      const result = await request({ body: { catalogSearch: '41140' } });
      assert.equal(result.status, 409); assert.equal(result.body.error.code, 'AI_CONVERSATION_CHANGED');
      assert.equal(modelCalls, 0);
    });
    await t.test('catalog sign-out during guarded read stops before model', async () => {
      reset(); const authorization = `Bearer ${token('patron')}`;
      afterCatalog = () => catalogAccess.revoke(verifyCrmAccessToken(authorization.slice(7), { includeContext: true }),
        new Request('http://127.0.0.1/crm/catalog/auth/sign-out', { headers: { authorization } }));
      const result = await request({ authorization, body: { catalogSearch: '41140' } });
      assert.equal(result.status, 401); assert.equal(result.body.error.code, 'AI_CATALOG_ACCESS_REVOKED');
      assert.equal(modelCalls, 0);
    });
  } finally {
    globalThis.fetch = guardedFetch;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(original)) Object.assign(env[key], value);
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
