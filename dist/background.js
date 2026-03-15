"use strict";
const BASE_URL = "https://ai.hackclub.com/proxy/v1";
const MODEL = "google/gemini-3-flash-preview";
const SYSTEM_PROMPT = `You are an expert at answering educational questions. You will receive raw HTML from a CK-12 question.

Analyze the HTML to:
1. Extract the question text and all answer options
2. Identify the question type (multiple choice, multi-select, true/false, or short response)
3. Determine the correct answer(s)

Each interactive element has a "data-dx-elementinfo" attribute with a unique identifier. Read these EXACT values from the HTML and use them in your response. Examples of real values: "summative_test_answer_option-1", "summative_test_answer_option-3", "Option-1", etc.

Return JSON in one of these formats:
- Click-based (multiple choice, true/false, select-all-that-apply): {"action": "click", "targets": ["summative_test_answer_option-2", "summative_test_answer_option-4"]}
  targets = array of the EXACT data-dx-elementinfo attribute values of the correct answer elements
- Text input (short response): {"action": "type", "responses": [{"target": "Option-1", "value": "42.0"}, {"target": "Option-2", "value": "67.67"}]}
  responses = array of objects containing the EXACT data-dx-elementinfo of the input fields and their corresponding answers
  Use the exact format, units, and significant figures requested by the question.`;
async function consultTheClanker(questionHTML, screenshotBase64) {
    var _a, _b, _c;
    const { apiKey } = await chrome.storage.local.get(["apiKey"]);
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
        throw new Error("Missing Hack Club API key");
    }
    const content = screenshotBase64
        ? [
            {
                type: "text",
                text: questionHTML
            },
            {
                type: "image_url",
                image_url: {
                    url: screenshotBase64.startsWith("data:")
                        ? screenshotBase64
                        : `data:image/png;base64,${screenshotBase64}`
                }
            }
        ]
        : questionHTML;
    const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT
                },
                {
                    role: "user",
                    content: content
                }
            ],
            temperature: 0.1
        })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Hack Club API returned ${res.status}: ${err}`);
    }
    const data = await res.json();
    const text = (_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
    if (!text)
        throw new Error("Empty LLM response");
    const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
    return JSON.parse(cleaned);
}
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "fetch-image") {
        const imageUrl = typeof request.url === "string" ? request.url : "";
        if (!imageUrl) {
            sendResponse({ success: false, error: "Missing image URL" });
            return false;
        }
        fetch(imageUrl)
            .then(async (response) => {
            if (!response.ok) {
                throw new Error(`Image fetch failed with ${response.status}`);
            }
            const blob = await response.blob();
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = "";
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }
            const mimeType = blob.type || "image/png";
            const dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
            sendResponse({ success: true, dataUrl });
        })
            .catch((error) => {
            var _a;
            sendResponse({ success: false, error: (_a = error.message) !== null && _a !== void 0 ? _a : String(error) });
        });
        return true;
    }
    if (request.type === "answer") {
        consultTheClanker(request.questionHTML, request.screenshotBase64)
            .then(answer => sendResponse({ success: true, answer }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});
