'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { CONTACTS, CURRENT_USER } from '@/lib/mock-data'
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
import { ShaderBackdrop } from '@/components/shader-backdrop'
import { useSyncPrompt } from '@/hooks/use-sync-prompt'
import { fallbackFriendReply } from '@/lib/fallback'
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
  const [contacts, setContacts] = useState<Contact[]>(CONTACTS)
  const [tab, setTab] = useState<Tab>('nudges')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [typingId, setTypingId] = useState<string | null>(null)
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
  const { streak, reachedToday, snoozedIds, recordReachOut, snooze } =
    useEngagement()

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
    const saved = loadOnboarding()
    const deviceId = getDeviceId()
    let cancelled = false
    ;(async () => {
      const { contacts: custom, circles } = deviceId
        ? await fetchPeople(deviceId)
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
  }, [])

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
      void apiAddContact(deviceId, contact)
      if (group) void apiSetCircle(deviceId, contact.id, group)
    }
    return contact
  }, [])

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
      if (deviceId) return apiImportContacts(deviceId, built)
      return built.length
    },
    [],
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
      if (deviceId) void apiSetCircle(deviceId, contactId, group)
    },
    [],
  )

  // Every group name currently in use, for the add sheet and feed filter.
  const groups = useMemo(() => allGroupNames(groupTags), [groupTags])

  const activeContact = useMemo(
    () => contacts.find((c) => c.id === activeId) ?? null,
    [contacts, activeId],
  )

  const updateContact = useCallback(
    (id: string, updater: (c: Contact) => Contact) => {
      setContacts((prev) => prev.map((c) => (c.id === id ? updater(c) : c)))
    },
    [],
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
      let snapshot: Contact | undefined
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id !== contactId) return c
          const updated = {
            ...c,
            daysSinceContact: 0,
            messages: [...c.messages, myMessage],
          }
          snapshot = updated
          return updated
        }),
      )

      if (!snapshot) return

      // Reaching out keeps the relationship warm — counts toward the streak.
      recordReachOut(contactId)

      setTypingId(contactId)
      try {
        const res = await fetch('/api/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: snapshot.name,
            relationship: snapshot.relationship,
            context: snapshot.context,
            interests: snapshot.interests,
            recentMessages: snapshot.messages
              .slice(-8)
              .map((m) => ({ sender: m.sender, text: m.text })),
          }),
        })
        const data = (await res.json()) as { text?: string }
        const replyText = data.text || fallbackFriendReply(snapshot)
        updateContact(contactId, (c) => ({
          ...c,
          messages: [
            ...c.messages,
            { id: nextId(), sender: 'them', text: replyText, minutesAgo: 0 },
          ],
        }))
      } catch (error) {
        console.error('Reply generation failed, using fallback:', error)
        updateContact(contactId, (c) => ({
          ...c,
          messages: [
            ...c.messages,
            { id: nextId(), sender: 'them', text: fallbackFriendReply(snapshot as Contact), minutesAgo: 0 },
          ],
        }))
      } finally {
        setTypingId(null)
      }
    },
    [updateContact, recordReachOut],
  )

  // Avoid an onboarding/app flash before localStorage is read.
  if (phase === 'pending') {
    return <div className="min-h-[100dvh] bg-background" aria-hidden="true" />
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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-background">
      {activeContact ? (
        <ConversationView
          contact={activeContact}
          voice={voice}
          isTyping={typingId === activeContact.id}
                onBack={() => setActiveId(null)}
                onSend={(text) => sendMessage(activeContact.id, text)}
              />
      ) : (
        <>
          <header className="glass-appbar relative isolate sticky top-0 z-10 overflow-hidden px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-appbar-foreground">
            {/* Ambient shader living behind the glass tint — same indigo family
                as the bar, so it adds depth without hurting white-text contrast. */}
            <ShaderBackdrop
              variant="appbar"
              speed={0.12}
              className="-z-10 opacity-55 [mask-image:linear-gradient(to_bottom,black,transparent)]"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-appbar-foreground/15">
                  <NudgeLogo className="size-[20px]" />
                </span>
                <h1 className="font-heading text-xl font-semibold tracking-tight">
                  FollowApp
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-[12px] font-medium text-appbar-foreground/85">
                  {tab === 'nudges'
                    ? 'Your network'
                    : tab === 'chats'
                      ? 'Your chats'
                      : 'Your assistant'}
                </p>
                {tab === 'nudges' && (
                  <button
                    type="button"
                    onClick={() => setShowAddContact(true)}
                    aria-label="Add someone"
                    className="flex size-11 items-center justify-center rounded-full bg-appbar-foreground/15 text-appbar-foreground transition-transform active:scale-95"
                  >
                    <UserPlus className="size-[18px]" />
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto overscroll-y-contain pb-24">
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
