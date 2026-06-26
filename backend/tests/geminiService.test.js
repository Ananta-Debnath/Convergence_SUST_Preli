const { callGemini } = require('../src/services/geminiService');

describe('geminiService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should throw an error if GEMINI_API_KEY is not defined', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(callGemini('Hello')).rejects.toThrow(
      'GEMINI_API_KEY is not defined in the environment variables.'
    );
  });

  test('should call native fetch with correct URL and payload, and return text content', async () => {
    process.env.GEMINI_API_KEY = 'mock_api_key';

    const mockResponseText = 'This is a mock response from Gemini.';
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: mockResponseText }]
            },
            finishReason: 'STOP'
          }
        ]
      })
    });

    global.fetch = mockFetch;

    const result = await callGemini('Hello Gemini', {
      model: 'gemini-1.5-flash',
      temperature: 0.5,
      systemInstruction: 'Be polite.'
    });

    expect(result).toBe(mockResponseText);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const calledUrl = mockFetch.mock.calls[0][0];
    const calledOptions = mockFetch.mock.calls[0][1];

    expect(calledUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=mock_api_key'
    );
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.headers).toEqual({
      'Content-Type': 'application/json'
    });

    const body = JSON.parse(calledOptions.body);
    expect(body.contents).toEqual([
      {
        role: 'user',
        parts: [{ text: 'Hello Gemini' }]
      }
    ]);
    expect(body.systemInstruction).toEqual({
      parts: [{ text: 'Be polite.' }]
    });
    expect(body.generationConfig).toEqual({
      temperature: 0.5
    });
  });

  test('should throw an error if fetch response is not ok', async () => {
    process.env.GEMINI_API_KEY = 'mock_api_key';

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('API Error Details')
    });

    await expect(callGemini('Hello')).rejects.toThrow(
      'Gemini API returned status 400: API Error Details'
    );
  });
});
