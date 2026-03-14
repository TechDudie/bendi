// this is the content script
// and it's gonna talk to the background script and the popup script
// and it's gonna do all the CK-12 solving

interface AnswerResponse {
    action: "click" | "type";
    targets?: string[]; // for click-based questions
    target?: string; // for text input questions
    value?: string; // for text input questions
    error?: string; // for errors :(
}

interface BackgroundResponse {
    success: boolean;
    answer?: AnswerResponse;
    error?: string;
}

let extensionEnabled = true;
let inFlightQuestionHTML: string | null = null;
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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
            return text.includes(needle);
        });

        // if it is, click it and bail
        if (match) {
            match.click();
            return true;
        }
    }

    return false;
}

function cycleProgressionButtons() {
    // clickButtonText(["Very confident", "Done", "Check It", "Submit", "Turn In", "Try Again", "Next", "Continue", "Got It"])

    if (clickButtonText(["Very confident"])) return; // skips the initial finish confidence prompt
    if (clickButtonText(["Done"])) return; // should exit the assignment, the button in the top right
    if (clickButtonText(["Check It", "Submit", "Turn In"])) return; // should initially a given answer
    if (clickButtonText(["Try Again", "Next", "Continue", "Got It"])) return; // should then proceed to the next question if right and try again if wrong
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
    } else if (response.action === "type" && response.value != null) {
        const target = response.target ?? "Option-1";
        const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            `input[data-dx-elementinfo="${target}"], textarea[data-dx-elementinfo="${target}"]`
        );

        if (input) {
            // we have to trigger the React onChange handler manually, gemini is the goat
            const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

            if (setter) {
                setter.call(input, response.value);
            } else {
                input.value = response.value;
            }

            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }
}

function proceedToAssessment() {
    // check if ts extension is even enabled rq
    if (!extensionEnabled) return;

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

            return;
        }
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
    if (!extensionEnabled) return;

    if (updateInProgress) return;
    updateInProgress = true;

    try {
        let thisQuestionNode = document.querySelector(".question_Container") as HTMLElement | null;

        cycleProgressionButtons();

        if (!thisQuestionNode) return;

        const thisQuestionHTML = thisQuestionNode.outerHTML;
        const hasQuestionText = thisQuestionHTML.includes("x-ck12-question_text"); // make sure that we're not just getting a blank element
        if (!hasQuestionText) return;

        if (inFlightQuestionHTML) return;

        const now = Date.now();
        const didQuestionChange = thisQuestionHTML === lastQuestionHTML;
        const cooldownActive = didQuestionChange && now - lastRequestAt < 67; // 67 ms grace period in between each ACTIVE state check
        if (cooldownActive) return;

        inFlightQuestionHTML = thisQuestionHTML;
        lastQuestionHTML = thisQuestionHTML;
        lastRequestAt = now;
        log("question request started");

        // consult the clankers!!!
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

        // error handling
        if (!res.success) {
            log(`background error: ${res.error ?? "unknown error"}`);
            return;
        }
        if (!res.answer) {
            log("background returned success but no answer payload");
            return;
        }

        console.log(res);

        // execute the answer
        await executeAnswer(res.answer);

        cycleProgressionButtons();
        await delay(67);
        cycleProgressionButtons();
    } finally {
        inFlightQuestionHTML = null;
        updateInProgress = false;
    }
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