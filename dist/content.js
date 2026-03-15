"use strict";
let extensionEnabled = true;
let badge = null;
let inFlightQuestionHTML = null;
let lastQuestionHTML = "";
let lastRequestAt = 0;
let lastAskedQuestionKey = "";
let currentlyUpdating = false;
chrome.storage.local.get(["extensionEnabled"], (result) => {
    if (result.extensionEnabled !== undefined) {
        extensionEnabled = Boolean(result.extensionEnabled);
    }
});
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.extensionEnabled) {
        extensionEnabled = Boolean(changes.extensionEnabled.newValue);
    }
});
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let lastBadgeText = "";
function setBadge(text, color) {
    if (badge && lastBadgeText !== text) {
        lastBadgeText = text;
        badge.textContent = `status: ${text}`;
        badge.style.color = color;
    }
}
function log(message) {
    console.log(`[bendi] ${message}`);
}
function clickButtonText(candidates) {
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const candidate of candidates) {
        const needle = candidate.trim().toLowerCase();
        if (!needle)
            continue;
        const match = buttons.find((button) => {
            var _a;
            const text = ((_a = button.textContent) !== null && _a !== void 0 ? _a : "").trim().toLowerCase();
            const disabled = button.disabled || button.getAttribute("aria-disabled") === "true";
            return !disabled && text.includes(needle);
        });
        if (match) {
            match.click();
            return true;
        }
    }
    return false;
}
function getQuestionKey(questionNode) {
    var _a, _b, _c;
    const labeledRegion = questionNode.querySelector('[role="region"][aria-label]');
    const ariaLabel = (_a = labeledRegion === null || labeledRegion === void 0 ? void 0 : labeledRegion.getAttribute("aria-label")) === null || _a === void 0 ? void 0 : _a.trim();
    if (ariaLabel)
        return ariaLabel;
    const questionText = (_c = (_b = questionNode.querySelector("x-ck12-question_text")) === null || _b === void 0 ? void 0 : _b.textContent) === null || _c === void 0 ? void 0 : _c.trim();
    if (questionText)
        return questionText;
    return "";
}
function cycleProgressionButtons() {
    if (clickButtonText(["Very confident"]))
        return "progressed";
    if (clickButtonText(["Done"]))
        return "progressed";
    if (clickButtonText(["Check It", "Submit", "Turn In"]))
        return "progressed";
    if (clickButtonText(["Try Again"]))
        return "retry";
    if (clickButtonText(["Next", "Continue", "Got It"]))
        return "progressed";
    return "none";
}
function handleProgressionButtons() {
    const progression = cycleProgressionButtons();
    if (progression === "retry") {
        lastAskedQuestionKey = "";
    }
    return progression !== "none";
}
async function executeAnswer(response) {
    var _a;
    if (response.error)
        return;
    if (response.action === "click" && response.targets) {
        for (const target of response.targets) {
            const el = document.querySelector(`[data-dx-elementinfo="${target}"]`);
            if (el) {
                el.click();
            }
            else {
                log(`target not found for click: ${target}`);
            }
        }
    }
    else if (response.action === "type" && response.responses) {
        for (const { target, value } of response.responses) {
            const input = document.querySelector(`input[data-dx-elementinfo="${target}"], textarea[data-dx-elementinfo="${target}"]`);
            if (input) {
                const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                const setter = (_a = Object.getOwnPropertyDescriptor(proto, "value")) === null || _a === void 0 ? void 0 : _a.set;
                if (setter) {
                    setter.call(input, value);
                }
                else {
                    input.value = value;
                }
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
    }
}
function proceedToAssessment() {
    var _a;
    if (!extensionEnabled) {
        setBadge("disabled", "#64748b");
        return;
    }
    let completionPercent = document.querySelector(".ScoreChartComponent__psign");
    if (completionPercent) {
        const text = (_a = completionPercent.textContent) !== null && _a !== void 0 ? _a : "";
        const percent = parseInt(text.replace("%", "").trim());
        if (percent >= 100) {
            const buttons = Array.from(document.querySelectorAll("button"));
            const match = buttons.find((button) => {
                var _a;
                const text = ((_a = button.textContent) !== null && _a !== void 0 ? _a : "").trim().toLowerCase();
                return text.includes("turn in") && !text.includes("again");
            });
            if (match)
                match.click();
            setBadge("redirecting", "oklch(0.84 0.24 148)");
            return;
        }
        else {
            setBadge("idle", "#94a3b8");
        }
    }
    else {
        setBadge("running", "oklch(0.84 0.24 148)");
    }
    let startPracticeButton = document.querySelector('[data-dx-desc="start_practice_button"]');
    let keepPracticingButton = document.querySelector('[data-dx-desc="Keep practicing"]');
    if (startPracticeButton) {
        startPracticeButton.click();
    }
    else if (keepPracticingButton) {
        keepPracticingButton.click();
    }
    else {
        log("no buttons found");
    }
}
async function updateQuestionNode() {
    var _a, _b, _c;
    if (!extensionEnabled) {
        setBadge("disabled", "#64748b");
        return;
    }
    if (currentlyUpdating)
        return;
    currentlyUpdating = true;
    try {
        let thisQuestionNode = document.querySelector(".question_Container");
        if (handleProgressionButtons())
            return;
        if (!thisQuestionNode) {
            if (lastBadgeText !== "answering") {
                setBadge("waiting", "#94a3b8");
            }
            return;
        }
        const thisQuestionHTML = thisQuestionNode.outerHTML;
        const thisQuestionKey = getQuestionKey(thisQuestionNode) || thisQuestionHTML;
        const hasQuestionText = thisQuestionHTML.includes("x-ck12-question_text");
        if (!hasQuestionText) {
            if (lastBadgeText !== "answering") {
                setBadge("waiting", "#94a3b8");
            }
            return;
        }
        if (thisQuestionKey === lastAskedQuestionKey)
            return;
        if (inFlightQuestionHTML)
            return;
        const now = Date.now();
        const didQuestionChange = thisQuestionHTML === lastQuestionHTML;
        const cooldownActive = didQuestionChange && now - lastRequestAt < 67;
        if (cooldownActive)
            return;
        inFlightQuestionHTML = thisQuestionHTML;
        lastQuestionHTML = thisQuestionHTML;
        lastRequestAt = now;
        log("question request started");
        setBadge("thinking", "#d8b4fe");
        console.log(thisQuestionNode.cloneNode(true));
        let base64 = null;
        if (!!thisQuestionNode.querySelector("img")) {
            const externalImageDataUrls = new Map();
            const questionImages = Array.from(thisQuestionNode.querySelectorAll("img"));
            await Promise.all(questionImages.map(async (image) => {
                var _a;
                const rawSrc = image.currentSrc || image.src || "";
                if (!rawSrc)
                    return;
                let normalizedSrc = rawSrc;
                try {
                    const srcUrl = new URL(rawSrc, window.location.href);
                    normalizedSrc = srcUrl.href;
                    if (srcUrl.origin === window.location.origin)
                        return;
                }
                catch (_b) {
                    return;
                }
                const fetchResult = await chrome.runtime.sendMessage({
                    type: "fetch-image",
                    url: normalizedSrc
                });
                if (fetchResult.success && fetchResult.dataUrl) {
                    externalImageDataUrls.set(normalizedSrc, fetchResult.dataUrl);
                }
                else {
                    log(`image data fetch failed: ${normalizedSrc} (${(_a = fetchResult.error) !== null && _a !== void 0 ? _a : "unknown"})`);
                }
            }));
            try {
                const canvas = await html2canvas(thisQuestionNode, {
                    backgroundColor: null,
                    useCORS: false,
                    allowTaint: false,
                    logging: false,
                    scale: 1,
                    imageTimeout: 670,
                    ignoreElements: (element) => {
                        const tagName = element.tagName;
                        if (tagName === "SCRIPT" || tagName === "IFRAME")
                            return true;
                        if (tagName === "IMG") {
                            const src = element.currentSrc || element.src || "";
                            if (!src)
                                return false;
                            try {
                                const srcUrl = new URL(src, window.location.href);
                                return srcUrl.origin !== window.location.origin && !externalImageDataUrls.has(srcUrl.href);
                            }
                            catch (_a) {
                                return false;
                            }
                        }
                        return false;
                    },
                    onclone: (clonedDocument) => {
                        clonedDocument.querySelectorAll("script, iframe").forEach((node) => node.remove());
                        const clonedImages = clonedDocument.querySelectorAll(".question_Container img");
                        clonedImages.forEach((image) => {
                            const src = image.currentSrc || image.src || "";
                            if (!src)
                                return;
                            try {
                                const srcUrl = new URL(src, window.location.href);
                                const dataUrl = externalImageDataUrls.get(srcUrl.href);
                                if (dataUrl) {
                                    image.src = dataUrl;
                                    image.removeAttribute("srcset");
                                }
                            }
                            catch (_a) {
                                return;
                            }
                        });
                    }
                });
                base64 = canvas.toDataURL("image/png");
                log("question screenshot captured");
                console.log(base64);
            }
            catch (err) {
                log(`html2canvas capture failed: ${err}`);
            }
        }
        const res = await chrome.runtime.sendMessage({
            type: "answer",
            questionHTML: thisQuestionHTML,
            screenshotBase64: base64
        });
        const currentQuestionHTML = (_b = (_a = document.querySelector(".question_Container")) === null || _a === void 0 ? void 0 : _a.outerHTML) !== null && _b !== void 0 ? _b : "";
        if (currentQuestionHTML !== thisQuestionHTML) {
            log("stale model response ignored");
            return;
        }
        setBadge("answering", "#7dd3fc");
        console.log(res);
        if (!res.success) {
            setBadge("error!", "#ef4444");
            log(`background error: ${(_c = res.error) !== null && _c !== void 0 ? _c : "unknown error"}`);
            return;
        }
        if (!res.answer) {
            setBadge("error!", "#ef4444");
            log("background returned success but no answer payload");
            return;
        }
        await executeAnswer(res.answer);
        lastAskedQuestionKey = thisQuestionKey;
        handleProgressionButtons();
        await delay(67);
        handleProgressionButtons();
    }
    finally {
        inFlightQuestionHTML = null;
        currentlyUpdating = false;
    }
}
if (window === window.top) {
    if (document.head) {
        if (!document.getElementById("bendi-oxanium-preconnect")) {
            const preconnectGoogle = document.createElement("link");
            preconnectGoogle.id = "bendi-oxanium-preconnect";
            preconnectGoogle.rel = "preconnect";
            preconnectGoogle.href = "https://fonts.googleapis.com";
            document.head.appendChild(preconnectGoogle);
        }
        if (!document.getElementById("bendi-oxanium-preconnect-gstatic")) {
            const preconnectGStatic = document.createElement("link");
            preconnectGStatic.id = "bendi-oxanium-preconnect-gstatic";
            preconnectGStatic.rel = "preconnect";
            preconnectGStatic.href = "https://fonts.gstatic.com";
            preconnectGStatic.crossOrigin = "anonymous";
            document.head.appendChild(preconnectGStatic);
        }
        if (!document.getElementById("bendi-oxanium-stylesheet")) {
            const stylesheet = document.createElement("link");
            stylesheet.id = "bendi-oxanium-stylesheet";
            stylesheet.rel = "stylesheet";
            stylesheet.href = "https://fonts.googleapis.com/css2?family=Oxanium:wght@200..800&display=swap";
            document.head.appendChild(stylesheet);
        }
    }
    badge = document.createElement("div");
    badge.id = "bendi-badge";
    badge.textContent = "status: idle";
    Object.assign(badge.style, {
        position: "fixed",
        bottom: window.location.href.includes("/cbook/") ? "84px" : "30px",
        right: "30px",
        zIndex: "999999",
        fontFamily: '"Oxanium", sans-serif',
        color: "#94a3b8",
        backgroundColor: "#181818",
        padding: "12px 12px",
        borderRadius: "8px",
    });
    document.body.appendChild(badge);
}
async function run() {
    if (window.location.href.includes("/cbook/"))
        proceedToAssessment();
    if (window.location.href.includes("/assessment/ui/"))
        updateQuestionNode();
}
setInterval(run, 67);
