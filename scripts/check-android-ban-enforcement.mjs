import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const need = (text, needle, label) => { if (!text.includes(needle)) throw new Error(`Ban enforcement check failed: ${label}`); };

const app = read('android-app/app/src/main/java/com/vidalost/biblegames/App.kt');
const cloud = read('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt');
const core = read('cloudflare/app-core-worker/src/index-v4.js');
const gradle = read('android-app/app/build.gradle');

need(app, 'ACCESS_POLL_MS = 4_000L', 'Android does not poll account status');
need(app, 'if (!accessChecked || isBanned) return', 'game launch is not gated by verified access');
need(app, 'AccessVerificationScreen(', 'initial access verification screen missing');
need(app, 'targetState = Triple(userId.isNotBlank(), currentGame, isBanned)', 'root navigation does not use live ban state');
need(cloud, 'put("action", "accessStatus")', 'Android accessStatus API missing');
need(core, "'accessStatus'", 'backend accessStatus action missing');
need(core, "if (isBanned) throw httpError(403, 'Доступ ограничен');", 'backend does not reject banned writes');
need(core, 'if (isBanned) return json(syncResponse(access.user)', 'banned sync can still merge client progress');
need(gradle, "versionName '2.6.5-native'", 'Android version was not bumped');

console.log('Android ban enforcement checks passed.');
