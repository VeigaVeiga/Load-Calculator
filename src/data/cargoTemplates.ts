import type { Cargo } from '../types'

// Start with an empty cargo list. Regression/test cargo must never silently
// appear in the planner or in exported loading plans.
export const cargoTemplates: Cargo[] = []
