import { assertCrmPermission, verifyCrmAccessToken, verifyTerminalCrmSession } from '../services/crmAuthService.js';

// Only duplicate middleware in this exact HTTP request shares the completed
// proof. No user/role/permission result is reused across requests.
const verifiedRequests=new WeakMap();

function authError(code, message, statusCode = 401) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export async function requireCrmAuth(req, res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      throw authError('WHATSAPP_CRM_AUTH_TOKEN_REQUIRED', 'Access token is required', 401);
    }

    const prior=verifiedRequests.get(req);
    if(prior?.token===token){req.user=prior.user;return next();}
    const user=verifyCrmAccessToken(token);
    await verifyTerminalCrmSession(user);
    if(req.get('authorization')!==authorization)throw authError('AUTH_TOKEN_INVALID','Oturum doğrulanamadı.');
    req.user=user;verifiedRequests.set(req,{token,user});
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireCrmPermission(permissionKey) {
  return (req, res, next) => {
    try {
      assertCrmPermission(req.user, permissionKey);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
