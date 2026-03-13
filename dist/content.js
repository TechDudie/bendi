"use strict";
var extensionEnabled = true;
var lastQuestionNode = null;
chrome.storage.local.get(["extensionEnabled"], function (result) {
    if (result.extensionEnabled !== undefined) {
        extensionEnabled = Boolean(result.extensionEnabled);
    }
});
chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName === "local" && changes.extensionEnabled) {
        extensionEnabled = Boolean(changes.extensionEnabled.newValue);
    }
});
function log(message) {
    console.log("[bendi] ".concat(message));
}
function proceedToAssessment() {
    if (!extensionEnabled)
        return;
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
function updateQuestionNode() {
    var thisQuestionNode = document.querySelector(".question_Container");
    if (!thisQuestionNode.isEqualNode(lastQuestionNode)) {
        log("new question content detected");
        lastQuestionNode = thisQuestionNode;
    }
}
if (window.location.href.indexOf("/cbook/") !== -1) {
    setInterval(proceedToAssessment, 67);
}
if (window.location.href.indexOf("/assessment/ui/") !== -1) {
    setInterval(updateQuestionNode, 67);
}
