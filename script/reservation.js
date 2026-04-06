// Supabase 연동을 위해 설정 파일을 import
import { supabase } from './supabase-config.js';

// 변경: 자주 사용하는 DOM 요소를 상단에서 한 번만 조회해 캐싱
const dateInput = document.getElementById('date');
const yearMonthDisplay = document.getElementById('current-year-month');
const calendarGrid = document.getElementById('calendar-grid');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

// 초기 시작 날짜를 현재 날짜로 설정
let simulatedToday = new Date();
simulatedToday.setHours(0, 0, 0, 0); // 시간 비교를 정확히 하기 위해 0시로 초기화
let viewDate = new Date(simulatedToday.getFullYear(), simulatedToday.getMonth(), 1);
let selectedDate = null; // 초기 선택된 날짜 없음
// 시간 선택 상태를 저장하기 위한 변수
let selectedTime = null;

// 변경: 특정 날짜의 예약 시간 조회를 캐싱하여 동일 날짜 재조회 시 네트워크 호출 최소화
let lastLoadedDate = null;
let lastReservedTimes = null;

// 변경: 시공 희망 착공일 — input[type=date], 모바일·데스크톱 브라우저 기본 픽커
const constructionStartDateInput = document.getElementById('construction-start-date');
const constructionAreaInput = document.getElementById('construction-area');
const constructionDateHitbox = document.querySelector('.reservation-construction__date-hitbox');

/** 변경: 착공일 min=오늘(과거 날짜 선택 불가, 기존 커스텀 달력과 동일 정책) */
function initConstructionDateInput() {
    if (!constructionStartDateInput) return;
    const y = simulatedToday.getFullYear();
    const m = String(simulatedToday.getMonth() + 1).padStart(2, '0');
    const d = String(simulatedToday.getDate()).padStart(2, '0');
    constructionStartDateInput.min = `${y}-${m}-${d}`;

    // 변경: 아이콘뿐 아니라 입력 칸 전체 클릭 시 네이티브 날짜 픽커 열기(showPicker + 모바일 대응)
    const openNativeDatePicker = () => {
        const el = constructionStartDateInput;
        if (typeof el.showPicker === 'function') {
            try {
                el.showPicker();
            } catch {
                el.focus();
            }
        } else {
            el.focus();
        }
    };

    if (constructionDateHitbox) {
        constructionDateHitbox.addEventListener('click', () => {
            openNativeDatePicker();
        });
    }
}

function updateInput() {
    if (selectedDate) {
        const y = selectedDate.getFullYear();
        const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const d = String(selectedDate.getDate()).padStart(2, '0');
        dateInput.value = `${y}-${m}-${d}`;
    }
}

function renderCalendar() {
    // 요일 유지하고 날짜만 비우기
    const weekdays = calendarGrid.querySelectorAll('.weekday');
    calendarGrid.innerHTML = '';
    weekdays.forEach(el => calendarGrid.appendChild(el));

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const displayMonth = String(month + 1).padStart(2, '0');
    yearMonthDisplay.textContent = `${year}-${displayMonth}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    // 빈 칸 채우기 
    for (let x = 0; x < firstDayIndex; x++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'date-cell empty';
        calendarGrid.appendChild(emptyCell);
    }

    // 날짜 채우기
    for (let i = 1; i <= lastDate; i++) {
        const cellDate = new Date(year, month, i);
        const cell = document.createElement('div');
        cell.className = 'date-cell';

        const dateNumber = document.createElement('div');
        dateNumber.className = 'date-number';
        dateNumber.textContent = i;
        cell.appendChild(dateNumber);

        // 과거 날짜 비활성화 (오늘보다 이전)
        if (cellDate < simulatedToday) {
            cell.classList.add('past');
        }

        // 오늘 날짜 표시
        if (cellDate.getTime() === simulatedToday.getTime()) {
            cell.classList.add('today');
        }

        // 선택된 날짜 표시
        if (selectedDate && cellDate.getTime() === selectedDate.getTime()) {
            cell.classList.add('selected');
        }

        // 날짜 클릭 이벤트 (date-number에서만 선택)
        dateNumber.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!cell.classList.contains('past') && cellDate >= simulatedToday) {
                selectedDate = new Date(year, month, i);
                updateInput();
                renderCalendar();
                // 날짜 선택 시 모든 시간 버튼을 우선 활성화하고, 해당 날짜의 예약된 시간을 다시 불러와 비활성화 처리
                const currentDateValue = dateInput.value;
                timeButtons.forEach((button) => {
                    button.disabled = false;
                    button.classList.remove('is-active');
                });
                await loadReservedTimesForDate(currentDateValue);
            }
        });

        calendarGrid.appendChild(cell);
    }

    // 해당 달에 필요한 주 수만큼만 행 구성 (5주 또는 6주)
    const totalDateCells = firstDayIndex + lastDate;
    const totalCellsForMonth = Math.ceil(totalDateCells / 7) * 7;
    const remainingCells = totalCellsForMonth - totalDateCells;

    for (let y = 0; y < remainingCells; y++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'date-cell empty';
        calendarGrid.appendChild(emptyCell);
    }

    // 이전 달 이동 버튼 비활성화 처리 (현재 달일 때만 비활성화)
    if (prevMonthBtn) {
        if (viewDate.getFullYear() === simulatedToday.getFullYear() && viewDate.getMonth() === simulatedToday.getMonth()) {
            prevMonthBtn.disabled = true;
        } else {
            prevMonthBtn.disabled = false;
        }
    }
}

// 변경: 이전/다음 달 이동 버튼도 캐싱된 요소를 사용하여 DOM 탐색 최소화
if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
        if (prevMonthBtn.disabled) return;
        viewDate.setMonth(viewDate.getMonth() - 1);
        renderCalendar();
    });
}

if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
        viewDate.setMonth(viewDate.getMonth() + 1);
        renderCalendar();
    });
}

// 시간 선택 버튼 클릭 시 선택 상태 및 selectedTime을 관리하는 로직
const timeButtons = document.querySelectorAll('.time-group button[data-time]');

// 날짜가 선택되기 전에는 시간 버튼을 비활성화하기 위한 초기 설정
timeButtons.forEach((button) => {
    button.disabled = true;
});

timeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        // 비활성화된 버튼은 클릭 이벤트를 무시
        if (button.disabled) return;

        timeButtons.forEach((btn) => btn.classList.remove('is-active'));
        button.classList.add('is-active');
        selectedTime = button.dataset.time;
    });
});

// 예약하기 버튼 클릭 시 Supabase에 예약 데이터를 insert하는 로직
const reserveButton = document.querySelector('.action-cta');
const nameInput = document.querySelector('input[name="name"]');
const phoneInput = document.querySelector('input[name="phone"]');

// 선택된 날짜의 예약된 시간을 Supabase에서 조회하고 시간 버튼을 비활성화하는 함수
async function loadReservedTimesForDate(date) {
    if (!date) return;

    // 변경: 같은 날짜를 다시 선택할 경우 캐싱된 결과를 재사용하여 불필요한 네트워크 호출 방지
    if (lastLoadedDate === date && lastReservedTimes) {
        timeButtons.forEach((button) => {
            const buttonTime = button.dataset.time;
            const isReserved = lastReservedTimes.has(buttonTime);
            button.disabled = isReserved;
            if (isReserved) {
                button.classList.remove('is-active');
                if (selectedTime === buttonTime) {
                    selectedTime = null;
                }
            }
        });
        return;
    }

    try {
        const { data, error } = await supabase
            .from('reservations')
            .select('time')
            .eq('date', date);

        if (error) {
            console.error('예약 시간 조회 오류:', error);
            return;
        }

        const reservedTimes = new Set((data || []).map((row) => row.time));

        // 변경: 조회한 예약 시간을 전역 변수에 저장하여 동일 날짜 재조회 시 재사용
        lastLoadedDate = date;
        lastReservedTimes = reservedTimes;

        timeButtons.forEach((button) => {
            const buttonTime = button.dataset.time;
            if (reservedTimes.has(buttonTime)) {
                button.disabled = true;
                button.classList.remove('is-active');
                if (selectedTime === buttonTime) {
                    selectedTime = null;
                }
            }
        });
    } catch (err) {
        console.error('예약 시간 조회 예외:', err);
    }
}

// 변경: 예약 중복 요청을 막기 위한 상태 플래그
let isReserving = false;

if (reserveButton) {
    reserveButton.addEventListener('click', async (event) => {
        event.preventDefault();

        // 변경: 이미 예약 요청이 진행 중이면 추가 클릭을 무시하여 중복 요청 방지
        if (isReserving) return;

        const date = dateInput.value;
        const time = selectedTime;
        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        // 변경: 시공 위치·착공일 필수 검증
        const construction_area = constructionAreaInput ? constructionAreaInput.value.trim() : '';
        const construction_start_date = constructionStartDateInput
            ? constructionStartDateInput.value.trim()
            : '';

        if (!construction_area) {
            alert('시공 희망 지역을 입력해 주세요.');
            return;
        }
        if (!construction_start_date) {
            alert('시공 희망 착공일을 선택해 주세요.');
            return;
        }

        if (!date) {
            alert('날짜를 선택해 주세요.');
            return;
        }

        if (!time) {
            alert('시간을 선택해 주세요.');
            return;
        }

        if (!name) {
            alert('이름을 입력해 주세요.');
            return;
        }

        if (!phone) {
            alert('연락처를 입력해 주세요.');
            return;
        }

        // 변경: self.html에서 세션에 저장한 셀프 견적 정보에서 invoice_no와 total_price를 함께 사용
        let invoice_no = null;
        let total_price = null;
        try {
            const rawEstimateForReservation = sessionStorage.getItem('builderland_estimate_latest');
            if (rawEstimateForReservation) {
                const parsedForReservation = JSON.parse(rawEstimateForReservation);
                invoice_no = parsedForReservation.invoice_no || null;
                const estimateForReservation = parsedForReservation.estimate || {};
                total_price = estimateForReservation.total_price ?? null;
            }
        } catch (e) {
            console.error('예약용 셀프 견적 세션 파싱 오류:', e);
        }

        try {
            // 변경: 예약 요청 시작 시 버튼을 비활성화하여 사용자가 연속 클릭하지 않도록 처리
            isReserving = true;
            reserveButton.disabled = true;

            // Supabase reservations 테이블에 예약 데이터를 저장 (테이블명이 다를 경우 아래 from 인자를 수정하세요)
            // 변경: 시공 지역·착공일 컬럼이 Supabase reservations 테이블에 있어야 함
            const { data, error } = await supabase
                .from('reservations')
                .insert([
                    {
                        date,
                        time,
                        name,
                        phone,
                        invoice_no,
                        total_price,
                        construction_area,
                        construction_start_date,
                    },
                ]);

            if (error) {
                console.error('예약 저장 오류:', error);
                alert('예약 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
                return;
            }

            // 변경: self.html에서 세션에 저장한 셀프 견적 정보를 estimates 테이블에 기록
            try {
                const rawEstimate = sessionStorage.getItem('builderland_estimate_latest');
                if (rawEstimate) {
                    const parsed = JSON.parse(rawEstimate);
                    const invoice_no = parsed.invoice_no;
                    const payload = parsed.payload || {};
                    const estimate = parsed.estimate || {};

                    if (invoice_no && payload.space_type && payload.area_py && payload.grade) {
                        const { error: estimatesError } = await supabase
                            .from('estimates')
                            .insert({
                                invoice_no,
                                space_type: payload.space_type,
                                area_py: payload.area_py,
                                grade: payload.grade,
                                scope: payload.scope || [],
                                extra_works: payload.extra_works || [],
                                bathroom_count: payload.bathroom_count || 1,
                                basic_price: estimate.basic_price,
                                optional_price: estimate.optional_price,
                                indirect_price: estimate.indirect_price,
                                total_price: estimate.total_price,
                                min_price: estimate.min_price,
                                max_price: estimate.max_price,
                            });

                        if (estimatesError) {
                            console.error('셀프 견적 estimates 저장 오류:', estimatesError);
                        }
                    }
                }
            } catch (e) {
                console.error('셀프 견적 estimates 저장 처리 중 예외:', e);
            }

            alert('예약이 완료되었습니다.');
            // 예약 완료 페이지에서 사용할 예약 정보를 sessionStorage에 저장
            const reservationConfirmData = {
                date,   // YYYY-MM-DD 형식
                time,   // 11:00 / 14:00 / 16:00 등
                name,
                phone,
                construction_area,
                construction_start_date,
            };
            sessionStorage.setItem('reservationConfirm', JSON.stringify(reservationConfirmData));
            // 예약 완료 후 확인 페이지로 이동
            location.href = 'confirm.html';
        } catch (err) {
            console.error('예약 요청 예외:', err);
            alert('예약 처리 중 알 수 없는 오류가 발생했습니다.');
        } finally {
            // 변경: 정상/오류와 관계없이 예약 처리 종료 후 버튼 상태 및 플래그를 원복
            isReserving = false;
            reserveButton.disabled = false;
        }
    });
}

// 초기 화면 렌더링
updateInput();
renderCalendar();
// 변경: 착공일 native date 입력 min 속성
initConstructionDateInput();