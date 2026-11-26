package id.ranszshop.larikoin

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.rewarded.RewardedAd
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Runner Coin — WebView wrapper + AdMob (tahap 2, v1.4.0).
 *
 * Menggantikan TWA murni (v1.3.0): TWA dirender Chrome dan TIDAK BISA
 * menjalankan AdMob SDK. Wrapper ini punya WebView sendiri + Google
 * Mobile Ads SDK + JS bridge (window.AdMobBridge) yang dipakai
 * public/app.js (tampilIklanSelingan + mintaNyawaRewarded).
 *
 * Game yang dimuat TETAP web yang sama (URL Railway) — tidak ada kode
 * game yang diduplikasi ke native. Kalau WebView gagal / bridge tidak
 * ada, game jalan dengan simulasi seperti di browser biasa.
 *
 * CATATAN LOGIN (baca sebelum tes di HP): Google Sign-In di dalam
 * WebView bisa diblokir Google (403 disallowed_useragent — Google
 * melarang OAuth di WebView tertanam). Pemain mungkin harus login
 * lewat jalur lain; lihat WRAPPER-README.md § "Login Google di WebView".
 */
class MainActivity : Activity() {

    companion object {
        const val GAME_URL = "https://lari-koin-hosting-production.up.railway.app/"
        const val CONFIG_URL = GAME_URL + "api/ads/config"

        // Fallback kalau GET /api/ads/config tidak bisa diambil (server
        // down / timeout 6 detik). ID ini BUKAN rahasia (identifier publik
        // yang tampil di dashboard AdMob) — tapi perubahan unit iklan di
        // masa depan HARUS lewat server, bukan rebuild APK.
        const val FALLBACK_REWARDED_UNIT_ID = "ca-app-pub-3929807789448089/9615563652"
        const val FALLBACK_INTERSTITIAL_UNIT_ID = "ca-app-pub-3929807789448089/1088180253"
        const val CONFIG_TIMEOUT_MS = 6000
    }

    private lateinit var webView: WebView
    private lateinit var bridge: AdMobBridge
    internal var interstitialAd: InterstitialAd? = null
    internal var rewardedAd: RewardedAd? = null
    internal var rewardedUnitId: String = FALLBACK_REWARDED_UNIT_ID
    internal var interstitialUnitId: String = FALLBACK_INTERSTITIAL_UNIT_ID

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            setSupportMultipleWindows(true)
            // Tandai wrapper supaya game (app.js) memakai bridge AdMob
            // beneran, bukan simulasi. TWA tidak punya penanda ini.
            userAgentString = userAgentString + " RunnerCoinWrapper/1.4.0"
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                // Tetap di dalam WebView hanya untuk situs game; tautan luar
                // dibuka di browser sistem (jangan jebak pemain di WebView).
                return if (Uri.parse(url).host == Uri.parse(GAME_URL).host) {
                    false
                } else {
                    try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) { }
                    true
                }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            // window.open(...) — mis. tombol offerwall Tapjoy — buka URL-nya
            // di browser sistem, jangan di WebView baru yang tersembunyi.
            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                val newWebView = WebView(view.context)
                newWebView.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                        try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { }
                        return true
                    }
                }
                val transport = resultMsg.obj as WebView.WebViewTransport
                transport.webView = newWebView
                resultMsg.sendToTarget()
                return true
            }
        }
        bridge = AdMobBridge(this)
        webView.addJavascriptInterface(bridge, "AdMobBridge")

        // Inisialisasi AdMob + ambil konfigurasi unit dari server.
        MobileAds.initialize(this) {}
        Thread { muatConfigDanIklan() }.start()

        webView.loadUrl(GAME_URL)
    }

    /** Ambil unit ID dari server (background thread), lalu preload iklan. */
    private fun muatConfigDanIklan() {
        try {
            val conn = (URL(CONFIG_URL).openConnection() as HttpURLConnection).apply {
                connectTimeout = CONFIG_TIMEOUT_MS
                readTimeout = CONFIG_TIMEOUT_MS
                requestMethod = "GET"
            }
            if (conn.responseCode == 200) {
                val body = conn.inputStream.bufferedReader().readText()
                val json = JSONObject(body)
                val r = json.optString("rewardedUnitId", "")
                val i = json.optString("interstitialUnitId", "")
                if (r.isNotBlank()) rewardedUnitId = r
                if (i.isNotBlank()) interstitialUnitId = i
            }
        } catch (_: Exception) {
            // Tetap pakai fallback — game jalan, iklan dicoba dengan ID fallback.
        }
        runOnUiThread { bridge.preloadSemua() }
    }

    /** Panggil JS di WebView (selalu dari UI thread). */
    internal fun panggilJs(code: String) {
        runOnUiThread {
            try { webView.evaluateJavascript(code, null) } catch (_: Exception) { }
        }
    }

    override fun onPause() {
        super.onPause()
        try { webView.onPause() } catch (_: Exception) { }
    }

    override fun onResume() {
        super.onResume()
        try { webView.onResume() } catch (_: Exception) { }
    }

    override fun onBackPressed() {
        // Mundur di dalam WebView kalau bisa; kalau tidak, tutup aplikasi
        // (perilaku yang sama seperti TWA).
        try {
            if (::webView.isInitialized && webView.canGoBack()) {
                webView.goBack()
                return
            }
        } catch (_: Exception) { }
        super.onBackPressed()
    }

    override fun onDestroy() {
        try { webView.destroy() } catch (_: Exception) { }
        super.onDestroy()
    }
}
