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
        const engine = getDJController().engine
        await processLibraryTrackStems(nextItem.track, engine)
        updateStemProgress(nextItem.trackId, { status: 'done', progress: 'Complete! ✅' })
        
        // Auto-load into decks if they happen to be playing this track
        const state = useAppStore.getState()
        const dj = getDJController()
        if (state.deckA.track?.stemTrackId === nextItem.trackId) dj.loadStemsFromDisk('A', nextItem.trackId)
        if (state.deckB.track?.stemTrackId === nextItem.trackId) dj.loadStemsFromDisk('B', nextItem.trackId)
        
        // Handle native notification
        const isPopupOpen = !!document.querySelector('.modal-overlay')
        if (isPopupOpen) {
          // Leave it in queue for 1s to show the 'v' animation, then remove
          setTimeout(() => {
            useAppStore.getState().removeStemProcess(nextItem.trackId)
          }, 1000)
        } else {
          // Popup closed, show native notification and remove immediately
          new window.Notification('Stems Ready ✅', {
            body: `${nextItem.track.name} stems have been successfully generated!`
          })
          useAppStore.getState().removeStemProcess(nextItem.trackId)
        }
      } catch (error) {
        console.error('Stem Queue processing error:', error)
        updateStemProgress(nextItem.trackId, { status: 'error', progress: 'Failed', error: error.message })
      } finally {
        isProcessingRef.current = false
      }
    }

    processNext()
  }, [stemQueue, updateStemProgress, removeStemProcess])
}
