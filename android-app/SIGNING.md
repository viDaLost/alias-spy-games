# Android release signing

Release APKs must use one long-lived private signing key. The release build is intentionally configured to fail when the release key is not supplied; it must never fall back to the Android debug key.

## 1. Create the key once

Run locally on a trusted computer with a JDK installed:

```bash
keytool -genkeypair -v \
  -keystore biblegames-release.jks \
  -alias biblegames \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Choose a strong unique password. Keep `biblegames-release.jks` and its password outside this repository. Make at least two encrypted backups in separate locations. Losing this private key means losing the ability to publish normal updates signed as the same Android app when self-managing the signing key.

## 2. Add GitHub Actions secrets

Convert the keystore to one-line Base64.

Linux/macOS:

```bash
base64 < biblegames-release.jks | tr -d '\n'
```

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("biblegames-release.jks"))
```

In repository Settings > Secrets and variables > Actions, add:

- `ANDROID_KEYSTORE_BASE64` — the Base64 value
- `ANDROID_KEYSTORE_PASSWORD` — keystore password
- `ANDROID_KEY_ALIAS` — normally `biblegames`
- `ANDROID_KEY_PASSWORD` — key password

Never commit the `.jks` file, Base64 value, or passwords to Git.

## 3. Build a signed release

Run the `Build Android APK` workflow manually. Pull requests only build a debug APK for compilation checks and do not receive release signing secrets. Manual release builds restore the keystore only into the temporary runner directory, verify the APK with `apksigner`, reject Android Debug certificates, and delete the restored keystore before the job finishes.

The workflow also produces a `.sha256` file for the APK.

## 4. Record the certificate fingerprint

Keep the SHA-256 certificate fingerprint in your release records:

```bash
keytool -list -v -keystore biblegames-release.jks -alias biblegames
```

Use the SHA-256 fingerprint when registering `com.vidalost.biblegames` with Android developer verification or services that bind configuration to the signing certificate.

## 5. Migration from previous debug-signed APKs

An APK signed with the new release key cannot normally update an already installed APK that was signed with a different debug key. If the original private debug key is unavailable, users must uninstall that old installation once and install the first build signed by the permanent release key. Every later self-distributed build must keep the same package name and be signed by the same permanent release key.

Do not create a fresh signing key for each release.
