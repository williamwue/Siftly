'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search,
  BookmarkX,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  List,
  AlignJustify,
  X,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import BookmarkCard from '@/components/bookmark-card'
import BookmarkRow from '@/components/bookmark-row'
import BookmarkDetailModal from '@/components/bookmark-detail-modal'
import type { BookmarkWithMedia, BookmarksResponse } from '@/lib/types'

const DEFAULT_PAGE_SIZE = 24
const COMPACT_PAGE_SIZE = 100

interface Filters {
  q: string
  category: string
  mediaType: string
  source: string
  sort: string
  page: number
  uncategorized: boolean
}

const DEFAULT_FILTERS: Filters = {
  q: '',
  category: '',
  mediaType: '',
  source: '',
  sort: 'newest',
  page: 1,
  uncategorized: false,
}

function buildUrl(filters: Filters, limit: number): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.uncategorized) {
    params.set('uncategorized', 'true')
  } else if (filters.category) {
    params.set('category', filters.category)
  }
  if (filters.mediaType) params.set('mediaType', filters.mediaType)
  if (filters.source) params.set('source', filters.source)
  params.set('sort', filters.sort)
  params.set('page', String(filters.page))
  params.set('limit', String(limit))
  return `/api/bookmarks?${params.toString()}`
}

function SelectMenu({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  placeholder: string
}) {
  return (
    <Select.Root value={value || '_all'} onValueChange={(v) => onChange(v === '_all' ? '' : v)}>
      <Select.Trigger className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 focus:outline-none focus:border-indigo-500 transition-all min-w-[120px] shrink-0">
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="ml-auto">
          <ChevronDown size={12} className="text-zinc-600" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          <Select.Viewport className="p-1">
            <Select.Item
              value="_all"
              className="flex items-center px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 rounded-lg cursor-pointer outline-none transition-colors data-[highlighted]:bg-zinc-800 data-[highlighted]:text-zinc-100"
            >
              <Select.ItemText>{placeholder}</Select.ItemText>
            </Select.Item>
            {options.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="flex items-center px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 rounded-lg cursor-pointer outline-none transition-colors data-[highlighted]:bg-zinc-800 data-[highlighted]:text-zinc-100"
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function SkeletonCard() {
  return (
    <div className="masonry-item">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-pulse">
        <div className="h-40 bg-zinc-800" />
        <div className="p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800" />
            <div className="space-y-1.5">
              <div className="w-24 h-3 rounded-lg bg-zinc-800" />
              <div className="w-16 h-2.5 rounded-lg bg-zinc-800" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="w-full h-3 rounded-lg bg-zinc-800" />
            <div className="w-5/6 h-3 rounded-lg bg-zinc-800" />
            <div className="w-3/4 h-3 rounded-lg bg-zinc-800" />
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-800 flex gap-2">
            <div className="w-16 h-5 rounded-full bg-zinc-800" />
            <div className="w-20 h-5 rounded-full bg-zinc-800" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Pagination({
  page,
  total,
  limit,
  onChange,
}: {
  page: number
  total: number
  limit: number
  onChange: (p: number) => void
}) {
  const totalPages = Math.ceil(total / limit)
  const [jumpValue, setJumpValue] = useState('')

  if (totalPages <= 1) return null

  function handleJumpKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const num = parseInt(jumpValue, 10)
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      onChange(num)
    }
    setJumpValue('')
  }

  const navBtnClass =
    'flex items-center justify-center w-9 h-9 rounded-xl text-sm bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 hover:bg-zinc-800 disabled:opacity-25 disabled:cursor-not-allowed transition-all'

  return (
    <div className="flex items-center justify-center gap-3 mt-12">
      {/* Jump to page */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500 select-none">Jump to page</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={handleJumpKeyDown}
          placeholder="—"
          className="w-14 px-2 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-700 text-sm text-center focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {/* Page indicator */}
      <span className="text-sm text-zinc-600 select-none tabular-nums">
        Page <span className="text-zinc-400">{page}</span> of <span className="text-zinc-400">{totalPages}</span>
      </span>

      {/* Navigation arrows */}
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(1)} disabled={page <= 1} className={navBtnClass} title="First page">
          <ChevronsLeft size={14} />
        </button>
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className={navBtnClass} title="Previous page">
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className={navBtnClass} title="Next page">
          <ChevronRight size={14} />
        </button>
        <button onClick={() => onChange(totalPages)} disabled={page >= totalPages} className={navBtnClass} title="Last page">
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  )
}

function BookmarksPageInner() {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => ({
    ...DEFAULT_FILTERS,
    uncategorized: searchParams.get('uncategorized') === 'true',
    category: searchParams.get('category') ?? '',
    mediaType: searchParams.get('mediaType') ?? '',
    q: searchParams.get('q') ?? '',
  }))
  const [searchInput, setSearchInput] = useState('')
  const [bookmarks, setBookmarks] = useState<BookmarkWithMedia[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid')
  const [openBookmark, setOpenBookmark] = useState<BookmarkWithMedia | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [pendingDelete, setPendingDelete] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteNotice, setDeleteNotice] = useState('')
  const deleteLock = useRef(false)
  const requestVersion = useRef(0)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchBookmarks = useCallback(async (f: Filters, limit: number) => {
    const version = ++requestVersion.current
    setSelected([])
    setLoading(true)
    try {
      const res = await fetch(buildUrl(f, limit))
      if (!res.ok) throw new Error('Failed to fetch')
      const data: BookmarksResponse = await res.json()
      if (version !== requestVersion.current) return
      setBookmarks(data.bookmarks)
      setTotal(data.total)
    } catch (err) {
      if (version !== requestVersion.current) return
      console.error(err)
      setBookmarks([])
      setTotal(0)
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [])

  const pageSize = viewMode === 'compact' ? COMPACT_PAGE_SIZE : DEFAULT_PAGE_SIZE

  useEffect(() => {
    fetchBookmarks(filters, pageSize)
  }, [fetchBookmarks, filters, pageSize])

  function requestDelete(ids: string[]) {
    setDeleteError('')
    setPendingDelete([...ids])
  }

  async function confirmDelete() {
    if (deleteLock.current || pendingDelete.length === 0) return
    deleteLock.current = true
    setDeleting(true)
    setDeleteError('')
    try {
      const response = await fetch('/api/bookmarks/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: pendingDelete }),
      })
      if (!response.ok) throw new Error('删除失败，请重试。')
      const result: { deleted: number } = await response.json()
      setPendingDelete([])
      setSelected([])
      setOpenBookmark(null)
      setDeleteNotice(`已删除 ${result.deleted} 条本地书签。X 上的收藏不受影响。`)
      window.dispatchEvent(new Event('siftly:bookmarks-changed'))
      const removedHere = bookmarks.filter((b) => pendingDelete.includes(b.id)).length
      const page = Math.min(filters.page, Math.max(1, Math.ceil((total - removedHere) / pageSize)))
      setFilters((prev) => ({ ...prev, page }))
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除失败，请重试。')
    } finally {
      deleteLock.current = false
      setDeleting(false)
    }
  }

  function bookmarkActions(bookmark: BookmarkWithMedia) {
    return (
      <div className="flex items-center justify-between px-3 py-2 text-sm text-zinc-400">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" aria-label={`选择 @${bookmark.authorHandle} 的书签 ${bookmark.id}`}
            checked={selected.includes(bookmark.id)}
            onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, bookmark.id] : prev.filter((id) => id !== bookmark.id))} />
          选择
        </label>
        <button type="button" className="text-red-400 hover:text-red-300" onClick={() => requestDelete([bookmark.id])}>删除</button>
      </div>
    )
  }

  function handleSetViewMode(mode: 'grid' | 'list' | 'compact') {
    setViewMode(mode)
    setFilters((prev) => ({ ...prev, page: 1 }))
  }

  function updateSearch(q: string) {
    setSearchInput(q)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, q, page: 1 }))
    }, 300)
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }))
  }

  function clearAllFilters() {
    setSearchInput('')
    setFilters(DEFAULT_FILTERS)
  }

  const mediaOptions = [
    { label: 'Photos', value: 'photo' },
    { label: 'Videos', value: 'video' },
  ]

  const sourceOptions = [
    { label: 'Bookmarks', value: 'bookmark' },
    { label: 'Likes', value: 'like' },
  ]

  const sortOptions = [
    { label: 'Newest first', value: 'newest' },
    { label: 'Oldest first', value: 'oldest' },
  ]

  const hasActiveFilters = !!(filters.q || filters.category || filters.mediaType || filters.source || filters.sort !== 'newest' || filters.uncategorized)

  const sortLabel = sortOptions.find((o) => o.value === filters.sort)?.label ?? 'Newest first'

  return (
    <div className="flex flex-col h-full">

      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur-lg border-b border-zinc-800/60">
        <div className="px-6 md:px-8 py-4">
          <div className="flex items-center gap-3">

            {/* Search */}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
              <input
                type="text"
                placeholder="Search bookmarks..."
                value={searchInput}
                onChange={(e) => updateSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 text-sm focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-all"
              />
              {searchInput && (
                <button
                  onClick={() => updateSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filters */}
            <SelectMenu
              value={filters.mediaType}
              onChange={(v) => updateFilter('mediaType', v)}
              options={mediaOptions}
              placeholder="All media"
            />

            {/* Source */}
            <SelectMenu
              value={filters.source}
              onChange={(v) => updateFilter('source', v)}
              options={sourceOptions}
              placeholder="All sources"
            />

            {/* Sort */}
            <button
              onClick={() => updateFilter('sort', filters.sort === 'newest' ? 'oldest' : 'newest')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-all shrink-0"
              title={`Sort: ${sortLabel}`}
            >
              <ArrowUpDown size={13} />
              <span className="hidden sm:inline">{sortLabel}</span>
            </button>

            {/* View toggle */}
            <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1 shrink-0">
              <button
                onClick={() => handleSetViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'grid' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'
                }`}
                aria-label="Masonry view"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => handleSetViewMode('list')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'list' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'
                }`}
                aria-label="List view"
              >
                <List size={14} />
              </button>
              <button
                onClick={() => handleSetViewMode('compact')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'compact' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'
                }`}
                aria-label="Compact view"
              >
                <AlignJustify size={14} />
              </button>
            </div>

          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {filters.uncategorized && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
                  Uncategorized
                  <button onClick={() => updateFilter('uncategorized', false)} className="text-amber-400 hover:text-amber-200 transition-colors"><X size={10} /></button>
                </span>
              )}
              {filters.category && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
                  {filters.category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  <button onClick={() => updateFilter('category', '')} className="text-indigo-400 hover:text-indigo-200 transition-colors"><X size={10} /></button>
                </span>
              )}
              {filters.mediaType && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
                  {mediaOptions.find((o) => o.value === filters.mediaType)?.label}
                  <button onClick={() => updateFilter('mediaType', '')} className="text-indigo-400 hover:text-indigo-200 transition-colors"><X size={10} /></button>
                </span>
              )}
              {filters.source && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
                  {sourceOptions.find((o) => o.value === filters.source)?.label}
                  <button onClick={() => updateFilter('source', '')} className="text-indigo-400 hover:text-indigo-200 transition-colors"><X size={10} /></button>
                </span>
              )}
              {filters.sort !== 'newest' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
                  {sortLabel}
                  <button onClick={() => updateFilter('sort', 'newest')} className="text-indigo-400 hover:text-indigo-200 transition-colors"><X size={10} /></button>
                </span>
              )}
              <button onClick={clearAllFilters} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors underline underline-offset-2">
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 px-6 md:px-8 py-6 max-w-7xl mx-auto w-full">

        {/* Results count */}
        {!loading && (
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm text-zinc-500">
              {total > 0 ? (
                <>
                  <span className="text-zinc-200 font-semibold">{total.toLocaleString()}</span>
                  {' '}bookmark{total !== 1 ? 's' : ''}
                  {filters.q && <span className="text-zinc-600"> for &quot;{filters.q}&quot;</span>}
                </>
              ) : (
                'No bookmarks found'
              )}
            </p>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="masonry-grid">
            {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {deleteNotice && <p role="status" className="mb-3 text-sm text-zinc-400">{deleteNotice}</p>}
        {!loading && bookmarks.length > 0 && (
          <div className="flex items-center gap-4 mb-4 text-sm text-zinc-300">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selected.length === bookmarks.length}
                onChange={(e) => setSelected(e.target.checked ? bookmarks.map((b) => b.id) : [])} />
              全选本页
            </label>
            <span>已选 {selected.length} 条</span>
            <button disabled={!selected.length} className="text-red-400 disabled:opacity-40" onClick={() => requestDelete(selected)}>删除所选</button>
          </div>
        )}
        <Dialog.Root open={pendingDelete.length > 0} onOpenChange={(open) => { if (!open && !deleting) setPendingDelete([]) }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/70" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-zinc-100">
              <Dialog.Title className="text-lg font-semibold">删除 {pendingDelete.length} 条书签？</Dialog.Title>
              <Dialog.Description className="mt-3 text-sm text-zinc-400">仅删除 Siftly 本地书签及其媒体、分类关联，不影响 X 收藏或其他书签。删除后无法在页面撤销；以后重新导入可能再次出现。</Dialog.Description>
              {deleteError && <p role="alert" className="mt-3 text-red-400">{deleteError}</p>}
              <div className="mt-5 flex justify-end gap-4">
                <button disabled={deleting} onClick={() => setPendingDelete([])}>取消</button>
                <button disabled={deleting} className="rounded bg-red-600 px-3 py-2 disabled:opacity-50" onClick={() => void confirmDelete()}>{deleting ? '删除中…' : '确认删除'}</button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        {/* Empty state */}
        {!loading && bookmarks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
              <BookmarkX size={26} className="text-zinc-700" />
            </div>
            <h3 className="text-base font-semibold text-zinc-400 mb-2">No bookmarks match your filters</h3>
            <p className="text-zinc-600 text-sm mb-6 max-w-xs">
              Try adjusting your search or removing some filters.
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-xl transition-colors border border-zinc-800"
              >
                <X size={13} />
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Masonry grid */}
        {!loading && bookmarks.length > 0 && viewMode === 'grid' && (
          <div className="masonry-grid">
            {bookmarks.map((bookmark) => (
              <div key={bookmark.id} className="masonry-item">
                {bookmarkActions(bookmark)}
                <BookmarkCard bookmark={bookmark} />
              </div>
            ))}
          </div>
        )}

        {/* List view */}
        {!loading && bookmarks.length > 0 && viewMode === 'list' && (
          <div className="flex flex-col gap-3 max-w-3xl mx-auto">
            {bookmarks.map((bookmark) => (
              <div key={bookmark.id}>{bookmarkActions(bookmark)}<BookmarkCard bookmark={bookmark} /></div>
            ))}
          </div>
        )}

        {/* Compact view */}
        {!loading && bookmarks.length > 0 && viewMode === 'compact' && (
          <div className="flex flex-col divide-y divide-zinc-800/50 border border-zinc-800 rounded-2xl overflow-hidden max-w-5xl mx-auto">
            {bookmarks.map((bookmark) => (
              <div key={bookmark.id}>{bookmarkActions(bookmark)}<BookmarkRow bookmark={bookmark} onClick={setOpenBookmark} /></div>
            ))}
          </div>
        )}

        <Pagination
          page={filters.page}
          total={total}
          limit={pageSize}
          onChange={(p) => setFilters((prev) => ({ ...prev, page: p }))}
        />
      </div>

      {openBookmark && (
        <BookmarkDetailModal
          bookmark={openBookmark}
          onClose={() => setOpenBookmark(null)}
        />
      )}
    </div>
  )
}

export default function BookmarksPage() {
  return (
    <Suspense>
      <BookmarksPageInner />
    </Suspense>
  )
}
