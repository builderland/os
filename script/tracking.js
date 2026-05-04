/**
 * 변경: GA4·Meta Pixel 공통 초기화 — 배포 전 아래 ID 상수만 채우면 됨(비어 있으면 해당 추적은 로드하지 않음)
 */
// 변경: Google 태그(gtag.js) 공식 스니펫의 측정 ID(G-HE6RDBKFN3)와 동일
const GA4_MEASUREMENT_ID = 'G-HE6RDBKFN3';
// 변경: Meta Pixel 공식 스니펫의 픽셀 ID와 동일
const META_PIXEL_ID = '957125517307149';

// 변경: GA4(gtag) — 측정 ID가 있을 때만 gtag/js 로드 및 config
(function initGa4() {
    if (!GA4_MEASUREMENT_ID) return;

    window.dataLayer = window.dataLayer || [];
    function gtag() {
        window.dataLayer.push(arguments);
    }
    window.gtag = window.gtag || gtag;

    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src =
        'https://www.googletagmanager.com/gtag/js?id=' +
        encodeURIComponent(GA4_MEASUREMENT_ID);
    document.head.appendChild(gaScript);

    gtag('js', new Date());
    gtag('config', GA4_MEASUREMENT_ID);
})();

// 변경: Meta Pixel — 픽셀 ID가 있을 때만 fbevents 로드 및 PageView
(function initMetaPixel() {
    if (!META_PIXEL_ID) return;

    !(function (f, b, e, v, n, t, s) {
        if (f.fbq) return;
        n = f.fbq = function () {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = !0;
        n.version = '2.0';
        n.queue = [];
        t = b.createElement(e);
        t.async = !0;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', META_PIXEL_ID);
    fbq('track', 'PageView');
})();
