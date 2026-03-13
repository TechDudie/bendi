"use strict";
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
        console.log("No buttons found");
    }
}
if (window.location.href.indexOf("/cbook/") !== -1) {
    setInterval(proceedToAssessment, 67);
}
