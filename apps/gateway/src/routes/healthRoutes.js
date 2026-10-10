import { Router } from 'express';
import { getHealthController } from '../controllers/healthController.js';
import {fileURLToPath} from 'node:url';
import {createStableServiceHealthHandler} from '../../../../deploy/stable-transport.mjs';
import {resolveTestEndpoints} from '../../../../deploy/test-endpoints.mjs';

export function createHealthRoutes({serviceHealth=createStableServiceHealthHandler({service:'gateway',executionRoot:fileURLToPath(new URL('../../../../',import.meta.url)),testEndpoints:resolveTestEndpoints()})}={}) {
  const router=Router();
  router.use((req,res,next)=>{if(!serviceHealth(req,res))next();});
  router.get('/health', getHealthController);
  return router;
}
export const healthRoutes = createHealthRoutes();
