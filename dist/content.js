"use strict";
function log(message) {
    console.log("[bendi] ".concat(message));
}
function proceedToAssessment() {
    var startPracticeButton = document.querySelector('[data-dx-desc="start_practice_button"]');
    var keepPracticingButton = document.querySelector('[data-dx-desc="Keep practicing"]');
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
if (window.location.href.indexOf("/cbook/") !== -1) {
    setInterval(proceedToAssessment, 67);
}
if (window.location.href.indexOf("/assessment/ui/") !== -1) {
    document.querySelector(".question_Container");
}
