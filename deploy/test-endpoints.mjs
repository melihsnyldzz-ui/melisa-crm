export function resolveTestEndpoints(env = process.env) {
  if (env.CRM_TEST_PROFILE) {
    if (env.CRM_TEST_PROFILE !== 'clean-synthetic-20261022' || env.CRM_ISOLATED_PREPARATION !== 'true'
      || env.CRM_TEST_PORT_BASE !== '62800' || env.CRM_TEST_ERP_ORIGIN !== 'http://127.0.0.1:4194'
      || env.CRM_TEST_EXPECTED_DATABASE !== 'MELISA_ERP_CLEAN_TEST_20261022') throw Error('CLEAN_TEST_IDENTITY_REQUIRED');
    return {profile:env.CRM_TEST_PROFILE,cleanSynthetic:true,isolated:true,businessScope:true,database:'MELISA_ERP_CLEAN_TEST_20261022',
      erpUiOrigin:'http://127.0.0.1:5244',erpOrigin:'http://127.0.0.1:4194',erpPort:4194,
      ui:62800,gateway:62801,catalog:62802,orders:62803,native:4196,
      uiOrigin:'http://127.0.0.1:62800',gatewayOrigin:'http://127.0.0.1:62801',catalogOrigin:'http://127.0.0.1:62802',nativeOrigin:'http://127.0.0.1:4196'};
  }
  const base = Number(env.CRM_TEST_PORT_BASE || 62400);
  if (![62400,62600,62700].includes(base)) throw Error('TEST_PORT_BASE_INVALID');
  const isolated = env.CRM_ISOLATED_PREPARATION === 'true';
  if ((base !== 62400) !== isolated) throw Error('TEST_ISOLATION_PORT_REQUIRED');
  const businessScope = base === 62700;
  const expectedPort = businessScope ? 4184 : isolated ? 4174 : 4144;
  const expectedDatabase = businessScope ? 'MELISA_ERP_CRM_SHARED_TEST_20261009_02' : isolated ? 'MELISA_ERP_CRM_SHARED_TEST_20261009_01' : 'MELISA_ERP_SIRKET_TEST_20260929_01';
  const erpOrigin = env.CRM_TEST_ERP_ORIGIN || 'http://127.0.0.1:4144';
  const origin = new URL(erpOrigin);
  if (origin.origin !== erpOrigin || origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:'
      || origin.username || origin.password || Number(origin.port) !== expectedPort) throw Error('ERP_TEST_ORIGIN_REQUIRED');
  const database = env.CRM_TEST_EXPECTED_DATABASE || 'MELISA_ERP_SIRKET_TEST_20260929_01';
  if (database !== expectedDatabase) throw Error('ERP_TEST_DATABASE_REQUIRED');
  return {isolated,businessScope,database,erpUiOrigin:`http://127.0.0.1:${businessScope?5234:isolated?5224:5194}`,erpOrigin,erpPort:Number(origin.port),ui:base,gateway:base+1,catalog:base+2,orders:base+3,native:base+4,
    uiOrigin:`http://127.0.0.1:${base}`,gatewayOrigin:`http://127.0.0.1:${base+1}`,catalogOrigin:`http://127.0.0.1:${base+2}`,nativeOrigin:`http://127.0.0.1:${base+4}`};
}

export function sharedTestHealthSafe(h){
 return h?.environment==='ISOLATED_TEST_COPY'&&h.serverName==='Semih\\MELISADEV'&&h.originalDatabaseAccess===0&&h.liveDatabaseAccess===0&&h.sysadmin===0&&h.databaseControl===0&&h.externalOperations===false&&h.automaticJobs===false&&h.actualT1===false;
}

export function cleanSyntheticTestHealthSafe(h){
 return h?.environment==='CLEAN_SYNTHETIC_TEST'&&h.synthetic===true&&h.serverName==='Semih\\MELISADEV'
   &&h.originalDatabaseAccess===0&&h.liveDatabaseAccess===0&&h.sysadmin===0&&h.databaseControl===0
   &&h.externalOperations===false&&h.automaticJobs===false&&h.actualT1===false;
}
