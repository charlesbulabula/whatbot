const stamp = () => new Date().toISOString();

const write = (level, args) => {
  const line = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  process.stdout.write(`${stamp()} [${level}] ${line}\n`);
};

export const logger = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  debug: (...args) => process.env.DEBUG && write('debug', args),
};
