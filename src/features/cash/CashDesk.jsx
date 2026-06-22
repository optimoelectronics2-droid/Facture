import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, FileSpreadsheet, Lock, Plus, Printer, Trash2, Unlock, AlertTriangle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { DataTable } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { buildCashCutReport } from '../../lib/cashDeskEngine'
import { downloadCsv } from '../../lib/csvExport'
import { dayKeyInSystemZone, todayIso } from '../../lib/dateTime'
import { currency, formatDate } from '../../lib/formatters'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'

const movementCategories = ['Gastos', 'Compras', 'Transporte', 'Mensajeria', 'Delivery', 'Servicios', 'Luz', 'Internet', 'Telefono', 'Alquiler', 'Nomina', 'Combustible', 'Mantenimiento', 'Retiros', 'Ingresos extraordinarios', 'Ajustes', 'Impuestos', 'Bancos', 'Otros']
const paymentMethods = ['Efectivo', 'Tarjeta', 'Transferencia', 'Deposito', 'Cheque', 'Pago movil', 'Zelle', 'PayPal', 'Credito', 'Otro']
const periodOptions = [
  { id: 'day', label: 'Dia' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'year', label: 'Año' },
  { id: 'all', label: 'Todo' },
]

export function CashDesk({ manualOnly = false }) {
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const company = useERPStore((state) => state.company)
  const branches = useERPStore((state) => state.branches)
  const invoices = useERPStore((state) => state.invoices)
  const creditNotes = useERPStore((state) => state.creditNotes)
  const expenses = useERPStore((state) => state.expenses)
  const receivables = useERPStore((state) => state.receivables)
  const payments = useERPStore((state) => state.payments)
  const cash = useERPStore((state) => state.cashRegister)
  const currentUser = useERPStore((state) => state.currentUser)
  const openCashRegister = useERPStore((state) => state.openCashRegister)
  const closeCashRegister = useERPStore((state) => state.closeCashRegister)
  const registerCashMovement = useERPStore((state) => state.registerCashMovement)
  const deleteCashMovement = useERPStore((state) => state.deleteCashMovement)
  const [openForm, setOpenForm] = useState({
    amount: cash.counted || 0,
    branchId: branches[0]?.id || '',
    branchName: branches[0]?.name || '',
    cashName: cash.name || 'Caja principal',
    cashier: currentUser?.name || 'Usuario',
  })
  const [counted, setCounted] = useState(cash.counted || 0)
  const [movement, setMovement] = useState(defaultManualMovement())
  const [movementPeriod, setMovementPeriod] = useState('day')
  const [closeConfirm, setCloseConfirm] = useState(false)
  const standaloneManual = manualOnly || location.pathname === '/movimientos-manuales'
  const report = useMemo(() => buildCashCutReport({ cashRegister: { ...cash, counted }, invoices, creditNotes, expenses, receivables, payments, company, branches }), [branches, cash, company, counted, creditNotes, expenses, invoices, payments, receivables])
  const manualMovements = useMemo(() => (report.movements || [])
    .filter((item) => isManualMovement(item))
    .filter((item) => inMovementPeriod(item.movementDate || item.createdAt, movementPeriod))
    .sort((left, right) => String(right.movementDate || right.createdAt).localeCompare(String(left.movementDate || left.createdAt))), [movementPeriod, report.movements])
  const manualSummary = useMemo(() => summarizeManualMovements(manualMovements), [manualMovements])

  function setOpenField(key, value) {
    setOpenForm((state) => ({ ...state, [key]: value }))
  }

  function selectBranch(branchId) {
    const branch = branches.find((item) => item.id === branchId)
    setOpenForm((state) => ({ ...state, branchId, branchName: branch?.name || '' }))
  }

  function setMovementField(key, value) {
    setMovement((state) => ({ ...state, [key]: value }))
  }

  function submitMovement(event) {
    event.preventDefault()
    try {
      registerCashMovement(movement)
      setMovement(defaultManualMovement())
      toast.success('Movimiento registrado y caja recalculada.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function handleClose() {
    try {
      closeCashRegister(counted)
      toast.success('Caja cerrada correctamente.')
      setCloseConfirm(false)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function removeMovement(row) {
    if (row.type === 'opening') {
      toast.error('La apertura de caja no se elimina; cierre y abra una caja nueva si necesita corregirla.')
      return
    }
    if (!isManualMovement(row)) {
      toast.error('Este movimiento pertenece a un documento del sistema. Corrija el documento original para recalcular caja.')
      return
    }
    if (!window.confirm(`Eliminar el movimiento "${row.concept || row.type}"?`)) return
    try {
      deleteCashMovement(row.id, 'Eliminacion confirmada desde caja')
      toast.success('Movimiento eliminado y caja recalculada.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  async function exportCutPdf() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(report.companyName || 'Cierre de caja', 14, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`RNC: ${report.rnc || 'N/A'} | Sucursal: ${report.branchName} | Caja: ${report.cashName} | Cajero: ${report.cashier}`, 14, 21)
    doc.text(`Apertura: ${formatDate(report.openedAt)} | Cierre: ${report.closedAt ? formatDate(report.closedAt) : 'En curso'}`, 14, 27)
    autoTable(doc, {
      startY: 34,
      head: [['Concepto', 'Monto']],
      body: [
        ['Fondo inicial', currency.format(report.openingAmount)],
        ['Ventas totales', currency.format(report.grossSales)],
        ['Devoluciones / notas credito', currency.format(report.returns)],
        ['Descuentos', currency.format(report.discounts)],
        ['ITBIS', currency.format(report.tax)],
        ['Gastos', currency.format(report.expenses)],
        ['Balance calculado de caja', currency.format(report.expected)],
        ['Efectivo contado', currency.format(report.counted)],
        ['Diferencia', currency.format(report.difference)],
      ],
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    })
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Metodo', 'Ventas', 'Devoluciones', 'Neto']],
      body: report.byMethod.map((item) => [item.method, currency.format(item.sales), currency.format(item.refunds), currency.format(item.net)]),
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    })
    doc.save('cierre-caja-profesional.pdf')
  }

  function exportManualCsv() {
    downloadCsv(`movimientos-manuales-${movementPeriod}.csv`, manualMovements.map((item) => ({
      Fecha: formatDate(item.movementDate || item.createdAt),
      Tipo: movementTypeLabel(item.type),
      Categoria: item.category || '',
      Metodo: item.method || '',
      Destino: item.destination || '',
      Mensajero: item.messenger || '',
      Concepto: item.concept || item.note || '',
      Referencia: item.reference || '',
      Canal: item.channel || '',
      Notas: item.notes || '',
      Monto: signedManualAmount(item),
    })))
  }

  async function exportManualPdf() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
    const periodLabel = periodOptions.find((option) => option.id === movementPeriod)?.label || 'Todo'
    const companyName = report.companyName || company?.name || 'Trifusion Technologies'
    doc.setProperties({ title: `Movimientos manuales - ${periodLabel}` })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Reporte avanzado de movimientos manuales', 12, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(`${companyName} | RNC: ${report.rnc || company?.rnc || 'N/A'} | Periodo: ${periodLabel} | Generado: ${formatDate(new Date())}`, 12, 21)
    doc.text(`Sucursal: ${report.branchName || 'Principal'} | Caja: ${report.cashName || cash.name || 'Caja principal'} | Cajero: ${report.cashier || currentUser?.name || 'Usuario'}`, 12, 27)

    autoTable(doc, {
      startY: 34,
      head: [['Indicador', 'Valor', 'Indicador', 'Valor']],
      body: [
        ['Ingresos manuales', currency.format(manualSummary.income), 'Salidas manuales', currency.format(manualSummary.outflow)],
        ['Balance manual', currency.format(manualSummary.net), 'Movimientos', manualSummary.count],
        ['Promedio ingresos', currency.format(manualSummary.avgIncome), 'Promedio salidas', currency.format(manualSummary.avgOutflow)],
        ['Mayor ingreso', currency.format(manualSummary.maxIncome), 'Mayor salida', currency.format(manualSummary.maxOutflow)],
      ],
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } },
    })

    const breakdownRows = [
      ...manualSummary.byType.map((item) => ['Tipo', item.label, item.count, currency.format(item.income), currency.format(item.outflow), currency.format(item.net)]),
      ...manualSummary.byCategory.map((item) => ['Categoria', item.label, item.count, currency.format(item.income), currency.format(item.outflow), currency.format(item.net)]),
      ...manualSummary.byMethod.map((item) => ['Metodo', item.label, item.count, currency.format(item.income), currency.format(item.outflow), currency.format(item.net)]),
    ]
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Grupo', 'Detalle', 'Cantidad', 'Ingresos', 'Salidas', 'Balance']],
      body: breakdownRows.length ? breakdownRows : [['Sin movimientos', 'No hay datos en este periodo', 0, currency.format(0), currency.format(0), currency.format(0)]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Fecha', 'Tipo', 'Categoria', 'Metodo', 'Destino', 'Mensajero', 'Concepto', 'Referencia', 'Monto']],
      body: manualMovements.map((item) => [
        formatDate(item.movementDate || item.createdAt),
        movementTypeLabel(item.type),
        item.category || '',
        item.method || '',
        item.destination || '',
        item.messenger || '',
        item.concept || item.note || '',
        item.reference || '',
        currency.format(signedManualAmount(item)),
      ]),
      styles: { fontSize: 7.4, cellPadding: 1.8, overflow: 'linebreak' },
      headStyles: { fillColor: [99, 102, 241], textColor: 255 },
      columnStyles: { 6: { cellWidth: 58 }, 7: { cellWidth: 34 }, 8: { halign: 'right' } },
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.getHeight()
        doc.setFontSize(7)
        doc.setTextColor(120)
        doc.text(`Movimientos manuales | ${companyName}`, 12, pageHeight - 8)
      },
    })
    doc.save(`movimientos-manuales-avanzado-${movementPeriod}.pdf`)
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-bold uppercase" style={{ color: 'rgb(191,219,254)' }}>{standaloneManual ? 'Operaciones' : 'Caja profesional'}</p>
            <h2 className="font-display text-3xl font-bold">{standaloneManual ? 'Registro completo de movimientos manuales' : 'Apertura, movimientos y corte diario'}</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{standaloneManual ? 'Entradas, salidas, pagos operativos, mensajeria, servicios y gastos sin mezclar la pantalla de arqueo.' : 'Control tactil para POS, tablets y arqueos con auditoria del estado actual.'}</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            {standaloneManual ? (
              <Button variant="ghost" onClick={() => navigate('/caja')}>Volver a caja</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/movimientos-manuales')}>Registro manual</Button>
                <Button variant="ghost" icon={Printer} onClick={() => window.print()}>Imprimir corte</Button>
                <Button variant="primary" icon={Download} onClick={exportCutPdf}>PDF corte</Button>
              </>
            )}
          </div>
        </div>
      </section>

      {!standaloneManual ? <section className="grid gap-5 xl:grid-cols-[.82fr_1.18fr]">
        <div>
          <h3 className="font-display text-xl font-bold">Apertura y cierre</h3>
          <div className="mt-4 rounded-lg p-4" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}>
            <p className="text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>Estado</p>
            <p className={cash.status === 'open' ? 'mt-2 text-3xl font-extrabold' : 'mt-2 text-3xl font-extrabold'} style={{ color: cash.status === 'open' ? 'var(--color-income)' : 'var(--color-alert)' }}>{cash.status === 'open' ? 'Abierta' : 'Cerrada'}</p>
            <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,.5)' }}>Apertura: {formatDate(cash.openedAt)}</p>
          </div>

          <div className="mt-4 grid gap-3">
            <label><span className="label-dark">Sucursal</span><select id="cash-branch" name="cash-branch" value={openForm.branchId} onChange={(event) => selectBranch(event.target.value)} className="input-dark"><option value="">Sucursal principal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label><span className="label-dark">Caja</span><input id="cash-name" name="cash-name" value={openForm.cashName} onChange={(event) => setOpenField('cashName', event.target.value)} className="input-dark" /></label>
            <label><span className="label-dark">Cajero</span><input id="cash-cashier" name="cash-cashier" value={openForm.cashier} onChange={(event) => setOpenField('cashier', event.target.value)} className="input-dark" /></label>
            <label><span className="label-dark">Monto inicial</span><input id="cash-opening-amount" name="cash-opening-amount" type="number" value={openForm.amount} onChange={(event) => setOpenField('amount', event.target.value)} className="input-dark" /></label>
            <label><span className="label-dark">Efectivo contado al cierre</span><input id="cash-counted" name="cash-counted" type="number" value={counted} onChange={(event) => setCounted(event.target.value)} className="input-dark" /></label>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button icon={Unlock} variant="success" onClick={() => openCashRegister(openForm)}>Abrir caja</Button>
            <Button icon={Lock} variant="danger" onClick={() => setCloseConfirm(true)}>Cerrar caja</Button>
          </div>
        </div>

        <div className="printable-report">
          <h3 className="font-display text-xl font-bold">Corte de caja</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Total label="Ventas totales" value={report.grossSales} />
            <Total label="Esperado efectivo" value={report.expectedCash} />
            <Total label="Efectivo contado" value={report.counted} />
            <Total label="Diferencia efectivo" value={report.difference} danger={Math.abs(report.difference) > 0.01} />
            <Total label="Esperado tarjetas" value={report.expectedCard} />
            <Total label="Esperado tranferencias" value={report.expectedTransfer} />
            <Total label="Credito" value={report.byMethod.find((item) => item.method === 'Credito')?.net || 0} />
            <Total label="Notas credito" value={report.returns} />
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <DataTable data={report.byMethod} columns={methodColumns} initialPageSize={8} emptyText="Sin pagos en el corte." />
            <DataTable data={report.movements || []} columns={movementColumns(removeMovement)} initialPageSize={8} emptyText="Sin movimientos de caja." />
          </div>
        </div>
      </section> : null}

      <section id="registro-manual" className="manual-operations-panel">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="font-display text-xl font-bold">Movimiento manual</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Registra pagos, gastos, servicios, mensajeria, entradas y salidas operativas desde cero.</p>
          </div>
          <span className="rounded-full border px-3 py-2 text-xs font-black uppercase" style={{ borderColor: 'rgba(16,185,129,.28)', background: 'rgba(16,185,129,.09)', color: 'rgb(167,243,208)' }}>Modulo separado</span>
        </div>
        <form onSubmit={submitMovement} className="manual-entry-form mt-4">
          <label><span className="label-dark">Tipo</span><select id="cash-movement-type" name="cash-movement-type" value={movement.type} onChange={(event) => setMovementField('type', event.target.value)} className="input-dark"><option value="income">Ingreso</option><option value="expense">Salida / gasto</option><option value="withdrawal">Retiro</option></select></label>
          <label><span className="label-dark">Categoria</span><select id="cash-movement-category" name="cash-movement-category" value={movement.category} onChange={(event) => setMovementField('category', event.target.value)} className="input-dark">{movementCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label><span className="label-dark">Metodo de pago</span><select id="cash-movement-method" name="cash-movement-method" value={movement.method} onChange={(event) => setMovementField('method', event.target.value)} className="input-dark">{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
          <label><span className="label-dark">Fecha del movimiento</span><input id="cash-movement-date" name="cash-movement-date" type="date" value={movement.movementDate} onChange={(event) => setMovementField('movementDate', event.target.value)} className="input-dark" /></label>
          <label><span className="label-dark">Monto</span><input id="cash-movement-amount" name="cash-movement-amount" type="number" value={movement.amount} onChange={(event) => setMovementField('amount', event.target.value)} className="input-dark" /></label>
          <label className="manual-entry-wide"><span className="label-dark">Concepto</span><input id="cash-movement-concept" name="cash-movement-concept" value={movement.concept} onChange={(event) => setMovementField('concept', event.target.value)} className="input-dark" placeholder="Ej. Pago de internet, envio a cliente, compra operativa..." /></label>
          <label><span className="label-dark">Destino / hacia donde fue</span><input id="cash-movement-destination" name="cash-movement-destination" value={movement.destination} onChange={(event) => setMovementField('destination', event.target.value)} className="input-dark" placeholder="Proveedor, cliente, sucursal..." /></label>
          <label><span className="label-dark">Mensajero / responsable</span><input id="cash-movement-messenger" name="cash-movement-messenger" value={movement.messenger} onChange={(event) => setMovementField('messenger', event.target.value)} className="input-dark" placeholder="Nombre o ruta" /></label>
          <label><span className="label-dark">Referencia</span><input id="cash-movement-reference" name="cash-movement-reference" value={movement.reference} onChange={(event) => setMovementField('reference', event.target.value)} className="input-dark" placeholder="Recibo, transferencia, comprobante" /></label>
          <label><span className="label-dark">Canal</span><input id="cash-movement-channel" name="cash-movement-channel" value={movement.channel} onChange={(event) => setMovementField('channel', event.target.value)} className="input-dark" placeholder="Caja, banco, mensajeria..." /></label>
          <label className="manual-entry-notes"><span className="label-dark">Notas</span><textarea id="cash-movement-notes" name="cash-movement-notes" value={movement.notes} onChange={(event) => setMovementField('notes', event.target.value)} className="input-dark min-h-20 resize-y" placeholder="Detalle del pago, quien autorizo, ruta, observaciones..." /></label>
          <Button icon={Plus} variant="primary" className="self-end" type="submit">Registrar movimiento</Button>
        </form>
      </section>

      <section className="printable-report">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="font-display text-xl font-bold">Reporte de movimientos manuales</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Entradas y salidas registradas manualmente, separadas de facturacion, inventario, CxC y CxP.</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <select id="cash-period-filter" name="cash-period-filter" value={movementPeriod} onChange={(event) => setMovementPeriod(event.target.value)} className="input-dark max-w-40">{periodOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            <Button variant="primary" icon={Download} onClick={exportManualPdf}>PDF avanzado</Button>
            <Button variant="ghost" icon={FileSpreadsheet} onClick={exportManualCsv}>Excel</Button>
            <Button variant="ghost" icon={Printer} onClick={() => window.print()}>Imprimir</Button>
          </div>
        </div>

        <div className="movement-kpi-strip mb-4">
          <div className="movement-kpi report-nav-green"><span>Ingresos manuales</span><strong>{currency.format(manualSummary.income)}</strong></div>
          <div className="movement-kpi report-nav-red"><span>Salidas manuales</span><strong>{currency.format(manualSummary.outflow)}</strong></div>
          <div className={`movement-kpi ${manualSummary.net < 0 ? 'report-nav-red' : 'report-nav-blue'}`}><span>Balance manual</span><strong>{currency.format(manualSummary.net)}</strong></div>
          <div className="movement-kpi report-nav-violet"><span>Movimientos</span><strong>{manualSummary.count}</strong></div>
          <div className="movement-kpi report-nav-cyan"><span>Promedio ingresos</span><strong>{currency.format(manualSummary.avgIncome)}</strong></div>
          <div className="movement-kpi report-nav-amber"><span>Promedio salidas</span><strong>{currency.format(manualSummary.avgOutflow)}</strong></div>
        </div>

        <div className="movement-breakdown-grid manual-breakdown-grid mb-4">
          <ManualBreakdownBlock title="Por categoria" items={manualSummary.byCategory} />
          <ManualBreakdownBlock title="Por metodo" items={manualSummary.byMethod} />
          <ManualBreakdownBlock title="Por tipo" items={manualSummary.byType} />
        </div>

        <DataTable data={manualMovements} columns={manualMovementColumns(removeMovement)} initialPageSize={15} emptyText="Sin movimientos manuales para este periodo." searchPlaceholder="Buscar categoria, concepto, destino, mensajero, referencia o metodo..." />
      </section>

      <Modal
        open={closeConfirm}
        onClose={() => setCloseConfirm(false)}
        title="Confirmar cierre de caja"
        description="Revise el efectivo contado antes de cerrar. El cierre es irreversible hasta una nueva apertura."
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCloseConfirm(false)}>Cancelar</Button><Button variant="danger" icon={Lock} onClick={handleClose}>Confirmar cierre</Button></div>}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg p-4" style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)' }}>
            <AlertTriangle size={24} style={{ color: 'var(--color-pending)' }} />
            <div>
              <p className="font-bold" style={{ color: 'rgb(252,211,77)' }}>Diferencia detectada: {currency.format(report.difference)}</p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,.6)' }}>Balance calculado: {currency.format(report.expected)} vs contado: {currency.format(report.counted)}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,.035)' }}>
              <p className="text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>Total ventas</p>
              <p className="font-display text-xl font-bold">{currency.format(report.grossSales)}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,.035)' }}>
              <p className="text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>Gastos</p>
              <p className="font-display text-xl font-bold">{currency.format(report.expenses)}</p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function defaultManualMovement() {
  return {
    type: 'expense',
    category: 'Gastos',
    amount: '',
    method: 'Efectivo',
    concept: '',
    reference: '',
    destination: '',
    messenger: '',
    movementDate: todayIso(),
    channel: 'Caja',
    notes: '',
  }
}

function Total({ label, value, danger }) {
  return <div className="rounded-lg p-4" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.04)' }}><p className="text-xs font-extrabold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>{label}</p><p className={`mt-1 font-display text-2xl font-bold ${danger ? 'text-red-300' : ''}`}>{currency.format(value || 0)}</p></div>
}

function ManualBreakdownBlock({ title, items }) {
  const visibleItems = (items || []).slice(0, 6)
  return (
    <div className="movement-breakdown">
      <p>{title}</p>
      <div>
        {visibleItems.length ? visibleItems.map((item) => (
          <span key={item.label}>{item.label}<small>{currency.format(item.net)}</small></span>
        )) : <em>Sin datos</em>}
      </div>
    </div>
  )
}

const methodColumns = [
  { header: 'Metodo', accessorKey: 'method' },
  { header: 'Ventas', cell: ({ row }) => currency.format(row.original.sales || 0) },
  { header: 'Devoluciones', cell: ({ row }) => currency.format(row.original.refunds || 0) },
  { header: 'Neto', cell: ({ row }) => currency.format(row.original.net || 0) },
]

const movementColumns = (removeMovement) => [
  { header: 'Fecha', cell: ({ row }) => formatDate(row.original.createdAt) },
  { header: 'Tipo', cell: ({ row }) => movementTypeLabel(row.original.type) },
  { header: 'Categoria', accessorKey: 'category' },
  { header: 'Metodo', accessorKey: 'method' },
  { header: 'Concepto', cell: ({ row }) => row.original.concept || row.original.note || '' },
  { header: 'Monto', cell: ({ row }) => currency.format(row.original.amount || 0) },
  { header: 'Acciones', cell: ({ row }) => isManualMovement(row.original) ? <button type="button" onClick={() => removeMovement(row.original)} className="rounded-md border p-2 transition" style={{ borderColor: 'rgba(239,68,68,.2)', background: 'rgba(239,68,68,.1)', color: 'rgb(254,202,202)' }} aria-label="Eliminar movimiento"><Trash2 size={15} /></button> : <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,.35)' }}>Sistema</span> },
]

const manualMovementColumns = (removeMovement) => [
  { header: 'Fecha', cell: ({ row }) => formatDate(row.original.movementDate || row.original.createdAt) },
  { header: 'Tipo', cell: ({ row }) => movementTypeLabel(row.original.type) },
  { header: 'Categoria', accessorKey: 'category' },
  { header: 'Metodo', accessorKey: 'method' },
  { header: 'Destino', accessorKey: 'destination' },
  { header: 'Mensajero', accessorKey: 'messenger' },
  { header: 'Concepto', cell: ({ row }) => row.original.concept || row.original.note || '' },
  { header: 'Referencia', accessorKey: 'reference' },
  { header: 'Monto', cell: ({ row }) => currency.format(signedManualAmount(row.original)) },
  { header: 'Acciones', cell: ({ row }) => <button type="button" onClick={() => removeMovement(row.original)} className="no-print rounded-md border p-2 transition" style={{ borderColor: 'rgba(239,68,68,.2)', background: 'rgba(239,68,68,.1)', color: 'rgb(254,202,202)' }} aria-label="Eliminar movimiento"><Trash2 size={15} /></button> },
]

function isManualMovement(movement) {
  return movement?.source === 'manual' || movementCategories.includes(movement?.category)
}

function inMovementPeriod(value, period) {
  if (period === 'all') return true
  const key = dayKeyInSystemZone(value)
  const today = todayIso()
  if (period === 'day') return key === today
  if (period === 'week') {
    const date = new Date(`${key}T12:00:00`)
    const now = new Date(`${today}T12:00:00`)
    const start = new Date(now)
    const day = start.getDay() || 7
    start.setDate(start.getDate() - day + 1)
    start.setHours(0, 0, 0, 0)
    return date >= start && date <= now
  }
  if (period === 'month') return key.slice(0, 7) === today.slice(0, 7)
  if (period === 'year') return key.slice(0, 4) === today.slice(0, 4)
  return true
}

function signedManualAmount(movement) {
  const amount = Number(movement?.amount || 0)
  const type = String(movement?.type || '').toLowerCase()
  return ['expense', 'withdrawal', 'retiro'].includes(type) ? -amount : amount
}

function summarizeManualMovements(movements) {
  const typeMap = new Map()
  const categoryMap = new Map()
  const methodMap = new Map()
  const summary = movements.reduce((current, movement) => {
    const signed = signedManualAmount(movement)
    const positive = Math.max(0, signed)
    const negative = Math.max(0, Math.abs(Math.min(0, signed)))
    if (signed >= 0) {
      current.income += signed
      current.incomeCount += 1
      current.maxIncome = Math.max(current.maxIncome, signed)
    } else {
      current.outflow += Math.abs(signed)
      current.outflowCount += 1
      current.maxOutflow = Math.max(current.maxOutflow, Math.abs(signed))
    }
    current.net += signed
    current.count += 1
    addManualBreakdown(typeMap, movementTypeLabel(movement.type), positive, negative, signed)
    addManualBreakdown(categoryMap, movement.category || 'Sin categoria', positive, negative, signed)
    addManualBreakdown(methodMap, movement.method || 'Sin metodo', positive, negative, signed)
    return current
  }, { income: 0, outflow: 0, net: 0, count: 0, incomeCount: 0, outflowCount: 0, avgIncome: 0, avgOutflow: 0, maxIncome: 0, maxOutflow: 0, byType: [], byCategory: [], byMethod: [] })

  summary.avgIncome = summary.incomeCount ? summary.income / summary.incomeCount : 0
  summary.avgOutflow = summary.outflowCount ? summary.outflow / summary.outflowCount : 0
  summary.byType = manualBreakdownRows(typeMap)
  summary.byCategory = manualBreakdownRows(categoryMap)
  summary.byMethod = manualBreakdownRows(methodMap)
  return summary
}

function addManualBreakdown(map, label, income, outflow, net) {
  const key = label || 'Sin definir'
  const item = map.get(key) || { label: key, count: 0, income: 0, outflow: 0, net: 0 }
  item.count += 1
  item.income += income
  item.outflow += outflow
  item.net += net
  map.set(key, item)
}

function manualBreakdownRows(map) {
  return Array.from(map.values()).sort((left, right) => Math.abs(right.net) - Math.abs(left.net))
}

function movementTypeLabel(type) {
  const value = String(type || '').toLowerCase()
  if (value === 'income') return 'Ingreso'
  if (value === 'expense') return 'Gasto'
  if (value === 'withdrawal' || value === 'retiro') return 'Retiro'
  if (value === 'payable_payment') return 'Pago CxP'
  return type || 'Movimiento'
}
