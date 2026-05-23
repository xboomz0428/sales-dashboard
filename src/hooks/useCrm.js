import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, supabaseReady } from '../config/supabase'

const LS_CRM   = 'crm_contacts'
const LS_BONUS = 'bonus_plans'
const TBL_CRM   = 'crm_contacts'
const TBL_BONUS = 'bonus_plans'

function lsGet(key) { try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] } }
function lsSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }

export function genCrmId() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

function dbToContact(r) {
  return {
    id:             r.id,
    name:           r.name || '',
    type:           r.type || 'prospect',
    clientCategory: r.client_category || 'studio',
    stage:          r.stage || 'contact',
    assigneeUid:    r.assignee_uid || '',
    assigneeName:   r.assignee_name || '',
    phone:          r.phone || '',
    email:          r.email || '',
    address:        r.address || '',
    scale:          r.scale || '',
    intel:          r.intel || '',
    note:           r.note || '',
    contacts:       Array.isArray(r.contacts) ? r.contacts : [],
    socialMedia:    r.social_media || { instagram: '', facebook: '', line: '', website: '' },
    nextFollowup:   r.next_followup || '',
    wonAt:          r.won_at || '',
    logs:           Array.isArray(r.logs) ? r.logs : [],
    createdAt:      r.created_at || '',
    updatedAt:      r.updated_at || '',
  }
}

function contactToDb(c) {
  return {
    id:              c.id,
    name:            c.name,
    type:            c.type,
    client_category: c.clientCategory,
    stage:           c.stage,
    assignee_uid:    c.assigneeUid,
    assignee_name:   c.assigneeName,
    phone:           c.phone || '',
    email:           c.email || '',
    address:         c.address || '',
    scale:           c.scale || '',
    intel:           c.intel || '',
    note:            c.note || '',
    contacts:        c.contacts || [],
    social_media:    c.socialMedia || {},
    next_followup:   c.nextFollowup || null,
    won_at:          c.wonAt || null,
    logs:            c.logs,
    created_at:      c.createdAt,
    updated_at:      new Date().toISOString().slice(0, 10),
  }
}

function dbToPlan(r) {
  return {
    uid:            r.uid,
    name:           r.name || '',
    devChain:       r.dev_chain ?? 5000,
    devBrand:       r.dev_brand ?? 3000,
    devStudio:      r.dev_studio ?? 1000,
    devThreshold:   r.dev_threshold ?? 500000,
    devEnabled:     r.dev_enabled ?? true,
    monthlyTiers:    r.monthly_tiers || [
      { min: 0,       rate: 0.01  },
      { min: 500000,  rate: 0.015 },
      { min: 1000000, rate: 0.02  },
    ],
    monthlyEnabled:  r.monthly_enabled ?? true,
    quarterlyTiers:  r.quarterly_tiers || [
      { min: 0,        rate: 0.008 },
      { min: 1500000,  rate: 0.012 },
      { min: 3000000,  rate: 0.018 },
    ],
    quarterlyEnabled: r.quarterly_enabled ?? true,
    annualTiers:     r.annual_tiers || [
      { min: 0,        rate: 0.005 },
      { min: 5000000,  rate: 0.01  },
    ],
    annualEnabled:   r.annual_enabled ?? true,
    updatedAt:       r.updated_at || '',
  }
}

function planToDb(p) {
  return {
    uid:             p.uid,
    name:            p.name,
    dev_chain:       Number(p.devChain) || 0,
    dev_brand:       Number(p.devBrand) || 0,
    dev_studio:      Number(p.devStudio) || 0,
    dev_threshold:   Number(p.devThreshold) || 0,
    dev_enabled:     p.devEnabled,
    monthly_tiers:    p.monthlyTiers,
    monthly_enabled:  p.monthlyEnabled,
    quarterly_tiers:  p.quarterlyTiers,
    quarterly_enabled: p.quarterlyEnabled,
    annual_tiers:     p.annualTiers,
    annual_enabled:   p.annualEnabled,
    updated_at:      new Date().toISOString().slice(0, 10),
  }
}

export function useCrm(user) {
  const [contacts,   setContacts]   = useState(() => lsGet(LS_CRM))
  const [bonusPlans, setBonusPlans] = useState(() => lsGet(LS_BONUS))
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!user || !supabaseReady || loadedRef.current) return
    loadedRef.current = true
    Promise.all([
      supabase.from(TBL_CRM).select('*').order('updated_at', { ascending: false }),
      supabase.from(TBL_BONUS).select('*'),
    ]).then(([crmRes, bonusRes]) => {
      if (!crmRes.error && crmRes.data?.length) {
        const parsed = crmRes.data.map(dbToContact)
        setContacts(parsed)
        lsSet(LS_CRM, parsed)
      }
      if (!bonusRes.error && bonusRes.data?.length) {
        const parsed = bonusRes.data.map(dbToPlan)
        setBonusPlans(parsed)
        lsSet(LS_BONUS, parsed)
      }
    }).catch(() => {})
  }, [user?.id])

  const saveContact = useCallback((contact) => {
    const today = new Date().toISOString().slice(0, 10)
    const isNew = !contact.id
    const c = isNew
      ? { ...contact, id: genCrmId(), createdAt: today, updatedAt: today }
      : { ...contact, updatedAt: today }
    setContacts(prev => {
      const next = isNew ? [...prev, c] : prev.map(x => x.id === c.id ? c : x)
      lsSet(LS_CRM, next)
      return next
    })
    if (supabaseReady) {
      supabase.from(TBL_CRM).upsert(contactToDb(c)).catch(() => {})
    }
    return c
  }, [])

  const deleteContact = useCallback((id) => {
    setContacts(prev => {
      const next = prev.filter(x => x.id !== id)
      lsSet(LS_CRM, next)
      return next
    })
    if (supabaseReady) {
      supabase.from(TBL_CRM).delete().eq('id', id).catch(() => {})
    }
  }, [])

  const saveBonusPlan = useCallback((plan) => {
    setBonusPlans(prev => {
      const exists = prev.find(p => p.uid === plan.uid)
      const next = exists ? prev.map(p => p.uid === plan.uid ? plan : p) : [...prev, plan]
      lsSet(LS_BONUS, next)
      return next
    })
    if (supabaseReady) {
      supabase.from(TBL_BONUS).upsert(planToDb(plan)).catch(() => {})
    }
  }, [])

  return { contacts, bonusPlans, saveContact, deleteContact, saveBonusPlan }
}
