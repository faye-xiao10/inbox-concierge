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
  onBucketDeleted: (bucketId: number, bucketName: string, displacedThreadIds: string[]) => void;
  onBucketsChanged: () => void;
}

type FormState = 'idle' | 'submitting';

interface Exemplar {
  id: number;
  text: string | null;
}

export default function ManageBucketsPanel({ isOpen, onClose, buckets: initialBuckets, isDemo, onBucketCreated, onBucketDeleted, onBucketsChanged }: ManageBucketsPanelProps) {
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
  const [exemplars, setExemplars] = useState<Exemplar[]>([]);
  const [exemplarsLoading, setExemplarsLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  async function openEdit(bucket: PanelBucket) {
    setEditingId(bucket.id);
    setEditName(bucket.name);
    setEditDesc(bucket.description ?? '');
    setSaveState('idle');
    setSaveError('');
    setConfirmingDelete(false);
    setExemplars([]);
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
  }

  async function saveEdit(bucketId: number) {
    setSaveState('saving');
    setSaveError('');
    const res = await fetch(`/api/buckets/${bucketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, description: editDesc }),
    });
    const data = await res.json() as { error?: string; name?: string; description?: string };
    if (!res.ok) { setSaveState('error'); setSaveError(data.error ?? 'Save failed'); return; }
    setBuckets((prev) => prev.map((b) => b.id === bucketId ? { ...b, name: editName, description: editDesc } : b));
    setSaveState('done');
    setTimeout(() => closeEdit(), 800);
    onBucketsChanged();
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
    const data = await response.json() as { displaced?: number; displacedThreadIds?: string[]; error?: string };
    if (!response.ok) { showToast(data.error ?? 'Delete failed'); return; }
    setBuckets((prev) => prev.filter((b) => b.id !== bucketId));
    closeEdit();
    const count = data.displaced ?? 0;
    showToast(`"${bucketName}" deleted. ${count} email${count !== 1 ? 's' : ''} will be reclassified.`);
    onBucketDeleted(bucketId, bucketName, data.displacedThreadIds ?? []);
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
            style={{ width: 400, background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-md)', borderLeft: '1px solid var(--border-default)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <span className="heading-sm" style={{ color: 'var(--text-primary)' }}>Manage Buckets</span>
              <button className="btn-ghost btn-sm" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>×</button>
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
                          <div className="flex flex-wrap gap-1 mb-2">
                            {exemplars.map((ex) => (
                              <span
                                key={ex.id}
                                className="px-2 py-0.5 rounded-full"
                                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 11, border: '1px solid var(--border-default)' }}
                              >
                                {ex.text}
                              </span>
                            ))}
                          </div>
                        )}
                        {saveError && <p className="body-sm mb-2" style={{ color: 'var(--color-error)' }}>{saveError}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            className="btn-primary btn-sm flex-1"
                            onClick={() => saveEdit(bucket.id)}
                            disabled={saveState === 'saving' || !editName.trim() || !editDesc.trim()}
                          >
                            {saveState === 'saving' ? 'Saving…' : saveState === 'done' ? '✓ Saved' : 'Save'}
                          </button>
                          <button className="btn-ghost btn-sm" onClick={closeEdit}>Cancel</button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          {confirmingDelete ? (
                            <>
                              <button
                                className="btn-ghost btn-sm"
                                style={{ color: 'var(--color-error)', fontWeight: 600 }}
                                onClick={() => deleteBucket(bucket.id, bucket.name)}
                              >
                                Are you sure? Click to confirm
                              </button>
                              <button
                                className="btn-ghost btn-sm"
                                style={{ color: 'var(--text-tertiary)' }}
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
                          {bucket.isDefault && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>🔒</span>}
                        </div>
                        {!bucket.isDefault && !isDemo && (
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
