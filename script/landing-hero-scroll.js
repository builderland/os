/**
 * 변경: index.html(page-landing) 전용 — 스크롤 시 .hero-service-name 이 상단 좌측(섹션 그리드)으로 축소·이동
 */
(function () {
    "use strict";

    if (!document.body.classList.contains("page-landing")) return;

    var heroCopy = document.querySelector(".hero.hero-copy");
    var heroName = document.querySelector(".hero-service-name");
    var heroBgImage = document.querySelector(".hero-service-name-container .hero-image");
    var heroBgDim = document.querySelector(".hero-service-name-container .hero-image .dim");
    var footer = document.querySelector(".footer");
    if (!heroCopy || !heroName) return;

    var cachedStart = null;
    var ticking = false;
    var isHeroNameFixed = false;
    // 변경: 배경 이미지 숨김 상태가 바뀔 때만 opacity 갱신
    var lastHeroBgHidden = null;

    // 변경: 종료 앵커 — .section-inner 좌측 그리드 + 상단(세이프에리어)
    var END_FONT_SIZE = 19;
    var END_TOP_OFFSET = 28;
    var cachedEndHalfWidth = null;

    function getSafeAreaTop() {
        var raw = getComputedStyle(document.body).getPropertyValue("--safe-area-top");
        var v = parseFloat(raw);
        return !isNaN(v) && v > 0 ? v : 0;
    }

    /** 변경: 종료 시 MMMH 반폭(translate -50% 보간용) */
    function getEndHalfWidth() {
        if (cachedEndHalfWidth != null) return cachedEndHalfWidth;

        var probe = document.createElement("span");
        probe.textContent = heroName.textContent || "MMMH";
        probe.setAttribute("aria-hidden", "true");
        probe.style.cssText =
            "position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;" +
            'font-family:"Google Sans Flex",sans-serif;font-weight:700;font-size:' +
            END_FONT_SIZE +
            "px;letter-spacing:-0.03em;text-transform:uppercase;";
        document.body.appendChild(probe);
        cachedEndHalfWidth = probe.getBoundingClientRect().width / 2;
        document.body.removeChild(probe);
        return cachedEndHalfWidth;
    }

    function getEndAnchor() {
        var gridEl =
            document.querySelector(".hero.hero-copy .section-inner") ||
            document.querySelector(".section-inner");
        var contentLeft = 20;

        if (gridEl) {
            var rect = gridEl.getBoundingClientRect();
            var padLeft = parseFloat(getComputedStyle(gridEl).paddingLeft) || 20;
            contentLeft = rect.left + padLeft;
        }

        return {
            cx: contentLeft + getEndHalfWidth(),
            cy: getSafeAreaTop() + END_TOP_OFFSET,
            fontSize: END_FONT_SIZE,
        };
    }

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

    /** 변경: 푸터 진입·문서 하단(오버스크롤) 시 fixed 히어로 이미지 숨김 */
    function shouldHideHeroBg() {
        var atPageBottom =
            window.scrollY + window.innerHeight >=
            document.documentElement.scrollHeight - 2;
        if (atPageBottom) return true;
        if (!footer) return false;
        return footer.getBoundingClientRect().top < window.innerHeight;
    }

    function setHeroBgVisible(visible) {
        if (!heroBgImage) return;
        var hide = !visible;
        if (lastHeroBgHidden === hide) return;
        heroBgImage.style.opacity = hide ? "0" : "1";
        lastHeroBgHidden = hide;
    }

    /** 변경: .hero-copy 상단이 뷰포트에 도달하면 채널톡 플로팅 버튼 표시 (바텀시트 열림 시 숨김) */
    function updateChannelButtonVisibility() {
        var sheet = document.getElementById("estimate-sheet");
        if (sheet && sheet.classList.contains("is-open")) {
            if (typeof window.ChannelIO === "function") {
                window.ChannelIO("hideChannelButton");
            }
            return;
        }
        var show = heroCopy.getBoundingClientRect().top <= 0;
        if (typeof window.ChannelIO === "function") {
            window.ChannelIO(show ? "showChannelButton" : "hideChannelButton");
        }
    }

    // 변경: 견적서 바텀시트 열림/닫힘 시 채널톡 표시 상태 갱신
    window.updateChannelButtonVisibility = updateChannelButtonVisibility;

    function update() {
        refreshStartIfAtTop();

        var maxScroll = Math.max(heroCopy.offsetHeight * 0.75, window.innerHeight * 0.45);
        var p = clamp01(window.scrollY / maxScroll);
        var dimOpacity = lerp(0, 0.6, p);

        var end = getEndAnchor();
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
            setHeroBgVisible(!shouldHideHeroBg());
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
            heroName.style.color = "#fff";
            heroName.style.zIndex = "10000";
            heroName.style.opacity = "1";
            heroName.style.visibility = "visible";
            heroName.style.pointerEvents = "none";
            isHeroNameFixed = true;
        }

        var tx = lerp(0, end.cx - start.cx, p);
        var ty = lerp(0, end.cy - start.cy, p);
        var safeStartFont = Math.max(start.fontSize, 1);
        var scale = lerp(1, end.fontSize / safeStartFont, p);

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

        setHeroBgVisible(!shouldHideHeroBg());
    }

    function onScrollOrResize() {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(function () {
                update();
                updateChannelButtonVisibility();
                ticking = false;
            });
        }
    }

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", function () {
        if (window.scrollY <= 2) {
            cachedStart = null;
        }
        cachedEndHalfWidth = null;
        onScrollOrResize();
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            refreshStartIfAtTop();
            update();
            updateChannelButtonVisibility();
        });
    } else {
        refreshStartIfAtTop();
        update();
        updateChannelButtonVisibility();
    }
})();
