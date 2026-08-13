import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const need = (text, needle, label) => { if (!text.includes(needle)) throw new Error(`Network resilience check failed: ${label}`); };

const cloud = read('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt');
const core = read('cloudflare/app-core-worker/src/index-v4.js');
const authStore = read('cloudflare/app-core-worker/src/android-auth-user-store.js');
const gradle = read('android-app/app/build.gradle');

need(cloud, 'private val authRequestClient', 'short login request client missing');
need(cloud, 'callTimeout(4, TimeUnit.SECONDS)', 'login request can still block too long');
need(cloud, 'postRoomViaCore', 'room relay fallback missing');
need(core, "url.pathname === '/android/room-relay'", 'room relay route missing');
need(core, 'ANDROID_ROOM_BACKENDS', 'room relay backend allowlist missing');
need(core, 'await requireAndroidSession(request, env)', 'room relay is not session-protected');
need(authStore, 'MAX_CHALLENGES_PER_ID = 6', 'per-ID login retry allowance not updated');
need(gradle, "versionName '2.7.3-native'", 'Android version is not 2.7.3');
need(gradle, 'versionCode 23', 'Android versionCode is not 23');

console.log('Android auth latency and room relay resilience checks passed.');
