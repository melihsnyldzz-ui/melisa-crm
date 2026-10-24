export function scopeCatalogConversation({read, verifyCrmContext, readConversation}) {
  return async request => {
    const id = request.headers.get('x-crm-conversation-id');
    if (id === null) return read(request); // Existing general catalog grant stays unchanged.
    const fail = (status, code) => Response.json({success:false,error:{code,message:code}},{status,headers:{'cache-control':'no-store'}});
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return fail(400,'CRM_CONVERSATION_CONTEXT_INVALID');
    if (typeof readConversation !== 'function') return fail(503,'CRM_CONVERSATION_CONTEXT_UNAVAILABLE');
    const check = async () => {
      const authorization = request.headers.get('authorization') || '';
      if (!/^Bearer [^\s]+$/.test(authorization)) throw Object.assign(Error('CURRENT_CRM_SESSION_REQUIRED'),{statusCode:401});
      const current = verifyCrmContext(authorization.slice(7));
      await readConversation({conversationId:id,user:current.user});
    };
    try {
      await check();
      const response = await read(request);
      // List, individual product and image bytes all retain the same fresh assignment scope.
      await check();
      return response;
    } catch(error) {
      const code = ['WHATSAPP_CRM_CONVERSATION_FORBIDDEN','WHATSAPP_CRM_CONVERSATION_NOT_FOUND','AUTH_TOKEN_INVALID','AUTH_TOKEN_EXPIRED','CURRENT_CRM_SESSION_REQUIRED'].includes(error?.code || error?.message)
        ? (error.code || error.message) : 'CRM_CONVERSATION_CONTEXT_UNAVAILABLE';
      return fail([401,403,404].includes(error?.statusCode) ? error.statusCode : 503,code);
    }
  };
}
