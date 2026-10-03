// Development proposal only. No listener, token cache, environment/config import or live changes.
const ASSIGNMENT=Symbol('verified-catalog-read-budget');
const ROLES=new Set(['patron','mudur','personel']);
export const PROPOSED_READ_BUDGET=Object.freeze({windowMs:60000,catalogMax:300,verificationMax:650});
export function budgetKey(request){
  const assignment=request[ASSIGNMENT];
  if(!assignment)throw Error('VERIFIED_READ_BUDGET_REQUIRED');
  return `${assignment.kind}:${assignment.actorId}`;
}
export function createReadBudgetMiddleware({verifyToken,canRead,globalLimiter,catalogLimiter,verificationLimiter}={}){
  if(![verifyToken,canRead,globalLimiter,catalogLimiter,verificationLimiter].every(value=>typeof value==='function'))throw Error('EXPLICIT_RATE_DEPENDENCIES_REQUIRED');
  return function readBudget(request,response,next){
    delete request[ASSIGNMENT];
    // Method and exact route classification never trusts Origin, query URL, IP spoofing or browser role.
    const kind=request.method==='GET'&&/^\/crm\/catalog\/products(?:\/vega-[1-9][0-9]*(?:\/photo)?)?$/.test(request.path)?'catalog':request.method==='GET'&&request.path==='/auth/me'?'verification':null;
    if(!kind)return globalLimiter(request,response,next);
    let user;const authorization=request.get('authorization')||'';
    if(!/^Bearer [^\s]+$/.test(authorization))return globalLimiter(request,response,next);
    try{user=verifyToken(authorization.slice(7));
      if(user?.active!==true||typeof user.id!=='string'||!user.id||!ROLES.has(user.role)||!Array.isArray(user.permissions)||!user.permissions.includes('crm.view')||canRead(user,authorization)!==true)return globalLimiter(request,response,next);
    }catch{return globalLimiter(request,response,next)}
    // Store only the current verified public account ID. Do not retain the credential/token.
    request[ASSIGNMENT]={kind,actorId:user.id};
    return (kind==='catalog'?catalogLimiter:verificationLimiter)(request,response,next);
  };
}
