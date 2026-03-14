"use strict";
let extensionEnabled = true;
let inFlightQuestionHTML = null;
let lastQuestionHTML = "";
let lastRequestAt = 0;
let updateInProgress = false;
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
            return text.includes(needle);
        });
        if (match) {
            match.click();
            return true;
        }
    }
    return false;
}
function cycleProgressionButtons() {
    if (clickButtonText(["Very confident"]))
        return;
    if (clickButtonText(["Done"]))
        return;
    if (clickButtonText(["Check It", "Submit", "Turn In"]))
        return;
    if (clickButtonText(["Try Again", "Next", "Continue", "Got It"]))
        return;
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
    if (!extensionEnabled)
        return;
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
            return;
        }
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
    if (!extensionEnabled)
        return;
    if (updateInProgress)
        return;
    updateInProgress = true;
    try {
        let thisQuestionNode = document.querySelector(".question_Container");
        cycleProgressionButtons();
        if (!thisQuestionNode)
            return;
        const thisQuestionHTML = thisQuestionNode.outerHTML;
        const hasQuestionText = thisQuestionHTML.includes("x-ck12-question_text");
        if (!hasQuestionText)
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
        const res = await chrome.runtime.sendMessage({
            type: "answer",
            questionHTML: thisQuestionHTML
        });
        const currentQuestionHTML = (_b = (_a = document.querySelector(".question_Container")) === null || _a === void 0 ? void 0 : _a.outerHTML) !== null && _b !== void 0 ? _b : "";
        if (currentQuestionHTML !== thisQuestionHTML) {
            log("stale model response ignored");
            return;
        }
        if (!res.success) {
            log(`background error: ${(_c = res.error) !== null && _c !== void 0 ? _c : "unknown error"}`);
            return;
        }
        if (!res.answer) {
            log("background returned success but no answer payload");
            return;
        }
        console.log(res);
        await executeAnswer(res.answer);
        cycleProgressionButtons();
        await delay(67);
        cycleProgressionButtons();
    }
    finally {
        inFlightQuestionHTML = null;
        updateInProgress = false;
    }
}
async function run() {
    if (window.location.href.includes("/cbook/"))
        proceedToAssessment();
    if (window.location.href.includes("/assessment/ui/"))
        updateQuestionNode();
}
setInterval(run, 67);
