import React, { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'

export function LyricsView({ deckId }) {
  const deckState = useAppStore(s => deckId === 'A' ? s.deckA : s.deckB)
  const containerRef = useRef(null)

  const { lyrics, position, showLyrics } = deckState

  useEffect(() => {
    if (!showLyrics || !lyrics || lyrics.length === 0 || !containerRef.current) return

    // Find the active index
    const activeIndex = lyrics.findIndex((segment, i) => {
      const nextSegment = lyrics[i + 1]
      return position >= segment.start && (!nextSegment || position < nextSegment.start)
    })

    if (activeIndex !== -1) {
      const container = containerRef.current
      const activeElement = container.children[activeIndex]
      
      if (activeElement) {
        // Scroll to center the active line
        const topOffset = activeElement.offsetTop - (container.offsetHeight / 2) + (activeElement.offsetHeight / 2)
        container.scrollTo({ top: topOffset, behavior: 'smooth' })
      }
    }
  }, [position, lyrics, showLyrics])

  if (!showLyrics || !lyrics) return null

  return (
    <div className="lyrics-view" ref={containerRef}>
      {lyrics.map((segment, idx) => {
        // A segment is active if the current position falls within its start time and end time.
        // We add a small 0.2s padding so it doesn't flicker instantly if there's a tiny gap.
        const isActive = position >= segment.start && position <= (segment.start + segment.duration + 0.2)
        const isPassed = position > (segment.start + segment.duration + 0.2)

        return (
          <div 
            key={`${idx}-${segment.start}`} 
            className={`lyrics-line ${isActive ? 'lyrics-line--active' : ''} ${isPassed ? 'lyrics-line--passed' : ''}`}
            onClick={() => {
              // Optionally seek to the start of this lyric when clicked
              // Need DJController instance here to seek
            }}
          >
            {segment.text}
          </div>
        )
      })}
    </div>
  )
}
