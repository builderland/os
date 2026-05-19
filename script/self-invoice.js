// 셀프 견적 페이지 - Edge Function 연동 스크립트
// 변경: Supabase estimates 저장 로직 제거, 세션에만 셀프 견적 저장

const EDGE_FUNCTION_URL = 'https://zzczkrnninvyyxwdicck.supabase.co/functions/v1/calculate-estimate';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Y3prcm5uaW52eXl4d2RpY2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNzQxMTEsImV4cCI6MjA4NzY1MDExMX0.mgzgnSoSGIOKi2tJe-C_BNfdroH7rZs6fsm8c4KV0Pg';

// 공간 유형 매핑
const typeMap = { '1': '아파트', '2': '오피스텔', '3': '주택' };

// 마감재 등급 매핑
const gradeMap = { '1': '베이직', '2': '스탠다드', '3': '프리미엄' };

// 부분공사 scope_detail value → Edge Function scope 매핑
const scopeDetailMap = {
    'wallpaper':      ['도배'],
    'film':           ['필름_문문틀', '필름_창호', '필름_몰딩', '필름_주방가구'],
    'tile':           ['현관타일', '바닥타일'],
    'floor':          ['바닥'],
    'electric':       ['전기'],
    'kitchen_scope':  ['주방'],
    'bathroom_scope': ['욕실'],
};

// 선택 공사 체크박스 value → 한글 매핑
const extraMap = {
    'all':      '발코니확장',
    'kitchen':  '창호',
    'bathroom': '시스템에어컨',
};

// Edge Function scope → 저장용 scope 역변환
// (필름_문문틀/창호/몰딩/주방가구 → 필름, 현관타일/바닥타일 → 타일 하나로 통합)
function normalizeScope(scope) {
    const filmScopes = ['필름_문문틀', '필름_창호', '필름_몰딩', '필름_주방가구'];
    const tileScopes = ['현관타일', '바닥타일'];

    const hasFilm = filmScopes.some(s => scope.includes(s));
    const hasTile = tileScopes.some(s => scope.includes(s));

    let result = scope.filter(s => !filmScopes.includes(s) && !tileScopes.includes(s));
    if (hasFilm) result.push('필름');
    if (hasTile) result.push('타일');
    return result;
}

// 인보이스 번호 생성: MMDD + XXXX(당일 순번) + RRR(랜덤 영숫자)
function generateInvoiceNumber() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateKey = month + day;

    const counterStorageKey = `builderland_invoice_counter_${dateKey}`;
    const existing = localStorage.getItem(counterStorageKey);
    const currentCount = existing ? parseInt(existing, 10) || 0 : 0;
    const nextCount = currentCount + 1;
    localStorage.setItem(counterStorageKey, String(nextCount));
    const counterPart = String(nextCount).padStart(4, '0');

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    for (let i = 0; i < 3; i += 1) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return dateKey + counterPart + randomPart;
}

// 오늘 날짜 + 7일을 yyyy/mm/dd 형식으로 반환
function getValidUntilDate() {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

// 숫자 포맷 성능 향상을 위해 Intl.NumberFormat 인스턴스를 재사용
const manwonFormatter = new Intl.NumberFormat('ko-KR');

// 숫자를 만원 단위로 포맷 (콤마 포함)
function formatManwon(won) {
    const manwon = Math.round(won / 10000);
    return manwonFormatter.format(manwon);
}

// 자주 접근하는 DOM 요소 캐싱을 위한 변수 정의
let estimateRangeEl = null;
let estimateTableBody = null;
let estimateTableFootRow = null;
let mobileEstimateRangeEl = null;
let globalInvoiceEl = null;
let typeSelectEl = null;
let sizeSelectEl = null;
let gradeSelectEl = null;
let optionalCheckboxes = null;
let overlayEl = null;

// 견적 카드 결과 업데이트
function updateEstimateCard(data) {
    const indirectTotal = (data.indirect_price || 0) + (data.overhead || 0);

    // 만원 단위 변환 (반올림 기준 통일)
    const basicMin    = Math.round(data.basic_price    * 0.9 / 10000);
    const basicMax    = Math.round(data.basic_price    * 1.1 / 10000);
    const optMin      = Math.round(data.optional_price * 0.9 / 10000);
    const optMax      = Math.round(data.optional_price * 1.1 / 10000);
    const indirectMin = Math.round(indirectTotal        * 0.9 / 10000);
    const indirectMax = Math.round(indirectTotal        * 1.1 / 10000);

    // 합계 = 세부 항목 합산 (반올림 일치)
    const totalMin = basicMin + optMin + indirectMin;
    const totalMax = basicMax + optMax + indirectMax;

    // 상단 견적 금액 범위
    const formattedRange = `${manwonFormatter.format(totalMin)} ~ ${manwonFormatter.format(totalMax)}`;
    if (estimateRangeEl)       estimateRangeEl.textContent       = formattedRange;
    if (mobileEstimateRangeEl) mobileEstimateRangeEl.textContent = formattedRange;

    // 세부 항목 테이블
    if (estimateTableBody) {
        estimateTableBody.innerHTML = `
            <tr>
                <td>1</td>
                <td>기본 공사비</td>
                <td class="number">${manwonFormatter.format(basicMin)}</td>
                <td class="number">${manwonFormatter.format(basicMax)}</td>
            </tr>
            <tr>
                <td>2</td>
                <td>선택 공사비</td>
                <td class="number">${manwonFormatter.format(optMin)}</td>
                <td class="number">${manwonFormatter.format(optMax)}</td>
            </tr>
            <tr>
                <td>3</td>
                <td>직접 공사비 외 비용</td>
                <td class="number">${manwonFormatter.format(indirectMin)}</td>
                <td class="number">${manwonFormatter.format(indirectMax)}</td>
            </tr>
        `;
    }

    // 합계 행
    if (estimateTableFootRow) {
        estimateTableFootRow.innerHTML = `
            <td colspan="2">합계(만원)</td>
            <td class="number">${manwonFormatter.format(totalMin)}</td>
            <td class="number">${manwonFormatter.format(totalMax)}</td>
        `;
    }
}

// 버튼 로딩 상태 토글
function setLoading(isLoading) {
    const btn = document.querySelector('.action-cta');
    if (!btn) return;
    const label = btn.querySelector('.label');
    if (isLoading) {
        btn.disabled = true;
        if (label) label.textContent = '계산 중...';
    } else {
        btn.disabled = false;
        if (label) label.textContent = '견적 비교';
    }
}

// 화면 중앙 로딩 오버레이 토글
function setOverlayLoading(isLoading) {
    if (!overlayEl) return;
    overlayEl.classList.toggle('is-visible', isLoading);
    overlayEl.setAttribute('aria-hidden', String(!isLoading));
}

// 자동 계산/저장을 위한 상태 및 유틸 함수 추가
let lastPayload = null;
let lastEstimate = null;
let latestRequestId = 0;

// 디바운스 유틸
function debounce(fn, delay) {
    let timer = null;
    return function debounced(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// 현재 폼 상태에서 payload 구성
function buildPayload(options = { showAlert: false }) {
    const { showAlert } = options;

    const invoiceEl = globalInvoiceEl;
    const typeVal   = typeSelectEl?.value;
    const sizeVal   = sizeSelectEl?.value;
    const gradeVal  = gradeSelectEl?.value;

    if (!typeVal || !sizeVal || !gradeVal) {
        if (showAlert) alert('필수 항목을 모두 선택해주세요.');
        return null;
    }

    const areaPy = parseInt(sizeVal, 10);
    if (!Number.isFinite(areaPy)) {
        if (showAlert) alert('면적을 다시 선택해주세요.');
        return null;
    }

    const grade = gradeMap[gradeVal];

    // ── 선택공사 수집 (라디오 체크 전에 먼저 수집) ──────────────
    const extra_works = [];
    if (optionalCheckboxes) {
        for (const cb of optionalCheckboxes) {
            if (cb.checked) {
                const mapped = extraMap[cb.value];
                if (mapped) extra_works.push(mapped);
            }
        }
    }

    // ── 공사 범위 수집 ───────────────────────────────────────
    const rangeRoot = document.getElementById('self-form-range');
    if (!rangeRoot) return null;

    const topScopeRadio = rangeRoot.querySelector('.range-top-cards input[type="radio"]:checked');

    // 라디오 미선택이어도 선택공사만 있으면 계산 진행
    if (!topScopeRadio) {
        if (extra_works.length > 0) {
            return {
                invoice_no:        invoiceEl ? invoiceEl.textContent : '',
                space_type:        typeMap[typeVal],
                area_py:           areaPy,
                grade,
                construction_type: '부분',
                scope:             [],
                extra_works,
                bathroom_count:    0,
            };
        }
        if (showAlert) alert('공사 범위(전체/부분)를 선택해주세요.');
        return null;
    }

    const construction_type = topScopeRadio.value === 'full_work' ? '전체' : '부분';
    let scope = [];

    if (construction_type === '부분') {
        const checkedDetails = Array.from(
            rangeRoot.querySelectorAll('.option-grid input[type="checkbox"]:checked')
        ).map(cb => cb.value);

        // 공사 항목도 없고 선택공사도 없으면 중단
        if (checkedDetails.length === 0 && extra_works.length === 0) {
            if (showAlert) alert('부분 공사는 하위 항목을 2개 이상 선택해주세요.');
            return null;
        }

        checkedDetails.forEach(val => {
            (scopeDetailMap[val] || []).forEach(s => {
                scope.push(s);
            });
        });

        scope = [...new Set(scope)];
    }

    // 욕실 개수
    const hasBathroom    = construction_type === '전체' || scope.includes('욕실');
    const bathroom_count = hasBathroom ? 1 : 0;

    return {
        invoice_no:        invoiceEl ? invoiceEl.textContent : '',
        space_type:        typeMap[typeVal],
        area_py:           areaPy,
        grade,
        construction_type,
        scope,
        extra_works,
        bathroom_count,
    };
}

// Edge Function 호출 + 카드 렌더 + 상태 갱신
async function calculateAndRender(payload, options = { useButtonLoading: false, useOverlayLoading: false }) {
    const { useButtonLoading, useOverlayLoading } = options;
    const currentRequestId = ++latestRequestId;

    if (useButtonLoading)  setLoading(true);
    if (useOverlayLoading) setOverlayLoading(true);

    try {
        const res = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || '견적 계산 중 오류가 발생했습니다.');

        if (currentRequestId !== latestRequestId) return null;

        updateEstimateCard(data);

        lastPayload  = payload;
        lastEstimate = data;

        return data;
    } finally {
        if (useButtonLoading  && currentRequestId === latestRequestId) setLoading(false);
        if (useOverlayLoading && currentRequestId === latestRequestId) setOverlayLoading(false);
    }
}

// 셀프 견적 정보를 sessionStorage에만 저장하고 about.html로 이동
function saveEstimateToSessionAndNavigate() {
    if (!lastPayload || !lastEstimate) {
        alert('먼저 입력값을 선택해 예상 견적을 확인해 주세요.');
        return;
    }

    const estimateSummary = {
        basic_price:    lastEstimate.basic_price,
        optional_price: lastEstimate.optional_price,
        indirect_price: lastEstimate.indirect_price,
        total_price:    lastEstimate.total_price,
        min_price:      lastEstimate.min_price,
        max_price:      lastEstimate.max_price,
        items:          lastEstimate.items || [],
    };

    const payloadSummary = {
        space_type:        lastPayload.space_type,
        area_py:           lastPayload.area_py,
        grade:             lastPayload.grade,
        construction_type: lastPayload.construction_type,
        scope:             lastPayload.construction_type === '전체'
                             ? ['전체공사']
                             : normalizeScope(lastPayload.scope),
        extra_works:       lastPayload.extra_works,
        bathroom_count:    lastPayload.bathroom_count,
    };

    try {
        sessionStorage.setItem(
            'builderland_estimate_latest',
            JSON.stringify({
                invoice_no: lastPayload.invoice_no,
                payload:    payloadSummary,
                estimate:   estimateSummary,
            })
        );
    } catch (e) {
        console.warn('sessionStorage에 셀프 견적 정보를 저장하지 못했습니다.', e);
    }

    window.location.href = 'about.html';
}

document.addEventListener('DOMContentLoaded', () => {
    // DOM 요소 캐싱
    globalInvoiceEl       = document.querySelector('.estimate-card__invoice');
    estimateRangeEl       = document.querySelector('.estimate-card__range');
    mobileEstimateRangeEl = document.querySelector('.self-mobile-total-bar__range');
    estimateTableBody     = document.querySelector('.estimate-table tbody');
    estimateTableFootRow  = document.querySelector('.estimate-table tfoot tr');
    typeSelectEl          = document.getElementById('type');
    sizeSelectEl          = document.getElementById('size');
    gradeSelectEl         = document.getElementById('finish-grade');
    optionalCheckboxes    = document.querySelectorAll('#self-form-optional input[type="checkbox"]');
    overlayEl             = document.querySelector('.self-loading-overlay');

    if (!globalInvoiceEl) return;

    // 면적 옵션 동적 생성 (15~70평)
    if (sizeSelectEl && sizeSelectEl.tagName === 'SELECT') {
        sizeSelectEl.querySelectorAll('option:not([value=""])').forEach(o => o.remove());
        for (let p = 15; p <= 70; p++) {
            const opt = document.createElement('option');
            opt.value       = String(p);
            opt.textContent = `${p}`;
            sizeSelectEl.appendChild(opt);
        }
    }

    // 인보이스 번호 생성
    globalInvoiceEl.textContent = generateInvoiceNumber();

    // 유효기간 표시
    const validEl = document.querySelector('.estimate-card__valid');
    if (validEl) validEl.textContent = `${getValidUntilDate()} 까지 유효`;

    // 모바일 하단 고정 바 초기화
    if (mobileEstimateRangeEl) mobileEstimateRangeEl.textContent = '0';

    const actionButtons = document.querySelectorAll('.action-cta');

    // 자동 계산 디바운스
    const autoCalc = debounce(async () => {
        const payload = buildPayload({ showAlert: false });
        if (!payload) return;
        await calculateAndRender(payload, { useButtonLoading: false, useOverlayLoading: true });
    }, 800);

    // select 변경 시 자동 계산
    [typeSelectEl, sizeSelectEl, gradeSelectEl].filter(Boolean).forEach(el => {
        el.addEventListener('change', autoCalc);
    });

    // 선택공사 체크박스 변경 시 자동 계산
    if (optionalCheckboxes?.length > 0) {
        [...optionalCheckboxes].forEach(cb => cb.addEventListener('change', autoCalc));
    }

    // 공사 범위 라디오/체크박스 연동
    const rangeRoot = document.getElementById('self-form-range');
    if (rangeRoot) {
        const topScopeRadios     = rangeRoot.querySelectorAll('.range-top-cards input[type="radio"]');
        const detailOptionWrap   = rangeRoot.querySelector('.self-form-item-option');
        const detailOptionChecks = rangeRoot.querySelectorAll('.option-grid input[type="checkbox"]');
        let previousTopScopeChecked = null;

        const toggleDetailOptionByTopScope = () => {
            const selected = rangeRoot.querySelector('.range-top-cards input[type="radio"]:checked');
            if (!detailOptionWrap) return;

            if (selected?.value === 'partial_work') {
                detailOptionWrap.style.display = 'block';
            } else {
                detailOptionWrap.style.display = 'none';
                detailOptionChecks.forEach(cb => { cb.checked = false; });
            }
            autoCalc();
        };

        rangeRoot.addEventListener('pointerdown', () => {
            previousTopScopeChecked = rangeRoot.querySelector('.range-top-cards input[type="radio"]:checked');
        }, true);

        topScopeRadios.forEach(r => {
            r.addEventListener('click', () => {
                if (previousTopScopeChecked === r) {
                    r.checked = false;
                    previousTopScopeChecked = null;
                    toggleDetailOptionByTopScope();
                }
            });

            r.addEventListener('change', () => {
                previousTopScopeChecked = r;
                toggleDetailOptionByTopScope();
            });
        });

        detailOptionChecks.forEach(cb => cb.addEventListener('change', autoCalc));

        // 초기 상태 동기화
        toggleDetailOptionByTopScope();
    }

    // 버튼 클릭 핸들러
    const handleClick = async () => {
        const payload = buildPayload({ showAlert: true });
        if (!payload) return;

        const selectedTopScope = document.querySelector('#self-form-range .range-top-cards input[type="radio"]:checked');
        if (!selectedTopScope) {
            alert('공사 범위(전체/부분)를 선택해주세요.');
            return;
        }

        const isSamePayload = JSON.stringify(lastPayload) === JSON.stringify(payload);
        if (!lastEstimate || !isSamePayload) {
            try {
                await calculateAndRender(payload, { useButtonLoading: true, useOverlayLoading: true });
            } catch (e) {
                alert(e?.message || '견적 계산 중 오류가 발생했습니다.');
                return;
            }
        }

        if (payload.construction_type === '부분') {
            const checkedDetailCount = document.querySelectorAll(
                '#self-form-range .option-grid input[type="checkbox"]:checked'
            ).length;
            if (checkedDetailCount < 2) {
                alert('부분 공사는 하위 항목을 2개 이상 선택해주세요.');
                return;
            }
        }

        localStorage.setItem('builderland_invoice_latest', globalInvoiceEl.textContent);
        document.querySelector('.estimate-card')?.scrollIntoView({ behavior: 'smooth' });
        saveEstimateToSessionAndNavigate();
    };

    actionButtons.forEach(button => button.addEventListener('click', handleClick));
});