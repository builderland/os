/**
 * 변경: 견적서 업로드 2단계 — Supabase Storage·DB 연동, 3패널(폼/연락처/완료)
 */
import { supabase } from "./supabase-config.js";

const MAX_BYTES = 20 * 1024 * 1024;
const PYEONG_TO_SQM = 3.305785;
const STORAGE_BUCKET = "uploads";
const TABLE_UPLOAD_REQUESTS = "upload_requests";
const PHONE_REGEX = /^01\d{9}$/;

const fileInput = document.getElementById("estimate-file-input");
const btnSelect = document.getElementById("btn-estimate-select");
const btnCta = document.getElementById("btn-estimate-cta");
const fileError = document.getElementById("estimate-file-error");
const sheet = document.getElementById("estimate-sheet");
const overlay = document.getElementById("estimate-sheet-overlay");
const stepForm = document.getElementById("estimate-sheet-form");
const stepPhone = document.getElementById("estimate-sheet-phone");
const stepDone = document.getElementById("estimate-sheet-done");
const btnFileRemove = document.getElementById("btn-estimate-file-remove");
const fileNameEl = document.getElementById("estimate-file-name");
const fileDetailEl = document.getElementById("estimate-file-detail");
const areaPyeongEl = document.getElementById("estimate-area-pyeong");
const areaSqmEl = document.getElementById("estimate-area-sqm");
const areaSlider = document.getElementById("estimate-area-slider");
const btnUpload = document.getElementById("btn-estimate-upload");
const uploadError = document.getElementById("estimate-upload-error");
const phoneInput = document.getElementById("estimate-phone-input");
// 변경: 개인정보 동의 체크박스
const phoneConsent = document.getElementById("estimate-phone-consent");
const phoneError = document.getElementById("estimate-phone-error");
const btnPhoneSubmit = document.getElementById("btn-estimate-phone-submit");
const btnDone = document.getElementById("btn-estimate-done");
const areaChips = document.querySelectorAll(".estimate-area-chip");

if (!fileInput || !btnSelect || !sheet) {
    throw new Error("[estimate-upload] 필수 DOM 요소를 찾을 수 없습니다.");
}

/** @type {File | null} */
let selectedFile = null;
let areaPyeong = 0;
let lockedScrollY = 0;
/** @type {string | null} */
let uploadRequestId = null;
/** @type {'idle' | 'uploaded' | 'submitted'} */
let requestStatus = "idle";
let isUploading = false;
let isPhoneSubmitting = false;

function isAllowedFile(file) {
    if (!file) return false;
    const okType =
        file.type.startsWith("image/") || file.type === "application/pdf";
    const okSize = file.size <= MAX_BYTES;
    return okType && okSize;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + "B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
    return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}

function getFileTypeLabel(file) {
    if (file.type === "application/pdf") return "PDF";
    if (file.type === "image/jpeg") return "JPG";
    if (file.type === "image/png") return "PNG";
    if (file.type === "image/webp") return "WEBP";
    if (file.type.startsWith("image/")) {
        const sub = file.type.split("/")[1];
        return sub ? sub.toUpperCase() : "IMAGE";
    }
    return "FILE";
}

function showInlineError(el, message) {
    if (!el) return;
    if (message) {
        el.textContent = message;
        el.hidden = false;
    } else {
        el.textContent = "";
        el.hidden = true;
    }
}

function showFileError(message) {
    showInlineError(fileError, message);
}

function lockScroll() {
    lockedScrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = "-" + lockedScrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.overflow = "hidden";
}

function unlockScroll() {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.overflow = "";
    window.scrollTo(0, lockedScrollY);
}

function canSubmitUpload() {
    return Boolean(selectedFile) && areaPyeong > 0 && !isUploading;
}

function setSubmitButtonState(btn, enabled, loadingLabel, defaultLabel) {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.setAttribute("aria-disabled", enabled ? "false" : "true");
    btn.classList.toggle("is-disabled", !enabled);
    if (loadingLabel && btn.dataset.defaultLabel === undefined) {
        btn.dataset.defaultLabel = defaultLabel || btn.textContent;
    }
    if (loadingLabel) {
        btn.textContent = loadingLabel;
        btn.classList.add("is-loading");
    } else if (btn.dataset.defaultLabel) {
        btn.textContent = btn.dataset.defaultLabel;
        btn.classList.remove("is-loading");
    }
}

function updateUploadButtonState() {
    const enabled = canSubmitUpload();
    setSubmitButtonState(btnUpload, enabled, null, "견적서 업로드");
}

function updatePhoneButtonState() {
    if (!btnPhoneSubmit || !phoneInput) return;
    const digits = phoneInput.value.replace(/\D/g, "");
    const consentChecked = phoneConsent ? phoneConsent.checked : false;
    const enabled =
        PHONE_REGEX.test(digits) && consentChecked && !isPhoneSubmitting;
    setSubmitButtonState(
        btnPhoneSubmit,
        enabled,
        isPhoneSubmitting ? "제출 중…" : null,
        "분석 결과 알림 받기"
    );
}

function updateAreaDisplay() {
    const sqm = (areaPyeong * PYEONG_TO_SQM).toFixed(1);
    if (areaPyeongEl) areaPyeongEl.textContent = String(areaPyeong);
    if (areaSqmEl) areaSqmEl.textContent = "(" + sqm + "m²)";
    if (areaSlider) areaSlider.value = String(areaPyeong);
    updateUploadButtonState();
}

function renderFileCard() {
    if (!selectedFile) return;
    if (fileNameEl) fileNameEl.textContent = selectedFile.name;
    if (fileDetailEl) {
        fileDetailEl.textContent =
            getFileTypeLabel(selectedFile) +
            " / " +
            formatFileSize(selectedFile.size);
    }
}

function showStep(step) {
    const steps = [
        { el: stepForm, name: "form" },
        { el: stepPhone, name: "phone" },
        { el: stepDone, name: "done" },
    ];
    steps.forEach(function (item) {
        if (!item.el) return;
        const active = item.name === step;
        item.el.hidden = !active;
    });
    sheet.dataset.activeStep = step;
}

function openBottomSheet() {
    sheet.hidden = false;
    sheet.setAttribute("aria-hidden", "false");
    sheet.classList.add("is-open");
    lockScroll();
    // 변경: 바텀시트 열림 시 채널톡 플로팅 버튼 숨김
    if (typeof window.updateChannelButtonVisibility === "function") {
        window.updateChannelButtonVisibility();
    } else if (typeof window.ChannelIO === "function") {
        window.ChannelIO("hideChannelButton");
    }
    if (overlay) overlay.focus();
}

function closeBottomSheet() {
    if (isUploading) return;
    sheet.classList.remove("is-open");
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
    unlockScroll();
    // 변경: 바텀시트 닫힘 시 스크롤 위치에 따라 채널톡 버튼 복원
    if (typeof window.updateChannelButtonVisibility === "function") {
        window.updateChannelButtonVisibility();
    }
}

function resetSessionState() {
    selectedFile = null;
    areaPyeong = 0;
    uploadRequestId = null;
    requestStatus = "idle";
    isUploading = false;
    isPhoneSubmitting = false;
    fileInput.value = "";
    showFileError("");
    showInlineError(uploadError, "");
    showInlineError(phoneError, "");
    if (phoneInput) phoneInput.value = "";
    if (phoneConsent) phoneConsent.checked = false;
    showStep("form");
    updateAreaDisplay();
    updatePhoneButtonState();
    setSubmitButtonState(btnUpload, false, null, "견적서 업로드");
}

function resetToInitialState() {
    resetSessionState();
    closeBottomSheet();
}

function sanitizeFileName(name) {
    const dot = name.lastIndexOf(".");
    const rawExt = dot >= 0 ? name.slice(dot + 1) : "";
    // 변경: Storage 키는 ASCII만 허용 — 한글 등 비ASCII 파일명은 InvalidKey(400) 발생
    const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "");
    const safeExt = ext ? "." + ext : "";
    const token =
        typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID().slice(0, 8)
            : String(Date.now());
    return "file-" + token + safeExt;
}

function createStoragePath(file) {
    const id =
        typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()) + "-" + Math.random().toString(36).slice(2);
    return id + "/" + sanitizeFileName(file.name);
}

function showFormStep() {
    showStep("form");
    updateAreaDisplay();
    updateUploadButtonState();
}

function showPhoneStep() {
    showStep("phone");
    showInlineError(phoneError, "");
    updatePhoneButtonState();
    if (phoneInput) phoneInput.focus();
}

function showDoneStep() {
    showStep("done");
}

function openEstimateFlow() {
    showFileError("");
    if (requestStatus === "submitted") {
        showDoneStep();
        openBottomSheet();
        return;
    }
    if (requestStatus === "uploaded") {
        showPhoneStep();
        openBottomSheet();
        return;
    }
    if (selectedFile) {
        renderFileCard();
        showFormStep();
        openBottomSheet();
        return;
    }
    fileInput.click();
}

function onSelectButtonClick() {
    openEstimateFlow();
}

function onFileInputChange() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (!isAllowedFile(file)) {
        fileInput.value = "";
        if (file.size > MAX_BYTES) {
            showFileError("파일 크기는 최대 20MB까지 업로드할 수 있습니다.");
        } else {
            showFileError("사진 또는 PDF 파일만 선택할 수 있습니다.");
        }
        return;
    }

    showFileError("");
    selectedFile = file;
    requestStatus = "idle";
    uploadRequestId = null;
    renderFileCard();
    showFormStep();
    openBottomSheet();
}

function onFileRemoveClick() {
    if (requestStatus !== "idle") return;
    resetToInitialState();
}

function onOverlayClick() {
    closeBottomSheet();
}

function onAreaSliderInput() {
    areaPyeong = parseInt(areaSlider.value, 10) || 0;
    updateAreaDisplay();
}

function onAreaChipClick(e) {
    const chip = e.currentTarget;
    const val = parseInt(chip.getAttribute("data-pyeong"), 10);
    if (isNaN(val)) return;
    areaPyeong = val;
    updateAreaDisplay();
}

function onPhoneInput() {
    if (!phoneInput) return;
    phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 11);
    showInlineError(phoneError, "");
    updatePhoneButtonState();
}

function onPhoneConsentChange() {
    showInlineError(phoneError, "");
    updatePhoneButtonState();
}

async function submitEstimate() {
    if (!canSubmitUpload() || !selectedFile) return;

    isUploading = true;
    showInlineError(uploadError, "");
    setSubmitButtonState(btnUpload, false, "업로드 중…", "견적서 업로드");

    const storagePath = createStoragePath(selectedFile);

    try {
        const { error: storageError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, selectedFile, {
                cacheControl: "3600",
                upsert: false,
                contentType: selectedFile.type || undefined,
            });

        if (storageError) {
            throw storageError;
        }

        // 변경: anon에는 SELECT 정책 없음 — .select() 시 RLS 401. id는 클라이언트에서 생성
        const requestId = crypto.randomUUID();
        const { error: insertError } = await supabase
            .from(TABLE_UPLOAD_REQUESTS)
            .insert({
                id: requestId,
                file_path: storagePath,
                file_name: selectedFile.name,
                area_py: areaPyeong,
                phone: null,
                status: "uploaded",
            });

        if (insertError) {
            await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
            throw insertError;
        }

        uploadRequestId = requestId;
        requestStatus = "uploaded";
        showPhoneStep();
    } catch (err) {
        console.error("[estimate-upload] 업로드 실패", err);
        showInlineError(
            uploadError,
            "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요."
        );
    } finally {
        isUploading = false;
        updateUploadButtonState();
    }
}

async function onPhoneSubmit() {
    if (!phoneInput || !uploadRequestId || requestStatus !== "uploaded") return;

    const phone = phoneInput.value.replace(/\D/g, "");
    if (phoneConsent && !phoneConsent.checked) {
        showInlineError(
            phoneError,
            "개인정보 수집 및 이용에 동의해 주세요."
        );
        updatePhoneButtonState();
        return;
    }
    if (!PHONE_REGEX.test(phone)) {
        showInlineError(phoneError, "연락처를 정확히 입력해 주세요.");
        updatePhoneButtonState();
        return;
    }

    isPhoneSubmitting = true;
    showInlineError(phoneError, "");
    updatePhoneButtonState();

    try {
        // 변경: UPDATE는 SELECT RLS 없으면 0행 갱신·204만 반환 — .select('id')로 실제 반영 검증
        const { data, error } = await supabase
            .from(TABLE_UPLOAD_REQUESTS)
            .update({
                phone: phone,
                status: "submitted",
            })
            .eq("id", uploadRequestId)
            .select("id")
            .maybeSingle();

        if (error) {
            throw error;
        }
        if (!data) {
            throw new Error("upload_requests update matched no rows");
        }

        requestStatus = "submitted";
        showDoneStep();
    } catch (err) {
        console.error("[estimate-upload] 연락처 저장 실패", err);
        showInlineError(
            phoneError,
            "제출에 실패했습니다. 잠시 후 다시 시도해 주세요."
        );
    } finally {
        isPhoneSubmitting = false;
        updatePhoneButtonState();
    }
}

function onDoneConfirm() {
    resetToInitialState();
}

function onKeyDown(e) {
    if (e.key !== "Escape") return;
    if (sheet.hidden || !sheet.classList.contains("is-open")) return;
    closeBottomSheet();
}

btnSelect.addEventListener("click", onSelectButtonClick);
if (btnCta) btnCta.addEventListener("click", onSelectButtonClick);
fileInput.addEventListener("change", onFileInputChange);
if (btnFileRemove) btnFileRemove.addEventListener("click", onFileRemoveClick);
if (overlay) overlay.addEventListener("click", onOverlayClick);
if (areaSlider) areaSlider.addEventListener("input", onAreaSliderInput);
if (btnUpload) btnUpload.addEventListener("click", submitEstimate);
if (phoneInput) phoneInput.addEventListener("input", onPhoneInput);
if (phoneConsent) phoneConsent.addEventListener("change", onPhoneConsentChange);
if (btnPhoneSubmit) btnPhoneSubmit.addEventListener("click", onPhoneSubmit);
if (btnDone) btnDone.addEventListener("click", onDoneConfirm);
document.addEventListener("keydown", onKeyDown);

areaChips.forEach(function (chip) {
    chip.addEventListener("click", onAreaChipClick);
});

updateAreaDisplay();
