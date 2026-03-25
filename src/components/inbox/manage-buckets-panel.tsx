'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface PanelBucket {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  description: string | null;
}

interface ManageBucketsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  buckets: PanelBucket[];
  isDemo: boolean;
  onBucketCreated: (bucket: PanelBucket) => void;
  onBucketDeleted: (bucketId: number, bucketName: string) => void;
  onBucketUpdated?: (bucketId: number) => void;
  onBucketsChanged: () => void;
}

type FormState = 'idle' | 'submitting';

interface Exemplar {
  id: number;
  text: string | null;
}

const DEFAULT_BUCKET_NAMES = new Set(['Direct', 'Updates', 'Newsletters', 'Promotions', 'Auto-Archive']);

export default function ManageBucketsPanel({ isOpen, onClose, buckets: initialBuckets, isDemo, onBucketCreated, onBucketDeleted, onBucketUpdated, onBucketsChanged }: ManageBucketsPanelProps) {
  const [buckets, setBuckets] = useState<PanelBucket[]>(initialBuckets);

  // New bucket form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formState, setFormState] = useState<FormState>('idle');
  const [createError, setCreateError] = useState('');


  // Inline edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [originalDesc, setOriginalDesc] = useState('');
  const [exemplars, setExemplars] = useState<Exemplar[]>([]);
  const [exemplarsLoading, setExemplarsLoading] = useState(false);
  const [expandedExemplarIds, setExpandedExemplarIds] = useState<Set<number>>(new Set());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingReclassify, setConfirmingReclassify] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  async function openEdit(bucket: PanelBucket) {
    setEditingId(bucket.id);
    setEditName(bucket.name);
    setEditDesc(bucket.description ?? '');
    setOriginalDesc(bucket.description ?? '');
    setSaveState('idle');
    setSaveError('');
    setConfirmingDelete(false);
    setConfirmingReclassify(false);
    setExemplars([]);
    setExpandedExemplarIds(new Set());
    setExemplarsLoading(true);
    try {
      const res = await fetch(`/api/buckets/${bucket.id}/exemplars`);
      if (res.ok) {
        const data = await res.json() as Exemplar[];
        setExemplars(data);
      }
    } finally {
      setExemplarsLoading(false);
    }
  }

  function closeEdit() {
    setEditingId(null);
    setSaveState('idle');
    setSaveError('');
    setConfirmingDelete(false);
    setConfirmingReclassify(false);
  }

  function handleSaveClick(bucketId: number) {
    // Description changed → gate behind "Confirm & Reclassify"
    if (editDesc.trim() !== originalDesc.trim()) {
      setConfirmingReclassify(true);
    } else {
      void saveEdit(bucketId);
    }
  }

  async function saveEdit(bucketId: number) {
    setSaveState('saving');
    setSaveError('');
    const res = await fetch(`/api/buckets/${bucketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, description: editDesc }),
    });
    const data = await res.json() as { error?: string; needsReclassify?: boolean; name?: string; description?: string };
    if (!res.ok) { setSaveState('error'); setSaveError(data.error ?? 'Save failed'); setConfirmingReclassify(false); return; }
    setBuckets((prev) => prev.map((b) => b.id === bucketId ? { ...b, name: editName, description: editDesc } : b));
    setSaveState('done');
    setTimeout(() => closeEdit(), 800);
    if (data.needsReclassify) {
      onBucketUpdated?.(bucketId);
    } else {
      onBucketsChanged();
    }
  }

  async function submitBucket() {
    setFormState('submitting');
    setCreateError('');
    const response = await fetch('/api/buckets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    const data = await response.json() as { status?: string; error?: string; bucket?: PanelBucket };

    if (!response.ok) { setFormState('idle'); setCreateError(data.error ?? 'Failed to create bucket'); return; }
    if (data.status === 'created' && data.bucket) {
      setBuckets((prev) => [...prev, data.bucket!]);
      setFormState('idle');
      setName('');
      setDescription('');
      onBucketCreated(data.bucket);
    }
  }

  async function deleteBucket(bucketId: number, bucketName: string) {
    const response = await fetch(`/api/buckets/${bucketId}`, { method: 'DELETE' });
    const data = await response.json() as { deleted?: boolean; error?: string };
    if (!response.ok) { showToast(data.error ?? 'Delete failed'); return; }
    setBuckets((prev) => prev.filter((b) => b.id !== bucketId));
    closeEdit();
    showToast(`"${bucketName}" deleted.`);
    onBucketDeleted(bucketId, bucketName);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(59,50,38,0.2)' }} onClick={onClose} />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
            style={{ width: 400, background: 'var(--bg-elevated)', boxShadow: '0 4px 24px rgba(59,50,38,0.12)', borderLeft: '1px solid rgba(221,210,192,0.4)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <span className="heading-sm" style={{ color: 'var(--text-primary)' }}>Manage Buckets</span>
              <button className="btn-ghost btn-sm rounded-full" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, width: 28, height: 28, padding: 0 }}>×</button>
            </div>

            {/* New bucket form — top section */}
            {!isDemo && (
              <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-default)' }}>
                <p className="body-sm mb-3" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>New Bucket</p>

                {(formState === 'idle' || formState === 'submitting') && (
                  <>
                    <input
                      className="w-full mb-2 px-3 py-2 body-sm rounded"
                      placeholder="Bucket name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                      disabled={formState === 'submitting'}
                    />
                    <textarea
                      className="w-full mb-2 px-3 py-2 body-sm rounded resize-none"
                      placeholder="What goes in here? (plain English)"
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                      disabled={formState === 'submitting'}
                    />
                    {createError && <p className="body-sm mb-2" style={{ color: 'var(--color-error)' }}>{createError}</p>}
                    <button
                      className="btn-primary btn-sm w-full"
                      onClick={() => submitBucket()}
                      disabled={formState === 'submitting' || !name.trim() || !description.trim()}
                    >
                      {formState === 'submitting' ? 'Creating...' : 'Create Bucket'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Bucket list — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="body-sm mb-3" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Your Buckets</p>
              <div className="flex flex-col gap-1">
                {buckets.map((bucket) => (
                  <div key={bucket.id}>
                    {editingId === bucket.id ? (
                      /* Inline edit */
                      <div className="rounded p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}>
                        <input
                          className="w-full mb-2 px-2 py-1.5 body-sm rounded"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                        />
                        <textarea
                          className="w-full mb-2 px-2 py-1.5 body-sm rounded resize-none"
                          rows={3}
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                        />
                        {exemplarsLoading && (
                          <p className="body-sm mb-2" style={{ color: 'var(--text-tertiary)' }}>Loading exemplars…</p>
                        )}
                        {!exemplarsLoading && exemplars.length > 0 && (
                          <div className="flex flex-col gap-1 mb-2">
                            {exemplars.map((ex) => {
                              const isExpanded = expandedExemplarIds.has(ex.id);
                              return (
                                <button
                                  key={ex.id}
                                  type="button"
                                  onClick={() => setExpandedExemplarIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(ex.id)) next.delete(ex.id); else next.add(ex.id);
                                    return next;
                                  })}
                                  className="w-full text-left px-2 py-1 rounded cursor-pointer"
                                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 11, border: '1px solid var(--border-default)', transition: 'background 150ms ease' }}
                                >
                                  <span style={isExpanded ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                                    {ex.text}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {saveError && <p className="body-sm mb-2" style={{ color: 'var(--color-error)' }}>{saveError}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          {confirmingReclassify ? (
                            <>
                              <button
                                className="btn-primary btn-sm flex-1"
                                onClick={() => saveEdit(bucket.id)}
                                disabled={saveState === 'saving'}
                              >
                                {saveState === 'saving' ? 'Saving…' : saveState === 'done' ? '✓ Saved' : 'Confirm & Reclassify'}
                              </button>
                              <button className="btn-ghost btn-sm" onClick={() => setConfirmingReclassify(false)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button
                                className="btn-primary btn-sm flex-1"
                                onClick={() => handleSaveClick(bucket.id)}
                                disabled={saveState === 'saving' || !editName.trim() || !editDesc.trim()}
                              >
                                {saveState === 'saving' ? 'Saving…' : saveState === 'done' ? '✓ Saved' : 'Save'}
                              </button>
                              <button className="btn-ghost btn-sm" onClick={closeEdit}>Cancel</button>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          {confirmingDelete ? (
                            <>
                              <button
                                className="btn-ghost btn-sm flex-1"
                                style={{ color: 'var(--color-error)', fontWeight: 600, border: '1px solid var(--color-error)' }}
                                onClick={() => deleteBucket(bucket.id, bucket.name)}
                              >
                                Yes, delete
                              </button>
                              <button
                                className="btn-ghost btn-sm"
                                onClick={() => setConfirmingDelete(false)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn-ghost btn-sm"
                              style={{ color: 'var(--color-error)' }}
                              onClick={() => setConfirmingDelete(true)}
                            >
                              Delete this bucket
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Idle row */
                      <div className="flex items-center justify-between py-2 px-1 rounded" style={{ transition: 'background 150ms ease' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: bucket.color }} />
                          <span className="body-sm truncate" style={{ color: 'var(--text-primary)' }}>{bucket.name}</span>
                        </div>
                        {!DEFAULT_BUCKET_NAMES.has(bucket.name) && !isDemo && (
                          <button
                            className="btn-ghost btn-sm flex-shrink-0"
                            style={{ color: 'var(--text-tertiary)', padding: '2px 6px', fontSize: 14 }}
                            onClick={() => openEdit(bucket)}
                            title="Edit bucket"
                          >
                            ✎
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {toast && (
              <div className="px-5 py-3 body-sm flex-shrink-0" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-default)' }}>
                {toast}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
