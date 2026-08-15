import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '../store/appStore.js'
import { getDJController } from '../engine/DJController.js'

// ─── Tag color map ────────────────────────────────────────────────────────────
const TAG_COLORS = {
  'POP':          { bg: 'rgba(236, 72, 153, 0.18)', color: '#ec4899', border: 'rgba(236, 72, 153, 0.4)' },
  'EDM':          { bg: 'rgba(139, 92, 246, 0.18)', color: '#8b5cf6', border: 'rgba(139, 92, 246, 0.4)' },
  'HOUSE':        { bg: 'rgba(59, 130, 246, 0.18)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.4)' },
  'TECHNO':       { bg: 'rgba(107, 114, 128, 0.25)', color: '#9ca3af', border: 'rgba(107, 114, 128, 0.4)' },
  'HIP HOP':      { bg: 'rgba(245, 158, 11, 0.18)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.4)' },
  'R&B':          { bg: 'rgba(244, 63, 94, 0.18)', color: '#f43f5e', border: 'rgba(244, 63, 94, 0.4)' },
  'FESTIVAL':     { bg: 'rgba(34, 211, 238, 0.18)', color: '#22d3ee', border: 'rgba(34, 211, 238, 0.4)' },
  'HIGH ENERGY':  { bg: 'rgba(239, 68, 68, 0.18)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.4)' },
  'CHILL':        { bg: 'rgba(16, 185, 129, 0.18)', color: '#10b981', border: 'rgba(16, 185, 129, 0.4)' },
  'CLASSIC':      { bg: 'rgba(251, 191, 36, 0.18)', color: '#fbbf24', border: 'rgba(251, 191, 36, 0.4)' },
  'DRUM & BASS':  { bg: 'rgba(249, 115, 22, 0.18)', color: '#f97316', border: 'rgba(249, 115, 22, 0.4)' },
  'TRANCE':       { bg: 'rgba(167, 139, 250, 0.18)', color: '#a78bfa', border: 'rgba(167, 139, 250, 0.4)' },
}
const DEFAULT_TAG_COLOR = { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' }

function getTagStyle(tag) {
  return TAG_COLORS[tag] || DEFAULT_TAG_COLOR
}

// ─── Tag Pill ─────────────────────────────────────────────────────────────────
function TagPill({ tag, active, onClick, small, removable, onRemove }) {
  const s = getTagStyle(tag)
  return (
    <span
      className={`bm-tag${active ? ' bm-tag--active' : ''}${small ? ' bm-tag--sm' : ''}`}
      style={{
        background: active ? s.color : s.bg,
        color: active ? '#000' : s.color,
        borderColor: active ? s.color : s.border,
      }}
      onClick={onClick}
    >
      {tag}
      {removable && (
        <span className="bm-tag__remove" onClick={(e) => { e.stopPropagation(); onRemove?.() }}>×</span>
      )}
    </span>
  )
}

// ─── Sidebar Tree Item ────────────────────────────────────────────────────────
function TreeItem({ nodeId, depth = 0, currentFolderId, onNavigate, onContextMenu }) {
  const node = useAppStore(s => s.fsNodes[nodeId])
  const fsNodes = useAppStore(s => s.fsNodes)
  const addTrackToFolder = useAppStore(s => s.addTrackToFolder)
  const library = useAppStore(s => s.library)
  const addToast = useAppStore(s => s.addToast)
  const [expanded, setExpanded] = useState(depth < 2)
  const [isDragOver, setIsDragOver] = useState(false)

  if (!node || node.type === 'track') return null

  const isActive = currentFolderId === nodeId
  const childFolders = (node.children || []).filter(cid => {
    const child = fsNodes[cid]
    return child && (child.type === 'folder' || child.type === 'set')
  })
  const hasChildren = childFolders.length > 0
  const icon = node.type === 'set' ? '🎧' : nodeId === 'sets_root' ? '💾' : nodeId === 'root' ? '🎵' : '📁'

  return (
    <div className="bm-tree-item-group">
      <div
        className={`bm-tree-item${isActive ? ' bm-tree-item--active' : ''}${isDragOver ? ' bm-tree-item--drag-over' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => {
          onNavigate(nodeId)
          if (hasChildren) setExpanded(!expanded)
        }}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, nodeId) }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOver(false)
          const trackIndex = e.dataTransfer.getData('text/track-index')
          if (trackIndex !== '') {
            const track = library[parseInt(trackIndex, 10)]
            if (track) {
              addTrackToFolder(nodeId, track)
              addToast(`Added "${track.name}" to ${node.name}`, 'success')
            }
          }
        }}
      >
        {hasChildren ? (
          <span className={`bm-tree-item__arrow${expanded ? ' expanded' : ''}`}>▸</span>
        ) : (
          <span className="bm-tree-item__arrow" style={{ visibility: 'hidden' }}>▸</span>
        )}
        <span className="bm-tree-item__icon">{icon}</span>
        <span className="bm-tree-item__name">{node.name}</span>
        {node.type === 'set' && <span className="bm-tree-item__badge">SET</span>}
        {(nodeId !== 'root' && nodeId !== 'sets_root') && (
          <span className="bm-tree-item__more" onClick={(e) => { e.stopPropagation(); onContextMenu?.(e, nodeId) }}>⋯</span>
        )}
      </div>
      {expanded && hasChildren && childFolders.map(cid => (
        <TreeItem
          key={cid}
          nodeId={cid}
          depth={depth + 1}
          currentFolderId={currentFolderId}
          onNavigate={onNavigate}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  )
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div className="bm-ctx-menu" ref={ref} style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="bm-ctx-menu__sep" />
        ) : (
          <div
            key={i}
            className={`bm-ctx-menu__item${item.danger ? ' bm-ctx-menu__item--danger' : ''}`}
            onClick={() => { item.action(); onClose() }}
          >
            <span className="bm-ctx-menu__item-icon">{item.icon}</span>
            {item.label}
          </div>
        )
      )}
    </div>
  )
}

// ─── Save Set Dialog ──────────────────────────────────────────────────────────
function SaveSetDialog({ onClose }) {
  const [name, setName] = useState('')
  const saveSet = useAppStore(s => s.saveSet)
  const addToast = useAppStore(s => s.addToast)
  const deckA = useAppStore(s => s.deckA)
  const deckB = useAppStore(s => s.deckB)

  const totalTracks = (deckA.track ? 1 : 0) + (deckB.track ? 1 : 0) + deckA.queue.length + deckB.queue.length

  const handleSave = () => {
    if (!name.trim()) return
    saveSet(name.trim())
    addToast(`Set "${name.trim()}" saved with ${totalTracks} tracks`, 'success')
    onClose()
  }

  return (
    <div className="bm-save-dialog">
      <div className="bm-save-dialog__content">
        <h3>💾 Save Current Setup as Set</h3>
        <div className="bm-save-dialog__preview">
          <div className="bm-save-dialog__deck">
            <span className="bm-save-dialog__deck-label" style={{ color: 'var(--accent-a)' }}>Deck A</span>
            <span>{deckA.track?.name || '(empty)'}</span>
            {deckA.queue.length > 0 && <span className="bm-save-dialog__queue-count">+ {deckA.queue.length} in queue</span>}
          </div>
          <div className="bm-save-dialog__deck">
            <span className="bm-save-dialog__deck-label" style={{ color: 'var(--accent-b)' }}>Deck B</span>
            <span>{deckB.track?.name || '(empty)'}</span>
            {deckB.queue.length > 0 && <span className="bm-save-dialog__queue-count">+ {deckB.queue.length} in queue</span>}
          </div>
        </div>
        <input
          type="text"
          className="bm-save-dialog__input"
          placeholder="Set name (e.g. Friday Night Mix)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          autoFocus
        />
        <div className="bm-save-dialog__actions">
          <button className="bm-btn bm-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="bm-btn bm-btn--primary" onClick={handleSave} disabled={!name.trim()}>
            Save Set
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tag Manager Dialog ───────────────────────────────────────────────────────
function TagManagerDialog({ trackPath, onClose }) {
  const allTags = useAppStore(s => s.allTags)
  const tags = useAppStore(s => s.trackTags[trackPath])
  const trackTags = tags || []
  const addTagToTrack = useAppStore(s => s.addTagToTrack)
  const removeTagFromTrack = useAppStore(s => s.removeTagFromTrack)
  const createTag = useAppStore(s => s.createTag)
  const [newTag, setNewTag] = useState('')

  const handleAddCustom = () => {
    if (!newTag.trim()) return
    const tag = newTag.trim().toUpperCase()
    createTag(tag)
    addTagToTrack(trackPath, tag)
    setNewTag('')
  }

  return (
    <div className="bm-save-dialog">
      <div className="bm-save-dialog__content">
        <h3>🏷️ Manage Tags</h3>
        <div className="bm-tag-manager__current">
          {trackTags.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No tags assigned</span>}
          {trackTags.map(tag => (
            <TagPill key={tag} tag={tag} removable onRemove={() => removeTagFromTrack(trackPath, tag)} />
          ))}
        </div>
        <div className="bm-tag-manager__all">
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Click to add:</span>
          <div className="bm-tag-manager__grid">
            {allTags.filter(t => !trackTags.includes(t)).map(tag => (
              <TagPill key={tag} tag={tag} small onClick={() => addTagToTrack(trackPath, tag)} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="text"
            className="bm-save-dialog__input"
            placeholder="Custom tag..."
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
            style={{ flex: 1 }}
          />
          <button className="bm-btn bm-btn--ghost" onClick={handleAddCustom} disabled={!newTag.trim()}>Add</button>
        </div>
        <div className="bm-save-dialog__actions">
          <button className="bm-btn bm-btn--primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Content Item ────────────────────────────────────────────────────────
function ContentItem({ node, index, isSelected, innerRef, onNavigate, onContextMenu, onDoubleClick, onTagClick, onDragStart, onDragOver, onDrop, onDragLeave, isDragOver }) {
  const tags = useAppStore(s => node?.type === 'track' && node.trackRef ? s.trackTags[node.trackRef] : null)
  const trackTags = tags || []
  const dj = getDJController()

  if (!node) return null

  const icon = node.type === 'folder'
    ? (node.id === 'sets_root' ? '💾' : '📁')
    : node.type === 'set' ? '🎧' : '🎵'

  const childCount = node.children ? node.children.length : 0

  return (
    <div
      ref={innerRef}
      className={`bm-content-item bm-content-item--${node.type}${isDragOver ? ' bm-content-item--drag-over' : ''}${isSelected ? ' bm-content-item--selected' : ''}`}
      onClick={() => node.type !== 'track' && onNavigate(node.id)}
      onDoubleClick={() => onDoubleClick?.(node.id, node)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node) }}
      draggable={node.type === 'track'}
      onDragStart={(e) => onDragStart?.(e, node.id, index)}
      onDragOver={(e) => onDragOver?.(e, node.id)}
      onDragLeave={(e) => onDragLeave?.(e, node.id)}
      onDrop={(e) => onDrop?.(e, node.id, index)}
    >
      <span className="bm-content-item__icon">{icon}</span>
      <div className="bm-content-item__info">
        <span className="bm-content-item__name">{node.name}</span>
        <div className="bm-content-item__meta">
          {(node.type === 'folder' || node.type === 'set') && <span>{childCount} items</span>}
          {trackTags.length > 0 && (
            <div className="bm-content-item__tags">
              {trackTags.map(tag => <TagPill key={tag} tag={tag} small />)}
            </div>
          )}
          {node.type === 'track' && node.trackData?.hasSubtitles && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }} title="Has Subtitles">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 1, color: 'var(--accent-a)' }}>
                <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
                <line x1="6" y1="10" x2="10" y2="10"></line>
                <line x1="14" y1="10" x2="18" y2="10"></line>
                <line x1="6" y1="14" x2="18" y2="14"></line>
              </svg>
            </div>
          )}
        </div>
      </div>
      <div className="bm-content-item__actions">
        {node.type === 'track' && (
          <>
            <button className="bm-btn bm-btn--sm bm-btn--ghost" onClick={(e) => { e.stopPropagation(); if (node.trackData) dj.loadTrack('A', node.trackData) }} title="Load to Deck A">Load A</button>
            <button className="bm-btn bm-btn--sm bm-btn--ghost" onClick={(e) => { e.stopPropagation(); if (node.trackData) dj.loadTrack('B', node.trackData) }} title="Load to Deck B">Load B</button>
            <button className="bm-btn bm-btn--sm bm-btn--ghost" onClick={(e) => { e.stopPropagation(); onTagClick?.(node.trackRef) }} title="Manage Tags">🏷️</button>
          </>
        )}
        {node.type === 'set' && (
          <button className="bm-btn bm-btn--sm bm-btn--accent" onClick={(e) => { e.stopPropagation(); onDoubleClick?.(node.id, node, true) }} title="Load Set">Load Set</button>
        )}
        <button
          className="bm-btn bm-btn--sm bm-btn--ghost"
          onClick={(e) => { e.stopPropagation(); onContextMenu(e, node) }}
          title="More actions"
        >
          ⋯
        </button>
      </div>
    </div>
  )
}

// ─── Browse Modal ─────────────────────────────────────────────────────────────
export function BrowseModal() {
  const browseOpen = useAppStore(s => s.browseOpen)
  const setBrowseOpen = useAppStore(s => s.setBrowseOpen)
  const fsNodes = useAppStore(s => s.fsNodes)
  const currentFolderId = useAppStore(s => s.currentFolderId)
  const setCurrentFolder = useAppStore(s => s.setCurrentFolder)
  const browseSearchQuery = useAppStore(s => s.browseSearchQuery)
  const setBrowseSearch = useAppStore(s => s.setBrowseSearch)
  const browseTagFilter = useAppStore(s => s.browseTagFilter)
  const toggleBrowseTag = useAppStore(s => s.toggleBrowseTag)
  const clearBrowseTagFilter = useAppStore(s => s.clearBrowseTagFilter)
  const allTags = useAppStore(s => s.allTags)
  const trackTags = useAppStore(s => s.trackTags)
  const createFolder = useAppStore(s => s.createFolder)
  const deleteItem = useAppStore(s => s.deleteItem)
  const renameItem = useAppStore(s => s.renameItem)
  const addToQueue = useAppStore(s => s.addToQueue)
  const importToLibrary = useAppStore(s => s.importToLibrary)
  const loadSet = useAppStore(s => s.loadSet)
  const addToast = useAppStore(s => s.addToast)
  const library = useAppStore(s => s.library)
  const addTrackToFolder = useAppStore(s => s.addTrackToFolder)
  const setBrowseListCount = useAppStore(s => s.setBrowseListCount)
  const setActiveLoadCallback = useAppStore(s => s.setActiveLoadCallback)
  const browseIndex = useAppStore(s => s.browseIndex)

  const [showSaveSet, setShowSaveSet] = useState(false)
  const [tagManagerTrack, setTagManagerTrack] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [addTrackMode, setAddTrackMode] = useState(false)
  const [closing, setClosing] = useState(false)
  const itemRefs = useRef({})

  const currentNode = fsNodes[currentFolderId] || fsNodes['root']

  // Build breadcrumb path
  const breadcrumb = useMemo(() => {
    const path = []
    let nodeId = currentFolderId
    while (nodeId) {
      const node = fsNodes[nodeId]
      if (!node) break
      path.unshift({ id: nodeId, name: node.name })
      nodeId = node.parentId
    }
    return path
  }, [currentFolderId, fsNodes])

  // Get children of current folder, apply search & tag filters
  const filteredChildren = useMemo(() => {
    const query = browseSearchQuery.toLowerCase().trim()
    const tagFilters = browseTagFilter

    // If searching, search ALL nodes globally
    if (query || tagFilters.length > 0) {
      const results = Object.values(fsNodes).filter(node => {
        if (node.type === 'folder' && node.id !== 'sets_root') return false // Don't show folders in search results (except sets_root)
        let matchesQuery = true
        let matchesTags = true

        if (query) {
          const nameMatch = node.name.toLowerCase().includes(query)
          const tagMatch = node.trackRef && (trackTags[node.trackRef] || []).some(t => t.toLowerCase().includes(query))
          matchesQuery = nameMatch || tagMatch
        }

        if (tagFilters.length > 0 && node.type === 'track' && node.trackRef) {
          const nodeTags = trackTags[node.trackRef] || []
          matchesTags = tagFilters.some(tf => nodeTags.includes(tf))
        } else if (tagFilters.length > 0 && node.type !== 'track') {
          // Sets match if their name matches tags, otherwise hide
          matchesTags = tagFilters.some(tf => node.name.toUpperCase().includes(tf))
        }

        return matchesQuery && matchesTags
      })

      // Deduplicate tracks by trackRef so we don't show the same song 5 times if it's in 5 folders
      const seenRefs = new Set()
      const uniqueResults = []
      for (const node of results) {
        if (node.type === 'track' && node.trackRef) {
          if (!seenRefs.has(node.trackRef)) {
            seenRefs.add(node.trackRef)
            uniqueResults.push(node)
          }
        } else {
          uniqueResults.push(node)
        }
      }

      return uniqueResults
    }

    // Normal folder view
    const childrenNodes = (currentNode.children || []).map(id => fsNodes[id]).filter(Boolean)
    if (currentNode.id === 'root') {
      // It's the root node. Combine children (folders) with the global library (tracks).
      const libraryNodes = library.map(t => ({
        id: `lib_${t.path}`,
        type: 'track',
        name: t.name,
        trackRef: t.path,
        trackData: t
      }))
      
      // Filter out library nodes that happen to match tracks the user already accidentally added to root
      const existingRefs = new Set(childrenNodes.filter(n => n.type === 'track' && n.trackRef).map(n => n.trackRef))
      const filteredLibNodes = libraryNodes.filter(n => !existingRefs.has(n.trackRef))
      
      return [...childrenNodes, ...filteredLibNodes]
    }
    return childrenNodes
  }, [currentNode, browseSearchQuery, browseTagFilter, fsNodes, trackTags, library])

  // Sort: folders first, then sets, then tracks
  const sortedChildren = useMemo(() => {
    return [...filteredChildren].sort((a, b) => {
      const typeOrder = { folder: 0, set: 1, track: 2 }
      const ta = typeOrder[a.type] ?? 3
      const tb = typeOrder[b.type] ?? 3
      if (ta !== tb) return ta - tb
      return a.name.localeCompare(b.name)
    })
  }, [filteredChildren])

  useEffect(() => {
    const el = itemRefs.current[browseIndex]
    if (el && browseOpen) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [browseIndex, browseOpen])

  useEffect(() => {
    if (browseOpen) {
      setBrowseListCount(sortedChildren.length)
      setActiveLoadCallback((deckId, index) => {
        const node = sortedChildren[index]
        if (!node) return
        if (node.type === 'track') {
          const dj = getDJController()
          if (node.trackData) dj.loadTrack(deckId, node.trackData)
        }
      })
    }
  }, [sortedChildren, browseOpen, setBrowseListCount, setActiveLoadCallback])

  const handleNavigate = useCallback((id) => {
    setCurrentFolder(id)
    setContextMenu(null)
  }, [setCurrentFolder])

  const handleContextMenu = useCallback((e, nodeOrId) => {
    e.preventDefault?.()
    e.stopPropagation?.()
    const node = typeof nodeOrId === 'string' ? fsNodes[nodeOrId] : nodeOrId
    if (!node) return

    const items = []

    if (node.type === 'track') {
      items.push(
        { icon: '+A', label: 'Add to Queue A', action: () => { if (node.trackData) addToQueue('A', node.trackData) } },
        { icon: '+B', label: 'Add to Queue B', action: () => { if (node.trackData) addToQueue('B', node.trackData) } },
        { separator: true },
        { icon: '📥', label: 'Import to Library', action: () => { importToLibrary(node.id); addToast('Track imported to library', 'success') } }
      )
      
      if (!node.id.startsWith('lib_')) {
        items.push(
          { separator: true },
          { icon: '✏️', label: 'Rename', action: () => { setRenamingId(node.id); setRenameValue(node.name) } },
          { icon: '🗑️', label: 'Delete', danger: true, action: () => deleteItem(node.id) },
        )
      }
    } else if (node.type === 'set') {
      items.push(
        { icon: '▶️', label: 'Load Set', action: () => { loadSet(node.id); setBrowseOpen(false) } },
        { separator: true },
        { icon: '📥', label: 'Import to Library', action: () => { importToLibrary(node.id); addToast('Set tracks imported to library', 'success') } },
        { separator: true },
        { icon: '✏️', label: 'Rename', action: () => { setRenamingId(node.id); setRenameValue(node.name) } },
        { icon: '🗑️', label: 'Delete', danger: true, action: () => deleteItem(node.id) },
      )
    } else if (node.type === 'folder') {
      items.push(
        { icon: '📥', label: 'Import All to Library', action: () => { importToLibrary(node.id); addToast('Folder imported to library', 'success') } },
      )
      if (node.id !== 'root' && node.id !== 'sets_root') {
        items.push(
          { separator: true },
          { icon: '✏️', label: 'Rename', action: () => { setRenamingId(node.id); setRenameValue(node.name) } },
          { icon: '🗑️', label: 'Delete', danger: true, action: () => deleteItem(node.id) },
        )
      }
    }

    const rect = e.currentTarget?.getBoundingClientRect?.()
    setContextMenu({
      x: e.clientX || (rect ? rect.right : 200),
      y: e.clientY || (rect ? rect.top : 200),
      items,
    })
  }, [fsNodes, addToQueue, importToLibrary, loadSet, deleteItem, addToast, setBrowseOpen])

  const handleCreateFolder = useCallback(() => {
    if (!newFolderName.trim()) return
    createFolder(currentFolderId, newFolderName.trim())
    setNewFolderName('')
    setShowNewFolder(false)
  }, [newFolderName, currentFolderId, createFolder])

  const handleRename = useCallback(() => {
    if (!renameValue.trim() || !renamingId) return
    renameItem(renamingId, renameValue.trim())
    setRenamingId(null)
    setRenameValue('')
  }, [renamingId, renameValue, renameItem])

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setBrowseOpen(false)
      setClosing(false)
    }, 200)
  }, [setBrowseOpen])

  useEffect(() => {
    if (!browseOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showSaveSet) { setShowSaveSet(false); return }
        if (tagManagerTrack) { setTagManagerTrack(null); return }
        if (showNewFolder) { setShowNewFolder(false); return }
        if (renamingId) { setRenamingId(null); return }
        if (contextMenu) { setContextMenu(null); return }
        if (addTrackMode) { setAddTrackMode(false); return }
        
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [browseOpen, showSaveSet, tagManagerTrack, showNewFolder, renamingId, contextMenu, addTrackMode, handleClose])

  const handleDoubleClick = useCallback((nodeId, node, forceLoadSet = false) => {
    if (node.type === 'track') {
      if (node.trackData) getDJController().loadTrack('A', node.trackData)
      addToast(`Loaded ${node.name} to Deck A`, 'success')
    } else if (node.type === 'set' && forceLoadSet) {
      loadSet(nodeId)
      addToast(`Set "${node.name}" loaded`, 'success')
      setBrowseOpen(false)
    }
  }, [loadSet, addToast, setBrowseOpen])

  const reorderFolderChildren = useAppStore(s => s.reorderFolderChildren)
  const [dragOverNodeId, setDragOverNodeId] = useState(null)

  const handleDragStart = useCallback((e, nodeId, index) => {
    e.dataTransfer.setData('text/bm-item-index', index.toString())
  }, [])

  const handleDragOver = useCallback((e, nodeId) => {
    e.preventDefault()
    setDragOverNodeId(nodeId)
  }, [])

  const handleDragLeave = useCallback((e, nodeId) => {
    if (dragOverNodeId === nodeId) setDragOverNodeId(null)
  }, [dragOverNodeId])

  const handleItemDrop = useCallback((e, dropTargetId, dropIndex) => {
    e.preventDefault()
    setDragOverNodeId(null)
    const dropTargetNode = fsNodes[dropTargetId]
    if (!dropTargetNode) return

    // Case 1: Drop from library onto a Folder/Set
    const libraryIndex = e.dataTransfer.getData('text/track-index')
    if (libraryIndex !== '' && dropTargetNode.type !== 'track') {
      const track = library[parseInt(libraryIndex, 10)]
      if (track) {
        addTrackToFolder(dropTargetId, track)
        addToast(`Added "${track.name}" to ${dropTargetNode.name}`, 'success')
      }
      return
    }

    // Case 2: Internal reordering
    const bmItemIndex = e.dataTransfer.getData('text/bm-item-index')
    if (bmItemIndex !== '') {
      // Reorder within the same parent
      if (dropTargetNode.type === 'track') {
        reorderFolderChildren(dropTargetNode.parentId, parseInt(bmItemIndex, 10), dropIndex)
      } else {
        // Drop on a folder - not supported internally right now unless we want to move items between folders
      }
    }
  }, [fsNodes, library, addTrackToFolder, reorderFolderChildren, addToast])

  // Handle drop from library to the main container
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOverNodeId(null)
    const trackIndex = e.dataTransfer.getData('text/track-index')
    if (trackIndex !== '') {
      const track = library[parseInt(trackIndex, 10)]
      if (track) {
        addTrackToFolder(currentFolderId, track)
        addToast(`Added "${track.name}" to folder`, 'success')
      }
    }
  }, [library, currentFolderId, addTrackToFolder, addToast])

  if (!browseOpen) return null

  return (
    <div className={`bm-overlay${closing ? ' bm-overlay--closing' : ''}`} onClick={handleClose}>
      <div className={`bm-modal${closing ? ' bm-modal--closing' : ''}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bm-header">
          <div className="bm-header__left">
            <span className="bm-header__title">🎵 Music Browser</span>
          </div>
          <div className="bm-header__search">
            <svg className="bm-header__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="bm-header__search-input"
              placeholder="Search tracks, artists, tags..."
              value={browseSearchQuery}
              onChange={e => setBrowseSearch(e.target.value)}
            />
            {browseSearchQuery && (
              <button className="bm-header__search-clear" onClick={() => setBrowseSearch('')}>×</button>
            )}
          </div>
          <button className="bm-header__close" onClick={handleClose}>×</button>
        </div>

        {/* Tag filter bar */}
        <div className="bm-tagbar">
          <span className="bm-tagbar__label">Tags:</span>
          <div className="bm-tagbar__pills">
            {allTags.map(tag => (
              <TagPill
                key={tag}
                tag={tag}
                small
                active={browseTagFilter.includes(tag)}
                onClick={() => toggleBrowseTag(tag)}
              />
            ))}
          </div>
          {browseTagFilter.length > 0 && (
            <button className="bm-btn bm-btn--xs bm-btn--ghost" onClick={clearBrowseTagFilter}>Clear</button>
          )}
        </div>

        <div className="bm-body">
          {/* Sidebar */}
          <div className="bm-sidebar">
            <div className="bm-sidebar__tree">
              <TreeItem
                nodeId="root"
                depth={0}
                currentFolderId={currentFolderId}
                onNavigate={handleNavigate}
                onContextMenu={handleContextMenu}
              />
            </div>
            <div className="bm-sidebar__actions">
              <button className="bm-btn bm-btn--ghost bm-btn--full" onClick={() => setShowNewFolder(true)}>
                ➕ New Folder
              </button>
              <button className="bm-btn bm-btn--accent bm-btn--full" onClick={() => setShowSaveSet(true)}>
                💾 Save Set
              </button>
            </div>
          </div>

          {/* Content */}
          <div
            className="bm-content"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {/* Breadcrumb */}
            <div className="bm-breadcrumb">
              {breadcrumb.map((b, i) => (
                <React.Fragment key={b.id}>
                  {i > 0 && <span className="bm-breadcrumb__sep">›</span>}
                  <span
                    className={`bm-breadcrumb__item${i === breadcrumb.length - 1 ? ' bm-breadcrumb__item--current' : ''}`}
                    onClick={() => handleNavigate(b.id)}
                  >
                    {b.name}
                  </span>
                </React.Fragment>
              ))}
            </div>

            {/* Contextual Action Bar */}
            <div className="bm-content-actions">
              {(currentNode.type === 'folder' || currentNode.type === 'set') && currentNode.id !== 'root' && (
                <button className={`bm-btn bm-btn--sm ${addTrackMode ? 'bm-btn--primary' : 'bm-btn--ghost'}`} onClick={() => setAddTrackMode(!addTrackMode)}>
                  {addTrackMode ? '✓ Done Adding' : '📂 Add from Library'}
                </button>
              )}
              {currentNode.type === 'set' && (
                <>
                  <button className="bm-btn bm-btn--primary bm-btn--sm" onClick={() => {
                    useAppStore.getState().loadSet(currentFolderId)
                    setBrowseOpen(false)
                  }}>
                    ▶️ Load Set
                  </button>
                  <button className="bm-btn bm-btn--accent bm-btn--sm" onClick={() => {
                    useAppStore.getState().updateSetSnapshot(currentFolderId)
                    addToast('Set snapshot updated with current decks', 'success')
                  }}>
                    🔄 Update Set Snapshot
                  </button>
                </>
              )}
            </div>

            {/* New folder inline form */}
            {showNewFolder && (
              <div className="bm-new-folder">
                <span>📁</span>
                <input
                  type="text"
                  className="bm-new-folder__input"
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false) }}
                  autoFocus
                />
                <button className="bm-btn bm-btn--sm bm-btn--primary" onClick={handleCreateFolder}>Create</button>
                <button className="bm-btn bm-btn--sm bm-btn--ghost" onClick={() => setShowNewFolder(false)}>Cancel</button>
              </div>
            )}

            {/* Add from library mode */}
            {addTrackMode && (
              <div className="bm-add-track-panel">
                <div className="bm-add-track-panel__header">
                  Select library tracks to add to <strong>{currentNode.name}</strong>:
                </div>
                <div className="bm-add-track-panel__list">
                  {library.map((track, i) => (
                    <div
                      key={track.path}
                      className="bm-add-track-panel__item"
                      onClick={() => {
                        addTrackToFolder(currentFolderId, track)
                        addToast(`Added "${track.name}"`, 'success', 2000)
                      }}
                    >
                      <span>🎵</span>
                      <span className="bm-add-track-panel__item-name">{track.name}</span>
                      <span className="bm-btn bm-btn--xs bm-btn--ghost">+ Add</span>
                    </div>
                  ))}
                  {library.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 16 }}>
                      No tracks in library. Add tracks via the main library panel first.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Items list */}
            <div className="bm-content__list">
              {sortedChildren.length === 0 && !showNewFolder && !addTrackMode && (
                <div className="bm-content__empty">
                  <div className="bm-content__empty-icon">
                    {browseSearchQuery || browseTagFilter.length > 0 ? '🔍' : '📂'}
                  </div>
                  <div className="bm-content__empty-text">
                    {browseSearchQuery || browseTagFilter.length > 0
                      ? 'No matching items found'
                      : 'This folder is empty'}
                  </div>
                  <div className="bm-content__empty-hint">
                    {!browseSearchQuery && browseTagFilter.length === 0 && (
                      <>Drag tracks here from the library, or click "Add from Library"</>
                    )}
                  </div>
                </div>
              )}
              {sortedChildren.map((node, i) => {
                if (!node) return null

                // Rename mode
                if (renamingId === node.id) {
                  return (
                    <div key={node.id} className="bm-content-item bm-content-item--renaming">
                      <span className="bm-content-item__icon">
                        {node.type === 'folder' ? '📁' : node.type === 'set' ? '🎧' : '🎵'}
                      </span>
                      <input
                        type="text"
                        className="bm-new-folder__input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenamingId(null) }}
                        autoFocus
                      />
                      <button className="bm-btn bm-btn--sm bm-btn--primary" onClick={handleRename}>Save</button>
                      <button className="bm-btn bm-btn--sm bm-btn--ghost" onClick={() => setRenamingId(null)}>Cancel</button>
                    </div>
                  )
                }

                return (
                  <ContentItem
                    key={node.id}
                    node={node}
                    index={i}
                    isSelected={i === browseIndex}
                    innerRef={el => { itemRefs.current[i] = el }}
                    onNavigate={() => handleNavigate(node.id)}
                    onContextMenu={(e) => handleContextMenu(e, node)}
                    onAddTrackMode={() => setAddTrackMode(true)}
                    onTagClick={(trackRef) => setTagManagerTrack(trackRef)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleItemDrop}
                    isDragOver={dragOverNodeId === node.id}
                  />
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bm-footer">
          <span className="bm-footer__count">
            {sortedChildren.length} item{sortedChildren.length !== 1 ? 's' : ''}
            {browseTagFilter.length > 0 && ` · Filtered by ${browseTagFilter.length} tag${browseTagFilter.length !== 1 ? 's' : ''}`}
          </span>
          <div className="bm-footer__actions">
            {currentFolderId !== 'root' && currentFolderId !== 'sets_root' && (
              <button
                className="bm-btn bm-btn--accent"
                onClick={() => { importToLibrary(currentFolderId); addToast('Imported to library', 'success') }}
              >
                📥 Import Folder to Library
              </button>
            )}
          </div>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Save Set Dialog */}
        {showSaveSet && <SaveSetDialog onClose={() => setShowSaveSet(false)} />}

        {/* Tag Manager Dialog */}
        {tagManagerTrack && <TagManagerDialog trackPath={tagManagerTrack} onClose={() => setTagManagerTrack(null)} />}
      </div>
    </div>
  )
}
