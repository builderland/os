/**
 * 변경: index.html 전용 — 히어로 .hero-service-name 이 스크롤에 따라 작아지며 헤더 .service-name 위치로 이동
 */
(function () {
    "use strict";

    if (!document.body.classList.contains("page-index")) return;

    var hero = document.querySelector(".hero");
    var heroName = document.querySelector(".hero-service-name");
    var headerName = document.querySelector("header .service-name");
    var headerEl = document.querySelector("header");
    if (!hero || !heroName || !headerName || !headerEl) return;

    var cachedStart = null;
    var ticking = false;

    /** 스크롤이 맨 위일 때만 DOM에서 시작 중심·시작 폰트 크기 캐시 */
    function refreshStartIfAtTop() {
        if (window.scrollY > 2) return;
        var r = heroName.getBoundingClientRect();
        cachedStart = {
            cx: r.left + r.width / 2,
            cy: r.top + r.height / 2,
            fontSize: parseFloat(window.getComputedStyle(heroName).fontSize),
        };
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function clamp01(x) {
        return Math.min(1, Math.max(0, x));
    }

    /** 변경: index만 — .hero 상단이 뷰포트 상단에 도달하면 문의하기 버튼 표시 */
    function updateInquiryVisibility() {
        var top = hero.getBoundingClientRect().top;
        if (top <= 0) {
            headerEl.classList.add("header-inquiry-visible");
        } else {
            headerEl.classList.remove("header-inquiry-visible");
        }
    }

    function update() {
        refreshStartIfAtTop();

        var maxScroll = Math.max(hero.offsetHeight * 0.75, window.innerHeight * 0.45);
        var p = clamp01(window.scrollY / maxScroll);

        var endR = headerName.getBoundingClientRect();
        var endCx = endR.left + endR.width / 2;
        var endCy = endR.top + endR.height / 2;
        var endFs = parseFloat(window.getComputedStyle(headerName).fontSize);

        var start = cachedStart;
        if (!start) {
            refreshStartIfAtTop();
            start = cachedStart;
        }

        // 변경: 헤더 .service-name 은 항상 숨김 — 히어로 텍스트만 보간해 동일 위치로 이동
        if (p < 0.01) {
            heroName.removeAttribute("style");
            heroName.classList.remove("hero-service-name--fixed");
            return;
        }

        if (!start) return;

        heroName.classList.add("hero-service-name--fixed");

        var cx = lerp(start.cx, endCx, p);
        var cy = lerp(start.cy, endCy, p);
        var fs = lerp(start.fontSize, endFs, p);

        // 변경: 스크롤해도 글자색은 SCSS(.hero-service-name color) 유지 — 보간으로 검정 변하지 않음
        heroName.style.position = "fixed";
        heroName.style.left = cx + "px";
        heroName.style.top = cy + "px";
        heroName.style.transform = "translate(-50%, -50%)";
        heroName.style.fontSize = fs + "px";
        heroName.style.color = "";
        heroName.style.zIndex = "101";
        heroName.style.opacity = "1";
        heroName.style.visibility = "visible";
        heroName.style.pointerEvents = "none";
    }

    function onScrollOrResize() {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(function () {
                update();
                updateInquiryVisibility();
                ticking = false;
            });
        }
    }

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", function () {
        // 변경: 맨 위에서만 재측정 — 스크롤 중 리사이즈 시 시작점 캐시 유지
        if (window.scrollY <= 2) cachedStart = null;
        onScrollOrResize();
    });
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            refreshStartIfAtTop();
            update();
            updateInquiryVisibility();
        });
    } else {
        refreshStartIfAtTop();
        update();
        updateInquiryVisibility();
    }
})();
