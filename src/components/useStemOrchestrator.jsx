import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { getDJController } from '../engine/DJController'
import { processLibraryTrackStems } from '../engine/StemSeparator'

export function useStemOrchestrator() {
  const stemQueue = useAppStore(s => s.stemQueue)
  const updateStemProgress = useAppStore(s => s.updateStemProgress)
  const removeStemProcess = useAppStore(s => s.removeStemProcess)
  
  const isProcessingRef = useRef(false)

  useEffect(() => {
    // Only proceed if we're not currently processing something
    if (isProcessingRef.current) return
    
    // Find next pending item
    const nextItem = stemQueue.find(item => item.status === 'pending')
    if (!nextItem) return

    const processNext = async () => {
      isProcessingRef.current = true
      updateStemProgress(nextItem.trackId, { status: 'processing', progress: 'Starting...' })
      
      try {
        const state = useAppStore.getState()
        if (state.deckA.track?.stemTrackId === nextItem.trackId) {
          state.updateDeck('A', { stemsFailed: false })
        }
        if (state.deckB.track?.stemTrackId === nextItem.trackId) {
          state.updateDeck('B', { stemsFailed: false })
        }

        const engine = getDJController().engine
        await processLibraryTrackStems(nextItem.track, engine)
        updateStemProgress(nextItem.trackId, { status: 'done', progress: 'Complete' })
        
        // Auto-load into decks if they happen to be playing this track
        const currentState = useAppStore.getState()
        const dj = getDJController()
        if (currentState.deckA.track?.stemTrackId === nextItem.trackId) dj.loadStemsFromDisk('A', nextItem.trackId)
        if (currentState.deckB.track?.stemTrackId === nextItem.trackId) dj.loadStemsFromDisk('B', nextItem.trackId)
        
        // Notify user via in-app toast (safe, never throws)
        try {
          useAppStore.getState().addToast(
            `Stems ready: ${nextItem.track.name}`,
            'success',
            5000
          )
        } catch (_) { /* never crash on notification */ }

        // Leave it in queue briefly to show the checkmark animation, then remove
        const isPopupOpen = !!document.querySelector('.modal-overlay')
        if (isPopupOpen) {
          setTimeout(() => {
            useAppStore.getState().removeStemProcess(nextItem.trackId)
          }, 1000)
        } else {
          useAppStore.getState().removeStemProcess(nextItem.trackId)
        }
      } catch (error) {
        console.error('Stem Queue processing error:', error)
        updateStemProgress(nextItem.trackId, { status: 'error', progress: 'Failed', error: error.message })

        // Also update deck UI so it stops showing stale progress
        const state = useAppStore.getState()
        if (state.deckA.track?.stemTrackId === nextItem.trackId) {
          state.updateDeck('A', { stemsFailed: true, stemsProgress: '' })
        }
        if (state.deckB.track?.stemTrackId === nextItem.trackId) {
          state.updateDeck('B', { stemsFailed: true, stemsProgress: '' })
        }

        // Show failure toast
        try {
          useAppStore.getState().addToast(
            `Stem separation failed: ${nextItem.track.name}`,
            'error',
            6000
          )
        } catch (_) { /* never crash on notification */ }
      } finally {
        isProcessingRef.current = false
      }
    }

    processNext()
  }, [stemQueue, updateStemProgress, removeStemProcess])
}
