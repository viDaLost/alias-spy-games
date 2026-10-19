// New named bindings must not deploy before Core exports the access service.
const url = 'https://alias-spy-games-core.vitaledanilov.workers.dev/app/access';
for (let attempt = 0; attempt < 45; attempt += 1) {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    if (response.ok && typeof data.restricted === 'boolean' && typeof data.allowed === 'boolean') {
      console.log('Application access service is available.');
      process.exit(0);
    }
  } catch { /* Core is being deployed; retry without changing bindings. */ }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
throw new Error('Deploy app-core-worker with the AppAccess entrypoint before room Workers.');
