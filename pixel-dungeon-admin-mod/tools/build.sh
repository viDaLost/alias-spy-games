#!/bin/bash
# Полная сборка модифицированного APK из оригинала.
set -e
cd "$(dirname "$0")/.."

SMALI_CP="tools/lib/*"
SIGN_CP="build/apksigcls:tools/lib/bcprov-jdk18on-1.78.jar:tools/lib/bcpkix-jdk18on-1.78.jar:tools/lib/bcutil-jdk18on-1.78.jar"
EXPORTS="--add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED"

echo "[1/7] дизассемблирую оригинальный classes.dex"
rm -rf smali_out
java -cp "$SMALI_CP" org.jf.baksmali.Main d --debug-info false -o smali_out x/classes.dex

echo "[2/7] вношу хуки админ-панели"
python3 build/patch.py

echo "[3/7] добавляю классы админ-панели"
mkdir -p smali_out/com/watabou/pixeldungeon/admin
cp build/adminsmali/com/watabou/pixeldungeon/admin/*.smali smali_out/com/watabou/pixeldungeon/admin/

echo "[4/7] проверяю ссылки нового кода"
python3 build/verify.py smali_out build/adminsmali

echo "[5/7] собираю classes.dex"
java -Xmx3g -cp "$SMALI_CP" org.jf.smali.Main a -a 14 -o build/classes.dex smali_out

echo "[6/7] пересобираю APK с выравниванием"
python3 build/repack.py game.apk build/unsigned.apk build/classes.dex

echo "[7/7] подписываю (v1 + v2)"
rm -f build/PixelDungeon-Admin.apk
java $EXPORTS -cp "build/signcls:$SIGN_CP" SignApk \
    build/unsigned.apk build/PixelDungeon-Admin.apk build/mod.keystore pixeldungeon pdmod 14
java $EXPORTS -cp "build/signcls:$SIGN_CP" VerifyApk build/PixelDungeon-Admin.apk

ls -la build/PixelDungeon-Admin.apk
