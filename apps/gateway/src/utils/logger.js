const sensitiveKeyPattern = /(password|secret|token|authorization|cookie|key|connection|string)/i;

function maskText(value) {
  if (typeof value !== 'string') return value;
  if (value.length <= 8) return '***';
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

export function maskSensitive(input) {
  if (!input || typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(maskSensitive);
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (sensitiveKeyPattern.test(key)) {
        return [key, maskText(String(value || ''))];
      }

      if (value && typeof value === 'object') {
        return [key, maskSensitive(value)];
      }

      return [key, value];
    }),
  );
}

function write(level, message, meta = {}) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...maskSensitive(meta),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
