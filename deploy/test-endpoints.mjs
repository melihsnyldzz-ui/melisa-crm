export function resolveTestEndpoints(env = process.env) {
  const base = Number(env.CRM_TEST_PORT_BASE || 62400);
  if (![62400,62600].includes(base)) throw Error('TEST_PORT_BASE_INVALID');
  const isolated = env.CRM_ISOLATED_PREPARATION === 'true';
  if ((base === 62600) !== isolated) throw Error('TEST_ISOLATION_PORT_REQUIRED');
  const erpOrigin = env.CRM_TEST_ERP_ORIGIN || 'http://127.0.0.1:4144';
  const origin = new URL(erpOrigin);
  if (origin.origin !== erpOrigin || origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:'
      || origin.username || origin.password || ![4144,4174].includes(Number(origin.port))
      || (isolated ? Number(origin.port) !== 4174 : Number(origin.port) !== 4144)) throw Error('ERP_TEST_ORIGIN_REQUIRED');
  const database = env.CRM_TEST_EXPECTED_DATABASE || 'MELISA_ERP_SIRKET_TEST_20260929_01';
  if (isolated ? database !== 'MELISA_ERP_CRM_SHARED_TEST_20261009_01'
      : database !== 'MELISA_ERP_SIRKET_TEST_20260929_01') throw Error('ERP_TEST_DATABASE_REQUIRED');
  return {isolated,database,erpOrigin,erpPort:Number(origin.port),ui:base,gateway:base+1,catalog:base+2,orders:base+3,native:base+4,
    uiOrigin:`http://127.0.0.1:${base}`,gatewayOrigin:`http://127.0.0.1:${base+1}`,catalogOrigin:`http://127.0.0.1:${base+2}`,nativeOrigin:`http://127.0.0.1:${base+4}`};
}

export function sharedTestHealthSafe(h){
 return h?.environment==='ISOLATED_TEST_COPY'&&h.serverName==='Semih\\MELISADEV'&&h.originalDatabaseAccess===0&&h.liveDatabaseAccess===0&&h.sysadmin===0&&h.databaseControl===0&&h.externalOperations===false&&h.automaticJobs===false&&h.actualT1===false;
}
