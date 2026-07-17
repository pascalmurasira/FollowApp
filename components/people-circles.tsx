'use client'

import { useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  Check,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import type { Contact, Tier } from '@/lib/types'
import type { ContactUpdateInput } from '@/lib/contacts-store'
import {
  contactLastContactedInputValue,
  todayDateInputValue,
} from '@/lib/contact-dates'
import { ContactAvatar } from '@/components/contact-avatar'
import { cn } from '@/lib/utils'
import { CONTACT_LIMITS } from '@/lib/persistence-limits'

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: 'key', label: 'Key' },
  { value: 'network', label: 'Network' },
  { value: 'casual', label: 'Casual' },
]

interface EditDraft {
  relationship: string
  title: string
  tier: Tier
  lastContactedAt: string
}

export function PeopleCircles({
  contacts,
  groups,
  onSetGroup,
  onUpdateContact,
  onDeleteContact,
}: {
  contacts: Contact[]
  groups: string[]
  onSetGroup: (contactId: string, group: string | null) => void
  onUpdateContact: (contactId: string, updates: ContactUpdateInput) => void
  onDeleteContact?: (contactId: string) => Promise<void> | void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [newGroup, setNewGroup] = useState('')
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const openContact = (contact: Contact, isOpen: boolean) => {
    if (isOpen) {
      setOpenId(null)
      setDraft(null)
      setNewGroup('')
      setConfirmDeleteId(null)
      setDeleteError(null)
      return
    }
    setOpenId(contact.id)
    setNewGroup('')
    setConfirmDeleteId(null)
    setDeleteError(null)
    setDraft({
      relationship: contact.relationship,
      title: contact.title ?? '',
      tier: contact.tier ?? 'network',
      lastContactedAt: contactLastContactedInputValue(contact),
    })
  }

  const updateDraft = <K extends keyof EditDraft>(
    key: K,
    value: EditDraft[K],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  return (
    <ul className="flex flex-col">
      {contacts.map((contact) => {
        const current = contact.groups?.[0]
        const isOpen = openId === contact.id
        return (
          <li key={contact.id} className="border-t border-border first:border-t-0">
            <button
              type="button"
              onClick={() => {
                openContact(contact, isOpen)
              }}
              className="flex w-full items-center gap-3 py-3 text-left transition-colors active:bg-muted/60"
            >
              <ContactAvatar contact={contact} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {contact.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {contact.relationship}
                </span>
              </span>
              {current ? (
                <span className="rounded-full bg-primary/[0.08] px-2.5 py-1 text-xs font-medium text-primary">
                  {current}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No circle</span>
              )}
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  isOpen && 'rotate-180',
                )}
              />
            </button>

            {isOpen && (
              <div className="flex flex-col gap-3 pb-3 pl-12 pr-1">
                {draft && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      onUpdateContact(contact.id, {
                        relationship: draft.relationship,
                        title: draft.title,
                        tier: draft.tier,
                        lastContactedAt: draft.lastContactedAt || null,
                      })
                    }}
                    className="rounded-2xl border border-[var(--hairline)] bg-white/15 p-3"
                  >
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
                      Edit contact
                    </p>
                    <div className="grid gap-2">
                      <label className="grid gap-1">
                        <span className="text-[11px] font-medium text-[var(--ink-secondary)]">
                          How you know them
                        </span>
                        <input
                          value={draft.relationship}
                          maxLength={CONTACT_LIMITS.relationship}
                          onChange={(event) =>
                            updateDraft('relationship', event.target.value)
                          }
                          className="h-11 rounded-xl border border-[var(--hairline)] bg-white/25 px-3 text-sm outline-none focus-visible:border-[var(--action-bg)]"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-medium text-[var(--ink-secondary)]">
                          Role & company
                        </span>
                        <input
                          value={draft.title}
                          maxLength={CONTACT_LIMITS.title}
                          onChange={(event) =>
                            updateDraft('title', event.target.value)
                          }
                          placeholder="Design Lead · Linear"
                          className="h-11 rounded-xl border border-[var(--hairline)] bg-white/25 px-3 text-sm outline-none focus-visible:border-[var(--action-bg)]"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-medium text-[var(--ink-secondary)]">
                          Last contacted
                        </span>
                        <div className="relative">
                          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-tertiary)]" />
                          <input
                            type="date"
                            value={draft.lastContactedAt}
                            max={todayDateInputValue()}
                            onChange={(event) =>
                              updateDraft('lastContactedAt', event.target.value)
                            }
                            className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 pl-10 pr-3 text-sm outline-none focus-visible:border-[var(--action-bg)]"
                          />
                        </div>
                        <span className="text-[11px] text-[var(--ink-secondary)]">
                          Blank means never contacted — they stay due.
                        </span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {TIER_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => updateDraft('tier', option.value)}
                            className={cn(
                              'min-h-11 rounded-xl border px-2 text-xs font-semibold',
                              draft.tier === option.value
                                ? 'border-[var(--action-bg)] bg-[var(--action-bg)] text-[var(--action-fg)]'
                                : 'border-[var(--glass-border)] bg-white/25 text-[var(--ink-secondary)]',
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="primary-action pressable mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
                    >
                      <Save className="size-4" />
                      Save changes
                    </button>
                  </form>
                )}

                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => onSetGroup(contact.id, current === g ? null : g)}
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        current === g
                          ? 'border-primary bg-primary/[0.08] font-medium text-primary'
                          : 'border-border bg-card text-muted-foreground',
                      )}
                    >
                      {current === g && <Check className="size-3" strokeWidth={3} />}
                      {g}
                    </button>
                  ))}
                  {current && (
                    <button
                      type="button"
                      onClick={() => onSetGroup(contact.id, null)}
                      className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors active:bg-muted"
                    >
                      <X className="size-3" />
                      Remove
                    </button>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const name = newGroup.trim()
                    if (!name) return
                    onSetGroup(contact.id, name)
                    setNewGroup('')
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={newGroup}
                    maxLength={CONTACT_LIMITS.group}
                    onChange={(e) => setNewGroup(e.target.value)}
                    placeholder="New circle name"
                    className="h-11 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:border-primary"
                  />
                  <button
                    type="submit"
                    disabled={!newGroup.trim()}
                    className="min-h-11 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>

                {onDeleteContact &&
                  (confirmDeleteId === contact.id ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                      <p className="text-sm font-medium text-foreground">
                        Remove {contact.name} from FollowApp?
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        This removes their FollowApp details, reminders, circles,
                        and learned context. It does not delete a contact from
                        your phone.
                      </p>
                      {deleteError && (
                        <p className="mt-2 text-xs font-medium text-destructive">
                          {deleteError}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={deletingId === contact.id}
                          onClick={async () => {
                            setDeletingId(contact.id)
                            setDeleteError(null)
                            try {
                              await onDeleteContact(contact.id)
                              setOpenId(null)
                              setDraft(null)
                              setConfirmDeleteId(null)
                            } catch {
                              setDeleteError(
                                'Removed here. Its cloud copy is waiting to retry from Back up & sync.',
                              )
                            } finally {
                              setDeletingId(null)
                            }
                          }}
                          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-destructive px-3 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
                        >
                          <Trash2 className="size-4" />
                          {deletingId === contact.id ? 'Removing…' : 'Remove person'}
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === contact.id}
                          onClick={() => {
                            setConfirmDeleteId(null)
                            setDeleteError(null)
                          }}
                          className="glass-button min-h-11 flex-1 rounded-xl px-3 text-sm font-medium disabled:opacity-60"
                        >
                          Keep person
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(contact.id)
                        setDeleteError(null)
                      }}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-destructive"
                    >
                      <Trash2 className="size-4" />
                      Remove from FollowApp
                    </button>
                  ))}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
