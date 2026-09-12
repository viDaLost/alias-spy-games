import com.android.apksig.ApkSigner;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Подписывает APK схемами v1 + v2 через библиотеку apksig. */
public class SignApk {
    public static void main(String[] args) throws Exception {
        String in = args[0], out = args[1], ks = args[2], pass = args[3], alias = args[4];
        int minSdk = Integer.parseInt(args[5]);

        KeyStore store = KeyStore.getInstance("PKCS12");
        try (FileInputStream fis = new FileInputStream(ks)) {
            store.load(fis, pass.toCharArray());
        }
        PrivateKey key = (PrivateKey) store.getKey(alias, pass.toCharArray());
        java.security.cert.Certificate[] chain = store.getCertificateChain(alias);
        List<X509Certificate> certs = new ArrayList<>();
        for (java.security.cert.Certificate c : chain) {
            certs.add((X509Certificate) c);
        }

        ApkSigner.SignerConfig config =
                new ApkSigner.SignerConfig.Builder("CERT", key, certs).build();

        new ApkSigner.Builder(Collections.singletonList(config))
                .setInputApk(new File(in))
                .setOutputApk(new File(out))
                .setMinSdkVersion(minSdk)
                .setV1SigningEnabled(true)
                .setV2SigningEnabled(true)
                .setCreatedBy("apksig")
                .build()
                .sign();

        System.out.println("подписано: " + out);
    }
}
