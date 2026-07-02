'use client'

import { useState } from 'react'
import { ChevronDown, Check, X } from 'lucide-react'
import type { Contact } from '@/lib/types'
import { ContactAvatar } from '@/components/contact-avatar'
import { cn } from '@/lib/utils'

export function PeopleCircles({
  contacts,
  groups,
  onSetGroup,
}: {
  contacts: Contact[]
  groups: string[]
  onSetGroup: (contactId: string, group: string | null) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [newGroup, setNewGroup] = useState('')

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
                setOpenId(isOpen ? null : contact.id)
                setNewGroup('')
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
              <div className="flex flex-col gap-2 pb-3 pl-12 pr-1">
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
                    onChange={(e) => setNewGroup(e.target.value)}
                    placeholder="New circle name"
                    className="h-9 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:border-primary"
                  />
                  <button
                    type="submit"
                    disabled={!newGroup.trim()}
                    className="rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
