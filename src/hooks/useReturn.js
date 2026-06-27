import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getOrCreateReturn, updateReturn, saveMessage,
  loadConversation, logAudit, submitReturn,
  insertFlags,
} from '../lib/supabase.js';
import { uploadDocument, validateFile } from '../lib/storage.js';

// Debounce helper
function useDebouncedCallback(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export function useReturn(userId) {
  const [returnRecord, setReturnRecord] = useState(null);
  const [loadingReturn, setLoadingReturn] = useState(true);
  const [step, setStep] = useState('welcome');
  const [extractedData, setExtractedData] = useState({});
  const [computation, setComputation] = useState(null);
  const [error, setError] = useState(null);

  // Load or create return on mount
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const r = await getOrCreateReturn(userId);
        setReturnRecord(r);
        // Restore state from DB if return was in progress
        if (r.extracted_data && Object.keys(r.extracted_data).length > 0) {
          setExtractedData(r.extracted_data);
        }
        if (r.computation && Object.keys(r.computation).length > 0) {
          setComputation(r.computation);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoadingReturn(false);
      }
    })();
  }, [userId]);

  // Auto-save extracted data (debounced)
  const persistExtractedData = useDebouncedCallback(async (data) => {
    if (!returnRecord?.id) return;
    await updateReturn(returnRecord.id, { extracted_data: data });
  }, 800);

  const mergeExtractedData = useCallback((updates) => {
    setExtractedData(prev => {
      const next = { ...prev, ...updates };
      persistExtractedData(next);
      return next;
    });
  }, [persistExtractedData]);

  // Save step progress
  const advanceStep = useCallback(async (newStep) => {
    setStep(newStep);
    if (returnRecord?.id) {
      await updateReturn(returnRecord.id, {
        extracted_data: { ...extractedData, __step: newStep },
      }).catch(console.error);
    }
  }, [returnRecord, extractedData]);

  // Persist a chat message
  const persistMessage = useCallback(async (role, content, metadata = {}) => {
    if (!returnRecord?.id || !userId) return;
    // Store plain text (strip React elements to string for DB)
    const text = typeof content === 'string' ? content : '[structured message]';
    await saveMessage(returnRecord.id, userId, role, text, step, metadata);
  }, [returnRecord, userId, step]);

  // Handle document upload → R2 (two-step presigned) + trigger extraction
  const handleUpload = useCallback(async (file, docType, onProgress) => {
    if (!userId) throw new Error('Please sign in before uploading.');

    // If returnRecord is still loading (null), wait up to 5 s for it to resolve.
    // This covers the race where the user taps Upload before getOrCreateReturn finishes.
    let activeReturn = returnRecord;
    if (!activeReturn?.id) {
      activeReturn = await Promise.race([
        getOrCreateReturn(userId),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out waiting for return to load. Please refresh and try again.')), 5000)),
      ]);
      if (activeReturn) setReturnRecord(activeReturn);
    }
    if (!activeReturn?.id) throw new Error('Could not create return. Please refresh and try again.');

    const validationError = validateFile(file);
    if (validationError) throw new Error(validationError);

    // Upload to R2 via presigned URL, register in Supabase
    const doc = await uploadDocument(file, activeReturn.id, docType, onProgress);
    return doc;
  }, [returnRecord, userId]);

  // Save final computation — also determines and saves the correct ITR form
  const saveComputation = useCallback(async (comp) => {
    setComputation(comp);
    if (!returnRecord?.id) return;
    // Determine ITR form from computation data (import inline to avoid circular deps)
    const { determineITRForm } = await import('../lib/itrJson.js');
    const itrForm = determineITRForm(returnRecord.profile, comp);
    await updateReturn(returnRecord.id, {
      computation:   comp,
      old_regime_tax: comp.oldTax,
      new_regime_tax: comp.newTax,
      chosen_regime:  comp.betterRegime,
      refund_amount:  comp.refund     || 0,
      balance_due:    comp.balanceDue || 0,
      itr_form:       itrForm,
      profile:        returnRecord.profile || comp.profile,
    });
  }, [returnRecord]);

  // Submit to CA queue — saves computation BEFORE changing status
  const submitToCA = useCallback(async (aiNote, flags = [], finalComp = null) => {
    if (!returnRecord?.id || !userId) throw new Error('No active return');

    // Save computation while status is still 'in_progress' (RLS allows it)
    if (finalComp) {
      const { determineITRForm } = await import('../lib/itrJson.js');
      const itrForm = determineITRForm(returnRecord.profile, finalComp);
      await updateReturn(returnRecord.id, {
        computation:    finalComp,
        old_regime_tax: finalComp.oldTax,
        new_regime_tax: finalComp.newTax,
        chosen_regime:  finalComp.betterRegime,
        refund_amount:  finalComp.refund     || 0,
        balance_due:    finalComp.balanceDue || 0,
        itr_form:       itrForm,
        profile:        returnRecord.profile || finalComp.profile,
      });
    }

    // Change status to submitted
    await submitReturn(returnRecord.id);

    // Insert flags
    if (flags.length > 0) {
      await insertFlags(returnRecord.id, flags).catch(e => console.warn('flags insert:', e.message));
    }

    // Insert CA queue entry
    const { supabase: sb } = await import('../lib/supabase.js');
    const { error: qErr } = await sb.from('ca_queue').insert({
      return_id:      returnRecord.id,
      user_id:        userId,
      priority:       flags.some(f => f.severity === 'critical') ? 1 : flags.length > 0 ? 3 : 5,
      flags_count:    flags.length,
      critical_flags: flags.filter(f => f.severity === 'critical').length,
      ai_note:        aiNote,
    });
    if (qErr) throw new Error(qErr.message);

    await logAudit(returnRecord.id, userId, 'submitted_to_ca', { flags: flags.length });
    setReturnRecord(prev => ({ ...prev, status: 'submitted' }));
  }, [returnRecord, userId]);

  return {
    returnRecord,
    loadingReturn,
    step,
    setStep: advanceStep,
    extractedData,
    mergeExtractedData,
    computation,
    saveComputation,
    persistMessage,
    handleUpload,
    submitToCA,
    error,
  };
}
