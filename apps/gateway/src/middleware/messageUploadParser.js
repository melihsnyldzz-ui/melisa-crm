import { Router, json } from 'express';
import { requireCrmAuth, requireCrmPermission } from './auth.js';
export function createMessageUploadParser() {
  const router = Router();
  // Only the existing send route gets a larger body, AFTER auth and crm.send.
  // The final route still rechecks auth, permission and conversation access.
  router.post('/crm/conversations/:conversationId/messages', requireCrmAuth,
    requireCrmPermission('crm.send'), json({ limit: '15mb' }), (_req, _res, next) => next());
  return router;
}
