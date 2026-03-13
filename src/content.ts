// this is the content script
// and it's gonna talk to the background script and the popup script
// and it's gonna do all the CK-12 solving

let extensionEnabled = true;
let lastQuestionNode: HTMLElement | null = null;

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

function log(message: string) {
    console.log(`[bendi] ${message}`);
}

function proceedToAssessment() {
    // check if ts extension is even enabled rq
    if (!extensionEnabled) return;

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

function updateQuestionNode() {
    let thisQuestionNode = document.querySelector(".question_Container") as HTMLElement;

    if (!thisQuestionNode.isEqualNode(lastQuestionNode)) {
        log("new question content detected");
        lastQuestionNode = thisQuestionNode;
    }
}

if (window.location.href.indexOf("/cbook/") !== -1) {
    // we are on a CK-12 lesson page
    // try to proceed reasonably fast to the assessment page
    setInterval(proceedToAssessment, 67);
}

if (window.location.href.indexOf("/assessment/ui/") !== -1) {
    // we are on a CK-12 assignment page
    // time to get to work

    setInterval(updateQuestionNode, 67);
}