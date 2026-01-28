
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Simple .env parser
function loadEnv() {
    try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split('\n').forEach(line => {
                const [key, val] = line.split('=');
                if (key && val) process.env[key.trim()] = val.trim();
            });
        }
    } catch (e) {
        console.error("Error loading .env", e);
    }
}

loadEnv();

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("❌ NO API KEY FOUND IN .env");
    process.exit(1);
}

const modelsToTest = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-pro',
];

console.log(`🔑 Testing with Key: ${GEMINI_API_KEY.substring(0, 5)}...`);

async function testModel(modelName) {
    console.log(`\n🧪 Testing: ${modelName}...`);
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "Hello, are you online?" }] }]
            })
        });

        if (response.ok) {
            console.log(`✅ SUCCESS: ${modelName} is working!`);
            return true;
        } else {
            console.log(`❌ FAILED: ${modelName} - Status: ${response.status} ${response.statusText}`);
            const err = await response.json();
            console.log(`   Error: ${err.error?.message || JSON.stringify(err)}`);
            return false;
        }
    } catch (e) {
        console.log(`❌ ERROR: ${modelName} - ${e.message}`);
        return false;
    }
}

async function runTests() {
    for (const model of modelsToTest) {
        const success = await testModel(model);
        if (success) {
            console.log(`\n🏆 WINNER: ${model}`);
            break; // Stop after finding the first working one
        }
    }
}

runTests();
