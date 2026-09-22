export type PackingTrigger = 'manual' | 'container-change' | 'initial'

/**
 * Keeps the packing trigger decision in one small, testable module.
 * Editing cargo data must not trigger packing automatically.
 */
export function shouldRunPacking(trigger: PackingTrigger): boolean {
  return trigger === 'manual' || trigger === 'container-change' || trigger === 'initial'
}

export function shouldPackAfterCargoEdit(): boolean {
  return false
}
