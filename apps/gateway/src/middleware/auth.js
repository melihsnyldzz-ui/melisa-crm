import { assertCrmPermission, verifyCrmAccessToken } from '../services/crmAuthService.js';

function authError(code, message, statusCode = 401) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function requireCrmAuth(req, res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      throw authError('WHATSAPP_CRM_AUTH_TOKEN_REQUIRED', 'Access token is required', 401);
    }

    req.user = verifyCrmAccessToken(token);
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
