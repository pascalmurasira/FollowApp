'use client'

import { useState } from 'react'
import {
  Plus,
  Check,
  Trash2,
  ListChecks,
  CalendarDays,
  ChevronDown,
  User,
} from 'lucide-react'
import type { Contact } from '@/lib/types'
import type { Task } from '@/hooks/use-tasks'
import { toDateInputValue } from '@/lib/calendar'
import { cn } from '@/lib/utils'

export function TasksView({
  open,
  completed,
  contacts,
  onAdd,
  onToggle,
  onRemove,
}: {
  open: Task[]
  completed: Task[]
  contacts: Contact[]
  onAdd: (input: {
    title: string
    contactId?: string
    contactName?: string
    dueDate?: string
  }) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [contactId, setContactId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [showDetails, setShowDetails] = useState(false)

  const submit = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    const contact = contacts.find((c) => c.id === contactId)
    onAdd({
      title: trimmed,
      contactId: contact?.id,
      contactName: contact?.name,
      dueDate: dueDate || undefined,
    })
    setTitle('')
    setContactId('')
    setDueDate('')
    setShowDetails(false)
  }

  const isEmpty = open.length === 0 && completed.length === 0

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {/* Quick add */}
      <div className="rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Add a task, e.g. Send deck to David"
            aria-label="Task title"
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus-visible:border-primary"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim()}
            aria-label="Add task"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
          >
            <Plus className="size-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          className="mt-2 flex items-center gap-1 px-1 text-[12px] font-medium text-muted-foreground transition-colors active:text-foreground"
        >
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              showDetails && 'rotate-180',
            )}
          />
          {showDetails ? 'Hide details' : 'Link a contact or add a due date'}
        </button>

        {showDetails && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                aria-label="Link a contact"
                className="h-11 w-full appearance-none rounded-xl border border-border bg-background pl-9 pr-4 text-base outline-none focus-visible:border-primary"
              >
                <option value="">No linked contact</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={dueDate}
                min={toDateInputValue(new Date())}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date"
                className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-base outline-none focus-visible:border-primary"
              />
            </div>
          </div>
        )}
      </div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          {open.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionLabel>
                To do
                <span className="ml-auto tnum text-muted-foreground/70">
                  {open.length}
                </span>
              </SectionLabel>
              {open.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onRemove={onRemove}
                />
              ))}
            </section>
          )}

          {completed.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionLabel>Done</SectionLabel>
              {completed.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onRemove={onRemove}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  onRemove,
}: {
  task: Task
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-card">
      <button
        type="button"
        onClick={() => onToggle(task.id)}
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? 'Mark task not done' : 'Mark task done'}
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
          task.done
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/40 text-transparent active:bg-muted',
        )}
      >
        <Check className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[15px] leading-tight text-pretty',
            task.done
              ? 'text-muted-foreground line-through'
              : 'text-foreground',
          )}
        >
          {task.title}
        </p>
        {(task.contactName || task.dueDate) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted-foreground">
            {task.contactName && (
              <span className="flex items-center gap-1">
                <User className="size-3" />
                {task.contactName}
              </span>
            )}
            {task.contactName && task.dueDate && <span aria-hidden="true">·</span>}
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" />
                {formatDue(task.dueDate)}
              </span>
            )}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRemove(task.id)}
        aria-label="Delete task"
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

/** Short due-date label, e.g. "Today", "Tomorrow", "Mar 5". */
function formatDue(dateStr: string): string {
  const today = toDateInputValue(new Date())
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dateStr === today) return 'Today'
  if (dateStr === toDateInputValue(tomorrow)) return 'Tomorrow'
  // Parse as local date to avoid UTC off-by-one.
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </h2>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
        <ListChecks className="size-6" strokeWidth={2.25} />
      </div>
      <div className="max-w-[18rem]">
        <p className="font-serif text-2xl font-medium leading-tight text-balance">
          No tasks yet
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
          Jot down a quick to-do — like &quot;Send deck to David&quot; or
          &quot;Intro Maya to an investor.&quot; Link it to a contact to keep it
          in context.
        </p>
      </div>
    </div>
  )
}
