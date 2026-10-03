import { listInboxOverview } from '../repositories/crmRepository.js';
import { env } from '../config/env.js';
import { listChatwootInboxOverview } from './chatwootInboxService.js';

function restrictLocalOverview(overview, user) {
  if (user?.role !== 'personel') return overview;
  const conversations = (overview.conversations || []).filter((item) => (
    String(item.assignedUserId || '') === String(user.id)
    || (user.chatwootAgentId && Number(item.chatwootAgentId) === Number(user.chatwootAgentId))
  ));
  return {
    ...overview,
    conversations,
    summary: {
      ...(overview.summary || {}),
      total: conversations.length,
      open: conversations.filter((item) => item.status === 'open').length,
      unread: conversations.reduce((sum, item) => sum + Number(item.unread || 0), 0),
    },
    pagination: {
      ...(overview.pagination || {}),
      total: conversations.length,
      hasNext: false,
      nextOffset: null,
    },
  };
}

export async function getInboxOverview(options = {}) {
  if (!env.chatwoot.inboxReadEnabled) {
    return restrictLocalOverview(await listInboxOverview(options), options.user);
  }

  try {
    return await listChatwootInboxOverview(options);
  } catch (error) {
    if (!env.chatwoot.inboxFallbackEnabled) throw error;

    const fallback = restrictLocalOverview(await listInboxOverview(options), options.user);
    return {
      ...fallback,
      integration: {
        requestedSource: 'chatwoot-crm',
        activeSource: fallback.summary?.source || 'postgres',
        fallback: true,
        errorCode: error.code || 'WHATSAPP_CRM_CHATWOOT_READ_FAILED',
      },
      boundaries: [
        ...(fallback.boundaries || []),
        'Chatwoot could not be read; the existing local inbox fallback is active.',
      ],
    };
  }
}
