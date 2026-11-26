package id.ranszshop.larikoin

import android.webkit.JavascriptInterface
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import java.util.UUID

/**
 * Jembatan JS ↔ AdMob native. Disuntikkan sebagai window.AdMobBridge
 * (addJavascriptInterface) sebelum halaman game dimuat, jadi app.js
 * bisa mendeteksinya lewat `window.AdMobBridge`.
 *
 * Semua method HARUS jalan di UI thread (AdMob mewajibkan show/load
 * dari UI thread) — karena itu semua pemanggilan dibungkus
 * activity.runOnUiThread.
 *
 * KEBIJAKAN (Google, support.google.com/admob/answer/7313578):
 * rewarded ad TIDAK BOLEH memberi hadiah moneter. Koin Runner Coin
 * bisa dicairkan jadi Rp → koin = hadiah moneter. Maka reward di sini
 * HANYA 'life' (+1 nyawa, non-uang). showRewarded() menerima
 * rewardType apa pun dari JS tapi native HANYA meneruskan 'life';
 * tipe lain ditolak langsung (callback gagal) — server juga menolak
 * tipe selain 'life' (POST /api/ads/rewarded-verify).
 *
 * Verifikasi hadiah: onUserEarnedReward (callback resmi AdMob — hanya
 * jalan kalau iklan reward benar-benar selesai ditonton) → native
 * membuat nonce UUID → JS memanggil POST /api/ads/rewarded-verify
 * dengan nonce itu; server menolak replay nonce yang sama (403).
 * Ini BUKAN Server-Side Verification resmi Google (lihat README).
 */
class AdMobBridge(private val activity: MainActivity) {

    /** Preload kedua format iklan (dipanggil setelah config diambil). */
    fun preloadSemua() {
        muatInterstitial()
        muatRewarded()
    }

    private fun muatInterstitial() {
        val req = AdRequest.Builder().build()
        InterstitialAd.load(
            activity, activity.interstitialUnitId, req,
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    activity.interstitialAd = ad
                }
                override fun onAdFailedToLoad(error: LoadAdError) {
                    activity.interstitialAd = null
                }
            }
        )
    }

    private fun muatRewarded() {
        val req = AdRequest.Builder().build()
        RewardedAd.load(
            activity, activity.rewardedUnitId, req,
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    activity.rewardedAd = ad
                }
                override fun onAdFailedToLoad(error: LoadAdError) {
                    activity.rewardedAd = null
                }
            }
        )
    }

    @JavascriptInterface
    fun isInterstitialReady(): Boolean = activity.interstitialAd != null

    @JavascriptInterface
    fun isRewardedReady(): Boolean = activity.rewardedAd != null

    /**
     * Tampilkan interstitial. Dipanggil app.js tampilIklanSelingan().
     * Setelah ditutup → JS window.__admobInterstitialClosed();
     * kalau tidak ada iklan / gagal tampil → __admobInterstitialFailed()
     * (JS fallback ke modal simulasi).
     */
    @JavascriptInterface
    fun showInterstitial() {
        activity.runOnUiThread {
            val ad = activity.interstitialAd
            if (ad == null) {
                activity.panggilJs("window.__admobInterstitialFailed && window.__admobInterstitialFailed()")
                muatInterstitial()
                return@runOnUiThread
            }
            activity.interstitialAd = null
            ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    activity.panggilJs("window.__admobInterstitialClosed && window.__admobInterstitialClosed()")
                    muatInterstitial()
                }
                override fun onAdFailedToShowFullScreenContent(error: AdError) {
                    activity.panggilJs("window.__admobInterstitialFailed && window.__admobInterstitialFailed()")
                    muatInterstitial()
                }
            }
            try {
                ad.show(activity)
            } catch (_: Exception) {
                activity.panggilJs("window.__admobInterstitialFailed && window.__admobInterstitialFailed()")
                muatInterstitial()
            }
        }
    }

    /**
     * Tampilkan rewarded ad untuk rewardType yang diminta.
     * HANYA 'life' yang diteruskan — tipe lain langsung gagal.
     * Reward didapat → JS window.__admobRewarded('life', nonce);
     * ditutup tanpa reward / gagal → __admobRewardedFailed().
     */
    @JavascriptInterface
    fun showRewarded(rewardType: String) {
        activity.runOnUiThread {
            if (rewardType != "life") {
                activity.panggilJs("window.__admobRewardedFailed && window.__admobRewardedFailed()")
                return@runOnUiThread
            }
            val ad = activity.rewardedAd
            if (ad == null) {
                activity.panggilJs("window.__admobRewardedFailed && window.__admobRewardedFailed()")
                muatRewarded()
                return@runOnUiThread
            }
            activity.rewardedAd = null
            var earned = false
            ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    if (!earned) {
                        activity.panggilJs("window.__admobRewardedFailed && window.__admobRewardedFailed()")
                    }
                    muatRewarded()
                }
                override fun onAdFailedToShowFullScreenContent(error: AdError) {
                    activity.panggilJs("window.__admobRewardedFailed && window.__admobRewardedFailed()")
                    muatRewarded()
                }
            }
            try {
                ad.show(activity) {
                    // Callback resmi AdMob: reward HANYA diberikan kalau
                    // iklan selesai ditonton sampai titik reward.
                    earned = true
                    val nonce = UUID.randomUUID().toString()
                    activity.panggilJs(
                        "window.__admobRewarded && window.__admobRewarded('life','" + nonce + "')"
                    )
                }
            } catch (_: Exception) {
                activity.panggilJs("window.__admobRewardedFailed && window.__admobRewardedFailed()")
                muatRewarded()
            }
        }
    }
}
