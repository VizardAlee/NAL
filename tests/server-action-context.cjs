// Standalone emulator tests need only Next request metadata/cache adapters.
// Authentication, validation, database transactions and Storage remain real.
const Module = require('module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (request === 'server-only') return require.resolve('next/dist/compiled/server-only/empty.js');
  return resolve.call(this, request, ...args);
};
const load = Module._load;
Module._load = function(request, ...args) {
  const result = load.call(this, request, ...args);
  if (request === 'next/cache') return { ...result, revalidatePath() {} };
  if (request === 'next/headers') return { ...result, headers: async () => new Headers({ host: 'nal.test', origin: 'https://nal.test', 'user-agent': 'Synthetic emulator QA' }) };
  return result;
};
