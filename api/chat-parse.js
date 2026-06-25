// api/chat-parse.js
// Parses natural language income messages from clients in any language
// Returns structured income data + follow-up questions for missing info

import { setCORSHeaders, handleOptions, getAuthUser, checkRateLimit } from './lib/helpers.js';

const SYSTEM = `You are TaxTalk, an Indian income tax assistant for AY 2026-27 (FY 2025-26).
You understand messages in English, Hindi, and Gujarati about income tax.
Extract structured income data from conversational messages.
Always respond in the SAME LANGUAGE as the user's message.
Return ONLY valid JSON — no preamble, no markdown.`;

const PARSE_PROMPT = `The user has sent this message about their income and taxes:
"{message}"

Extract ALL income, deduction, and tax payment information from this message.
If the user mentions figures without specifying currency, assume Indian Rupees.
Convert lakh/लाख/lākh (×100,000) and crore/करोड़ (×10,000,000) to numbers.

Also detect:
- The language used (en/gu/hi)
- Any questions embedded in the message
- What information is still missing for filing

Return this exact JSON:
{
  "language": "en" | "gu" | "hi",
  "understood_message": "brief confirmation of what was understood (in user's language)",
  "extracted": {
    "gross_salary": number | null,
    "tds_deducted": number | null,
    "advance_tax": number | null,
    "self_assessment_tax": number | null,
    "interest_income": number | null,
    "savings_interest": number | null,
    "fd_interest": number | null,
    "dividend_income": number | null,
    "business_income": number | null,
    "business_turnover": number | null,
    "rent_income": number | null,
    "house_loan_interest": number | null,
    "deductions_80c": number | null,
    "deductions_80d": number | null,
    "deductions_80e": number | null,
    "deductions_80g": number | null,
    "employer_name": string | null,
    "employer_tan": string | null,
    "pan": string | null,
    "bank_account": string | null,
    "ifsc": string | null
  },
  "follow_up_questions": [
    "question 1 in user's language",
    "question 2 in user's language"
  ],
  "missing_for_filing": [
    "item still needed (in user's language)"
  ],
  "confidence": 0.0–1.0
}`;

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ message: 'Not authenticated' });

  if (!(await checkRateLimit(user.id, 'chat-parse', 60))) {
    return res.status(429).json({ message: 'Too many requests. Please slow down.' });
  }

  const { message, context = {}, language = 'en' } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ message: 'No message provided' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ message: 'API key not configured' });

  try {
    const prompt = PARSE_PROMPT.replace('{message}', message);

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const aiData = await aiRes.json();
    const text   = aiData.content?.find(b => b.type === 'text')?.text || '{}';
    const clean  = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json({ parsed, message });
  } catch(e) {
    console.error('chat-parse error:', e.message);
    return res.status(500).json({ message: 'Could not parse message: ' + e.message });
  }
}
