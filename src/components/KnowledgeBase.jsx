import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase, supabaseAdmin } from '../config/supabase'
import { getStoredApiKey } from '../utils/ai'
import { streamAnalysis } from '../utils/aiAnalyst'

/**
 * 知識庫（FAQ）
 * ・依 品牌/產品 建立 FAQ，供內部查詢、客服回覆、AI 問答引用
 * ・篩選（品牌/產品/關鍵字/狀態）後可匯出 Word 檔（.doc，Word 直接開啟）
 * ・「🤖 AI 草稿」可依問題自動擬答（附合規規則），存檔前人工確認
 */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const EMPTY_FORM = { id: null, brand: '', category: '', product: '', question: '', answer: '', tags: '', status: 'published', compliance_ok: false }

export default function KnowledgeBase({ brands = [], products = [], brandProducts = {}, brandCategories = {}, catProducts = {}, canManage = true, userEmail = '' }) {
  const client = supabaseAdmin || supabase
  const [faqs, setFaqs] = useState(null)          // null = 載入中
  const [msg, setMsg] = useState(null)
  const [fBrand, setFBrand] = useState('')        // 篩選
  const [fCategory, setFCategory] = useState('')
  const [fProduct, setFProduct] = useState('')
  const [fKeyword, setFKeyword] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [form, setForm] = useState(null)          // null = 未開表單
  const [saving, setSaving] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)

  const load = useCallback(async () => {
    if (!client) { setFaqs([]); return }
    const { data, error } = await client.from('kb_faqs').select('*').order('brand').order('product').order('created_at')
    if (error) { setMsg({ ok: false, text: '載入失敗：' + error.message }); setFaqs([]); return }
    setFaqs(data || [])
  }, [client])
  useEffect(() => { load() }, [load])

  // brands prop 已依「近 3 年銷售額」排序（App 計算）；保持該順序，
  // 既有 FAQ 用到但不在清單內的品牌（如已停售）附加在最後，避免舊資料選不到
  const kbBrands = useMemo(() => {
    const extra = [...new Set((faqs || []).map(f => f.brand))]
      .filter(b => b && !brands.includes(b)).sort()
    return [...brands, ...extra]
  }, [faqs, brands])

  // 選定品牌後，產品選項自動縮小為該品牌的產品（依銷售額排序）；未選品牌則列全部活躍產品
  const productsForBrand = (brand) => (brand && brandProducts[brand]?.length ? brandProducts[brand] : products)
  // 分類選項：選定品牌 → 該品牌的分類（依銷售排序）；未選品牌 → 所有品牌分類聯集＋FAQ 既有分類
  const categoriesFor = (brand) => {
    if (brand && brandCategories[brand]?.length) return brandCategories[brand]
    const all = [...new Set([
      ...Object.values(brandCategories).flat(),
      ...(faqs || []).map(f => f.category).filter(Boolean),
    ])]
    return all
  }
  // 品牌＋分類都選了 → 產品只列該分類下的
  const productsFor = (brand, category) => {
    if (brand && category && catProducts[`${brand}|${category}`]?.length) return catProducts[`${brand}|${category}`]
    return productsForBrand(brand)
  }

  const filtered = useMemo(() => (faqs || []).filter(f => {
    if (fBrand && f.brand !== fBrand) return false
    if (fCategory && f.category !== fCategory) return false
    if (fProduct && !(f.product || '').toLowerCase().includes(fProduct.toLowerCase())) return false
    if (fStatus && f.status !== fStatus) return false
    if (fKeyword) {
      const kw = fKeyword.toLowerCase()
      if (!`${f.question} ${f.answer} ${(f.tags || []).join(' ')}`.toLowerCase().includes(kw)) return false
    }
    return true
  }), [faqs, fBrand, fCategory, fProduct, fKeyword, fStatus])

  // ── 儲存 / 刪除 ──────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.question.trim()) { setMsg({ ok: false, text: '問題不能為空' }); return }
    setSaving(true)
    const row = {
      brand: form.brand.trim(), category: form.category.trim(), product: form.product.trim(),
      question: form.question.trim(), answer: form.answer.trim(),
      tags: form.tags.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
      status: form.status, compliance_ok: form.compliance_ok,
      author: userEmail, updated_at: new Date().toISOString(),
    }
    const { error } = form.id
      ? await client.from('kb_faqs').update(row).eq('id', form.id)
      : await client.from('kb_faqs').insert(row)
    setSaving(false)
    if (error) { setMsg({ ok: false, text: '儲存失敗：' + error.message }); return }
    setMsg({ ok: true, text: form.id ? '已更新' : '已新增' })
    setForm(null)
    load()
  }

  const remove = async (f) => {
    if (!window.confirm(`確定刪除這則 FAQ？\nQ: ${f.question.slice(0, 40)}…`)) return
    const { error } = await client.from('kb_faqs').delete().eq('id', f.id)
    if (error) { setMsg({ ok: false, text: '刪除失敗：' + error.message }); return }
    load()
  }

  // ── AI 草稿擬答 ──────────────────────────────────────────────────────────
  const aiDraft = async () => {
    const apiKey = getStoredApiKey()
    if (!apiKey) { setMsg({ ok: false, text: '尚未設定 AI API Key（AI 分析頁左側可設定）' }); return }
    if (!form.question.trim()) { setMsg({ ok: false, text: '請先輸入問題' }); return }
    setAiBusy(true)
    let acc = ''
    await new Promise((resolve) => {
      streamAnalysis({
        apiKey,
        prompt: `你是威斯邁國際（台灣母嬰多品牌經銷商，品牌含 BAILEY/HUGGER/miYim/好漢草等）的客服知識庫編輯。請為以下 FAQ 撰寫答案草稿：
品牌：${form.brand || '（未指定）'}　產品：${form.product || '（未指定）'}
問題：${form.question}

要求：繁體中文、口吻親切專業、150 字內、純文字（禁 Markdown 與 HTML）。
合規紅線：涉及草本/保健/母嬰安全，嚴禁療效、醫療、誇大字眼（藥事法/食安法）；不確定的宣稱寧可不寫。結尾不用加「還有其他問題嗎」之類的客套話。`,
        onChunk: t => { acc += t },
        onDone: () => resolve(),
        onError: (m) => { setMsg({ ok: false, text: 'AI 草稿失敗：' + m }); resolve() },
      })
    })
    if (acc.trim()) setForm(prev => ({ ...prev, answer: acc.trim(), compliance_ok: false }))
    setAiBusy(false)
  }

  // ── 匯出 Word（.doc：Word 相容的 HTML）───────────────────────────────────
  const exportWord = () => {
    if (!filtered.length) { setMsg({ ok: false, text: '目前篩選條件下沒有 FAQ 可匯出' }); return }
    const groups = {}
    for (const f of filtered) {
      const b = f.brand || '未分類品牌'
      const p = f.category || f.product || '通用'
      ;((groups[b] ||= {})[p] ||= []).push(f)
    }
    const filterDesc = [fBrand && `品牌：${fBrand}`, fCategory && `分類：${fCategory}`, fProduct && `產品：${fProduct}`, fKeyword && `關鍵字：${fKeyword}`,
      fStatus && `狀態：${fStatus === 'published' ? '已發布' : '草稿'}`].filter(Boolean).join('；') || '全部'
    let body = `<h1 style="font-size:20pt">產品 FAQ 知識庫</h1>
<p style="color:#666">威斯邁國際有限公司　匯出日期：${new Date().toLocaleDateString('zh-TW')}　共 ${filtered.length} 則（篩選：${esc(filterDesc)}）</p><hr/>`
    let n = 0
    for (const b of Object.keys(groups).sort()) {
      body += `<h2 style="font-size:16pt;color:#1a56db">品牌：${esc(b)}</h2>`
      for (const p of Object.keys(groups[b]).sort()) {
        body += `<h3 style="font-size:13pt;color:#333">▍${esc(p)}</h3>`
        for (const f of groups[b][p]) {
          n++
          const prodTag = f.category && f.product ? `〔${esc(f.product)}〕` : ''
          body += `<p style="margin:8pt 0 2pt"><b>Q${n}. ${prodTag}${esc(f.question)}</b>${f.compliance_ok ? '' : '　<span style="color:#d97706;font-size:9pt">（未過合規審查）</span>'}</p>`
          body += `<p style="margin:0 0 6pt">${esc(f.answer).replace(/\n/g, '<br/>')}</p>`
        }
      }
    }
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>FAQ知識庫</title></head>
<body style="font-family:'Microsoft JhengHei','微軟正黑體',sans-serif;font-size:11pt;line-height:1.6">${body}</body></html>`
    const blob = new Blob(['﻿' + html], { type: 'application/msword' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `FAQ知識庫_${fBrand || '全部'}_${new Date().toISOString().slice(0, 10)}.doc`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">📚 知識庫（FAQ）</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            依品牌/產品累積 FAQ；AI 問答會自動引用這裡的內容回答
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportWord}
            className="text-sm px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-700/50 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-semibold">
            📄 匯出 Word（{filtered.length} 則）
          </button>
          {canManage && (
            <button onClick={() => setForm({ ...EMPTY_FORM })}
              className="text-sm px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">
              ＋ 新增 FAQ
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-xl text-sm border flex justify-between ${msg.ok
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-400'
          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-600 dark:text-red-400'}`}>
          <span>{msg.ok ? '✓ ' : '✕ '}{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* 篩選列 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex flex-wrap gap-2 items-center">
        <select value={fBrand} onChange={e => { setFBrand(e.target.value); setFCategory(''); setFProduct('') }}
          className="text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200">
          <option value="">全部品牌</option>
          {kbBrands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={fCategory} onChange={e => { setFCategory(e.target.value); setFProduct('') }}
          className="text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200">
          <option value="">全部分類</option>
          {categoriesFor(fBrand).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input list="kb-products-filter" value={fProduct} onChange={e => setFProduct(e.target.value)} placeholder="產品名稱…"
          className="text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 w-44" />
        <datalist id="kb-products-filter">{productsFor(fBrand, fCategory).slice(0, 300).map(p => <option key={p} value={p} />)}</datalist>
        <input value={fKeyword} onChange={e => setFKeyword(e.target.value)} placeholder="🔍 關鍵字（問題/答案/標籤）"
          className="text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 flex-1 min-w-[180px]" />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          className="text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200">
          <option value="">全部狀態</option>
          <option value="published">已發布</option>
          <option value="draft">草稿</option>
        </select>
        {(fBrand || fCategory || fProduct || fKeyword || fStatus) && (
          <button onClick={() => { setFBrand(''); setFCategory(''); setFProduct(''); setFKeyword(''); setFStatus('') }}
            className="text-xs text-gray-400 hover:text-gray-600 underline">清除篩選</button>
        )}
      </div>

      {/* 新增/編輯表單 */}
      {form && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-blue-200 dark:border-blue-700/50 shadow-md p-5 space-y-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{form.id ? '✏️ 編輯 FAQ' : '＋ 新增 FAQ'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">品牌</label>
              <input list="kb-brands" value={form.brand}
                onChange={e => setForm({ ...form, brand: e.target.value, category: '', product: '' })}
                placeholder="例：好漢草" className="mt-1 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200" />
              <datalist id="kb-brands">{kbBrands.map(b => <option key={b} value={b} />)}</datalist>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">分類{form.brand ? `（${form.brand} 的分類）` : ''}</label>
              <input list="kb-categories" value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value, product: '' })}
                placeholder="例：艾草包、背包" className="mt-1 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200" />
              <datalist id="kb-categories">{categoriesFor(form.brand).map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">產品（可空白＝分類通用）</label>
              <input list="kb-products" value={form.product} onChange={e => setForm({ ...form, product: e.target.value })}
                placeholder="例：艾草淨身平安包(15入)" className="mt-1 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200" />
              <datalist id="kb-products">{productsFor(form.brand, form.category).slice(0, 300).map(p => <option key={p} value={p} />)}</datalist>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase">問題</label>
            <input value={form.question} onChange={e => setForm({ ...form, question: e.target.value })}
              placeholder="例：平安包可以放多久？要怎麼使用？"
              className="mt-1 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-400 uppercase">答案</label>
              <button onClick={aiDraft} disabled={aiBusy}
                className="text-xs px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold">
                {aiBusy ? 'AI 撰寫中…' : '🤖 AI 草稿擬答'}
              </button>
            </div>
            <textarea value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} rows={5}
              placeholder="answer…（可先按 AI 草稿再修改）"
              className="mt-1 w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
              placeholder="標籤（逗號分隔）：使用方式, 保存, 退換貨"
              className="text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 flex-1 min-w-[200px]" />
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
              className="text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200">
              <option value="published">已發布</option>
              <option value="draft">草稿</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={form.compliance_ok} onChange={e => setForm({ ...form, compliance_ok: e.target.checked })} />
              已過人工合規審查
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setForm(null)} className="text-sm px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500">取消</button>
            <button onClick={save} disabled={saving}
              className="text-sm px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold">
              {saving ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      )}

      {/* 清單 */}
      <div className="space-y-2">
        {faqs == null ? (
          <p className="text-sm text-gray-400 py-8 text-center">載入中…</p>
        ) : !filtered.length ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-8 text-center text-gray-400 text-sm">
            {faqs.length ? '沒有符合篩選的 FAQ' : '還沒有 FAQ——按右上「＋ 新增 FAQ」開始建立知識庫'}
          </div>
        ) : filtered.map(f => (
          <div key={f.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  {f.brand && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold">{f.brand}</span>}
                  {f.category && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-bold">{f.category}</span>}
                  {f.product && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{f.product}</span>}
                  {(f.tags || []).map(t => <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-900 text-gray-400">#{t}</span>)}
                  {f.status === 'draft' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 font-bold">草稿</span>}
                  {!f.compliance_ok && <span className="text-xs text-amber-500" title="尚未通過人工合規審查">⚠️ 未審</span>}
                </div>
                <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">Q：{f.question}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">A：{f.answer || '（尚無答案）'}</p>
              </div>
              {canManage && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setForm({
                    id: f.id, brand: f.brand, category: f.category || '', product: f.product, question: f.question, answer: f.answer,
                    tags: (f.tags || []).join(', '), status: f.status, compliance_ok: !!f.compliance_ok,
                  })} className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700">✏️</button>
                  <button onClick={() => remove(f)}
                    className="text-xs px-2 py-1 rounded-lg border border-red-200 dark:border-red-700/50 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">🗑</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
