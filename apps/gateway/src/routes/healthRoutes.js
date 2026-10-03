import { Router } from 'express';
import { getHealthController } from '../controllers/healthController.js';

export const healthRoutes = Router();

healthRoutes.get('/health', getHealthController);
