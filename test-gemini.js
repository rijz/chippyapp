
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GOOGLE_API_KEY;
if (!apiKey) {
    console.error("No API KEY found in .env");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function testScan() {
    console.log("Testing Gemini Search with key starting with:", apiKey.substring(0, 5));
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: 'Who is the CEO of Google? Use Google Search.',
            config: {
                tools: [{ googleSearch: {} }]
            }
        });
        console.log("Response:", response.text);
    } catch (e) {
        console.error("ERROR:", e);
    }
}

testScan();
