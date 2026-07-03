// A tiny global concurrency limiter so we don't fire many AI requests at once
// (which trips rate limits). Requests run a few at a time, in order.

type Task<T> = () => Promise<T>

const MAX_CONCURRENT = 2
let active = 0
const queue: Array<() => void> = []

function next() {
  if (active >= MAX_CONCURRENT) return
  const run = queue.shift()
  if (!run) return
  active++
  run()
}

export function enqueue<T>(task: Task<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      task()
        .then(resolve, reject)
        .finally(() => {
          active--
          next()
        })
    }
    queue.push(run)
    next()
  })
}
