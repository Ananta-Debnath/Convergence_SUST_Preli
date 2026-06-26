/**
 * Script to test the Gemini API helper function.
 * Run this script with:
 *   node src/scripts/testGemini.js
 */

const { callGemini } = require('../services/geminiService');

// Load environment variables
try {
  require('dotenv').config();
} catch (_) {
  // Ignore if dotenv is not loaded
}

async function runTest() {
  console.log('Testing callGemini helper function...');
  
  if (!process.env.GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set in your environment or .env file.');
    console.warn('The test will fail unless an API key is provided.');
  }

  const prompt = 'Explain what a webhook is in 1 sentence.';
  console.log(`Prompt: "${prompt}"`);

  try {
    const response = await callGemini(prompt, {
      temperature: 0.2
    });
    console.log('\n--- SUCCESS ---');
    console.log('Gemini Response:');
    console.log(response);
    console.log('----------------');
  } catch (error) {
    console.error('\n--- FAILURE ---');
    console.error('Failed to call Gemini API:', error.message);
    console.error('----------------');
    process.exitCode = 1;
  }
}

runTest();
