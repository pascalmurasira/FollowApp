'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { CONTACTS, CURRENT_USER, DEMO_CONTACT_IDS } from '@/lib/mock-data'
import type { Contact, Message, Tab, Tier } from '@/lib/types'
import { BottomNav } from '@/components/bottom-nav'
import { NudgeFeed } from '@/components/nudge-feed'
import { ChatList } from '@/components/chat-list'
import { ChatRequests } from '@/components/chat-requests'
import { ConversationView } from '@/components/conversation-view'
import { NudgeLogo } from '@/components/nudge-logo'
import { WelcomeFlow } from '@/components/welcome-flow'
import { YouPanel } from '@/components/you-panel'
import { AddContactSheet } from '@/components/add-contact-sheet'
import { ImportContactsSheet } from '@/components/import-contacts-sheet'
import { ScanCardSheet } from '@/components/scan-card-sheet'
import { MyCardSheet } from '@/components/my-card-sheet'
import { QrScanSheet } from '@/components/qr-scan-sheet'
import { SecureNudgeSheet } from '@/components/secure-nudge-sheet'
import { useSyncPrompt } from '@/hooks/use-sync-prompt'
import {
  loadOnboarding,
  saveOnboarding,
  voiceForTone,
  labelForTone,
} from '@/lib/onboarding'
import {
  mergeContacts,
  fetchPeople,
  apiAddContact,
  apiImportContacts,
  apiSetCircle,
  apiTouchContact,
  createContact,
  allGroupNames,
  type GroupTags,
  type NewContactInput,
} from '@/lib/contacts-store'
import {
  toNewContactInput,
  type ParsedContact,
} from '@/lib/import-contacts'
import { getDeviceId } from '@/lib/device-id'
import { useSession } from '@/lib/auth-client'
import { useEngagement } from '@/hooks/use-engagement'
import { primeEnrichment } from '@/hooks/use-enrichment'

let idCounter = 0
const nextId = () => `local-${idCounter++}`

/** Move the user's chosen contacts to the front, keeping the rest in order. */
function prioritize(list: Contact[], selectedIds: string[]): Contact[] {
  if (selectedIds.length === 0) return list
  const picked = list.filter((c) => selectedIds.includes(c.id))
  const rest = list.filter((c) => !selectedIds.includes(c.id))
  return [...picked, ...rest]
}

export function NudgeApp() {
  const { data: session, isPending: sessionPending } = useSession()
  const signedIn = !!session?.user
  const [contacts, setContacts] = useState<Contact[]>(CONTACTS)
  const [tab, setTab] = useState<Tab>('nudges')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [voice, setVoice] = useState<string>(CURRENT_USER.voice)
  const [toneLabel, setToneLabel] = useState<string>('low-key & chill')
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [groupTags, setGroupTags] = useState<GroupTags>({})
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const [showAddContact, setShowAddContact] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [showCard, setShowCard] = useState(false)
  const [showScanQr, setShowScanQr] = useState(false)
  const [showSecure, setShowSecure] = useState(false)
  // How many contacts the user added themselves — our main "invested" signal.
  const [customCount, setCustomCount] = useState(0)
  const { streak, snoozedIds, recordReachOut, snooze } = useEngagement()

  // The user has something worth protecting once they've added their own
  // people or built up a streak. Drives when the "Secure your Nudge" prompt
  // appears (handled, with dismissal + signed-in checks, inside the hook).
  const invested = customCount > 0 || streak >= 3
  const { showSyncPrompt, dismissSyncPrompt } = useSyncPrompt(invested)

  // Surface the magic-link sheet when the hook says the moment is right.
  useEffect(() => {
    if (showSyncPrompt) setShowSecure(true)
  }, [showSyncPrompt])

  // 'pending' until we've checked localStorage, then 'onboarding' or 'app'.
  const [phase, setPhase] = useState<'pending' | 'onboarding' | 'app'>('pending')

  useEffect(() => {
    if (sessionPending) return
    const saved = loadOnboarding()
    const deviceId = getDeviceId()
    let cancelled = false
    ;(async () => {
      const { contacts: custom, circles } = deviceId
        ? await fetchPeople(deviceId, signedIn)
        : { contacts: [], circles: {} as GroupTags }
      if (cancelled) return
      const merged = mergeContacts(CONTACTS, custom, circles)
      setGroupTags(circles)
      setCustomCount(custom.length)
      if (saved?.completed) {
        setVoice(voiceForTone(saved.toneId))
        setToneLabel(labelForTone(saved.toneId))
        setPinnedIds(saved.selectedContactIds)
        setContacts(prioritize(merged, saved.selectedContactIds))
        setPhase('app')
      } else {
        setContacts(merged)
        setPhase('onboarding')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionPending, signedIn])

  const completeOnboarding = useCallback(
    ({
      selectedContactIds,
      toneId,
    }: {
      selectedContactIds: string[]
      toneId: string
    }) => {
      saveOnboarding({ completed: true, selectedContactIds, toneId })
      setVoice(voiceForTone(toneId))
      setToneLabel(labelForTone(toneId))
      setPinnedIds(selectedContactIds)
      setContacts((prev) => prioritize(prev, selectedContactIds))
      setPhase('app')
    },
    [],
  )

  const addContact = useCallback((input: NewContactInput): Contact => {
    const contact = createContact(input)
    const group = input.group ?? null
    const deviceId = getDeviceId()

    // Optimistically update the UI, then persist to Neon (keyed by device).
    if (group) {
      setGroupTags((prev) => ({ ...prev, [contact.id]: [group] }))
    }
    setContacts((prev) => [
      ...prev,
      { ...contact, groups: group ? [group] : [] },
    ])
    setCustomCount((n) => n + 1)

    if (deviceId) {
      void apiAddContact(deviceId, contact, signedIn)
      if (group) void apiSetCircle(deviceId, contact.id, group, signedIn)
    }
    return contact
  }, [signedIn])

  // A scanned card flows through the same add path, then warms the enrichment
  // cache in the background so recent-news hooks are ready when its
  // conversation opens — turning a snapshot into a context-rich first nudge.
  const addScannedContact = useCallback(
    (input: NewContactInput) => {
      const contact = addContact(input)
      void primeEnrichment({
        id: contact.id,
        name: contact.name,
        title: contact.title,
        relationship: contact.relationship,
      })
    },
    [addContact],
  )

  // Batch-import reviewed contacts. Build full Contact records (distinct seeds
  // so ids and avatar hues don't collide), optimistically add them, then
  // persist to Neon. Returns the saved count for the import sheet's toast.
  const importContacts = useCallback(
    async (rows: ParsedContact[], tier: Tier): Promise<number> => {
      const base = Date.now()
      const built = rows.map((row, i) =>
        createContact(toNewContactInput(row, tier), base + i),
      )
      setContacts((prev) => [...prev, ...built])
      setCustomCount((n) => n + built.length)

      const deviceId = getDeviceId()
      if (deviceId) return apiImportContacts(deviceId, built, signedIn)
      return built.length
    },
    [signedIn],
  )

  // Assign (or clear) a contact's circle. Tags are stored separately so the
  // built-in demo contacts can be sorted into circles too, and persist in Neon.
  const setContactGroup = useCallback(
    (contactId: string, group: string | null) => {
      setGroupTags((prev) => {
        const next = { ...prev }
        if (group) next[contactId] = [group]
        else delete next[contactId]
        return next
      })
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId ? { ...c, groups: group ? [group] : [] } : c,
        ),
      )
      const deviceId = getDeviceId()
      if (deviceId) void apiSetCircle(deviceId, contactId, group, signedIn)
    },
    [signedIn],
  )

  // Every group name currently in use, for the add sheet and feed filter.
  const groups = useMemo(() => allGroupNames(groupTags), [groupTags])

  const activeContact = useMemo(
    () => contacts.find((c) => c.id === activeId) ?? null,
    [contacts, activeId],
  )

  const sendMessage = useCallback(
    async (contactId: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const myMessage: Message = {
        id: nextId(),
        sender: 'me',
        text: trimmed,
        minutesAgo: 0,
      }

      // Optimistically add my message and mark the thread as fresh.
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id !== contactId) return c
          return {
            ...c,
            daysSinceContact: 0,
            messages: [...c.messages, myMessage],
          }
        }),
      )

      // Reaching out keeps the relationship warm — counts toward the streak.
      recordReachOut(contactId)
      if (!DEMO_CONTACT_IDS.has(contactId)) {
        const deviceId = getDeviceId()
        if (deviceId) void apiTouchContact(deviceId, contactId, signedIn)
      }

      // External replies stay in WhatsApp/email. Do not fabricate a response
      // inside FollowApp; this local entry only records the user's outreach.
    },
    [recordReachOut, signedIn],
  )

  // Avoid an onboarding/app flash before localStorage is read.
  if (phase === 'pending') {
    return <div className="app-field min-h-[100dvh]" aria-hidden="true" />
  }

  if (phase === 'onboarding') {
    return (
      <WelcomeFlow
        contacts={contacts}
        onComplete={completeOnboarding}
        onScanContact={addScannedContact}
      />
    )
  }

  return (
    <div className="app-field mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col lg:my-6 lg:min-h-[calc(100dvh-3rem)] lg:overflow-hidden lg:rounded-[1.6rem] lg:border lg:border-white/40 lg:shadow-card-lg">
      <span className="field-grain" aria-hidden />
      {activeContact ? (
        <ConversationView
          contact={activeContact}
          voice={voice}
          onBack={() => setActiveId(null)}
          onSend={(text) => sendMessage(activeContact.id, text)}
        />
      ) : (
        <>
          <header className="sticky top-0 z-10 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-[var(--ink-strong)] backdrop-blur-xl lg:static lg:px-8 lg:py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="glass-button flex size-9 items-center justify-center rounded-xl text-[var(--ink-strong)]">
                  <NudgeLogo className="size-[18px]" />
                </span>
                <div>
                  <h1 className="font-heading text-[30px] font-bold leading-none tracking-[-0.03em]">
                    {tab === 'nudges' ? 'Follow-ups' : tab === 'chats' ? 'Chats' : 'You'}
                  </h1>
                  <p className="mt-1 hidden text-[13px] text-[var(--ink-secondary)] lg:block">
                    {contacts.filter((c) => c.daysSinceContact < 30).length} on track ·{' '}
                    {contacts.filter((c) => c.daysSinceContact >= 30).length} overdue
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="hidden text-xs font-medium text-[var(--ink-secondary)] sm:block">
                  {tab === 'nudges'
                    ? `${contacts.length} relationships`
                    : tab === 'chats'
                      ? 'Private conversations'
                      : 'Profile & preferences'}
                </p>
                {tab === 'nudges' && (
                  <button
                    type="button"
                    onClick={() => setShowAddContact(true)}
                    aria-label="Add someone"
                    className="glass-button pressable flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-[var(--ink-strong)]"
                  >
                    <UserPlus className="size-[18px]" />
                    <span className="hidden sm:inline">Add contact</span>
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="order-2 flex-1 overflow-y-auto overscroll-y-contain pb-24 lg:pb-8">
            {tab === 'nudges' ? (
              <NudgeFeed
                contacts={contacts}
                voice={voice}
                pinnedIds={pinnedIds}
                snoozedIds={snoozedIds}
                groups={groups}
                groupFilter={groupFilter}
                onFilterChange={setGroupFilter}
                onOpen={(id) => setActiveId(id)}
                onSend={sendMessage}
                onSnooze={snooze}
              />
            ) : tab === 'chats' ? (
              <div className="flex flex-col">
                <ChatRequests />
                <ChatList contacts={contacts} onOpen={(id) => setActiveId(id)} />
              </div>
            ) : (
              <YouPanel
                voiceLabel={toneLabel}
                contacts={contacts}
                streak={streak}
                groups={groups}
                onAddPerson={() => setShowAddContact(true)}
                onSetGroup={setContactGroup}
                onShowCard={() => setShowCard(true)}
              />
            )}
          </main>

          <BottomNav tab={tab} onChange={setTab} />
        </>
      )}

      <AddContactSheet
        open={showAddContact}
        existingGroups={groups}
        onClose={() => setShowAddContact(false)}
        onAdd={addContact}
        onImport={() => {
          setShowAddContact(false)
          setShowImport(true)
        }}
        onScan={() => {
          setShowAddContact(false)
          setShowScan(true)
        }}
        onScanQr={() => {
          setShowAddContact(false)
          setShowScanQr(true)
        }}
      />

      <ImportContactsSheet
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={importContacts}
      />

      <ScanCardSheet
        open={showScan}
        onClose={() => setShowScan(false)}
        onAdd={addScannedContact}
      />

      <QrScanSheet
        open={showScanQr}
        onClose={() => setShowScanQr(false)}
        onAdd={addScannedContact}
      />

      <MyCardSheet open={showCard} onClose={() => setShowCard(false)} />

      <SecureNudgeSheet
        open={showSecure}
        onClose={() => {
          setShowSecure(false)
          // Snooze the auto-prompt so it doesn't reappear for a few days.
          dismissSyncPrompt()
        }}
      />
    </div>
  )
}
