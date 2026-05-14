const { GoogleGenerativeAI } = require('@google/generative-ai');

function initGemini() {
    if (!process.env.GEMINI_API_KEY) {
        console.warn('GEMINI_API_KEY is not set. Gemini OCR will fail.');
        return null;
    }
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

module.exports = { initGemini };
