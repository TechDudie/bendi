"use strict";
document.addEventListener("DOMContentLoaded", () => {
    const enabledSwitch = document.getElementById("enabled");
    const apiKeyInput = document.getElementById("apiKey");
    if (apiKeyInput) {
        chrome.storage.local.get(["apiKey"], (result) => {
            if (result.apiKey) {
                apiKeyInput.value = String(result.apiKey);
            }
        });
        apiKeyInput.addEventListener("input", () => {
            chrome.storage.local.set({ apiKey: apiKeyInput.value });
        });
    }
    if (enabledSwitch) {
        chrome.storage.local.get(["extensionEnabled"], (result) => {
            if (result.extensionEnabled !== undefined) {
                enabledSwitch.checked = Boolean(result.extensionEnabled);
            }
            else {
                enabledSwitch.checked = true;
            }
        });
        enabledSwitch.addEventListener("change", () => {
            chrome.storage.local.set({ extensionEnabled: enabledSwitch.checked });
        });
    }
});
