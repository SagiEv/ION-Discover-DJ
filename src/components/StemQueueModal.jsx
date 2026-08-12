import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore, getTrackId } from '../store/appStore'
import { CountdownETA } from './CountdownETA.jsx'

export function StemQueueModal({ onClose }) {
  const stemQueue = useAppStore(s => s.stemQueue)
  const library = useAppStore(s => s.library)
  const queueStemProcess = useAppStore(s => s.queueStemProcess)
  const removeStemProcess = useAppStore(s => s.removeStemProcess)
  const clearPendingStemQueue = useAppStore(s => s.clearPendingStemQueue)
  const reorderStemQueue = useAppStore(s => s.reorderStemQueue)
  const cancelStemProcess = useAppStore(s => s.cancelStemProcess)
  const retryStemProcess = useAppStore(s => s.retryStemProcess)

  const startTimes = useRef({})

  const [allMissingStems, setAllMissingStems] = useState([])
  const [checking, setChecking] = useState(true)
  const [selectedMissing, setSelectedMissing] = useState(new Set())
  const [draggedIdx, setDraggedIdx] = useState(null)
  
  const [isClosing, setIsClosing] = useState(false)

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(onClose, 200) // Match CSS transition duration
  }, [onClose])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  useEffect(() => {
    const checkLibraryStems = async () => {
      setChecking(true)
      const missing = []
      for (const track of library) {
        const trackId = getTrackId(track)
        if (!trackId) continue
        
        const exists = await window.electronAPI.checkStems(trackId)
        if (!exists) {
          missing.push(track)
        }
      }
      setAllMissingStems(missing)
      setChecking(false)
    }
    
    checkLibraryStems()
  }, [library])

  const queuedIds = new Set(stemQueue.map(item => item.trackId))
  const missingStems = allMissingStems.filter(track => {
    const trackId = getTrackId(track)
    return !queuedIds.has(trackId)
  })

  const handleProcessSelected = () => {
    if (selectedMissing.size === 0) {
      missingStems.forEach(track => queueStemProcess(track))
    } else {
      missingStems
        .filter(track => selectedMissing.has(getTrackId(track)))
        .forEach(track => queueStemProcess(track))
      setSelectedMissing(new Set())
    }
  }

  const toggleSelect = (trackId) => {
    const newSet = new Set(selectedMissing)
    if (newSet.has(trackId)) newSet.delete(trackId)
    else newSet.add(trackId)
    setSelectedMissing(newSet)
  }

  const handleDragStart = (e, idx) => {
    e.dataTransfer.setData('text/plain', idx)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedIdx(idx)
  }
  
  const handleDragOver = (e, idx) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  
  const handleDrop = (e, targetIdx) => {
    e.preventDefault()
    const sourceIdx = draggedIdx
    setDraggedIdx(null)
    if (sourceIdx !== null && sourceIdx !== targetIdx) {
      const sourceItem = stemQueue[sourceIdx]
      if (sourceItem.status === 'processing') return // Cannot move the currently processing item
      reorderStemQueue(sourceIdx, targetIdx)
    }
  }

  return (
    <div className={`modal-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`modal ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()} style={{ width: '640px', maxHeight: '85vh' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px', color: 'var(--accent-a)'}}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          AI Stems Manager
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ margin: 0 }}>Currently in Queue ({stemQueue.length})</h3>
          {stemQueue.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '14px', margin: 0 }}>Queue is empty.</p>
          ) : (
            <div className="modal-queue-list" style={{ maxHeight: '200px' }}>
              {stemQueue.map((item, idx) => (
                <div 
                  key={item.trackId} 
                  className="modal-queue-item"
                  draggable={item.status === 'pending'}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={() => setDraggedIdx(null)}
                  style={{ 
                    cursor: item.status === 'pending' ? 'grab' : 'default',
                    opacity: draggedIdx === idx ? 0.5 : 1,
                    background: draggedIdx === idx ? 'var(--bg-hover)' : ''
                  }}
                >
                  {item.status === 'pending' && (
                    <div className="drag-handle" title="Drag to reorder">⠿</div>
                  )}
                  {item.status === 'processing' && (
                    <div className="drag-handle" style={{ cursor: 'default', color: 'var(--accent-a)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin-anim" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
                    </div>
                  )}
                  {item.status === 'done' && (
                    <div className="drag-handle status-done" style={{ cursor: 'default', color: 'var(--accent-a)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                  {item.status === 'error' && (
                    <div className="drag-handle" style={{ cursor: 'default', color: 'var(--accent-red)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </div>
                  )}
                  <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>{item.track.name}</strong>
                    {(() => {
                      if (item.status !== 'processing') {
                        return <div style={{ fontSize: '12px', color: item.status === 'error' ? 'var(--accent-red)' : 'var(--text-dim)' }}>{item.progress}</div>
                      }
                      
                      const match = item.progress.match(/(\d+)\/(\d+)/)
                      if (match) {
                        const current = parseInt(match[1], 10)
                        const total = parseInt(match[2], 10)
                        const pct = total > 0 ? (current / total) * 100 : 0
                        
                        return (
                          <div style={{ marginTop: '4px', width: '100%', maxWidth: '240px' }}>
                            <div style={{ width: '100%', height: '6px', background: 'var(--bg-raised)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                              <div className="progress-bar-glow" style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-a)', transition: 'width 0.2s linear' }} />
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--accent-a)', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                              <span>{item.progress}</span>
                              <CountdownETA totalSteps={total} currentStep={current} trackId={item.trackId} progressStr={item.progress} />
                            </div>
                          </div>
                        )
                      }
                      
                      return <div style={{ fontSize: '12px', color: 'var(--accent-a)' }}>{item.progress}</div>
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {item.status === 'processing' && (
                      <button className="btn-icon danger" style={{ fontSize: '12px', padding: '2px 8px', width: 'auto' }} onClick={() => cancelStemProcess(item.trackId)} title="Cancel">
                        Cancel
                      </button>
                    )}
                    {item.status === 'error' && (
                      <button className="btn-icon success" style={{ fontSize: '12px', padding: '2px 8px', width: 'auto' }} onClick={() => retryStemProcess(item.trackId)} title="Retry">
                        Retry
                      </button>
                    )}
                    {item.status !== 'processing' && (
                      <button className="btn-icon danger" onClick={() => removeStemProcess(item.trackId)} title="Remove from queue">
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {stemQueue.some(item => item.status === 'pending') && (
            <div style={{ textAlign: 'right' }}>
              <button className="btn-secondary" onClick={clearPendingStemQueue}>Clear Pending</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflow: 'hidden' }}>
          <h3 style={{ margin: 0 }}>Library Suggestions</h3>
          {checking ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '14px', margin: 0 }}>Scanning library for missing stems...</p>
          ) : (
            <>
              {missingStems.length > 0 ? (
                <>
                  <p style={{ fontSize: '14px', margin: 0, color: 'var(--text-secondary)' }}>Found {missingStems.length} tracks without generated stems.</p>
                  
                  <div className="modal-queue-list" style={{ flex: 1 }}>
                    {missingStems.map((track, idx) => {
                      const trackId = getTrackId(track)
                      return (
                        <div 
                          key={trackId} 
                          className="modal-queue-item"
                          onClick={() => toggleSelect(trackId)}
                        >
                          <label className="custom-checkbox-wrapper" onClick={e => e.stopPropagation()}>
                            <input 
                              className="custom-checkbox-input"
                              type="checkbox" 
                              checked={selectedMissing.has(trackId)} 
                              onChange={() => toggleSelect(trackId)} 
                            />
                            <div className="custom-checkbox-box"></div>
                          </label>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: '14px' }}>{track.name}</span>
                          <button className="btn-icon success" onClick={(e) => { e.stopPropagation(); queueStemProcess(track); }} title="Add to queue">
                            +
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  <button className="btn-generate" onClick={handleProcessSelected} style={{ marginTop: '12px' }}>
                    {selectedMissing.size > 0 ? `Generate Stems for Selected (${selectedMissing.size})` : 'Generate Stems for All Missing Tracks'}
                  </button>
                </>
              ) : (
                <p style={{ color: 'var(--text-dim)', fontSize: '14px', margin: 0 }}>All tracks in your library have stems generated!</p>
              )}
            </>
          )}
        </div>

        <div style={{ textAlign: 'right', marginTop: '8px' }}>
          <button className="btn-secondary" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
