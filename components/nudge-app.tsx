'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { CONTACTS, CURRENT_USER, DEMO_CONTACT_IDS } from '@/lib/mock-data'
import type { Contact, Message, Tab, Tier } from '@/lib/types'
import { BottomNav } from '@/components/bottom-nav'
import { NudgeFeed } from '@/components/nudge-feed'
import { ChatList } from '@/components/chat-list'
import { ChatRequests } from '@/components/chat-requests'
import { ConversationView } from '@/components/conversation-view'
import { NudgeLogo } from '@/components/nudge-logo'
import { WelcomeFlow, type WelcomeResult } from '@/components/welcome-flow'
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
  shouldShowSampleContacts,
  shouldEnterApp,
} from '@/lib/onboarding'
import {
  mergeContacts,
  fetchPeople,
  loadLocalPeople,
  apiAddContact,
  apiImportContacts,
  apiSetCircle,
  apiTouchContact,
  apiUpdateContact,
  applyContactUpdate,
  createContact,
  allGroupNames,
  upsertContacts,
  type GroupTags,
  type ContactUpdateInput,
  type NewContactInput,
} from '@/lib/contacts-store'
import {
  importedContactId,
  importedContactIdentityKey,
  toNewContactInput,
  type ParsedContact,
} from '@/lib/import-contacts'
import { savedCountFromImportError } from '@/lib/contact-import-utils'
import { getDeviceId } from '@/lib/device-id'
import { useSession } from '@/lib/auth-client'
import { useEngagement } from '@/hooks/use-engagement'

let idCounter = 0
const nextId = () => `local-${idCounter++}`
const TAB_ORDER: Tab[] = ['nudges', 'chats', 'you']

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
  const [tabDirection, setTabDirection] = useState<'forward' | 'backward'>(
    'forward',
  )
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
  const { streak, snoozedIds, recordReachOut, snooze } = useEngagement()

  // Do not interrupt the first saved card. Account sync becomes relevant only
  // after the user has completed the product's first-value action: reaching out.
  const invested = streak > 0
  const { showSyncPrompt, dismissSyncPrompt } = useSyncPrompt(invested)

  // Surface the magic-link sheet when the hook says the moment is right.
  useEffect(() => {
    if (showSyncPrompt) setShowSecure(true)
  }, [showSyncPrompt])

  // 'pending' until we've checked localStorage, then 'onboarding' or 'app'.
  const [phase, setPhase] = useState<'pending' | 'onboarding' | 'app'>('pending')

  // Paint from local state immediately. Session and remote reconciliation must
  // never hold the scanner behind a blank launch screen.
  useEffect(() => {
    const saved = loadOnboarding()
    const local = loadLocalPeople()
    const seed = shouldShowSampleContacts(saved, local.contacts.length)
      ? CONTACTS
      : []
    const merged = mergeContacts(seed, local.contacts, local.circles)
    setGroupTags(local.circles)
    setContacts(merged)
    if (shouldEnterApp(saved, local.contacts.length)) {
      const toneId = saved?.completed ? saved.toneId : 'lowkey'
      const selectedIds = saved?.completed
        ? saved.selectedContactIds
        : [local.contacts[0].id]
      if (!saved?.completed) {
        saveOnboarding({
          completed: true,
          selectedContactIds: selectedIds,
          toneId,
          sampleMode: false,
        })
      }
      setVoice(voiceForTone(toneId))
      setToneLabel(labelForTone(toneId))
      setPinnedIds(selectedIds)
      setContacts(prioritize(merged, selectedIds))
      setPhase('app')
    } else {
      setPhase('onboarding')
    }
  }, [])

  // Merge the anonymous/account-scoped copy in the background after auth settles.
  useEffect(() => {
    if (sessionPending) return
    const deviceId = getDeviceId()
    if (!deviceId) return
    let cancelled = false
    ;(async () => {
      const { contacts: custom, circles } = await fetchPeople(deviceId, signedIn)
      if (cancelled) return
      const saved = loadOnboarding()
      const seed = shouldShowSampleContacts(saved, custom.length) ? CONTACTS : []
      const merged = mergeContacts(seed, custom, circles)
      setGroupTags(circles)
      if (saved?.completed) {
        setVoice(voiceForTone(saved.toneId))
        setToneLabel(labelForTone(saved.toneId))
        setPinnedIds(saved.selectedContactIds)
        setContacts(prioritize(merged, saved.selectedContactIds))
        setPhase('app')
      } else if (shouldEnterApp(saved, custom.length)) {
        // A returning user may have server-synced contacts but no local
        // onboarding flag on this installation. Their real data is the gate.
        saveOnboarding({
          completed: true,
          selectedContactIds: [custom[0].id],
          toneId: 'lowkey',
          sampleMode: false,
        })
        setPinnedIds([custom[0].id])
        setContacts(prioritize(merged, [custom[0].id]))
        setActiveId(custom[0].id)
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
    ({ selectedContactIds, toneId, sampleMode, openContactId }: WelcomeResult) => {
      saveOnboarding({ completed: true, selectedContactIds, toneId, sampleMode })
      setVoice(voiceForTone(toneId))
      setToneLabel(labelForTone(toneId))
      setPinnedIds(selectedContactIds)
      setContacts((previous) => {
        const visible = sampleMode
          ? previous
          : previous.filter((contact) => !DEMO_CONTACT_IDS.has(contact.id))
        return prioritize(visible, selectedContactIds)
      })
      if (openContactId) setActiveId(openContactId)
      setPhase('app')
    },
    [],
  )

  const leaveSampleMode = useCallback(() => {
    const saved = loadOnboarding()
    if (saved?.completed && saved.sampleMode !== false) {
      saveOnboarding({
        ...saved,
        selectedContactIds: saved.selectedContactIds.filter(
          (id) => !DEMO_CONTACT_IDS.has(id),
        ),
        sampleMode: false,
      })
    }
    setPinnedIds((previous) =>
      previous.filter((id) => !DEMO_CONTACT_IDS.has(id)),
    )
  }, [])

  const addContact = useCallback((input: NewContactInput): Contact => {
    const contact = createContact(input)
    const group = input.group ?? null
    const deviceId = getDeviceId()

    // Optimistically update the UI, then persist to Neon (keyed by device).
    if (group) {
      setGroupTags((prev) => ({ ...prev, [contact.id]: [group] }))
    }
    leaveSampleMode()
    setContacts((prev) => [
      ...prev.filter((item) => !DEMO_CONTACT_IDS.has(item.id)),
      { ...contact, groups: group ? [group] : [] },
    ])
    if (deviceId) {
      void apiAddContact(deviceId, contact, signedIn)
      if (group) void apiSetCircle(deviceId, contact.id, group, signedIn)
    }
    return contact
  }, [leaveSampleMode, signedIn])

  // Scanning follows the same optimistic persistence path as every quick add.
  const addScannedContact = useCallback(
    (input: NewContactInput) => {
      const contact = addContact(input)
      return contact
    },
    [addContact],
  )

  // Batch-import reviewed contacts. Stable device-scoped ids make retries safe,
  // and the UI changes only after each server-confirmed portion is persisted.
  const importContacts = useCallback(
    async (rows: ParsedContact[], tier: Tier): Promise<number> => {
      const base = Date.now()
      const deviceId = getDeviceId()
      const existingImportIds = new Map(
        contacts
          .filter((contact) => contact.id.startsWith('import-'))
          .map((contact) => [
            importedContactIdentityKey(contact),
            contact.id,
          ]),
      )
      const built = rows.map((row, i) => {
        const contact = createContact(toNewContactInput(row, tier), base + i)
        return {
          ...contact,
          id:
            existingImportIds.get(importedContactIdentityKey(contact)) ??
            importedContactId(deviceId ?? 'local', contact),
        }
      })

      const commit = (saved: Contact[]) => {
        if (saved.length === 0) return
        leaveSampleMode()
        setContacts((prev) =>
          upsertContacts(
            prev.filter((contact) => !DEMO_CONTACT_IDS.has(contact.id)),
            saved,
          ),
        )
      }

      try {
        const savedCount = deviceId
          ? await apiImportContacts(deviceId, built, signedIn)
          : built.length
        commit(built.slice(0, savedCount))
        return savedCount
      } catch (error) {
        const savedCount = Math.min(
          built.length,
          savedCountFromImportError(error),
        )
        commit(built.slice(0, savedCount))
        throw error
      }
    },
    [contacts, leaveSampleMode, signedIn],
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

  const updateContact = useCallback(
    (contactId: string, updates: ContactUpdateInput) => {
      setContacts((prev) =>
        prev.map((contact) =>
          contact.id === contactId
            ? applyContactUpdate(contact, updates)
            : contact,
        ),
      )
      const deviceId = getDeviceId()
      if (deviceId && !DEMO_CONTACT_IDS.has(contactId)) {
        void apiUpdateContact(deviceId, contactId, updates, signedIn)
      }
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

  const changeTab = useCallback((next: Tab) => {
    setTab((current) => {
      if (current === next) return current
      setTabDirection(
        TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(current)
          ? 'forward'
          : 'backward',
      )
      return next
    })
  }, [])

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
    <div className="app-field mx-auto flex h-[100dvh] w-full max-w-6xl flex-col lg:my-6 lg:h-[calc(100dvh-3rem)] lg:overflow-hidden lg:rounded-[1.6rem] lg:border lg:border-white/40 lg:shadow-card-lg">
      <span className="field-grain" aria-hidden />
      {activeContact ? (
        <ConversationView
          contact={activeContact}
          voice={voice}
          onBack={() => setActiveId(null)}
          onSend={(text) => sendMessage(activeContact.id, text)}
          onUpdateContact={(updates) => updateContact(activeContact.id, updates)}
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
                    onClick={() => setShowScan(true)}
                    aria-label="Scan a business card"
                    className="primary-action pressable flex min-h-11 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-semibold"
                  >
                    <ScanLine className="size-[18px]" />
                    <span className="hidden min-[380px]:inline">Scan card</span>
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="order-2 min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain pb-24 lg:pb-8">
            <div key={tab} className="tab-page" data-direction={tabDirection}>
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
                  onUpdateContact={updateContact}
                  onShowCard={() => setShowCard(true)}
                />
              )}
            </div>
          </main>

          <BottomNav tab={tab} onChange={changeTab} />
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
        autoLaunchCamera
        onClose={() => setShowScan(false)}
        onAdd={addScannedContact}
        onOpenContact={(contactId) => {
          setPinnedIds((previous) => [
            contactId,
            ...previous.filter((id) => id !== contactId),
          ])
          setActiveId(contactId)
        }}
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
