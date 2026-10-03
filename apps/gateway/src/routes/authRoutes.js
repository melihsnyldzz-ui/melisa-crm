import { Router } from 'express';
import { getAuthMe, postAuthLogin } from '../controllers/authController.js';
import { requireCrmAuth } from '../middleware/auth.js';
import { crmLoginRateLimit } from '../middleware/security.js';

export const authRoutes = Router();

authRoutes.post('/auth/login', crmLoginRateLimit, postAuthLogin);
authRoutes.get('/auth/me', requireCrmAuth, getAuthMe);
