// 예약 완료 페이지에서 sessionStorage에 저장된 예약 정보를 읽어와 화면에 표시하는 스크립트

document.addEventListener('DOMContentLoaded', () => {
    const raw = sessionStorage.getItem('reservationConfirm');

    // 저장된 예약 정보가 없으면 예약 페이지로 되돌려보냄
    if (!raw) {
        location.href = 'reservation.html';
        return;
    }

    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        console.error('예약 정보 파싱 오류:', e);
        location.href = 'reservation.html';
        return;
    }

    // 변경: 파싱된 데이터 구조 유효성 검사 후 필드 추출
    if (!data || typeof data !== 'object') {
        console.error('예약 데이터 형식이 올바르지 않습니다.');
        location.href = 'reservation.html';
        return;
    }

    const { date, time, name, phone } = data;

    const dateEl = document.getElementById('confirm-date');
    const nameEl = document.getElementById('confirm-name');
    const phoneEl = document.getElementById('confirm-phone');
    // 견적서 번호 표시용 요소 선택
    const invoiceEl = document.getElementById('confirm-invoice');

    // 변경: 필수 DOM 요소가 하나라도 없으면 예약 페이지로 이동시켜 잘못된 화면 노출 방지
    if (!dateEl || !nameEl || !phoneEl || !invoiceEl) {
        console.error('예약 정보 표시용 요소가 없습니다.');
        location.href = 'reservation.html';
        return;
    }

    // 날짜와 시간을 한글 형식으로 변환
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

    // 변경: 날짜/시간 문자열 유효성을 검증하여 예외 상황에서도 화면이 깨지지 않도록 처리
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
        console.error('예약 날짜가 올바르지 않습니다:', date);
        location.href = 'reservation.html';
        return;
    }

    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = weekdays[d.getDay()];

    // time 예: "11:00", "14:00", "16:00"
    let formattedTime = time;
    if (typeof time === 'string' && time.includes(':')) {
        const [hourStr, minuteStr] = time.split(':');
        const hourNum = Number(hourStr);
        if (!Number.isNaN(hourNum)) {
            const isMorning = hourNum < 12;
            const displayHour = hourNum > 12 ? hourNum - 12 : hourNum;
            formattedTime = `${isMorning ? '오전' : '오후'} ${displayHour}:${minuteStr}`;
        }
    }

    const formattedDateTime = `${year}년 ${month}월 ${day}일 ${weekday}요일 ${formattedTime}`;

    // DOM에 값 주입
    dateEl.textContent = formattedDateTime;
    nameEl.textContent = name;
    phoneEl.textContent = phone;

    // self 페이지에서 저장한 인보이스/견적 정보를 sessionStorage에서 우선 불러와 사용
    let invoiceText = '견적서 번호 없음';

    try {
        const rawEstimate = sessionStorage.getItem('builderland_estimate_latest');
        if (rawEstimate) {
            const parsed = JSON.parse(rawEstimate);
            // 변경: 파싱 결과의 타입을 한 번 더 확인하여 방어적으로 접근
            if (parsed && typeof parsed === 'object' && typeof parsed.invoice_no === 'string' && parsed.invoice_no) {
                invoiceText = parsed.invoice_no;
            }
        }
    } catch (e) {
        console.warn('sessionStorage 견적 정보 파싱 오류:', e);
    }

    // sessionStorage에 없을 때는 기존 localStorage 값을 그대로 사용하는 폴백
    if (invoiceText === '견적서 번호 없음') {
        const latestInvoice = localStorage.getItem('builderland_invoice_latest');
        if (latestInvoice) {
            invoiceText = latestInvoice;
        }
    }

    invoiceEl.textContent = invoiceText;
});