// this is the popup script
// and it's gonna talk to the frontend settings ui
// and it's gonna tell the content script if the extension is enabled
// and it's gonna tell the background script what the api key is

document.addEventListener("DOMContentLoaded", () => {
    // get the settings elements
    const enabledSwitch = document.getElementById("enabled") as HTMLInputElement | null;
    const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement | null;

    if (apiKeyInput) {
        // load the api key from storage and set it in the input
        chrome.storage.local.get(["apiKey"], (result) => {
            if (result.apiKey) {
                apiKeyInput.value = String(result.apiKey);
            }
        });

        // update the key in storage imediately after it changes
        apiKeyInput.addEventListener("input", () => {
            chrome.storage.local.set({ apiKey: apiKeyInput.value });
        });
    }

    if (enabledSwitch) {
        // load the enabled state from storage and set it in the switch
        chrome.storage.local.get(["extensionEnabled"], (result) => {
            if (result.extensionEnabled !== undefined) {
                enabledSwitch.checked = Boolean(result.extensionEnabled);
            } else {
                enabledSwitch.checked = true; // default to true
            }
        });

        // update the enabled state in storage immediately after it changes
        enabledSwitch.addEventListener("change", () => {
            chrome.storage.local.set({ extensionEnabled: enabledSwitch.checked });
        });
    }
});
