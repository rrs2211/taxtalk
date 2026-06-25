// api/chat.js — Full conversational ITR data extraction engine
// Handles any free-text input: "salary 8 lakh TDS 50000 PPF 1.5 lakh"
// Segregates by ITR clause, tracks completeness, drives step progression

import { setCORSHeaders, handleOptions, getAuthUser, checkRateLimit } from './lib/helpers.js';

const SYSTEM = `You are TaxTalk, the conversational ITR filing assistant for RB Shah & Associates (Rajkot, Gujarat).
You are helping Indian taxpayers file their AY 2026-27 (FY 2025-26) Income Tax Return.

LANGUAGE: Detect the language from the user's message. Respond in the SAME language.
- English message → English reply
- Hindi message → Hindi reply  
- Gujarati message → Gujarati reply
Tax terms (ITR, AIS, TDS, PAN, 80C, Form 16, etc.) stay in English regardless of reply language.

YOUR JOB:
1. Parse ANY free-text message for income, deduction, and tax data
2. Classify every figure into the correct ITR schedule/head
3. Determine what critical data is still MISSING for a complete return
4. Ask ONE clear follow-up question for the most important missing piece
5. Decide what filing step should come next

IMPORTANT RULES:
- NEVER invent numbers. Only extract explicitly stated figures.
- A figure without context: ask which head it belongs to.
- Be warm, conversational, and brief (2-3 sentences max for reply).
- All amounts in integer Indian Rupees (no decimals, no commas).
- Classify intelligently:
  * "salary 8 lakh" or "8 lakh naukri se" or "naukri ma 8 lakh" → grossSalary: 8000000... wait, 8 lakh = 800000
  * "TDS 50000" or "tax kata 50 hazar" or "TDS 50 hajar katyu" → tds: 50000
  * "PPF 1.5 lakh" or "PPF ma 1.5 lakh" → deductions80C += 150000
  * "LIC 25000" → deductions80C += 25000
  * "FD interest 45000" or "fixed deposit nu vadhu 45000" → fdInterest: 45000
  * "home loan interest 1.2 lakh" → homeLoanInterest: 120000
  * "mediclaim 20000" or "health insurance" → deductions80D: 20000
  * "capital gains 80000 shares" → capitalGainStcg OR capitalGainLtcg (ask if unclear)
  * "business income 6 lakh" or "dhandha ma 6 lakh" → businessIncome: 600000
  * "professional receipts 12 lakh" → businessIncome: 1200000, profile: "freelancer"
  * "partner in firm" → profile: "partner"
  * "advance tax 30000" → advanceTax: 30000
  * Numbers in Indian system: 1 lakh=100000, 1 crore=10000000, 50 hazar=50000
  * Abbreviated: "8L" or "8l" = 800000, "1.5L" = 150000, "50K" = 50000

STEP ADVANCEMENT: Based on what is now known after this message, return the best next_step:
- If profile unknown → "profile_select"
- If profile=salaried AND no salary yet → "ask_salary"  
- If profile=salaried AND salary known → "ask_deductions" or "taxes_confirm" if deductions also known
- If profile=business AND no turnover → "ask_turnover"
- If all income and TDS known → "ready_to_compute"
- If just answering a question, no data → keep current step

COMPLETENESS CHECK: For a valid ITR-1 (salaried), minimum required:
- grossSalary (or confirmation of 0)
- tds amount
- bank account (flag if missing)

For ITR-4 (business/freelancer):
- businessIncome OR (bizTurnover + bizType)
- tds or 0 confirmation

Return ONLY valid JSON, no markdown:`;

const USER_PROMPT = `CURRENT FILING STATE:
{
  "step": "{{step}}",
  "profile": "{{profile}}",
  "income": {
    "grossSalary": {{grossSalary}},
    "businessIncome": {{businessIncome}},
    "bizTurnover": {{bizTurnover}},
    "savingsInterest": {{savingsInterest}},
    "fdInterest": {{fdInterest}},
    "dividendIncome": {{dividendIncome}},
    "otherIncome": {{otherIncome}},
    "houseRentReceived": {{houseRentReceived}}
  },
  "taxes": {
    "tds": {{tds}},
    "advanceTax": {{advanceTax}},
    "selfAssessment": {{selfAssessment}}
  },
  "deductions": {
    "deductions80C": {{deductions80C}},
    "deductions80D": {{deductions80D}},
    "homeLoanInterest": {{homeLoanInterest}}
  },
  "capitalGains": {
    "stcg": {{capitalGainStcg}},
    "ltcg": {{capitalGainLtcg}}
  },
  "bankAccountEntered": {{hasBankAccount}},
  "ageGroup": "{{ageGroup}}"
}

USER MESSAGE: "{{message}}"

Extract all data from this message and return this exact JSON:
{
  "reply": "<warm 1-3 sentence response in user's language confirming what you understood>",
  "followup_question": "<single most important question for missing data, or null if nothing critical missing>",
  "next_step": "<step to advance to, or null to stay on current step>",
  "show_computation": <true if enough data to show tax computation now>,
  "extracted": {
    "grossSalary": <integer or null>,
    "businessIncome": <integer or null>,
    "bizTurnover": <integer or null>,
    "bizType": <"44AD"|"44ADA"|null>,
    "savingsInterest": <integer or null>,
    "fdInterest": <integer or null>,
    "dividendIncome": <integer or null>,
    "otherIncome": <integer or null>,
    "houseRentReceived": <integer or null>,
    "municipalTax": <integer or null>,
    "homeLoanInterest": <integer or null>,
    "tds": <integer or null>,
    "advanceTax": <integer or null>,
    "selfAssessment": <integer or null>,
    "deductions80C": <integer or null>,
    "deductions80D": <integer or null>,
    "deductions80E": <integer or null>,
    "deductions80G": <integer or null>,
    "capitalGainStcg": <integer or null>,
    "capitalGainLtcg": <integer or null>,
    "capitalGainProperty": <integer or null>,
    "profile": <"salaried"|"business"|"freelancer"|"partner"|null>,
    "ageGroup": <"<60"|"60-80"|">80"|null>,
    "pan": <string or null>,
    "bankIFSC": <string or null>,
    "bankAccount": <string or null>,
    "bizName": <string or null>,
    "bizCashPct": <integer 0-100 or null>,
    "employerName": <string or null>,
    "employerTAN": <string or null>
  },
  "data_summary": "<brief summary of all data extracted, in user's language>",
  "missing_critical": ["<list of critical missing fields by name>"],
  "confidence": <0.0-1.0>
}`;

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ message: 'Not authenticated' });

  if (!(await checkRateLimit(user.id, 'chat', 60))) {
    return res.status(429).json({ message: 'Too many messages this hour. Please wait a while before sending more.' });
  }

  const { message, state = {}, lang = 'en', conversationHistory = [] } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ message: 'Message required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ message: 'ANTHROPIC_API_KEY not configured' });

  const langInstruction = {
    en: 'Reply in English.',
    hi: 'हिंदी में reply दें। Tax terms (ITR, AIS, TDS, PAN, Form 16, 80C etc.) English में रखें।',
    gu: 'ગુજરાતીમાં reply આપો। Tax terms (ITR, AIS, TDS, PAN, Form 16, 80C etc.) English માં રાખો।',
  }[lang] || 'Reply in English.';

  // Build prompt with full state
  const prompt = USER_PROMPT
    .replace('{{message}}', message)
    .replace('{{step}}',           state.step           || 'welcome')
    .replace('{{profile}}',        state.profile        || 'unknown')
    .replace('{{grossSalary}}',    state.grossSalary    || 0)
    .replace('{{businessIncome}}', state.businessIncome || 0)
    .replace('{{bizTurnover}}',    state.bizTurnover    || 0)
    .replace('{{savingsInterest}}',state.savingsInterest|| 0)
    .replace('{{fdInterest}}',     state.fdInterest     || 0)
    .replace('{{dividendIncome}}', state.dividendIncome || 0)
    .replace('{{otherIncome}}',    state.otherIncome    || 0)
    .replace('{{houseRentReceived}}', state.houseRentReceived || 0)
    .replace('{{tds}}',            state.tds            || 0)
    .replace('{{advanceTax}}',     state.advanceTax     || 0)
    .replace('{{selfAssessment}}', state.selfAssessment || 0)
    .replace('{{deductions80C}}',  state.deductions80C  || 0)
    .replace('{{deductions80D}}',  state.deductions80D  || 0)
    .replace('{{homeLoanInterest}}',state.homeLoanInterest||0)
    .replace('{{capitalGainStcg}}',state.capitalGainStcg|| 0)
    .replace('{{capitalGainLtcg}}',state.capitalGainLtcg|| 0)
    .replace('{{hasBankAccount}}', state.hasBankAccount ? 'true' : 'false')
    .replace('{{ageGroup}}',       state.ageGroup       || '<60');

  // Build conversation history for multi-turn context
  const messages = [
    // Inject prior turns for context (last 6 messages max)
    ...conversationHistory.slice(-6).map(m => ({
      role: m.role,
      content: m.content,
    })),
    { role: 'user', content: prompt },
  ];

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: `${SYSTEM}\n\n${langInstruction}`,
        messages,
      }),
    });

    if (!aiRes.ok) {
      const errData = await aiRes.json().catch(() => ({}));
      console.error('Claude API error:', aiRes.status, errData);
      return res.status(502).json({ message: 'AI service unavailable. Please try again in a moment.' });
    }

    const aiData = await aiRes.json();
    const text   = aiData.content?.find(b => b.type === 'text')?.text || '';
    const clean  = text.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, t => t.replace(/```json|```/g,'')).trim();

    let parsed;
    try {
      // Find JSON object in response
      const match = clean.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : clean);
    } catch(e) {
      // Fallback: return as plain text reply
      return res.status(200).json({
        reply: text.substring(0, 600),
        extracted: {},
        followup_question: null,
        next_step: null,
        show_computation: false,
        data_summary: '',
        missing_critical: [],
        confidence: 0,
      });
    }

    return res.status(200).json(parsed);

  } catch(e) {
    console.error('chat handler error:', e.message);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
}
