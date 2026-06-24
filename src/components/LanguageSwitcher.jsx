// src/components/LanguageSwitcher.jsx
import React from 'react';
import { LANGUAGES, useLang } from '../i18n.js';

export default function LanguageSwitcher({ style }) {
  const { lang, setLang } = useLang();
  return (
    <div style={{ display:'flex', background:'var(--surface-3)', borderRadius:20, padding:2, gap:1, ...style }}>
      {LANGUAGES.map(l => (
        <button key={l.id} onClick={() => setLang(l.id)}
          style={{ padding:'4px 10px', borderRadius:18, border:'none', background:lang===l.id?'var(--brand)':'transparent', color:lang===l.id?'#fff':'var(--text-secondary)', fontSize:12, fontWeight:lang===l.id?700:500, cursor:'pointer', transition:'all 0.15s', minHeight:28, fontFamily:'inherit', lineHeight:1 }}
          title={l.native}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
