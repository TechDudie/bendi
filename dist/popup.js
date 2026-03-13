"use strict";
document.addEventListener("DOMContentLoaded", function () {
    var enabledSwitch = document.getElementById("enabled");
    var apiKeyInput = document.getElementById("apiKey");
    if (apiKeyInput) {
        chrome.storage.local.get(["apiKey"], function (result) {
            if (result.apiKey) {
                apiKeyInput.value = String(result.apiKey);
            }
        });
        apiKeyInput.addEventListener("input", function () {
            chrome.storage.local.set({ apiKey: apiKeyInput.value });
        });
    }
    if (enabledSwitch) {
        chrome.storage.local.get(["extensionEnabled"], function (result) {
            if (result.extensionEnabled !== undefined) {
                enabledSwitch.checked = Boolean(result.extensionEnabled);
            }
            else {
                enabledSwitch.checked = true;
            }
        });
        enabledSwitch.addEventListener("change", function () {
            chrome.storage.local.set({ extensionEnabled: enabledSwitch.checked });
        });
    }
});
