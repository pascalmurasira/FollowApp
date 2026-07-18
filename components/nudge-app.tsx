'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, ChevronLeft, QrCode, ScanLine } from 'lucide-react'
import { App } from '@capacitor/app'
import { CONTACTS, CURRENT_USER, DEMO_CONTACT_IDS } from '@/lib/mock-data'
import type {
  Contact,
  Message,
  OutreachChannel,
  Tab,
  Tier,
} from '@/lib/types'
import { BottomNav } from '@/components/bottom-nav'
import { NudgeFeed } from '@/components/nudge-feed'
import { ChatList } from '@/components/chat-list'
import { ChatRequests } from '@/components/chat-requests'
import { InAppChat } from '@/components/in-app-chat'
import type { LinkView } from '@/hooks/use-inbox'
import { ConversationView } from '@/components/conversation-view'
import { NudgeLogo } from '@/components/nudge-logo'
import { WelcomeFlow, type WelcomeResult } from '@/components/welcome-flow'
import { YouPanel } from '@/components/you-panel'
import { AddContactSheet } from '@/components/add-contact-sheet'
import { ImportContactsSheet } from '@/components/import-contacts-sheet'
import { ScanCardSheet } from '@/components/scan-card-sheet'
import { MyCardSheet } from '@/components/my-card-sheet'
import { QrScanSheet } from '@/components/qr-scan-sheet'
import { ConferenceModeSheet } from '@/components/conference-mode-sheet'
import { ConferenceInboxSheet } from '@/components/conference-inbox-sheet'
import { InvitePrompt } from '@/components/invite-prompt'
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
  apiConfirmOutreach,
  apiDeleteContact,
  apiUpdateContact,
  applyContactUpdate,
  createContact,
  normalizeCircleName,
  refreshContactFreshness,
  retryPendingContactWrites,
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
import {
  savedCountFromImportError,
  uniqueContactsById,
} from '@/lib/contact-import-utils'
import { getDeviceId } from '@/lib/device-id'
import { useSession } from '@/lib/auth-client'
import { useEngagement } from '@/hooks/use-engagement'
import { deliver, channelLabel, type ChannelId } from '@/lib/channels'
import {
  canScheduleReminderDate,
  formatFollowUpDate,
  nextFollowUpForContact,
  nextFollowUpDateInput,
  normalizeLastContactedAt,
  todayDateInputValue,
} from '@/lib/contact-dates'
import {
  isNativeRuntime,
  cancelAllFollowUpReminders,
  cancelFollowUpReminder,
  consumeFollowUpReminderTap,
  listenForFollowUpReminderTaps,
  openAppSettings,
  reminderPermissionStatus,
  requestReminderPermission,
  scheduleFollowUpReminder,
} from '@/lib/native'
import { trackProductEvent } from '@/lib/product-analytics'
import {
  clearContactAccessFailure,
  getContactSyncState,
} from '@/lib/contact-sync-recovery'
import { markInvited } from '@/lib/invite'
import {
  actionEncounter,
  appendEncounter,
  completeEncounterNextStep,
  contactsForEvent,
  createConferenceSession,
  eventGroupsFromContacts,
  findStrongContactMatch,
  loadConferenceSession,
  normalizeEncounters,
  saveConferenceSession,
  updateEncounterEventDetails,
  type ConferenceSession,
} from '@/lib/encounters'

const TAB_ORDER: Tab[] = ['nudges', 'chats', 'you']
const PENDING_OUTREACH_KEY = 'followapp.pending-outreach.v1'

interface PendingOutreach {
  id: string
  contactId: string
  text: string
  channel: OutreachChannel
  openedAt: string
  source: 'feed' | 'conversation'
}

interface ConfirmedOutreach {
  contactId: string
  contactName: string
  nextDate: string
  channel: OutreachChannel
  offerInvite: boolean
  openNextStep?: {
    label: string
    capturedAt: string
    eventId?: string
  }
  completedNextStep?: boolean
}

type ReminderTarget = Omit<ConfirmedOutreach, 'channel' | 'offerInvite'> & {
  channel?: OutreachChannel
}

function persistPendingOutreach(value: PendingOutreach | null) {
  try {
    if (value) window.localStorage.setItem(PENDING_OUTREACH_KEY, JSON.stringify(value))
    else window.localStorage.removeItem(PENDING_OUTREACH_KEY)
  } catch {
    // A pending confirmation is still kept in React state when storage is blocked.
  }
}

function readPendingOutreach(): PendingOutreach | null {
  try {
    const raw = window.localStorage.getItem(PENDING_OUTREACH_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PendingOutreach>
    if (
      !value.id ||
      !value.contactId ||
      !value.text ||
      (value.channel !== 'whatsapp' && value.channel !== 'email')
    ) {
      return null
    }
    return value as PendingOutreach
  } catch {
    return null
  }
}

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
  const [activeCloudChat, setActiveCloudChat] = useState<LinkView | null>(null)
  const [activeDraft, setActiveDraft] = useState<string | undefined>()
  const [draftClearRevision, setDraftClearRevision] = useState(0)
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
  const [conferenceSession, setConferenceSession] =
    useState<ConferenceSession | null>(null)
  const [showConferenceMode, setShowConferenceMode] = useState(false)
  const [showConferenceInbox, setShowConferenceInbox] = useState(false)
  const [conferenceInboxEventId, setConferenceInboxEventId] =
    useState<string | null>(null)
  const [pendingOutreach, setPendingOutreach] =
    useState<PendingOutreach | null>(null)
  const [confirmedOutreach, setConfirmedOutreach] =
    useState<ConfirmedOutreach | null>(null)
  const [reminderAvailable, setReminderAvailable] = useState(false)
  const [reminderState, setReminderState] = useState<
    'idle' | 'requesting' | 'scheduled' | 'denied' | 'error'
  >('idle')
  const {
    hydrated: engagementHydrated,
    snoozedIds,
    remindersEnabled,
    scheduledReminderDates,
    recordReachOut,
    snooze,
    refreshTimeState,
    enableReminders,
    disableReminders,
    markReminderScheduled,
    clearScheduledReminder,
    clearAllScheduledReminders,
  } = useEngagement()
  const reminderReconcileRef = useRef(new Set<string>())
  const contactsRef = useRef(contacts)

  useEffect(() => {
    contactsRef.current = contacts
  }, [contacts])

  // 'pending' until we've checked localStorage, then 'onboarding' or 'app'.
  const [phase, setPhase] = useState<'pending' | 'onboarding' | 'app'>('pending')

  const refreshClock = useCallback(() => {
    refreshTimeState()
    setContacts((previous) => previous.map(refreshContactFreshness))
  }, [refreshTimeState])

  const consumeReminderTarget = useCallback(async () => {
    const contactId = await consumeFollowUpReminderTap().catch(() => null)
    if (!contactId) return
    setActiveDraft(undefined)
    setDraftClearRevision((revision) => revision + 1)
    setTab('chats')
    setActiveId(contactId)
    clearScheduledReminder(contactId)
    trackProductEvent('reminder_opened', { surface: 'notification' })
  }, [clearScheduledReminder])

  const persistNativeReminder = useCallback(
    async (target: ReminderTarget): Promise<boolean> => {
      const id = `followapp-follow-up-${target.contactId}`
      if (!canScheduleReminderDate(target.nextDate)) {
        await cancelFollowUpReminder(id)
        clearScheduledReminder(target.contactId)
        return false
      }
      try {
        const scheduled = await scheduleFollowUpReminder({
          id,
          contactId: target.contactId,
          title: `Follow up with ${target.contactName}`,
          body: target.channel
            ? `Your ${channelLabel(target.channel)} follow-up is ready to plan.`
            : 'Your next follow-up is ready to plan.',
          date: target.nextDate,
        })
        if (scheduled) {
          markReminderScheduled(target.contactId, target.nextDate)
        } else {
          clearScheduledReminder(target.contactId)
        }
        return scheduled
      } catch (error) {
        await cancelFollowUpReminder(id).catch(() => {})
        clearScheduledReminder(target.contactId)
        throw error
      }
    },
    [clearScheduledReminder, markReminderScheduled],
  )

  const reconcileReminderPermission = useCallback(async () => {
    if (!engagementHydrated || !(await isNativeRuntime())) return
    let status: Awaited<ReturnType<typeof reminderPermissionStatus>>
    try {
      status = await reminderPermissionStatus()
    } catch {
      setReminderAvailable(false)
      return
    }
    setReminderAvailable(status !== 'unsupported')
    if (status !== 'granted' || !remindersEnabled) {
      if (status !== 'granted') disableReminders()
      await cancelAllFollowUpReminders().catch(() => {})
      clearAllScheduledReminders()
    }
  }, [
    clearAllScheduledReminders,
    disableReminders,
    engagementHydrated,
    remindersEnabled,
  ])

  useEffect(() => {
    setPendingOutreach(readPendingOutreach())
    setConferenceSession(loadConferenceSession())
  }, [])

  useEffect(() => {
    if (engagementHydrated) void consumeReminderTarget()
  }, [consumeReminderTarget, engagementHydrated])

  useEffect(() => {
    let active = true
    let removeListener: (() => void) | undefined
    void listenForFollowUpReminderTaps(() => {
      if (engagementHydrated) void consumeReminderTarget()
    })
      .then((remove) => {
        if (active) removeListener = remove
        else remove()
      })
      .catch(() => {})
    return () => {
      active = false
      removeListener?.()
    }
  }, [consumeReminderTarget, engagementHydrated])

  useEffect(() => {
    void reconcileReminderPermission()
  }, [reconcileReminderPermission])

  // Contact writes can fail from any surface, so recovery belongs at the app
  // lifecycle rather than behind the You tab. Retry once at startup, again
  // when connectivity returns, and after auth changes unblock a claimed device.
  useEffect(() => {
    let running = false
    const retryPending = async () => {
      const pending = getContactSyncState()
      if (
        running ||
        pending.pending === 0 ||
        (pending.authorizationBlocked && !signedIn)
      ) {
        return
      }

      const deviceId = getDeviceId()
      if (!deviceId) return
      running = true
      try {
        await retryPendingContactWrites(deviceId)
        clearContactAccessFailure()
        trackProductEvent('backup_sync_completed', {
          surface: 'automatic_retry',
        })
      } catch {
        trackProductEvent('backup_sync_failed', {
          stage: 'automatic_retry',
        })
      } finally {
        running = false
      }
    }

    const onOnline = () => void retryPending()
    void retryPending()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [signedIn])

  // Recalculate due dates and expired snoozes whenever the app becomes active,
  // and at local midnight for users who keep the native WebView alive for days.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshClock()
        void consumeReminderTarget()
        void reconcileReminderPermission()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    let active = true
    let appStateHandle: { remove: () => Promise<void> } | undefined
    void isNativeRuntime().then((native) => {
      if (!native || !active) return
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          refreshClock()
          void consumeReminderTarget()
          void reconcileReminderPermission()
        }
      }).then((handle) => {
        if (active) appStateHandle = handle
        else void handle.remove()
      })
    })

    let midnightTimer = 0
    const armMidnight = () => {
      const now = new Date()
      const next = new Date(now)
      next.setHours(24, 0, 1, 0)
      midnightTimer = window.setTimeout(() => {
        refreshClock()
        armMidnight()
      }, next.getTime() - now.getTime())
    }
    armMidnight()

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(midnightTimer)
      void appStateHandle?.remove()
    }
  }, [consumeReminderTarget, reconcileReminderPermission, refreshClock])

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
    const incomingEncounter = input.encounters?.at(-1)
    const existing = incomingEncounter
      ? findStrongContactMatch(
          contactsRef.current.filter(
            (contact) => !DEMO_CONTACT_IDS.has(contact.id),
          ),
          input,
        )
      : undefined
    if (existing && incomingEncounter) {
      const combinedContext = input.context?.trim()
        ? existing.context.includes(input.context.trim())
          ? existing.context
          : `${existing.context}\n${input.context.trim()}`.trim()
        : existing.context
      const updates: ContactUpdateInput = {
        title: existing.title || input.title || '',
        phone: existing.phone || input.phone || '',
        email: existing.email || input.email || '',
        context: combinedContext,
        encounters: appendEncounter(existing.encounters, incomingEncounter),
      }
      const merged = applyContactUpdate(existing, updates)
      contactsRef.current = contactsRef.current.map((contact) =>
        contact.id === existing.id ? merged : contact,
      )
      setContacts(contactsRef.current)
      const deviceId = getDeviceId()
      if (deviceId) void apiUpdateContact(deviceId, existing.id, updates, signedIn)
      trackProductEvent('encounter_duplicate_merged', {
        match: existing.email && input.email ? 'email' : 'phone',
      })
      return merged
    }

    const contact = createContact(input)
    const group = normalizeCircleName(input.group)
    const deviceId = getDeviceId()

    // Optimistically update the UI, then persist to Neon (keyed by device).
    if (group) {
      setGroupTags((prev) => ({ ...prev, [contact.id]: [group] }))
    }
    leaveSampleMode()
    const nextContacts = [
      ...contactsRef.current.filter((item) => !DEMO_CONTACT_IDS.has(item.id)),
      { ...contact, groups: group ? [group] : [] },
    ]
    contactsRef.current = nextContacts
    setContacts(nextContacts)
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
      const built = uniqueContactsById(
        rows.map((row, i) => {
          const contact = createContact(toNewContactInput(row, tier), base + i)
          return {
            ...contact,
            id:
              existingImportIds.get(importedContactIdentityKey(contact)) ??
              importedContactId(deviceId ?? 'local', contact),
          }
        }),
      )

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
      const normalizedGroup = normalizeCircleName(group)
      setGroupTags((prev) => {
        const next = { ...prev }
        if (normalizedGroup) next[contactId] = [normalizedGroup]
        else delete next[contactId]
        return next
      })
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId
            ? { ...c, groups: normalizedGroup ? [normalizedGroup] : [] }
            : c,
        ),
      )
      const deviceId = getDeviceId()
      if (deviceId) {
        void apiSetCircle(
          deviceId,
          contactId,
          normalizedGroup,
          signedIn,
        )
      }
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

  const deleteContact = useCallback(async (contactId: string) => {
    const exitsSampleMode = DEMO_CONTACT_IDS.has(contactId)
    const removedIds = exitsSampleMode
      ? new Set(DEMO_CONTACT_IDS)
      : new Set([contactId])
    if (exitsSampleMode) leaveSampleMode()

    setContacts((previous) =>
      previous.filter((contact) => !removedIds.has(contact.id)),
    )
    setGroupTags((previous) => {
      const next = { ...previous }
      for (const id of removedIds) delete next[id]
      return next
    })
    setPinnedIds((previous) =>
      previous.filter((id) => !removedIds.has(id)),
    )
    setActiveId((current) =>
      current && removedIds.has(current) ? null : current,
    )
    if (pendingOutreach && removedIds.has(pendingOutreach.contactId)) {
      persistPendingOutreach(null)
    }
    setPendingOutreach((current) =>
      current && removedIds.has(current.contactId) ? null : current,
    )
    setConfirmedOutreach((current) =>
      current && removedIds.has(current.contactId) ? null : current,
    )
    for (const id of removedIds) clearScheduledReminder(id)
    void Promise.all(
      [...removedIds].map((id) =>
        cancelFollowUpReminder(`followapp-follow-up-${id}`),
      ),
    ).catch(() => {})
    if (exitsSampleMode) {
      const deviceId = getDeviceId()
      await Promise.all(
        [...removedIds].map((id) =>
          apiSetCircle(deviceId, id, null, signedIn),
        ),
      )
    } else {
      await apiDeleteContact(getDeviceId(), contactId)
    }
  }, [clearScheduledReminder, leaveSampleMode, pendingOutreach, signedIn])

  // Every group name currently in use, for the add sheet and feed filter.
  const groups = useMemo(() => allGroupNames(groupTags), [groupTags])
  const conferenceEvents = useMemo(
    () => eventGroupsFromContacts(contacts),
    [contacts],
  )
  const currentConferenceSummary = useMemo(
    () =>
      conferenceSession
        ? conferenceEvents.find(
            (summary) => summary.event.id === conferenceSession.id,
          )
        : conferenceEvents[0],
    [conferenceEvents, conferenceSession],
  )
  const currentConferenceContacts = useMemo(
    () =>
      conferenceSession
        ? contactsForEvent(contacts, conferenceSession.id)
        : [],
    [conferenceSession, contacts],
  )

  const startConference = useCallback(
    (name: string, location?: string) => {
      const next = {
        ...createConferenceSession(name),
        location,
      }
      saveConferenceSession(next)
      setConferenceSession(next)
      setConferenceInboxEventId(next.id)
      setShowConferenceMode(false)
      setShowScan(true)
      trackProductEvent('conference_mode_started', { has_location: Boolean(location) })
    },
    [],
  )

  const updateConference = useCallback(
    (name: string, location?: string): ConferenceSession | null => {
      if (!conferenceSession) return null
      const next = { ...conferenceSession, name, location }
      saveConferenceSession(next)
      setConferenceSession(next)
      const detailsChanged =
        conferenceSession.name !== next.name ||
        conferenceSession.location !== next.location
      if (detailsChanged) {
        for (const contact of contactsRef.current) {
          if (
            DEMO_CONTACT_IDS.has(contact.id) ||
            !normalizeEncounters(contact.encounters).some(
              (encounter) => encounter.event?.id === next.id,
            )
          ) {
            continue
          }
          updateContact(contact.id, {
            encounters: updateEncounterEventDetails(contact.encounters, next),
          })
        }
      }
      return next
    },
    [conferenceSession, updateContact],
  )

  const endConference = useCallback((name?: string, location?: string) => {
    if (!conferenceSession) return
    const current = name
      ? updateConference(name, location) ?? conferenceSession
      : conferenceSession
    const next = {
      ...current,
      active: false,
      endedAt: new Date().toISOString(),
    }
    saveConferenceSession(next)
    setConferenceSession(next)
    setConferenceInboxEventId(next.id)
    setShowConferenceMode(false)
    setShowScan(false)
    setShowConferenceInbox(true)
    trackProductEvent('conference_mode_ended', {
      captured_count: currentConferenceContacts.length,
    })
  }, [conferenceSession, currentConferenceContacts.length, updateConference])

  const openConferenceInbox = useCallback((eventId?: string) => {
    setConferenceInboxEventId(
      eventId ?? conferenceSession?.id ?? conferenceEvents[0]?.event.id ?? null,
    )
    setShowConferenceMode(false)
    setShowConferenceInbox(true)
  }, [conferenceEvents, conferenceSession])

  const activeContact = useMemo(
    () => contacts.find((c) => c.id === activeId) ?? null,
    [contacts, activeId],
  )

  const openContact = useCallback((contactId: string, draft?: string) => {
    setActiveDraft(draft)
    setActiveId(contactId)
    if (draft?.trim()) {
      trackProductEvent('draft_selected', {
        source: 'feed_edit',
        channel_available: true,
      })
    }
  }, [])

  const beginOutreach = useCallback(
    (
      contactId: string,
      text: string,
      preferred: ChannelId | undefined,
      source: PendingOutreach['source'],
    ) => {
      const contact = contacts.find((item) => item.id === contactId)
      const trimmed = text.trim()
      if (!contact || !trimmed || pendingOutreach) return
      const channel = deliver(contact, trimmed, preferred)
      if (!channel) {
        openContact(contactId, trimmed)
        return
      }
      const pending: PendingOutreach = {
        id: `outreach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        contactId,
        text: trimmed,
        channel,
        openedAt: new Date().toISOString(),
        source,
      }
      setPendingOutreach(pending)
      persistPendingOutreach(pending)
      trackProductEvent('channel_handoff', { channel, source })
    },
    [contacts, openContact, pendingOutreach],
  )

  const scheduleReminderFor = useCallback(
    async (result: ConfirmedOutreach, prompted: boolean) => {
      setReminderState('requesting')
      try {
        const scheduled = await persistNativeReminder(result)
        setReminderState(scheduled ? 'scheduled' : 'error')
        trackProductEvent('reminder_outcome', {
          outcome: scheduled ? 'scheduled' : 'unavailable',
          prompted,
        })
        return scheduled
      } catch {
        setReminderState('error')
        trackProductEvent('reminder_outcome', {
          outcome: 'error',
          prompted,
        })
        return false
      }
    },
    [persistNativeReminder],
  )

  // Keep an existing reminder aligned with manual cadence/date edits. The
  // persisted registry prevents opt-in from silently expanding to every
  // contact; only reminders the user already scheduled are reconciled.
  useEffect(() => {
    if (phase !== 'app' || !engagementHydrated || !remindersEnabled) return
    for (const [contactId, scheduledDate] of Object.entries(
      scheduledReminderDates,
    )) {
      const contact = contacts.find((item) => item.id === contactId)
      const nextDate = contact ? nextFollowUpForContact(contact) : null
      if (nextDate === scheduledDate) continue
      if (reminderReconcileRef.current.has(contactId)) continue
      reminderReconcileRef.current.add(contactId)
      void (async () => {
        try {
          if (!contact || !nextDate) {
            await cancelFollowUpReminder(`followapp-follow-up-${contactId}`)
            clearScheduledReminder(contactId)
            return
          }
          await persistNativeReminder({
            contactId,
            contactName: contact.name,
            nextDate,
          })
        } catch {
          clearScheduledReminder(contactId)
        } finally {
          reminderReconcileRef.current.delete(contactId)
        }
      })()
    }
  }, [
    clearScheduledReminder,
    contacts,
    engagementHydrated,
    persistNativeReminder,
    phase,
    remindersEnabled,
    scheduledReminderDates,
  ])

  const confirmPendingOutreach = useCallback(() => {
    if (!pendingOutreach) return
    const contact = contacts.find((item) => item.id === pendingOutreach.contactId)
    if (!contact) {
      persistPendingOutreach(null)
      setPendingOutreach(null)
      return
    }
    const previousConfirmation = contact.messages.find(
      (entry) =>
        entry.id === pendingOutreach.id &&
        entry.sender === 'me' &&
        Boolean(entry.sentAt) &&
        Boolean(entry.channel),
    )
    const message: Message = previousConfirmation ?? {
      id: pendingOutreach.id,
      sender: 'me',
      text: pendingOutreach.text,
      minutesAgo: 0,
      sentAt: new Date().toISOString(),
      sentOn: todayDateInputValue(),
      channel: pendingOutreach.channel,
    }
    // A restored confirmation can be replayed after a crash. Keep the first
    // confirmed date immutable instead of advancing cadence on the second tap.
    const lastContactedAt = previousConfirmation
      ? contact.lastContactedAt ??
        normalizeLastContactedAt(
          previousConfirmation.sentOn ?? previousConfirmation.sentAt,
        ) ??
        todayDateInputValue()
      : todayDateInputValue()
    const encounter = actionEncounter(contact)
    const openNextStep =
      encounter?.nextStep?.status === 'open'
        ? {
            label: encounter.nextStep.label,
            capturedAt: encounter.capturedAt,
            eventId: encounter.event?.id,
          }
        : undefined
    const result: ConfirmedOutreach = {
      contactId: contact.id,
      contactName: contact.name,
      nextDate: nextFollowUpDateInput(lastContactedAt, contact.tier),
      channel: pendingOutreach.channel,
      // Growth never interrupts a real relationship moment. Conference QR
      // exchange is the acquisition loop; a confirmed personal message is not.
      offerInvite: false,
      openNextStep,
    }

    if (!previousConfirmation) {
      setContacts((previous) =>
        previous.map((item) =>
          item.id === contact.id
            ? {
                ...item,
                daysSinceContact: 0,
                lastContactedAt,
                messages: [...item.messages, message].slice(-100),
              }
            : item,
        ),
      )
      recordReachOut(contact.id)
    }
    if (!DEMO_CONTACT_IDS.has(contact.id)) {
      const deviceId = getDeviceId()
      if (deviceId) void apiConfirmOutreach(deviceId, contact.id, message, signedIn)
    }
    trackProductEvent('outreach_confirmation', {
      outcome: 'sent',
      channel: pendingOutreach.channel,
    })
    persistPendingOutreach(null)
    setPendingOutreach(null)
    setActiveDraft(undefined)
    setDraftClearRevision((revision) => revision + 1)
    setConfirmedOutreach(result)
    setReminderState('idle')
    if (remindersEnabled) void scheduleReminderFor(result, false)
  }, [
    contacts,
    pendingOutreach,
    recordReachOut,
    remindersEnabled,
    scheduleReminderFor,
    signedIn,
  ])

  const rejectPendingOutreach = useCallback(() => {
    if (!pendingOutreach) return
    trackProductEvent('outreach_confirmation', {
      outcome: 'not_yet',
      channel: pendingOutreach.channel,
    })
    openContact(pendingOutreach.contactId, pendingOutreach.text)
    persistPendingOutreach(null)
    setPendingOutreach(null)
  }, [openContact, pendingOutreach])

  const completeConfirmedNextStep = useCallback(() => {
    const target = confirmedOutreach?.openNextStep
    if (!confirmedOutreach || !target || confirmedOutreach.completedNextStep) {
      return
    }
    const contact = contacts.find(
      (item) => item.id === confirmedOutreach.contactId,
    )
    if (!contact) return
    const current = normalizeEncounters(contact.encounters)
    const stillOpen = current.some(
      (encounter) =>
        encounter.capturedAt === target.capturedAt &&
        encounter.event?.id === target.eventId &&
        encounter.nextStep?.status === 'open',
    )
    if (!stillOpen) return

    updateContact(contact.id, {
      encounters: completeEncounterNextStep(current, target),
    })
    setConfirmedOutreach((value) =>
      value ? { ...value, completedNextStep: true } : value,
    )
    trackProductEvent('next_step_completed', {
      source: 'outreach_confirmation',
    })
  }, [confirmedOutreach, contacts, updateContact])

  const optInToReminder = useCallback(async () => {
    if (!confirmedOutreach || reminderState === 'requesting') return
    setReminderState('requesting')
    trackProductEvent('reminder_opt_in', { action: 'requested' })
    try {
      let permission = await reminderPermissionStatus()
      if (permission === 'prompt') permission = await requestReminderPermission()
      if (permission !== 'granted') {
        if (permission === 'denied') setReminderState('denied')
        else setReminderState('error')
        trackProductEvent('reminder_outcome', {
          outcome: permission,
          prompted: true,
        })
        return
      }
      enableReminders()
      await scheduleReminderFor(confirmedOutreach, true)
    } catch {
      setReminderState('error')
      trackProductEvent('reminder_outcome', {
        outcome: 'error',
        prompted: true,
      })
    }
  }, [
    confirmedOutreach,
    enableReminders,
    reminderState,
    scheduleReminderFor,
  ])

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
        conferenceSession={conferenceSession}
        onStartConference={() => {
          const next = createConferenceSession("Today's conference")
          saveConferenceSession(next)
          setConferenceSession(next)
          setConferenceInboxEventId(next.id)
          return next
        }}
      />
    )
  }

  return (
    <div className="app-field mx-auto flex h-[100dvh] w-full max-w-6xl flex-col lg:my-6 lg:h-[calc(100dvh-3rem)] lg:overflow-hidden lg:rounded-[1.6rem] lg:border lg:border-white/40 lg:shadow-card-lg">
      <span className="field-grain" aria-hidden />
      {activeCloudChat?.otherUserId ? (
        <div className="relative z-[1] mx-auto flex h-[100dvh] w-full max-w-3xl flex-col lg:h-[calc(100dvh-3rem)] lg:border-x lg:border-white/30">
          <header className="z-10 flex items-center gap-2 border-b border-[var(--hairline)] px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5 text-[var(--ink-strong)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setActiveCloudChat(null)}
              aria-label="Back to chats"
              className="glass-button pressable flex size-11 items-center justify-center rounded-full text-[var(--ink-strong)]"
            >
              <ChevronLeft className="size-6" />
            </button>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
              {(activeCloudChat.otherName.trim() || 'Someone')
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-[15.5px] font-semibold leading-tight tracking-[-0.01em]">
                {activeCloudChat.otherName.trim() || 'Someone'}
              </p>
              <p className="truncate text-xs text-[var(--ink-secondary)]">
                FollowApp chat
              </p>
            </div>
          </header>
          <InAppChat
            otherUserId={activeCloudChat.otherUserId}
            otherName={activeCloudChat.otherName.trim() || 'Someone'}
          />
        </div>
      ) : activeContact ? (
        <ConversationView
          key={activeContact.id}
          contact={activeContact}
          voice={voice}
          initialDraft={activeDraft}
          clearDraftRevision={draftClearRevision}
          onBack={() => {
            setActiveId(null)
            setActiveDraft(undefined)
          }}
          onHandoff={(text, preferred) =>
            beginOutreach(activeContact.id, text, preferred, 'conversation')
          }
          onUpdateContact={(updates) => updateContact(activeContact.id, updates)}
        />
      ) : (
        <>
          <header className="sticky top-0 z-10 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-[var(--ink-strong)] backdrop-blur-xl lg:static lg:px-8 lg:py-5">
            <div className="flex items-center justify-between">
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <span className="glass-button flex size-9 items-center justify-center rounded-xl text-[var(--ink-strong)]">
                  <NudgeLogo className="size-[18px]" />
                </span>
                <div>
                  <h1 className="font-heading text-[26px] font-bold leading-none tracking-[-0.03em] min-[380px]:text-[30px]">
                    {tab === 'nudges' ? 'Follow-ups' : tab === 'chats' ? 'People' : 'You'}
                  </h1>
                  <p className="mt-1 hidden text-[13px] text-[var(--ink-secondary)] lg:block">
                    {conferenceSession?.active
                      ? `${currentConferenceContacts.length} captured at ${conferenceSession.name}`
                      : `${contacts.length} people · ${conferenceEvents.length} conference ${conferenceEvents.length === 1 ? 'event' : 'events'}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="hidden text-xs font-medium text-[var(--ink-secondary)] sm:block">
                  {tab === 'nudges'
                    ? `${contacts.length} relationships`
                    : tab === 'chats'
                      ? 'Relationships & history'
                      : 'Profile & preferences'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowCard(true)}
                  aria-label="Show my QR code"
                  title="Show my QR code"
                  className="glass-button pressable flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--ink-strong)] sm:w-auto sm:px-3.5"
                >
                  <QrCode className="size-[18px]" />
                  <span className="ml-1.5 text-[11px] font-semibold sm:text-sm">
                    My QR
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowScan(true)}
                  aria-label="Scan a business card"
                  title="Scan a business card"
                  className="primary-action pressable flex min-h-11 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-semibold"
                >
                  <ScanLine className="size-[18px]" />
                  <span className="text-[11px] sm:text-sm">Scan</span>
                </button>
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
                  onOpen={openContact}
                  onHandoff={(id, text, preferred) =>
                    beginOutreach(id, text, preferred, 'feed')
                  }
                  onSnooze={snooze}
                  onScan={() => setShowScan(true)}
                  onShowCard={() => setShowCard(true)}
                  conferenceSession={conferenceSession}
                  conferenceSummary={currentConferenceSummary}
                  onManageConference={() => setShowConferenceMode(true)}
                  onReviewConference={() =>
                    openConferenceInbox(currentConferenceSummary?.event.id)
                  }
                />
              ) : tab === 'chats' ? (
                <div className="flex flex-col">
                  <ChatRequests onOpenThread={setActiveCloudChat} />
                  <ChatList contacts={contacts} onOpen={(id) => openContact(id)} />
                </div>
              ) : (
                <YouPanel
                  voiceLabel={toneLabel}
                  contacts={contacts}
                  groups={groups}
                  onAddPerson={() => setShowAddContact(true)}
                  onSetGroup={setContactGroup}
                  onUpdateContact={updateContact}
                  onDeleteContact={deleteContact}
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
        conferenceSession={conferenceSession}
        stayAfterSave={conferenceSession?.active === true}
        onShowCard={() => {
          setShowScan(false)
          setShowCard(true)
        }}
        onFinishCapture={() => setShowScan(false)}
        onOpenContact={(contactId) => {
          setPinnedIds((previous) => [
            contactId,
            ...previous.filter((id) => id !== contactId),
          ])
          openContact(contactId)
        }}
      />

      <QrScanSheet
        open={showScanQr}
        onClose={() => setShowScanQr(false)}
        onAdd={addScannedContact}
        conferenceSession={conferenceSession}
        onShowCard={() => {
          setShowScanQr(false)
          setShowCard(true)
        }}
      />

      <MyCardSheet open={showCard} onClose={() => setShowCard(false)} />

      <ConferenceModeSheet
        open={showConferenceMode}
        session={conferenceSession}
        capturedCount={currentConferenceContacts.length}
        onClose={() => setShowConferenceMode(false)}
        onStart={startConference}
        onUpdate={(name, location) => {
          updateConference(name, location)
        }}
        onScan={(name, location) => {
          updateConference(name, location)
          setShowConferenceMode(false)
          setShowScan(true)
        }}
        onReview={() =>
          openConferenceInbox(conferenceSession?.id ?? undefined)
        }
        onEnd={endConference}
      />

      <ConferenceInboxSheet
        open={showConferenceInbox}
        contacts={contacts.filter(
          (contact) => !DEMO_CONTACT_IDS.has(contact.id),
        )}
        initialEventId={conferenceInboxEventId}
        onClose={() => setShowConferenceInbox(false)}
        onUpdate={updateContact}
        onOpenContact={(contactId) => {
          setShowConferenceInbox(false)
          openContact(contactId)
        }}
      />

      <OutreachConfirmation
        pending={pendingOutreach}
        contactName={
          pendingOutreach
            ? contacts.find((contact) => contact.id === pendingOutreach.contactId)
                ?.name ?? 'this person'
            : undefined
        }
        confirmed={confirmedOutreach}
        inviteContact={
          confirmedOutreach?.offerInvite
            ? contacts.find(
                (contact) => contact.id === confirmedOutreach.contactId,
              ) ?? null
            : null
        }
        reminderAvailable={reminderAvailable}
        reminderState={reminderState}
        onConfirm={confirmPendingOutreach}
        onNotYet={rejectPendingOutreach}
        onCompleteNextStep={completeConfirmedNextStep}
        onEnableReminder={() => void optInToReminder()}
        onOpenSettings={() => void openAppSettings()}
        onDismissInvite={() => {
          if (!confirmedOutreach) return
          markInvited(confirmedOutreach.contactId)
          setConfirmedOutreach((current) =>
            current ? { ...current, offerInvite: false } : current,
          )
        }}
        onDone={() => {
          if (confirmedOutreach?.offerInvite) {
            markInvited(confirmedOutreach.contactId)
          }
          setConfirmedOutreach(null)
          setReminderState('idle')
        }}
      />
    </div>
  )
}

function OutreachConfirmation({
  pending,
  contactName,
  confirmed,
  inviteContact,
  reminderAvailable,
  reminderState,
  onConfirm,
  onNotYet,
  onCompleteNextStep,
  onEnableReminder,
  onOpenSettings,
  onDismissInvite,
  onDone,
}: {
  pending: PendingOutreach | null
  contactName?: string
  confirmed: ConfirmedOutreach | null
  inviteContact: Contact | null
  reminderAvailable: boolean
  reminderState: 'idle' | 'requesting' | 'scheduled' | 'denied' | 'error'
  onConfirm: () => void
  onNotYet: () => void
  onCompleteNextStep: () => void
  onEnableReminder: () => void
  onOpenSettings: () => void
  onDismissInvite: () => void
  onDone: () => void
}) {
  if (!pending && !confirmed) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-foreground/45 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="outreach-confirmation-title"
        className="app-field relative w-full max-w-sm overflow-hidden rounded-[1.75rem] border border-white/40 p-5 shadow-card-lg"
      >
        <span className="field-grain" aria-hidden />
        <div className="relative z-[1]">
          {pending ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
                Back from {channelLabel(pending.channel)}?
              </p>
              <h2
                id="outreach-confirmation-title"
                className="mt-1 font-heading text-2xl font-bold tracking-[-0.03em] text-[var(--ink-strong)]"
              >
                Did you send it?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)] text-pretty">
                Confirm only if you tapped Send to {contactName}. We’ll update the
                relationship and schedule the next follow-up only after you say yes.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={onNotYet}
                  className="glass-button pressable min-h-12 flex-1 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)]"
                >
                  Not yet
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className="primary-action pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
                >
                  <Check className="size-4" />
                  Yes, sent
                </button>
              </div>
            </>
          ) : confirmed ? (
            <>
              <div className="flex size-12 items-center justify-center rounded-full bg-[var(--status-on-track-tint)] text-[var(--status-on-track)]">
                <Check className="size-6" />
              </div>
              <h2
                id="outreach-confirmation-title"
                className="mt-3 font-heading text-2xl font-bold tracking-[-0.03em] text-[var(--ink-strong)]"
              >
                Follow-up logged
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)] text-pretty">
                {confirmed.contactName} is next due on{' '}
                <span className="font-semibold text-[var(--ink-strong)]">
                  {formatFollowUpDate(confirmed.nextDate, { weekday: 'long' })}
                </span>
                .
              </p>

              {confirmed.openNextStep && (
                <div className="mt-4 rounded-2xl border border-[var(--hairline)] bg-white/20 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
                    Promised next step
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink-strong)]">
                    {confirmed.openNextStep.label}
                  </p>
                  {confirmed.completedNextStep ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--status-on-track)]">
                      <Check className="size-3.5" /> Marked complete
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={onCompleteNextStep}
                        className="glass-button pressable mt-3 min-h-10 w-full rounded-full px-4 text-xs font-semibold text-[var(--ink-strong)]"
                      >
                        Mark next step complete
                      </button>
                      <p className="mt-2 text-center text-[10px] leading-relaxed text-[var(--ink-tertiary)]">
                        Leave it open if there is still more to do.
                      </p>
                    </>
                  )}
                </div>
              )}

              {reminderAvailable && reminderState !== 'scheduled' && (
                <button
                  type="button"
                  onClick={onEnableReminder}
                  disabled={reminderState === 'requesting'}
                  className="glass-button pressable mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)] disabled:opacity-50"
                >
                  <Bell className="size-4" />
                  {reminderState === 'requesting'
                    ? 'Setting reminder…'
                    : 'Remind me that morning'}
                </button>
              )}
              {reminderState === 'scheduled' && (
                <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-[var(--status-on-track-tint)] px-3 py-2.5 text-sm font-semibold text-[var(--status-on-track)]">
                  <Bell className="size-4" /> Reminder set for 9:00
                </p>
              )}
              {(reminderState === 'denied' || reminderState === 'error') && (
                <p className="mt-3 text-center text-xs leading-relaxed text-[var(--status-overdue)]">
                  {reminderState === 'denied'
                    ? 'Notifications are off for FollowApp. Enable them in Settings to get this reminder.'
                    : 'The reminder could not be scheduled. You can try again.'}
                  {reminderState === 'denied' && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="pressable ml-1 min-h-8 font-semibold underline underline-offset-2"
                    >
                      Open Settings
                    </button>
                  )}
                </p>
              )}
              {confirmed.offerInvite && inviteContact && (
                <div className="-mx-4 mt-2">
                  <InvitePrompt
                    contact={inviteContact}
                    channelLabel={channelLabel(confirmed.channel)}
                    onDismiss={onDismissInvite}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={onDone}
                className="primary-action pressable mt-4 min-h-12 w-full rounded-full px-4 text-sm font-semibold"
              >
                Done
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
