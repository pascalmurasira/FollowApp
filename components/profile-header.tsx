'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Pencil } from 'lucide-react'
import type { Profile } from '@/lib/types'
import {
  loadProfile,
  saveProfile,
  fileToAvatarDataUrl,
  DEFAULT_PROFILE,
} from '@/lib/profile'
import { getDeviceId } from '@/lib/device-id'
import { cn } from '@/lib/utils'

function initials(name: string) {
  return (
    name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'Y'
  )
}

export function ProfileHeader({
  voiceLabel,
  peopleCount,
  streak,
  sentCount,
}: {
  voiceLabel: string
  peopleCount: number
  streak: number
  sentCount: number
}) {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const deviceId = getDeviceId()
    if (!deviceId) return
    loadProfile(deviceId).then(setProfile)
  }, [])

  const persist = async (next: Profile) => {
    const previous = profile
    // Optimistic: show the change immediately, roll back if the save fails.
    setProfile(next)
    const deviceId = getDeviceId()
    if (!deviceId) return
    try {
      await saveProfile(deviceId, next)
      setError(null)
    } catch {
      setProfile(previous)
      setError('That photo was too large to save. Try a smaller one.')
    }
  }

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      persist({ ...profile, photoUrl: dataUrl })
    } catch {
      setError("Couldn't read that image. Try another.")
    }
  }

  const saveName = () => {
    const name = draftName.trim() || 'You'
    persist({ ...profile, name })
    setEditing(false)
  }

  return (
    <section className="glass-hero flex flex-col items-center gap-3 px-5 py-6">
      {/* Avatar with camera overlay */}
      <div className="relative">
        {profile.photoUrl ? (
          <Image
            src={profile.photoUrl || '/placeholder.svg'}
            alt="Your profile"
            width={64}
            height={64}
            unoptimized
            className="size-16 rounded-full object-cover ring-1 ring-inset ring-white/40"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-full bg-[var(--avatar-solid-bg)] font-heading text-xl font-semibold tracking-tight text-[var(--avatar-solid-fg)] ring-1 ring-inset ring-white/40">
            {initials(profile.name)}
          </div>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Change profile photo"
          className="primary-action pressable absolute -bottom-2 -right-2 flex size-11 items-center justify-center rounded-full ring-2 ring-white/40"
        >
          <Camera className="size-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => onPickPhoto(e.target.files?.[0])}
        />
      </div>

      {/* Name (editable) */}
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            autoFocus
            maxLength={40}
            aria-label="Your name"
            className="glass-card h-11 w-44 rounded-full px-4 text-center text-base outline-none focus-visible:border-[var(--action-bg)]"
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
          />
          <button
            type="button"
            onClick={saveName}
            aria-label="Save name"
            className="primary-action pressable flex size-11 items-center justify-center rounded-full"
          >
            <Check className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraftName(profile.name === 'You' ? '' : profile.name)
            setEditing(true)
          }}
          className="pressable flex items-center gap-1.5 rounded-full px-2 py-1"
        >
          <span className="font-heading text-[30px] font-bold tracking-[-0.03em] text-[var(--ink-strong)]">
            {profile.name}
          </span>
          <Pencil className="size-3.5 text-muted-foreground" />
        </button>
      )}

      <p className="-mt-1 text-sm text-[var(--ink-secondary)]">
        {streak === 1
          ? 'Active 1 day in a row'
          : `Active ${streak} days in a row`}{' '}
        ·{' '}
        <span className="font-medium text-[var(--ink-strong)]">{voiceLabel}</span>
      </p>

      {error && (
        <p className="text-center text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Stats */}
      <div className="mt-2 grid w-full grid-cols-3 gap-1 overflow-hidden rounded-[var(--r-card)] border border-[var(--hairline)] bg-white/15">
        <Stat
          value={peopleCount}
          label="people"
          active={peopleCount > 0}
        />
        <Stat
          value={streak}
          label="day streak"
          active={streak > 0}
        />
        <Stat
          value={sentCount}
          label="sent"
          active
        />
      </div>
    </section>
  )
}

function Stat({
  value,
  label,
  active,
}: {
  value: number
  label: string
  active: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1 border-r border-[var(--hairline)] px-3 py-3 text-center last:border-r-0">
      <span
        className={cn(
          'tnum font-heading text-[22px] font-bold leading-none',
          active ? 'text-[var(--ink-strong)]' : 'text-[var(--ink-tertiary)]',
        )}
      >
        {value}
      </span>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] leading-tight text-[var(--ink-tertiary)] text-pretty">
        {label}
      </span>
    </div>
  )
}
