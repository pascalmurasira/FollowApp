'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Pencil, Users, Flame } from 'lucide-react'
import type { Profile } from '@/lib/types'
import {
  loadProfile,
  saveProfile,
  fileToAvatarDataUrl,
  DEFAULT_PROFILE,
} from '@/lib/profile'
import { getDeviceId } from '@/lib/device-id'

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
}: {
  voiceLabel: string
  peopleCount: number
  streak: number
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
    <section className="flex flex-col items-center gap-3 rounded-2xl bg-card px-5 py-6 shadow-card">
      {/* Avatar with camera overlay */}
      <div className="relative">
        {profile.photoUrl ? (
          <img
            src={profile.photoUrl || '/placeholder.svg'}
            alt="Your profile"
            className="size-20 rounded-full object-cover ring-1 ring-inset ring-foreground/[0.06]"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-full bg-secondary font-heading text-2xl font-semibold tracking-tight text-primary ring-1 ring-inset ring-foreground/[0.06]">
            {initials(profile.name)}
          </div>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Change profile photo"
          className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-2 ring-card transition-transform active:scale-95"
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
            className="h-10 w-44 rounded-full border border-border bg-background px-4 text-center text-base outline-none focus-visible:border-primary"
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
          />
          <button
            type="button"
            onClick={saveName}
            aria-label="Save name"
            className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
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
          className="flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors active:bg-muted"
        >
          <span className="font-serif text-2xl font-medium tracking-tight text-foreground">
            {profile.name}
          </span>
          <Pencil className="size-3.5 text-muted-foreground" />
        </button>
      )}

      <p className="-mt-1 text-sm text-muted-foreground">
        Your voice is{' '}
        <span className="font-medium text-foreground">{voiceLabel}</span>
      </p>

      {error && (
        <p className="text-center text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Stats */}
      <div className="mt-2 grid w-full grid-cols-2 gap-3">
        <Stat icon={Users} value={peopleCount} label="people you keep close" />
        <Stat icon={Flame} value={streak} label={streak === 1 ? 'day streak' : 'day streak'} />
      </div>
    </section>
  )
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users
  value: number
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-secondary/50 px-3 py-3 text-center">
      <Icon className="size-4 text-primary" />
      <span className="tnum font-heading text-xl font-semibold text-foreground">
        {value}
      </span>
      <span className="text-[11px] leading-tight text-muted-foreground text-pretty">
        {label}
      </span>
    </div>
  )
}
