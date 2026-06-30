import { useState } from 'react'
import { RotateCcw, Trash2, AlertTriangle, Search } from 'lucide-react'
import { useERPStore } from '../../store/useERPStore'
import { formatDate, currency } from '../../lib/formatters'

const COLLECTION_LABELS = {
  invoices: { label: 'Facturas', color: 'text-blue-300' },
  quotes: { label: 'Cotizaciones', color: 'text-amber-300' },
  customers: { label: 'Clientes', color: 'text-green-300' },
  suppliers: { label: 'Proveedores', color: 'text-purple-300' },
  products: { label: 'Productos', color: 'text-cyan-300' },
  receivables: { label: 'CxC', color: 'text-rose-300' },
  payments: { label: 'Pagos', color: 'text-indigo-300' },
  conduces: { label: 'Conduces', color: 'text-orange-300' },
  creditNotes: { label: 'Notas de credito', color: 'text-teal-300' },
}

export function TrashPage() {
  const [activeTab, setActiveTab] = useState('invoices')
  const [search, setSearch] = useState('')
  const [confirmPurge, setConfirmPurge] = useState(null)
  const [confirmAutoPurge, setConfirmAutoPurge] = useState(false)

  const state = useERPStore.getState()
  const restoreFromTrash = useERPStore((s) => s.restoreFromTrash)
  const purgeFromTrash = useERPStore((s) => s.purgeFromTrash)
  const autoPurgeTrash = useERPStore((s) => s.autoPurgeTrash)

  const allItems = state[activeTab]
  const trashItems = (Array.isArray(allItems) ? allItems : []).filter((item) => item.deletedAt)

  const filtered = search
    ? trashItems.filter((item) => {
        const name = item.name || item.customerName || item.number || item.id || ''
        return name.toLowerCase().includes(search.toLowerCase())
      })
    : trashItems

  function handleRestore(id) {
    try { restoreFromTrash(activeTab, id) } catch (e) { alert(e.message) }
  }

  function handlePurge(id) {
    try { purgeFromTrash(activeTab, id); setConfirmPurge(null) } catch (e) { alert(e.message) }
  }

  function handleAutoPurge() {
    try { autoPurgeTrash(); setConfirmAutoPurge(false) } catch (e) { alert(e.message) }
  }

  function renderItemName(item) {
    if (activeTab === 'customers') return item.name || item.legalName || item.id
    if (activeTab === 'products') return item.name || item.sku || item.id
    if (activeTab === 'suppliers') return item.name || item.id
    if (activeTab === 'invoices' || activeTab === 'creditNotes') return `${item.number || item.ncf || item.id} - ${item.customerName || 'N/A'}`
    if (activeTab === 'quotes') return `${item.number || item.id} - ${item.customerName || 'N/A'}`
    if (activeTab === 'receivables') return `${item.invoiceNumber || item.invoiceId || item.id} - RD$${currency(item.balance)}`
    if (activeTab === 'payments') return `${item.invoiceId || item.id} - RD$${currency(item.amount)}`
    if (activeTab === 'conduces') return `${item.number || item.id}`
    return item.id
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>Papelera</h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Registros eliminados. Restaure o purgue definitivamente.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirmAutoPurge(true)} className="rounded-xl border px-4 py-2 text-xs font-bold transition hover:bg-white/[0.05]" style={{ borderColor: 'var(--line)', color: 'var(--text-tertiary)' }}>
            Purgar automaticamente (30 dias)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2" style={{ borderColor: 'var(--line)' }}>
        {Object.entries(COLLECTION_LABELS).map(([key, meta]) => {
          const count = (Array.isArray(state[key]) ? state[key] : []).filter((i) => i.deletedAt).length
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setActiveTab(key); setSearch(''); setConfirmPurge(null) }}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                activeTab === key
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'text-[#94A3B8] hover:bg-white/[0.05] hover:text-[#F8FAFC]'
              }`}
            >
              {meta.label} {count > 0 && <span className="ml-1 rounded-full bg-blue-500/30 px-1.5 py-0.5 text-[10px]">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="relative mb-4">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 w-full rounded-xl border bg-[#0f172a] pl-10 pr-4 text-sm text-[#F8FAFC] outline-none transition placeholder:text-[#94A3B8]/60 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30" placeholder="Buscar en papelera..." aria-label="trash-search" />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Trash2 size={40} className="text-[#94A3B8]/40" />
          <p className="text-sm font-bold text-[#94A3B8]">No hay registros en la papelera</p>
          <p className="text-xs text-[#94A3B8]/60">Los registros eliminados apareceran aqui.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-bold text-[#94A3B8]">{filtered.length} registro(s)</span>
          </div>
          {filtered.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border px-4 py-3 transition hover:bg-white/[0.03]" style={{ borderColor: 'var(--line)' }}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Trash2 size={16} className="shrink-0 text-[#94A3B8]/60" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#F8FAFC]">{renderItemName(item)}</p>
                  <div className="flex items-center gap-3 text-[10px] text-[#94A3B8]/70">
                    <span>Eliminado: {item.deletedAt ? formatDate(item.deletedAt, { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</span>
                    {item.deletedBy && <span>por: {item.deletedBy}</span>}
                    {item.deleteReason && <span>motivo: {item.deleteReason}</span>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-4">
                <button type="button" onClick={() => handleRestore(item.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-green-400 transition hover:bg-green-500/10" title="Restaurar">
                  <RotateCcw size={13} /> Restaurar
                </button>
                <button type="button" onClick={() => setConfirmPurge(item.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-red-400 transition hover:bg-red-500/10" title="Eliminar definitivamente">
                  <Trash2 size={13} /> Purgar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Purge confirmation modal */}
      {confirmPurge && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmPurge(null)}>
          <div className="w-full max-w-md rounded-2xl border border-[#243244] bg-[#111827] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle size={24} className="text-red-400" />
              <div>
                <h3 className="font-bold text-[#F8FAFC]">Purgar registro</h3>
                <p className="text-xs text-[#94A3B8]">Esta accion no se puede deshacer. El registro se eliminara permanentemente de Firestore.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmPurge(null)} className="rounded-xl px-5 py-2 text-sm font-bold text-[#94A3B8] transition hover:bg-white/[0.05]">Cancelar</button>
              <button type="button" onClick={() => handlePurge(confirmPurge)} className="rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition hover:from-red-500 hover:to-red-400">Purgar</button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-purge confirmation */}
      {confirmAutoPurge && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmAutoPurge(false)}>
          <div className="w-full max-w-md rounded-2xl border border-[#243244] bg-[#111827] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle size={24} className="text-amber-400" />
              <div>
                <h3 className="font-bold text-[#F8FAFC]">Purgar automaticamente</h3>
                <p className="text-xs text-[#94A3B8]">Se eliminaran permanentemente todos los registros con mas de 30 dias en la papelera.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmAutoPurge(false)} className="rounded-xl px-5 py-2 text-sm font-bold text-[#94A3B8] transition hover:bg-white/[0.05]">Cancelar</button>
              <button type="button" onClick={handleAutoPurge} className="rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition hover:from-amber-500 hover:to-amber-400">Purgar todo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}