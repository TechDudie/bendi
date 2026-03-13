// this is the content script
// and it's gonna talk to the background script and the popup script
// and it's gonna do all the CK-12 solving



function log(message: string) {
    console.log(`[bendi] ${message}`);
}

function proceedToAssessment() {
    // we want to go to the assessment page
    // the buttons might be null tho

    let startPracticeButton = document.querySelector('[data-dx-desc="start_practice_button"]') as HTMLElement;
    let keepPracticingButton = document.querySelector('[data-dx-desc="Keep practicing"]')as HTMLElement;

    if (startPracticeButton) {
        startPracticeButton.click();
    } else if (keepPracticingButton) {
        keepPracticingButton.click();
    } else {
        log("no buttons found");
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

    while (true) {
        document.querySelector(".question_Container");
    }
}