/**
 * 변경: a/index.html(page-b) 전용 — 스크롤 시 .hero-service-name 이 .nav-logo 위치·크기로 보간
 */
(function () {
    "use strict";

    if (!document.body.classList.contains("page-b")) return;

    var hero = document.querySelector(".lp .hero");
    var heroName = document.querySelector(".hero-service-name");
    var navEl = document.querySelector(".lp .nav");
    var navLogo = document.querySelector(".lp .nav-logo");
    var heroBgImage = document.querySelector(".hero-service-name-container .hero-image");
    var heroBgDim = document.querySelector(".hero-service-name-container .hero-image .dim");
    if (!hero || !heroName || !navLogo) return;

    var cachedStart = null;
    var ticking = false;
    var isHeroNameFixed = false;

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

    /** 변경: .hero 상단이 뷰포트 상단에 도달하면 '서비스 특징'·채널톡 플로팅 버튼 동시 표시 */
    function updateNavLinksVisibility() {
        var top = hero.getBoundingClientRect().top;
        var show = top <= 0;

        if (navEl) {
            navEl.classList.toggle("nav-links-visible", show);
        }

        // 변경: 채널톡 플로팅 버튼 — 서비스 특징 링크와 같은 스크롤 타이밍
        if (typeof window.ChannelIO === "function") {
            window.ChannelIO(show ? "showChannelButton" : "hideChannelButton");
        }
    }

    /** 변경: nav 바로 아래 배경이 밝은 섹션(.sec.light, .cta)이면 헤더 글자색 어둡게 */
    function updateNavTheme() {
        var rect = navEl.getBoundingClientRect();
        var x = Math.min(
            Math.max(rect.left + rect.width / 2, 1),
            window.innerWidth - 2
        );
        var y = Math.min(rect.bottom + 4, window.innerHeight - 2);
        var prevPointer = navEl.style.pointerEvents;
        navEl.style.pointerEvents = "none";
        var el = document.elementFromPoint(x, y);
        navEl.style.pointerEvents = prevPointer;

        var isLight = false;
        var node = el;
        while (node && node !== document.body) {
            if (node.classList) {
                if (node.classList.contains("cta")) {
                    isLight = true;
                    break;
                }
                if (node.classList.contains("sec") && node.classList.contains("light")) {
                    isLight = true;
                    break;
                }
                if (
                    node.classList.contains("sec") &&
                    (node.classList.contains("dark") || node.classList.contains("dark2"))
                ) {
                    isLight = false;
                    break;
                }
                if (node.classList.contains("footer")) {
                    isLight = false;
                    break;
                }
            }
            node = node.parentElement;
        }

        document.body.classList.toggle("nav-on-light", isLight);
    }

    function update() {
        refreshStartIfAtTop();

        var maxScroll = Math.max(hero.offsetHeight * 0.75, window.innerHeight * 0.45);
        var p = clamp01(window.scrollY / maxScroll);
        var dimOpacity = lerp(0, 0.6, p);

        var endR = navLogo.getBoundingClientRect();
        var endCx = endR.left + endR.width / 2;
        var endCy = endR.top + endR.height / 2;
        var endFs = parseFloat(window.getComputedStyle(navLogo).fontSize);

        var start = cachedStart;
        if (!start) {
            refreshStartIfAtTop();
            start = cachedStart;
        }

        if (p < 0.01) {
            if (isHeroNameFixed) {
                heroName.removeAttribute("style");
                heroName.classList.remove("hero-service-name--fixed");
                isHeroNameFixed = false;
            }
            if (heroBgDim) {
                heroBgDim.style.background = "rgba(0, 0, 0, 0)";
            }
            if (heroBgImage) {
                heroBgImage.style.opacity = "1";
            }
            return;
        }

        if (!start) return;

        if (!isHeroNameFixed) {
            heroName.classList.add("hero-service-name--fixed");
            heroName.style.position = "fixed";
            heroName.style.left = start.cx + "px";
            heroName.style.top = start.cy + "px";
            heroName.style.transformOrigin = "center center";
            heroName.style.willChange = "transform, opacity";
            // 변경: 색상은 body.nav-on-light CSS 변수로 제어
            heroName.style.color = "";
            heroName.style.zIndex = "10000";
            heroName.style.opacity = "1";
            heroName.style.visibility = "visible";
            heroName.style.pointerEvents = "none";
            isHeroNameFixed = true;
        }

        var tx = lerp(0, endCx - start.cx, p);
        var ty = lerp(0, endCy - start.cy, p);
        var safeStartFont = Math.max(start.fontSize, 1);
        var scale = lerp(1, endFs / safeStartFont, p);

        heroName.style.transform =
            "translate(-50%, -50%) translate(" +
            tx.toFixed(2) +
            "px, " +
            ty.toFixed(2) +
            "px) scale(" +
            scale.toFixed(4) +
            ")";

        if (heroBgDim) {
            heroBgDim.style.background = "rgba(0, 0, 0, " + dimOpacity.toFixed(3) + ")";
        }
    }

    function onScrollOrResize() {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(function () {
                update();
                updateNavLinksVisibility();
                updateNavTheme();
                ticking = false;
            });
        }
    }

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", function () {
        if (window.scrollY <= 2) {
            cachedStart = null;
        }
        onScrollOrResize();
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            refreshStartIfAtTop();
            update();
            updateNavLinksVisibility();
            updateNavTheme();
        });
    } else {
        refreshStartIfAtTop();
        update();
        updateNavLinksVisibility();
        updateNavTheme();
    }
})();
