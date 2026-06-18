import { buildCode128Bars } from '../lib/barcodeEngine'

export const LABEL_DIMENSIONS = {
  '2x1': { widthIn: 2, heightIn: 1, widthDots: 203, heightDots: 102, cols: 4, name: '2" x 1"' },
  '3x2': { widthIn: 3, heightIn: 2, widthDots: 305, heightDots: 203, cols: 3, name: '3" x 2"' },
  '4x2': { widthIn: 4, heightIn: 2, widthDots: 406, heightDots: 203, cols: 2, name: '4" x 2"' },
  '4x3': { widthIn: 4, heightIn: 3, widthDots: 406, heightDots: 305, cols: 2, name: '4" x 3"' },
  '4x6': { widthIn: 4, heightIn: 6, widthDots: 406, heightDots: 610, cols: 1, name: '4" x 6"' },
}

export const PRINT_MODES = [
  { id: 'browser', label: 'Navegador (PDF)', desc: 'PDF con medidas exactas en mm, compatible con cualquier impresora' },
  { id: 'zpl', label: 'ZPL archivo', desc: 'Descarga .zpl para Zebra, 2connet, Agiler, Epson ZPL' },
  { id: 'usb', label: 'ZPL WebUSB', desc: 'Envio directo por USB (Chrome/Edge) a impresoras ZPL' },
  { id: 'escpos', label: 'ESC/POS archivo', desc: 'Descarga .prn para Epson TM, Bixolon, Star, genericas' },
  { id: 'escpos-usb', label: 'ESC/POS WebUSB', desc: 'Envio directo USB a Epson TM y compatibles ESC/POS' },
  { id: 'png', label: 'Imagen PNG', desc: 'Descarga como imagen 203DPI para compartir o imprimir' },
]

function buildLabelContent(product, opts = {}) {
  const includePrice = opts.includePrice !== false
  const includeSku = opts.includeSku !== false
  return {
    name: String(product.name || 'Producto').trim().slice(0, 40),
    sku: includeSku ? String(product.sku || '').trim().slice(0, 20) : '',
    price: includePrice ? Number(product.price || product.salePrice || 0) : 0,
    barcode: String(product.barcode || product.sku || product.id || 'SIN-CODIGO').trim().slice(0, 30),
  }
}

/* ================================================================
   1. ZPL — Zebra Programming Language
   ================================================================ */
export function generateZPL(product, { labelSize = '3x2', includePrice = true, includeSku = true, quantity = 1 } = {}) {
  const dim = LABEL_DIMENSIONS[labelSize] || LABEL_DIMENSIONS['3x2']
  const c = buildLabelContent(product, { includePrice, includeSku })
  const fontSize = dim.widthDots > 300 ? 35 : 28
  const priceFontSize = dim.widthDots > 300 ? 45 : 36
  const barcodeHeight = dim.heightDots > 200 ? 60 : 40
  let lines = []
  function zpl(text) { lines.push(text) }
  for (let i = 0; i < quantity; i++) {
    let y = 30
    zpl('^XA'); zpl(`^LL${dim.heightDots}`); zpl(`^PW${dim.widthDots}`)
    zpl(`^CF0,${fontSize}`); zpl(`^FO30,${y}^FD${c.name}^FS`); y += fontSize + 15
    if (c.sku) { zpl(`^CF0,${Math.round(fontSize * 0.7)}`); zpl(`^FO30,${y}^FDSKU: ${c.sku}^FS`); y += Math.round(fontSize * 0.7) + 8 }
    if (c.price > 0) { zpl(`^CF0,${priceFontSize}`); zpl(`^FO30,${y}^FDRD$${c.price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}^FS`); y += priceFontSize + 12 }
    const barModule = dim.widthDots > 300 ? 3 : 2
    const bcH = Math.min(barcodeHeight, Math.max(40, dim.heightDots - y - fontSize - 20))
    zpl(`^FO30,${y}^BY${barModule}^BCN,${bcH},Y,N,N`); zpl(`^FD${c.barcode}^FS`)
    if (dim.heightDots > 150) { y += bcH + 5; zpl(`^CF0,${Math.round(fontSize * 0.6)}`); zpl(`^FO30,${y}^FD${c.barcode}^FS`) }
    zpl('^XZ')
  }
  return lines.join('\n')
}

export function downloadZplFile(zpl, filename = 'etiquetas.zpl') {
  const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ================================================================
   2. ESC/POS — Epson TM, Bixolon, Star, genericas termicas
   ================================================================ */
function escposText(str, maxChars) {
  const encoder = new TextEncoder()
  return encoder.encode((str || '').slice(0, maxChars || 48) + '\n')
}

export function generateESCPOS(product, { labelSize = '3x2', includePrice = true, includeSku = true, quantity = 1 } = {}) {
  const dim = LABEL_DIMENSIONS[labelSize] || LABEL_DIMENSIONS['3x2']
  const c = buildLabelContent(product, { includePrice, includeSku })
  const maxChars = dim.widthDots > 300 ? 32 : 20
  const encoder = new TextEncoder()

  function build() {
    const chunks = []
    function cmd(...args) { chunks.push(new Uint8Array(args)) }
    function raw(arr) { chunks.push(arr) }

    cmd(0x1B, 0x40)
    cmd(0x1B, 0x61, 0x01)
    cmd(0x1B, 0x21, 0x08); raw(escposText(c.name, maxChars))
    if (c.sku) { cmd(0x1B, 0x21, 0x01); raw(escposText('SKU: ' + c.sku, maxChars)) }
    if (c.price > 0) { cmd(0x1B, 0x21, 0x30); raw(escposText('RD$' + c.price.toFixed(2), maxChars)) }
    const bd = encoder.encode(String(c.barcode || '') + '\n')
    cmd(0x1D, 0x68, 0x60); cmd(0x1D, 0x77, 0x03)
    cmd(0x1D, 0x6B, 0x49, (bd.length + 2) & 0xFF, ((bd.length + 2) >> 8) & 0xFF)
    raw(new Uint8Array([0x7B, 0x42])); raw(bd); cmd(0x00)
    cmd(0x1D, 0x56, 0x00)
    return chunks
  }

  const all = []
  for (let i = 0; i < quantity; i++) all.push(...build())
  return new Blob(all, { type: 'application/octet-stream' })
}

export function downloadEscposFile(blob, filename = 'etiquetas.prn') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function sendEscposToUsb(blob) {
  if (!navigator.usb) throw new Error('WebUSB no soportado en este navegador.')
  const device = await navigator.usb.requestDevice({ filters: [] })
  await device.open(); await device.selectConfiguration(1); await device.claimInterface(0)
  const data = new Uint8Array(await blob.arrayBuffer())
  const CHUNK_SIZE = 512
  for (let i = 0; i < data.length; i += CHUNK_SIZE)
    await device.transferOut(1, data.slice(i, Math.min(i + CHUNK_SIZE, data.length)))
  await device.close()
  return device.productName || 'Impresora ESC/POS'
}

/* ================================================================
   3. PNG — Render etiqueta a imagen 203DPI
   ================================================================ */
export function renderLabelToCanvas(product, { labelSize = '3x2', includePrice = true, includeSku = true, dpi = 203 } = {}) {
  const dim = LABEL_DIMENSIONS[labelSize] || LABEL_DIMENSIONS['3x2']
  const c = buildLabelContent(product, { includePrice, includeSku })
  const scale = dpi / 203
  const pxW = Math.round(dim.widthIn * dpi / 4 * scale)
  const pxH = Math.round(dim.heightIn * dpi / 4 * scale)
  const margin = Math.round(10 * scale)
  const usableW = pxW - margin * 2

  const canvas = document.createElement('canvas')
  canvas.width = pxW; canvas.height = pxH
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pxW, pxH)

  let y = margin + Math.round(5 * scale)

  ctx.fillStyle = '#111827'
  ctx.font = `bold ${Math.max(10, pxW * 0.045)}px sans-serif`
  ctx.textAlign = 'center'
  if (ctx.measureText(c.name).width > usableW) {
    const words = c.name.split(' ')
    let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (ctx.measureText(test).width > usableW && line) { ctx.fillText(line, pxW / 2, y); line = word; y += Math.round(14 * scale) }
      else { line = test }
    }
    if (line) { ctx.fillText(line, pxW / 2, y); y += Math.round(14 * scale) }
  } else {
    ctx.fillText(c.name, pxW / 2, y); y += Math.round(16 * scale)
  }

  if (c.sku) {
    ctx.font = `${Math.max(8, pxW * 0.035)}px sans-serif`
    ctx.fillStyle = '#374151'
    ctx.fillText('SKU: ' + c.sku, pxW / 2, y)
    y += Math.round(12 * scale)
  }

  if (c.price > 0) {
    ctx.font = `bold ${Math.max(14, pxW * 0.065)}px sans-serif`
    ctx.fillStyle = '#111827'
    ctx.fillText('RD$ ' + c.price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','), pxW / 2, y)
    y += Math.round(18 * scale)
  }

  const bc = buildCode128Bars(c.barcode)
  if (bc && bc.bars.length) {
    const barH = Math.max(20 * scale, (pxH - y - 16 * scale) * 0.6)
    const s = (usableW - 8 * scale) / bc.width
    const barY = y
    ctx.fillStyle = '#111827'
    for (const bar of bc.bars)
      ctx.fillRect(margin + 4 * scale + bar.x * s, barY, Math.max(bar.width * s, 0.5), barH)
    y = barY + barH + Math.round(4 * scale)
  }

  ctx.font = `bold ${Math.max(6, pxW * 0.03)}px monospace`
  ctx.fillStyle = '#111827'
  ctx.fillText(c.barcode, pxW / 2, y)

  return canvas
}

export function downloadLabelPng(canvas, filename = 'etiqueta.png') {
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ================================================================
   4. WebUSB — ZPL directo
   ================================================================ */
export async function sendToUsbPrinter(zpl) {
  if (!navigator.usb) throw new Error('WebUSB no soportado en este navegador. Use Chrome/Edge o descargue el archivo ZPL.')
  const device = await navigator.usb.requestDevice({ filters: [] })
  await device.open(); await device.selectConfiguration(1); await device.claimInterface(0)
  const encoder = new TextEncoder()
  const data = encoder.encode(zpl)
  const CHUNK_SIZE = 512
  for (let i = 0; i < data.length; i += CHUNK_SIZE)
    await device.transferOut(1, data.slice(i, Math.min(i + CHUNK_SIZE, data.length)))
  await device.close()
  return device.productName || 'Impresora USB'
}
