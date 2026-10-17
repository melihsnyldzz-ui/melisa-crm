import { accountIdentityKey } from '../accountIdentity.js';

export const TEXT_DRAFT_STORAGE_KEY = 'melisa-crm-text-drafts-v1';
const MAX_DRAFTS = 100, MAX_TEXT = 2000, MAX_JSON = 300000;
const validId = value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value) && value !== 'prototype' && !Object.hasOwn(Object.prototype, value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function normalTestDraftOnly(session) {
  const scope=session?.normalTestScope;
  return session?.accountIdentity?.id==='crm-agent-test-20261011'&&session.accountIdentity.username==='crm-agent-test'
    &&session.role==='personel'&&session.chatwootAgentId===3&&session.canSend===false&&session.liveSendEnabled===false
    &&Array.isArray(session.permissions)&&session.permissions.length===1&&session.permissions[0]==='crm.view'
    &&!session.testAdmin&&!session.testPersonnel&&scope?.database==='MELISA_ERP_CRM_SHARED_TEST_20261009_02'
    &&scope.isolatedPreparation===true&&scope.draftOnly===true&&scope.chatwootAgentId===3;
}
export function textDraftActorScope(session) {
  const identity = accountIdentityKey(session?.accountIdentity);
  if(identity&&normalTestDraftOnly(session))return JSON.stringify([identity,'personel','local-unsent-draft:DB02','3']);
  return identity && typeof session?.role === 'string' && session.role && session.canSend === true
    ? JSON.stringify([identity, session.role, 'crm.send', String(session.chatwootAgentId ?? '')]) : '';
}
export function textDraftConversationScope(conversation) {
  if (!conversation || !validId(String(conversation.id || ''))) return '';
  return JSON.stringify([String(conversation.id), String(conversation.phone || '').replace(/\D/g, ''),
    String(conversation.channel || ''), String(conversation.assignedUserId ?? ''),
    String(conversation.chatwootAgentId ?? ''), String(conversation.owner || '')]);
}

// Access is activated only after /auth/me and inbox have been verified. No token,
// media, customer name, ERP data or message history is stored here.
export function createTextDraftStorage({ getStorage = () => window.sessionStorage } = {}) {
  let actor = '', active = false, records = {}, visible = new Set(), available = true, ignoreStored = false, draftOnly = false;
  const allowed = conversation => !draftOnly || conversation?.chatwootAgentId===3;
  const storage = () => { try { return getStorage(); } catch { return null; } };
  const snapshot = () => Object.fromEntries(active ? Object.entries(records).filter(([id]) => visible.has(id)).map(([id, row]) => [id, row.text]) : []);
  const result = () => ({ drafts: snapshot(), persisted: available });
  const removeStored = () => {
    try { const target = storage(); if (!target) return false; target.removeItem(TEXT_DRAFT_STORAGE_KEY); return true; }
    catch {
      try { const target = storage(); if (!target) return false; target.setItem(TEXT_DRAFT_STORAGE_KEY, JSON.stringify({version:1,actor:'',records:{}})); return true; }
      catch { return false; }
    }
  };
  const persist = () => {
    if (!actor) return;
    const raw = JSON.stringify({ version: 1, actor, records });
    if (Object.keys(records).length > MAX_DRAFTS || raw.length > MAX_JSON || Object.values(records).some(row => row.text.length > MAX_TEXT)) { available = false; return; }
    try { const target = storage(); if (!target) throw new Error(); target.setItem(TEXT_DRAFT_STORAGE_KEY, raw); available = true; ignoreStored = false; }
    catch { available = false; }
  };
  const load = () => {
    if (ignoreStored) return;
    try {
      const target = storage(); if (!target) { available = false; return; }
      const raw = target.getItem(TEXT_DRAFT_STORAGE_KEY); if (!raw) return;
      if (raw.length > MAX_JSON) throw new Error();
      const value = JSON.parse(raw);
      if (!value || value.version !== 1 || typeof value.actor !== 'string' || value.actor.length > 400 ||
          !value.records || Array.isArray(value.records) || typeof value.records !== 'object' ||
          !same(Object.keys(value).sort(), ['actor','records','version']) || Object.keys(value.records).length > MAX_DRAFTS) throw new Error();
      if (value.actor !== actor) { available = removeStored(); ignoreStored = !available; return; }
      for (const [id, row] of Object.entries(value.records)) {
        if (!validId(id) || !row || !same(Object.keys(row).sort(), ['scope','text']) || typeof row.text !== 'string' || !row.text.length ||
            row.text.length > MAX_TEXT || typeof row.scope !== 'string' || row.scope.length > 1000) throw new Error();
        const scope = JSON.parse(row.scope);
        if (!Array.isArray(scope) || scope.length !== 6 || scope.some(part => typeof part !== 'string') || scope[0] !== id) throw new Error();
      }
      records = value.records;
    } catch { records = {}; ignoreStored = !removeStored(); available = false; }
  };
  const synchronize = conversations => {
    if (!active) return result();
    visible = new Set(); let changed = false;
    for (const conversation of conversations || []) {
      const id = String(conversation.id || ''), scope = textDraftConversationScope(conversation);
      if(!allowed(conversation)){if(records[id]){delete records[id];changed=true;}continue;}
      if (!scope) continue;
      visible.add(id);
      if (records[id] && records[id].scope !== scope) { delete records[id]; changed = true; }
    }
    // An inbox page is partial: unopened conversation records stay private until
    // their own authenticated row arrives and its peer/assignment is checked.
    if (changed) persist();
    return result();
  };
  return {
    isActive: () => active,
    activate(session, conversations) {
      const next = textDraftActorScope(session);
      if (!next) { this.clear(); return result(); }
      if (actor !== next) { if (actor) { available = removeStored(); ignoreStored = !available; } records = {}; actor = next; load(); }
      draftOnly=normalTestDraftOnly(session);active = true; return synchronize(conversations);
    },
    synchronize,
    visibleDrafts(conversations) {
      return Object.fromEntries(active ? (conversations || []).flatMap(conversation => {
        const id = String(conversation?.id || ''), row = records[id];
        return row && allowed(conversation) && visible.has(id) && row.scope === textDraftConversationScope(conversation) ? [[id, row.text]] : [];
      }) : []);
    },
    set(conversation, text) {
      const id = String(conversation?.id || ''), scope = textDraftConversationScope(conversation);
      if (!active || !allowed(conversation) || !scope || !visible.has(id) || typeof text !== 'string') return result();
      if (text.length) records[id] = { scope, text }; else delete records[id];
      persist(); return result();
    },
    clearSent(conversation, sentText, sentActor) {
      const id = String(conversation?.id || '');
      if (active && actor === sentActor && records[id]?.scope === textDraftConversationScope(conversation) && records[id]?.text === sentText) { delete records[id]; persist(); }
      return result();
    },
    forget(id) { if (active && records[String(id)]) { delete records[String(id)]; persist(); } return result(); },
    suspend() { active = false; visible.clear(); },
    clear() { available = removeStored(); ignoreStored = !available; actor = ''; records = {}; active = false; draftOnly = false; visible.clear(); return result(); },
  };
}
