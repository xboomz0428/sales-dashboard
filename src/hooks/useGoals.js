import { useState } from 'react'

const KEY = 'sdash_goals_v2'
const DEFAULT = { annual: {}, longTerm: {} }

export function useGoals() {
  const [goals, setGoals] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || DEFAULT }
    catch { return DEFAULT }
  })

  const save = (g) => {
    setGoals(g)
    localStorage.setItem(KEY, JSON.stringify(g))
  }

  const setAnnual = (year, field, value) => {
    const g = { ...goals, annual: { ...goals.annual, [year]: { ...(goals.annual[year] || {}), [field]: value } } }
    save(g)
  }

  const setLongTerm = (key, field, value) => {
    const g = { ...goals, longTerm: { ...goals.longTerm, [key]: { ...(goals.longTerm[key] || {}), [field]: value } } }
    save(g)
  }

  return { goals, save, setAnnual, setLongTerm }
}
