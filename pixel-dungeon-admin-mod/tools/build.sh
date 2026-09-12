#!/bin/bash
# Полная сборка модифицированного APK из оригинала.
set -e
cd "$(dirname "$0")/.."

SMALI_CP="tools/lib/*"
SIGN_CP="build/apksigcls:tools/lib/bcprov-jdk18on-1.78.jar:tools/lib/bcpkix-jdk18on-1.78.jar:tools/lib/bcutil-jdk18on-1.78.jar"
EXPORTS="--add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED"
SRC=build/src/com/watabou/pixeldungeon/admin

echo "[1/10] дизассемблирую оригинальный classes.dex"
rm -rf smali_out
java -cp "$SMALI_CP" org.jf.baksmali.Main d --debug-info false -o smali_out x/classes.dex

echo "[2/10] собираю каталог из всех предметов игры"
python3 build/gencatalog.py smali_out $SRC/AdminCatalog.java

echo "[3/10] генерирую заглушки API игры"
rm -rf build/stubsrc build/stubcls
python3 build/genstubs.py smali_out build/stubsrc
mkdir -p build/stubcls
find build/stubsrc -name "*.java" > build/stub.list
javac -nowarn -proc:none --release 8 -d build/stubcls @build/stub.list

echo "[4/10] компилирую админ-панель"
rm -rf build/classes build/admin.dex build/adminsmali
mkdir -p build/classes
javac -nowarn -proc:none -encoding UTF-8 --release 8 -cp build/stubcls -d build/classes $SRC/*.java

echo "[5/10] перевожу в dex"
java -cp tools/dalvik-dx-16.0.1.jar com.android.dx.command.Main --dex --output=build/admin.dex build/classes
java -cp "$SMALI_CP" org.jf.baksmali.Main d -o build/adminsmali build/admin.dex

echo "[6/10] вношу хуки в код игры"
python3 build/patch.py
mkdir -p smali_out/com/watabou/pixeldungeon/admin
cp build/adminsmali/com/watabou/pixeldungeon/admin/*.smali smali_out/com/watabou/pixeldungeon/admin/

echo "[7/10] проверяю ссылки нового кода"
python3 build/verify.py smali_out build/adminsmali

echo "[8/10] собираю classes.dex"
java -Xmx3g -cp "$SMALI_CP" org.jf.smali.Main a -a 14 -o build/classes.dex smali_out

echo "[9/10] пересобираю APK с выравниванием"
python3 build/repack.py game.apk build/unsigned.apk build/classes.dex

echo "[10/10] подписываю (v1 + v2)"
rm -f build/PixelDungeon-Admin.apk
java $EXPORTS -cp "build/signcls:$SIGN_CP" SignApk \
    build/unsigned.apk build/PixelDungeon-Admin.apk build/mod.keystore pixeldungeon pdmod 14
java $EXPORTS -cp "build/signcls:$SIGN_CP" VerifyApk build/PixelDungeon-Admin.apk

ls -la build/PixelDungeon-Admin.apk
