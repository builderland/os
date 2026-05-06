/**
 * 변경: index.html 전용 — 스크롤 위치 기반으로 .hero-service-name 이 작아졌다 커지도록 단순화
 */
(function () {
    "use strict";

    if (!document.body.classList.contains("page-index")) return;

    var hero = document.querySelector(".hero");
    var heroName = document.querySelector(".hero-service-name");
    var headerName = document.querySelector("header .service-name");
    var headerEl = document.querySelector("header");
    // 변경: 첫 화면 고정 배경 이미지(.hero-service-name-container .hero-image) 참조
    var heroBgImage = document.querySelector(".hero-service-name-container .hero-image");
    // 변경: pricing 섹션 상단 도달 시점 감지를 위한 참조
    var pricingSection = document.querySelector(".pricing");
    // 변경: 첫 화면 고정 배경 딤(.hero-service-name-container .hero-image .dim) 참조
    var heroBgDim = document.querySelector(".hero-service-name-container .hero-image .dim");
    if (!hero || !heroName || !headerName || !headerEl) return;

    var cachedStart = null;
    var ticking = false;
    // 변경: 스크롤 중 불필요한 style 재적용을 줄이기 위한 상태 캐시
    var isHeroNameFixed = false;
    // 변경: 배경 이미지 숨김 상태가 바뀔 때만 opacity를 갱신
    var lastHeroBgHidden = null;

    /** 스크롤이 맨 위일 때만 시작 중심·폰트 크기 캐시 */
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

    /** 변경: .hero 상단이 뷰포트 상단에 도달하면 문의하기 버튼 표시 */
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
        // 변경: 아래로 스크롤하면 0->1, 위로 스크롤하면 1->0으로 자연 복귀
        var p = clamp01(window.scrollY / maxScroll);
        // 변경: pricing 경계에서 급격한 토글을 줄이기 위해 완충 구간(24px) 적용
        var hideHeroBgImage = pricingSection && pricingSection.getBoundingClientRect().top <= -24;
        // 변경: 요청사항 반영 — hero-service-name 진행률과 동일하게 첫 화면 딤 투명도 보간
        var dimOpacity = lerp(0, 0.6, p);

        var endR = headerName.getBoundingClientRect();
        var endCx = endR.left + endR.width / 2;
        var endCy = endR.top + endR.height / 2;
        var endFs = parseFloat(window.getComputedStyle(headerName).fontSize);

        var start = cachedStart;
        if (!start) {
            refreshStartIfAtTop();
            start = cachedStart;
        }

        // 변경: 진행률이 거의 0이면 원래 상태로 복귀
        if (p < 0.01) {
            if (isHeroNameFixed) {
                heroName.removeAttribute("style");
                heroName.classList.remove("hero-service-name--fixed");
                isHeroNameFixed = false;
            }
            if (heroBgDim) {
                // 변경: 최상단 복귀 시 딤 원복
                heroBgDim.style.background = "rgba(0, 0, 0, 0)";
            }
            if (heroBgImage) {
                // 변경: 기본 상태는 항상 표시(visibility 토글 제거로 레이아웃 변동 최소화)
                heroBgImage.style.opacity = "1";
                lastHeroBgHidden = false;
            }
            return;
        }

        if (!start) return;

        if (!isHeroNameFixed) {
            heroName.classList.add("hero-service-name--fixed");
            // 변경: fixed 진입 시 시작점만 1회 배치하고 이후에는 transform으로만 보간
            heroName.style.position = "fixed";
            heroName.style.left = start.cx + "px";
            heroName.style.top = start.cy + "px";
            heroName.style.transformOrigin = "center center";
            heroName.style.willChange = "transform, opacity";
            heroName.style.color = "";
            // 변경: hero-service-name을 최상단 레이어로 올림
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

        // 변경: left/top/font-size 대신 transform 기반으로만 업데이트해 리플로우 부담 완화
        heroName.style.transform = "translate(-50%, -50%) translate(" + tx.toFixed(2) + "px, " + ty.toFixed(2) + "px) scale(" + scale.toFixed(4) + ")";

        if (heroBgImage) {
            // 변경: 상태가 바뀔 때만 opacity 갱신해 페인트 빈도 최소화
            if (lastHeroBgHidden !== hideHeroBgImage) {
                heroBgImage.style.opacity = hideHeroBgImage ? "0" : "1";
                lastHeroBgHidden = hideHeroBgImage;
            }
        }

        if (heroBgDim) {
            // 변경: 스크롤 진행률에 맞춰 딤 농도 증가/감소
            heroBgDim.style.background = "rgba(0, 0, 0, " + dimOpacity.toFixed(3) + ")";
        }
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
        // 변경: 맨 위에서만 시작점 캐시 재측정
        if (window.scrollY <= 2) {
            cachedStart = null;
        }
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
