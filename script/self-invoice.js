// 셀프 견적 페이지 - Edge Function 연동 스크립트
// 변경: Supabase estimates 저장 로직 제거, 세션에만 셀프 견적 저장

const EDGE_FUNCTION_URL = 'https://zzczkrnninvyyxwdicck.supabase.co/functions/v1/calculate-estimate';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Y3prcm5uaW52eXl4d2RpY2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNzQxMTEsImV4cCI6MjA4NzY1MDExMX0.mgzgnSoSGIOKi2tJe-C_BNfdroH7rZs6fsm8c4KV0Pg';

// 공간 유형 매핑
const typeMap = { '1': '아파트', '2': '오피스텔', '3': '주택' };

// 마감재 등급 매핑
const gradeMap = { '1': '베이직', '2': '스탠다드', '3': '프리미엄' };

// 공사 범위 체크박스 value → 한글 매핑
const scopeMap = {
    'all': '전체',
    'kitchen': '주방',
    'bathroom': '욕실',
    'living': '거실',
    'room': '침실',
    'entrance': '현관'
};

// 선택 공사 체크박스 value → 한글 매핑
const extraMap = {
    'all': '발코니확장',
    'kitchen': '창호',
    'bathroom': '시스템에어컨'
};

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

// 변경: 숫자 포맷 성능 향상을 위해 Intl.NumberFormat 인스턴스를 재사용
const manwonFormatter = new Intl.NumberFormat('ko-KR');

// 숫자를 만원 단위로 포맷 (콤마 포함)
function formatManwon(won) {
    const manwon = Math.round(won / 10000);
    return manwonFormatter.format(manwon);
}

// 변경: 자주 접근하는 DOM 요소 캐싱을 위한 변수 정의
let estimateRangeEl = null;
let estimateTableBody = null;
let estimateTableFootRow = null;
let globalInvoiceEl = null;
let typeSelectEl = null;
let sizeSelectEl = null;
let gradeSelectEl = null;
let rangeCheckboxes = null;
let optionalCheckboxes = null;

// 견적 카드 결과 업데이트
function updateEstimateCard(data) {
    // 변경: DOM 탐색 최소화를 위해 캐싱된 요소 사용
    // 견적 금액 범위 표시
    if (estimateRangeEl) {
        estimateRangeEl.textContent = `${formatManwon(data.min_price)} ~ ${formatManwon(data.max_price)}`;
    }

    // 세부 항목 테이블 업데이트
    if (estimateTableBody) {
        estimateTableBody.innerHTML = `
            <tr>
                <td>1</td>
                <td>기본 공사비</td>
                <td class="number">${formatManwon(data.basic_price * 0.9)}</td>
                <td class="number">${formatManwon(data.basic_price * 1.1)}</td>
            </tr>
            <tr>
                <td>2</td>
                <td>선택 공사비</td>
                <td class="number">${formatManwon(data.optional_price * 0.9)}</td>
                <td class="number">${formatManwon(data.optional_price * 1.1)}</td>
            </tr>
            <tr>
                <td>3</td>
                <td>직접 공사비 외 비용</td>
                <td class="number">${formatManwon(data.indirect_price * 0.9)}</td>
                <td class="number">${formatManwon(data.indirect_price * 1.1)}</td>
            </tr>
        `;
    }

    // 합계 업데이트
    if (estimateTableFootRow) {
        estimateTableFootRow.innerHTML = `
            <td colspan="2">합계(만원)</td>
            <td class="number">${formatManwon(data.min_price)}</td>
            <td class="number">${formatManwon(data.max_price)}</td>
        `;
    }
}

// 버튼 로딩 상태 토글 (라벨은 '견적 비교' 기준으로 유지)
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

// 변경: 자동 계산/저장을 위한 상태 및 유틸 함수 추가
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

// 현재 폼 상태에서 payload 구성 (showAlert에 따라 경고 표시 여부 제어)
function buildPayload(options = { showAlert: false }) {
    const { showAlert } = options;

    // 변경: 자주 사용하는 요소는 DOMContentLoaded에서 캐싱된 전역 변수를 사용
    const invoiceEl = globalInvoiceEl;
    const typeVal = typeSelectEl?.value;
    const sizeVal = sizeSelectEl?.value;
    const gradeVal = gradeSelectEl?.value;

    if (!typeVal || !sizeVal || !gradeVal) {
        if (showAlert) {
            alert('공간 유형, 면적, 마감재 등급을 모두 선택해주세요.');
        }
        return null;
    }

    // 변경: 면적은 선택한 평수(15~70)를 그대로 사용
    const areaPy = parseInt(sizeVal, 10);
    if (!Number.isFinite(areaPy)) {
        if (showAlert) {
            alert('면적을 다시 선택해주세요.');
        }
        return null;
    }

    // 공사 범위 체크박스 수집 (#self-form-range 안)
    // 변경: 매번 DOM을 다시 탐색하지 않고, 캐싱된 체크박스 목록에서 checked 상태만 확인
    const scope = [];
    if (rangeCheckboxes) {
        for (const cb of rangeCheckboxes) {
            if (cb.checked) {
                const mapped = scopeMap[cb.value];
                if (mapped) scope.push(mapped);
            }
        }
    }

    if (scope.length === 0) {
        if (showAlert) {
            alert('공사 범위를 1개 이상 선택해주세요.');
        }
        return null;
    }

    // 선택 공사 체크박스 수집 (#self-form-optional 안)
    // 변경: 선택 공사도 캐싱된 체크박스 목록을 순회하며 수집
    const extra_works = [];
    if (optionalCheckboxes) {
        for (const cb of optionalCheckboxes) {
            if (cb.checked) {
                const mapped = extraMap[cb.value];
                if (mapped) extra_works.push(mapped);
            }
        }
    }

    // 욕실 개수: scope에 욕실이 있으면 1로 고정 (추후 욕실 개수 선택 UI 추가 가능)
    const bathroom_count = scope.includes('욕실') ? 1 : 0;

    return {
        invoice_no: invoiceEl ? invoiceEl.textContent : '',
        space_type: typeMap[typeVal],
        area_py: areaPy,
        grade: gradeMap[gradeVal],
        scope,
        extra_works,
        bathroom_count
    };
}

// Edge Function 호출 + 카드 렌더 + 상태 갱신
async function calculateAndRender(payload, options = { useButtonLoading: false }) {
    const { useButtonLoading } = options;
    const currentRequestId = ++latestRequestId;

    if (useButtonLoading) {
        setLoading(true);
    }

    try {
        const res = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || '견적 계산 중 오류가 발생했습니다.');
        }

        // 최신 요청이 아닌 경우 렌더링/상태 갱신 생략
        if (currentRequestId !== latestRequestId) {
            return null;
        }

        updateEstimateCard(data);

        // 마지막 payload/estimate 상태 저장
        lastPayload = payload;
        lastEstimate = data;

        return data;
    } finally {
        if (useButtonLoading && currentRequestId === latestRequestId) {
            setLoading(false);
        }
    }
}

// 변경: 셀프 견적 정보를 sessionStorage에만 저장하고 about.html로 이동
function saveEstimateToSessionAndNavigate() {
    if (!lastPayload || !lastEstimate) {
        alert('먼저 입력값을 선택해 예상 견적을 확인해 주세요.');
        return;
    }

    const payloadToSave = lastPayload;
    const estimateToSave = lastEstimate;

    const estimateSummary = {
        basic_price: estimateToSave.basic_price,
        optional_price: estimateToSave.optional_price,
        indirect_price: estimateToSave.indirect_price,
        total_price: estimateToSave.total_price,
        min_price: estimateToSave.min_price,
        max_price: estimateToSave.max_price,
        items: estimateToSave.items || []
    };

    const payloadSummary = {
        space_type: payloadToSave.space_type,
        area_py: payloadToSave.area_py,
        grade: payloadToSave.grade,
        scope: payloadToSave.scope,
        extra_works: payloadToSave.extra_works,
        bathroom_count: payloadToSave.bathroom_count
    };

    try {
        sessionStorage.setItem(
            'builderland_estimate_latest',
            JSON.stringify({
                invoice_no: payloadToSave.invoice_no,
                payload: payloadSummary,
                estimate: estimateSummary
            })
        );
    } catch (e) {
        console.warn('sessionStorage에 셀프 견적 정보를 저장하지 못했습니다.', e);
    }

    window.location.href = 'about.html';
}

document.addEventListener('DOMContentLoaded', () => {
    // 변경: 여러 곳에서 사용하는 DOM 요소를 한 번만 조회 후 전역 변수에 캐싱
    globalInvoiceEl = document.querySelector('.estimate-card__invoice');
    const actionButton = document.querySelector('.action-cta');
    estimateRangeEl = document.querySelector('.estimate-card__range');
    estimateTableBody = document.querySelector('.estimate-table tbody');
    estimateTableFootRow = document.querySelector('.estimate-table tfoot tr');
    typeSelectEl = document.getElementById('type');
    sizeSelectEl = document.getElementById('size');
    gradeSelectEl = document.getElementById('finish-grade');
    rangeCheckboxes = document.querySelectorAll('#self-form-range input[type="checkbox"]');
    optionalCheckboxes = document.querySelectorAll('#self-form-optional input[type="checkbox"]');

    if (!globalInvoiceEl) return;

    // 변경: 면적 옵션을 15~70평으로 동적 생성 (self.html에는 placeholder만 유지)
    const sizeSelect = sizeSelectEl;
    if (sizeSelect && sizeSelect.tagName === 'SELECT') {
        sizeSelect.querySelectorAll('option:not([value=""])').forEach(o => o.remove());
        for (let p = 15; p <= 70; p += 1) {
            const opt = document.createElement('option');
            opt.value = String(p);
            opt.textContent = `${p}`;
            sizeSelect.appendChild(opt);
        }
    }

    // 인보이스 번호 생성 및 표시
    const invoiceNumber = generateInvoiceNumber();
    globalInvoiceEl.textContent = invoiceNumber;

    // 유효기간 표시
    const validEl = document.querySelector('.estimate-card__valid');
    if (validEl) {
        validEl.textContent = `${getValidUntilDate()} 까지 유효`;
    }

    if (!actionButton) return;

    // 변경: 선택 값 변경 시 자동 계산 디바운스 설정
    // 변경: 네트워크 요청 빈도를 줄이기 위해 디바운스 시간을 조금 늘려서 성능 최적화
    const autoCalc = debounce(async () => {
        const payload = buildPayload({ showAlert: false });
        if (!payload) return;
        await calculateAndRender(payload, { useButtonLoading: false });
    }, 800);

    const selects = [
        typeSelectEl,
        sizeSelectEl,
        gradeSelectEl
    ].filter(Boolean);

    selects.forEach((el) => {
        el.addEventListener('change', autoCalc);
    });

    // 변경: 선택 공사 체크박스 변경 시 자동 계산
    if (optionalCheckboxes && optionalCheckboxes.length > 0) {
        [...optionalCheckboxes].forEach((cb) => {
            cb.addEventListener('change', autoCalc);
        });
    }

    // 변경: 공사 범위 '전체' 체크박스와 개별 항목 동기화 로직 추가
    if (rangeCheckboxes && rangeCheckboxes.length > 0) {
        const rangeArray = Array.from(rangeCheckboxes);
        const allCheckbox = rangeArray.find((cb) => cb.value === 'all');
        const otherCheckboxes = rangeArray.filter((cb) => cb !== allCheckbox);

        if (allCheckbox) {
            // '전체' 선택 시 나머지 항목 일괄 선택/해제
            allCheckbox.addEventListener('change', () => {
                const shouldCheck = allCheckbox.checked;
                otherCheckboxes.forEach((cb) => {
                    cb.checked = shouldCheck;
                });
                // 전체 선택/해제 후 자동 계산
                autoCalc();
            });

            // 개별 항목 선택/해제에 따라 '전체' 상태 자동 갱신
            otherCheckboxes.forEach((cb) => {
                cb.addEventListener('change', () => {
                    if (!cb.checked) {
                        allCheckbox.checked = false;
                        autoCalc();
                        return;
                    }

                    const allChecked = otherCheckboxes.every((other) => other.checked);
                    if (allChecked && !allCheckbox.checked) {
                        allCheckbox.checked = true;
                    }

                    // 개별 항목 변경 후에도 자동 계산
                    autoCalc();
                });
            });
        }
    }

    // 변경: 버튼 클릭 시 계산은 다시 하지 않고, 현재 계산된 데이터를 세션에 저장 후 페이지 이동
    actionButton.addEventListener('click', async () => {
        // 아직 자동 계산으로 생성된 견적이 없다면 저장 불가
        if (!lastPayload || !lastEstimate) {
            alert('먼저 입력값을 선택해 예상 견적을 확인해 주세요.');
            return;
        }

        // localStorage에 인보이스 번호 저장 (기존 confirm 페이지 호환 유지)
        localStorage.setItem('builderland_invoice_latest', globalInvoiceEl.textContent);

        // 결과 카드로 스크롤
        document.querySelector('.estimate-card')?.scrollIntoView({ behavior: 'smooth' });

        // 변경: estimates 테이블에는 쓰지 않고, 세션에만 저장 후 about.html로 이동
        saveEstimateToSessionAndNavigate();
    });
});