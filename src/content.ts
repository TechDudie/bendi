// this is the content script
// and it's gonna talk to the background script and the popup script
// and it's gonna do all the CK-12 solving

interface ShortResponse {
    target: string;
    value: string;
}

interface AnswerResponse {
    action: "click" | "type";
    targets?: string[]; // for click-based questions
    responses?: ShortResponse[]; // for text input questions
    error?: string; // for errors :(
}

interface BackgroundResponse {
    success: boolean;
    answer?: AnswerResponse;
    error?: string;
}

let extensionEnabled = true;
let badge: HTMLDivElement | null = null;

let inFlightQuestionHTML: string | null = null;
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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastBadgeText = "";
function setBadge(text: string, color: string) {
    if (badge && lastBadgeText !== text) {
        lastBadgeText = text;
        badge.textContent = `status: ${text}`;
        badge.style.color = color;
    }
}

function log(message: string) {
    console.log(`[bendi] ${message}`);
}

function clickButtonText(candidates: string[]): boolean {
    // find all buttons
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));

    // take our array of candidates
    for (const candidate of candidates) {
        const needle = candidate.trim().toLowerCase();
        if (!needle) continue;

        // is our candidate string a subset of the button's content?
        const match = buttons.find((button) => {
            const text = (button.textContent ?? "").trim().toLowerCase();
            const disabled = button.disabled || button.getAttribute("aria-disabled") === "true";
            return !disabled && text.includes(needle);
        });

        // if it is, click it and bail
        if (match) {
            match.click();
            return true;
        }
    }

    return false;
}

function getQuestionKey(questionNode: HTMLElement): string {
    const labeledRegion = questionNode.querySelector<HTMLElement>('[role="region"][aria-label]');
    const ariaLabel = labeledRegion?.getAttribute("aria-label")?.trim();
    if (ariaLabel) return ariaLabel;

    const questionText = questionNode.querySelector("x-ck12-question_text")?.textContent?.trim();
    if (questionText) return questionText;

    return "";
}

function cycleProgressionButtons(): "none" | "progressed" | "retry" {
    // clickButtonText(["Very confident", "Done", "Check It", "Submit", "Turn In", "Try Again", "Next", "Continue", "Got It"])

    if (clickButtonText(["Very confident"])) return "progressed"; // skips the initial finish confidence prompt
    if (clickButtonText(["Done"])) return "progressed"; // should exit the assignment, the button in the top right
    if (clickButtonText(["Check It", "Submit", "Turn In"])) return "progressed"; // should initially a given answer
    if (clickButtonText(["Try Again"])) return "retry"; // wrong answer, so let us ask again after resetting
    if (clickButtonText(["Next", "Continue", "Got It"])) return "progressed"; // should then proceed to the next question if right

    return "none";
}

function handleProgressionButtons(): boolean {
    const progression = cycleProgressionButtons();
    if (progression === "retry") {
        lastAskedQuestionKey = ""; // handle retry
    }

    return progression !== "none";
}

async function executeAnswer(response: AnswerResponse) {
    if (response.error) return; // something went wrong!!!

    if (response.action === "click" && response.targets) {
        for (const target of response.targets) {
            // we loop through all of the given targets and click them one by one
            const el = document.querySelector<HTMLElement>(
                `[data-dx-elementinfo="${target}"]`
            );
            if (el) {
                el.click();
            } else {
                log(`target not found for click: ${target}`);
            }
        }
    } else if (response.action === "type" && response.responses) {
        for (const { target, value } of response.responses) {
            const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
                `input[data-dx-elementinfo="${target}"], textarea[data-dx-elementinfo="${target}"]`
            );

            if (input) {
                // we have to trigger the React onChange handler manually, gemini is the goat
                const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

                if (setter) {
                    setter.call(input, value);
                } else {
                    input.value = value;
                }

                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
    }
}

function proceedToAssessment() {
    // check if ts extension is even enabled rq
    if (!extensionEnabled) {
        setBadge("disabled", "#64748b");
        return;
    }

    // we need to check if we JUST came BACK from the assessment page, are we done?
    let completionPercent = document.querySelector(".ScoreChartComponent__psign") as HTMLElement | null;
    if (completionPercent) {
        const text = completionPercent.textContent ?? "";
        const percent = parseInt(text.replace("%", "").trim());
        if (percent >= 100) {
            // again, find all buttons
            const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));

            // can we find the assignment turn in button?
            const match = buttons.find((button) => {
                const text = (button.textContent ?? "").trim().toLowerCase();
                return text.includes("turn in") && !text.includes("again"); // turn it in ONCE
            });
    
            if (match) match.click();
            setBadge("redirecting", "oklch(0.84 0.24 148)");

            return;
        } else {
            setBadge("idle", "#94a3b8");
        }
    } else {
        setBadge("running", "oklch(0.84 0.24 148)");
    }

    // we want to go to the assessment page
    // the buttons might be null tho
    let startPracticeButton = document.querySelector('[data-dx-desc="start_practice_button"]') as HTMLElement;
    let keepPracticingButton = document.querySelector('[data-dx-desc="Keep practicing"]') as HTMLElement;

    if (startPracticeButton) {
        startPracticeButton.click();
    } else if (keepPracticingButton) {
        keepPracticingButton.click();
    } else {
        log("no buttons found");
    }
}

async function updateQuestionNode() {
    // check if ts extension is even enabled rq
    if (!extensionEnabled) {
        setBadge("disabled", "#64748b");
        return;
    }

    if (currentlyUpdating) return;
    currentlyUpdating = true;

    try {
        let thisQuestionNode = document.querySelector(".question_Container") as HTMLElement | null;

        if (handleProgressionButtons()) return;

        if (!thisQuestionNode) {
            if (lastBadgeText !== "answering") {
                setBadge("waiting", "#94a3b8");
            }
            return;
        }

        const thisQuestionHTML = thisQuestionNode.outerHTML;
        const thisQuestionKey = getQuestionKey(thisQuestionNode) || thisQuestionHTML;
        const hasQuestionText = thisQuestionHTML.includes("x-ck12-question_text"); // make sure that we're not just getting a blank element
        if (!hasQuestionText) {
            if (lastBadgeText !== "answering") {
                setBadge("waiting", "#94a3b8");
            }
            return;
        }

        if (thisQuestionKey === lastAskedQuestionKey) return;

        if (inFlightQuestionHTML) return;

        const now = Date.now();
        const didQuestionChange = thisQuestionHTML === lastQuestionHTML;
        const cooldownActive = didQuestionChange && now - lastRequestAt < 67; // 67 ms grace period in between each ACTIVE state check
        if (cooldownActive) return;

        inFlightQuestionHTML = thisQuestionHTML;
        lastQuestionHTML = thisQuestionHTML;
        lastRequestAt = now;
        log("question request started");

        setBadge("thinking", "#d8b4fe");

        // consult the clankers!!!
        console.log(thisQuestionNode.cloneNode(true));
        const res: BackgroundResponse = await chrome.runtime.sendMessage({
            type: "answer",
            questionHTML: thisQuestionHTML
        });

        // ignore stale resp
        const currentQuestionHTML = (document.querySelector(".question_Container") as HTMLElement | null)?.outerHTML ?? "";
        if (currentQuestionHTML !== thisQuestionHTML) {
            log("stale model response ignored");
            return;
        }

        setBadge("answering", "#7dd3fc");
        console.log(res);

        // error handling
        if (!res.success) {
            setBadge("error!", "#ef4444");
            log(`background error: ${res.error ?? "unknown error"}`);
            return;
        }
        if (!res.answer) {
            setBadge("error!", "#ef4444");
            log("background returned success but no answer payload");
            return;
        }

        // execute the answer
        await executeAnswer(res.answer);
        lastAskedQuestionKey = thisQuestionKey;

        handleProgressionButtons();
        await delay(67);
        handleProgressionButtons();
    } finally {
        inFlightQuestionHTML = null;
        currentlyUpdating = false;
    }
}

if (window === window.top) {
    // add the goat font
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

    // display ONE badge
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
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
    });
    document.body.appendChild(badge);
}

// if (window.location.href.indexOf("/cbook/") !== -1) {
//     // we are on a CK-12 lesson page
//     // try to proceed reasonably fast to the assessment page
//     setInterval(proceedToAssessment, 67);
// }

// if (window.location.href.indexOf("/assessment/ui/") !== -1) {
//     // we are on a CK-12 assignment page
//     // time to get to work

//     setInterval(updateQuestionNode, 67);
// }

// main loop
async function run() {
    if (window.location.href.includes("/cbook/")) proceedToAssessment();
    if (window.location.href.includes("/assessment/ui/")) updateQuestionNode();
}

setInterval(run, 67);
