import { Router } from 'express';
import { getAuthMe, postAuthLogin, postAuthRefresh, postAuthLogout } from '../controllers/authController.js';
import { requireCrmAuth } from '../middleware/auth.js';
import { crmLoginRateLimit } from '../middleware/security.js';

export const authRoutes = Router();

authRoutes.post('/auth/login', crmLoginRateLimit, postAuthLogin);
authRoutes.post('/auth/refresh', crmLoginRateLimit, postAuthRefresh);
authRoutes.post('/auth/logout', crmLoginRateLimit, postAuthLogout);
authRoutes.get('/auth/me', requireCrmAuth, getAuthMe);
