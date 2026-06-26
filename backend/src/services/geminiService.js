/**
 * Service to interact with the Google Gemini API.
 */

/**
 * Calls the Gemini API with the given prompt and options.
 * 
 * @param {string} prompt - The text prompt to send to Gemini.
 * @param {Object} [options] - Additional request options.
 * @param {string} [options.model] - The Gemini model to use (defaults to GEMINI_MODEL env var or 'gemini-2.5-flash').
 * @param {string} [options.systemInstruction] - System instruction to guide model behavior.
 * @param {number} [options.temperature] - Controls the randomness of the output (0.0 to 2.0).
 * @param {number} [options.maxOutputTokens] - Maximum number of tokens to generate.
 * @param {string} [options.responseMimeType] - Output MIME type, e.g., 'application/json'.
 * @param {Object} [options.responseSchema] - Optional structured JSON response schema.
 * @returns {Promise<string>} The generated text response.
 */
async function callGemini(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in the environment variables.');
  }

  const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const model = options.model || defaultModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build the contents payload
  const contents = [
    {
      role: 'user',
      parts: [{ text: prompt }]
    }
  ];

  // Build the generationConfig
  const generationConfig = {};
  if (options.temperature !== undefined) {
    generationConfig.temperature = options.temperature;
  }
  if (options.maxOutputTokens !== undefined) {
    generationConfig.maxOutputTokens = options.maxOutputTokens;
  }
  if (options.responseMimeType !== undefined) {
    generationConfig.responseMimeType = options.responseMimeType;
  }
  if (options.responseSchema !== undefined) {
    generationConfig.responseSchema = options.responseSchema;
  }

  const payload = {
    contents
  };

  // Add systemInstruction if provided
  if (options.systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: options.systemInstruction }]
    };
  }

  // Only include generationConfig if it has keys
  if (Object.keys(generationConfig).length > 0) {
    payload.generationConfig = generationConfig;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Gemini API response did not contain any candidates.');
    }

    const candidate = data.candidates[0];
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
        throw new Error(`Gemini API generation finished with reason: ${candidate.finishReason}`);
      }
    }

    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      throw new Error('Gemini API response candidate did not contain parts.');
    }

    return candidate.content.parts[0].text;
  } catch (error) {
    console.error('Error in callGemini service:', error);
    throw error;
  }
}

module.exports = {
  callGemini
};
