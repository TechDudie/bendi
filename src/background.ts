// this is the background script
// and it's gonna talk to the content script
// and it's gonna talk to the hackclub ai api

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
- Text input (short response): {"action": "type", "target": "Option-1", "value": "42.0"}
  target = EXACT data-dx-elementinfo of the input field, value = the answer text
  Use the exact format, units, and significant figures requested by the question.`;

interface AnswerResponse {
    action: "click" | "type";
    targets?: string[]; // for click-based questions
    target?: string; // for text input questions
    value?: string; // for text input questions
}

async function consultTheClanker(questionHTML: string): Promise<AnswerResponse> {
    // fetch ts api key from client storage
    const { apiKey } = await chrome.storage.local.get(["apiKey"]);
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
        throw new Error("Missing Hack Club API key");
    }

    const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: questionHTML }
            ],
            temperature: 0.1
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Hack Club API returned ${res.status}: ${err}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty LLM response");

    const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
    return JSON.parse(cleaned);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "answer") {
        consultTheClanker(request.questionHTML)
            .then(answer => sendResponse({ success: true, answer }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // indicate that we respond asynchronously
    }
});