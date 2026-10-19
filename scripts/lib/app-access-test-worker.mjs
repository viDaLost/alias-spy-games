// Authorized-session fixture for local room mechanics tests only.
// Production access rules are tested against the real Core in check-app-access.mjs.
import { WorkerEntrypoint } from 'cloudflare:workers';
export class AppAccess extends WorkerEntrypoint {
  async check(userId) { return { success: true, allowed: true, userId }; }
  async authorize(proof) { return { success: true, allowed: true, userId: String(proof.testUserId || '555555555') }; }
}
export default { fetch() { return Response.json({ ok: false }, { status: 404 }); } };
