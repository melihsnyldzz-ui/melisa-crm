import { Router } from 'express';
import { getAuthMe, getAuthRemembered, postAuthLogin, postAuthRefresh, postAuthLogout, postAuthTerminalHandoff } from '../controllers/authController.js';
import { clearRejectedSemihCookie } from '../services/semihTestCookie.mjs';
import { requireCrmAuth } from '../middleware/auth.js';
import { crmLoginRateLimit } from '../middleware/security.js';

export const authRoutes = Router();

authRoutes.post('/auth/login', crmLoginRateLimit, postAuthLogin);
authRoutes.post('/auth/terminal-handoff', crmLoginRateLimit, postAuthTerminalHandoff);
authRoutes.post('/auth/refresh', crmLoginRateLimit, postAuthRefresh);
authRoutes.post('/auth/logout', crmLoginRateLimit, postAuthLogout);
authRoutes.get('/auth/remembered', crmLoginRateLimit, getAuthRemembered);
authRoutes.get('/auth/me', (req,res,next)=>requireCrmAuth(req,res,error=>{
  if(error)clearRejectedSemihCookie(req,res,error);
  next(error);
}), getAuthMe);
