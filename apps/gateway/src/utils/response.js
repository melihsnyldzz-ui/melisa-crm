export function ok(res, data, meta = {}) {
  return res.json({
    success: true,
    data,
    meta,
  });
}

export function created(res, data, meta = {}) {
  return res.status(201).json({
    success: true,
    data,
    meta,
  });
}

export function fail(res, statusCode, code, message, meta = {}) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
    meta,
  });
}
