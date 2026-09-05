import { useState } from 'react'

/**
 * CustomerGroupManager — 客戶群組（常用抬頭）後台管理
 * ─────────────────────────────────────────────────────────────────────────────
 * 一個群組 = { id, label(群組簡稱), name(發票抬頭), taxId, note, stores[](成員門市/客戶名) }
 * ・多門市客戶（台隆/安琪兒…）：成員彙總後對應同一張發票
 * ・名稱對應（日藥本舖 ↔ 日藥本舖股份有限公司）：單成員群組
 * 儲存/刪除透過 useBusinessData 的 billing_entities 雲端同步。
 */

const genId = () => 'grp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function GroupEditor({ initial, allStores, onSave, onCancel, onDelete }) {
  const [label, setLabel] = useState(initial?.label || '')
  const [name, setName] = useState(initial?.name || '')
  const [taxId, setTaxId] = useState(initial?.taxId || '')
  const [note, setNote] = useState(initial?.note || '')
  const [stores, setStores] = useState(initial?.stores || [])
  const [addInput, setAddInput] = useState('')

  const addStore = () => {
    const v = addInput.trim()
    if (!v || stores.includes(v)) { setAddInput(''); return }
    setStores(prev => [...prev, v])
    setAddInput('')
  }

  const submit = () => {
    if (!name.trim() && !label.trim()) { alert('請至少填寫群組名稱或發票抬頭'); return }
    onSave({
      id: initial?.id || genId(),
      label: label.trim(),
      name: name.trim() || label.trim(),
      taxId: taxId.trim(),
      note: note.trim(),
      stores,
    })
  }

  return (
    <div className="space-y-3 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-700/50 rounded-xl p-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400">群組名稱（顯示用）</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="例：台隆手創館"
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400">發票抬頭（正式名稱）</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="例：臺隆工業股份有限公司"
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400">統一編號</label>
          <input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="8 碼"
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 font-mono" />
        </div>
      </div>
      <div>
        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">備註</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="例：兩公司獨立開發票，以春秋御所為主"
          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100" />
      </div>
      <div>
        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">成員門市／客戶名稱（{stores.length} 個）</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {stores.map(s => (
            <span key={s} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200">
              {s}
              <button onClick={() => setStores(prev => prev.filter(x => x !== s))}
                className="text-gray-400 hover:text-red-500 font-bold" title="移除">✕</button>
            </span>
          ))}
          {stores.length === 0 && <span className="text-xs text-gray-400 italic">尚無成員，從下方加入</span>}
        </div>
        <div className="mt-2 flex gap-2">
          <input value={addInput} onChange={e => setAddInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStore() } }}
            list="cgm-store-options" placeholder="輸入或選擇門市名稱後按 Enter 加入"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100" />
          <datalist id="cgm-store-options">
            {allStores.filter(s => !stores.includes(s)).map(s => <option key={s} value={s} />)}
          </datalist>
          <button onClick={addStore}
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">加入</button>
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <div>
          {initial?.id && onDelete && (
            <button onClick={() => { if (window.confirm(`確定刪除群組「${label || name}」？（不影響已開立的發票）`)) onDelete(initial.id) }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              刪除群組
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
          <button onClick={submit}
            className="px-4 py-1.5 text-sm font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">✓ 儲存</button>
        </div>
      </div>
    </div>
  )
}

export default function CustomerGroupManager({ entities = [], allStores = [], onSave, onDelete, onClose }) {
  const [editingId, setEditingId] = useState(null)   // null=清單；'new'=新增；其他=編輯該 id
  const sorted = [...entities].sort((a, b) => (b.stores?.length || 0) - (a.stores?.length || 0))

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">👥 客戶群組管理</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          多門市客戶（台隆、安琪兒…）設定成員後，「尚未開立發票」清單會自動彙總為一列，勾選即可整組開一張發票；單成員群組則作為名稱對應（銷售名稱 → 正式抬頭）。
        </p>

        {editingId === 'new' && (
          <div className="mb-4">
            <GroupEditor allStores={allStores}
              onSave={g => { onSave(g); setEditingId(null) }}
              onCancel={() => setEditingId(null)} />
          </div>
        )}
        {editingId !== 'new' && (
          <button onClick={() => setEditingId('new')}
            className="mb-4 px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
            ＋ 新增群組
          </button>
        )}

        <div className="space-y-2">
          {sorted.map(ent => (
            editingId === ent.id ? (
              <GroupEditor key={ent.id} initial={ent} allStores={allStores}
                onSave={g => { onSave(g); setEditingId(null) }}
                onCancel={() => setEditingId(null)}
                onDelete={id => { onDelete(id); setEditingId(null) }} />
            ) : (
              <button key={ent.id} onClick={() => setEditingId(ent.id)}
                className="w-full text-left border border-gray-100 dark:border-gray-700 rounded-xl p-3 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10 transition-colors">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-gray-800 dark:text-gray-100">{ent.label || ent.name}</span>
                    {(ent.stores?.length || 0) > 1 && (
                      <span className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                        {ent.stores.length} 個成員
                      </span>
                    )}
                    {(ent.stores?.length || 0) <= 1 && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full whitespace-nowrap">名稱對應</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono whitespace-nowrap">
                    {ent.name}{ent.taxId ? ` · ${ent.taxId}` : ''}
                  </span>
                </div>
                {ent.note && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">📌 {ent.note}</p>}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">
                  {(ent.stores || []).join('、') || '（無成員）'}
                </p>
              </button>
            )
          ))}
          {sorted.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">尚未建立任何群組</p>
          )}
        </div>
      </div>
    </div>
  )
}
