export interface CameraLaunchState {
  attempt: number
  active: boolean
}

export function createCameraLaunchState(): CameraLaunchState {
  return { attempt: 0, active: false }
}

/** Returns a unique attempt id, or null while another camera owns the UI. */
export function beginCameraLaunch(state: CameraLaunchState): number | null {
  if (state.active) return null
  state.active = true
  state.attempt += 1
  return state.attempt
}

/** Releases ownership only for the attempt that still owns the camera. */
export function finishCameraLaunch(
  state: CameraLaunchState,
  attempt: number,
): boolean {
  if (!state.active || state.attempt !== attempt) return false
  state.active = false
  return true
}

/** Invalidates a pending result when the scan sheet is reset or closed. */
export function cancelCameraLaunch(state: CameraLaunchState): void {
  state.attempt += 1
  state.active = false
}

export function isCameraLaunchActive(state: CameraLaunchState): boolean {
  return state.active
}
