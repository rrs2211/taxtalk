// api/extract-cg.js — Capital gains transaction extraction from broker documents
import { getPresignedUrl } from './lib/r2.js';
import { setCORSHeaders, handleOptions, getAuthUser, getSupabaseAdmin } from './lib/helpers.js';

const SYSTEM = `You are a specialized Indian capital gains tax extraction engine.
Extract all capital gain transactions from the uploaded document (broker P&L, tax report, or statement).
Return ONLY valid JSON — no preamble, no markdown.`;

const CG_PROMPT = `Extract all capital gain transactions from this document (Zerodha Tax P&L, Groww Tax Report, Angel One, Upstox, or similar broker report).

For each transaction identify:
- Whether it is short-term (held < 12 months) → type: "equity_stcg"  
- Or long-term (held ≥ 12 months) → type: "equity_ltcg"
- Property/land sales → type: "property_ltcg"

For equity Sec 111A (STCG) and Sec 112A (LTCG), extract:
- scrip/description, sale value, purchase cost, FMV as on 31 Jan 2018 (if mentioned), brokerage/expenses, net gain

Return this exact JSON structure:
{
  "broker": string | null,
  "period": string | null,
  "pan": string | null,
  "total_stcg": number,
  "total_ltcg": number,
  "transactions": [
    {
      "type": "equity_stcg" | "equity_ltcg" | "property_ltcg" | "other",
      "description": string,
      "isin": string | null,
      "quantity": number | null,
      "sale_date": string | null,
      "purchase_date": string | null,
      "sale_value": number,
      "purchase_cost": number,
      "fmv": number,
      "expenses": number,
      "gain": number,
      "holding_days": number | null
    }
  ],
  "confidence": number
}`;

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ message: 'Not authenticated' });

  const { documentId } = req.body || {};
  if (!documentId) return res.status(400).json({ message: 'Missing documentId' });

  const supabase = getSupabaseAdmin();
  const { data: doc } = await supabase.from('documents').select('*, returns(user_id)').eq('id', documentId).single();
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  if (doc.returns?.user_id !== user.id) return res.status(403).json({ message: 'Access denied' });

  try {
    const signedUrl = await getPresignedUrl(doc.storage_path, 120);
    const fileRes   = await fetch(signedUrl);
    const buffer    = await fileRes.arrayBuffer();
    const base64    = Buffer.from(buffer).toString('base64');
    const ext       = (doc.original_name || '').toLowerCase();
    const mime      = ext.endsWith('.pdf') ? 'application/pdf' : ext.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: mime === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: mime, data: base64 } },
            { type: 'text', text: CG_PROMPT },
          ],
        }],
      }),
    });

    const aiData = await aiRes.json();
    const text   = aiData.content?.find(b => b.type === 'text')?.text || '{}';
    const clean  = text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(clean);

    await supabase.from('documents').update({ extracted_json: extracted, extraction_status: 'success' }).eq('id', documentId);
    return res.status(200).json({ extracted, documentId });
  } catch(e) {
    console.error('extract-cg error:', e.message);
    return res.status(500).json({ message: e.message || 'CG extraction failed' });
  }
}
