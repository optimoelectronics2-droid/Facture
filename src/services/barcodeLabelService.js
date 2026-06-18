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
   1. ZPL — Zebra Programming Language (con auto-fit)
   ================================================================ */
function zplFit(c, dim, includePrice, includeSku) {
  let y = 20; const maxY = dim.heightDots - 8
  let fontSize = dim.widthDots > 300 ? 35 : 28
  let priceFs = dim.widthDots > 300 ? 45 : 36
  let skuFs = Math.round(fontSize * 0.7)
  let textH = fontSize + 15; let skuH = c.sku ? skuFs + 8 : 0; let priceH = c.price > 0 && includePrice ? priceFs + 12 : 0
  let totalNeeded = textH + skuH + priceH + 40 + 12
  let dropSku = false; let dropPrice = false

  if (totalNeeded > maxY) {
    const scale = maxY / totalNeeded
    fontSize = Math.max(14, Math.round(fontSize * scale))
    priceFs = Math.max(18, Math.round(priceFs * scale))
    skuFs = Math.round(fontSize * 0.7)
    textH = fontSize + 12; skuH = c.sku ? skuFs + 6 : 0; priceH = c.price > 0 && includePrice ? priceFs + 10 : 0
    totalNeeded = textH + skuH + priceH + 34 + 10
  }

  if (totalNeeded > maxY) { dropSku = true; totalNeeded = textH + priceH + 34 + 10 }
  if (totalNeeded > maxY && c.price > 0) { dropPrice = true; totalNeeded = textH + 34 + 10 }
  if (totalNeeded > maxY) { fontSize = Math.max(10, fontSize - 4); textH = fontSize + 10; totalNeeded = textH + 30 + 8 }
  if (totalNeeded > maxY) { fontSize = 8; textH = 16 }

  const bcH = Math.max(20, Math.min(50, maxY - (y + textH + (dropSku ? 0 : skuH) + (dropPrice ? 0 : priceH) + 8)))

  const lines = []
  function z(t) { lines.push(t) }
  z('^XA'); z(`^LL${dim.heightDots}`); z(`^PW${dim.widthDots}`)
  z(`^CF0,${fontSize}`); z(`^FO30,${y}^FD${c.name}^FS`); y += textH
  if (c.sku && !dropSku) { z(`^CF0,${skuFs}`); z(`^FO30,${y}^FDSKU:${c.sku}^FS`); y += skuH }
  if (c.price > 0 && includePrice && !dropPrice) {
    z(`^CF0,${priceFs}`)
    z(`^FO30,${y}^FDRD$${c.price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}^FS`); y += priceH
  }
  const barModule = dim.widthDots > 160 ? 2 : 2
  z(`^FO30,${y}^BY${barModule}^BCN,${bcH},Y,N,N`); z(`^FD${c.barcode}^FS`)
  y += bcH + 3
  if (maxY - y > 8) { z(`^CF0,${Math.max(6, skuFs)}`); z(`^FO30,${y}^FD${c.barcode}^FS`) }
  z('^XZ')
  return lines.join('\n')
}

export function generateZPL(product, { labelSize = '3x2', includePrice = true, includeSku = true, quantity = 1 } = {}) {
  const dim = LABEL_DIMENSIONS[labelSize] || LABEL_DIMENSIONS['3x2']
  const c = buildLabelContent(product, { includePrice, includeSku })
  let result = ''
  for (let i = 0; i < quantity; i++) result += zplFit(c, dim, includePrice, includeSku) + '\n'
  return result.trim()
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
  const pxW = Math.round(dim.widthIn * dpi / 4)
  const pxH = Math.round(dim.heightIn * dpi / 4)
  const margin = 8; const usableW = pxW - margin * 2; const maxY = pxH - margin

  const canvas = document.createElement('canvas')
  canvas.width = pxW; canvas.height = pxH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pxW, pxH)

  let nameFs = Math.max(9, pxW * 0.045); let skuFs = Math.max(7, pxW * 0.032); let priceFs = Math.max(11, pxW * 0.06)
  let nameH = nameFs + 4; let skuH = c.sku ? skuFs + 3 : 0; let priceH = (c.price > 0 && includePrice) ? priceFs + 5 : 0
  let barH = Math.max(16, pxH * 0.25); let totalH = nameH + skuH + priceH + barH + 8
  let dropSku = false; let dropPrice = false

  if (totalH > maxY) { const s = maxY / totalH; nameFs = Math.max(6, nameFs * s); skuFs = Math.max(5, skuFs * s); priceFs = Math.max(8, priceFs * s); nameH = nameFs + 3; skuH = c.sku ? skuFs + 2 : 0; priceH = (c.price > 0 && includePrice) ? priceFs + 3 : 0; barH = Math.max(10, barH * s); totalH = nameH + skuH + priceH + barH + 6 }
  if (totalH > maxY && c.sku) { dropSku = true; skuH = 0; totalH = nameH + priceH + barH + 6 }
  if (totalH > maxY && c.price > 0) { dropPrice = true; priceH = 0; totalH = nameH + barH + 6 }
  if (totalH > maxY) { nameFs = Math.max(5, nameFs - 1); nameH = nameFs + 2; barH = Math.max(8, barH - 2); totalH = nameH + barH + 5 }

  let y = margin + 2; ctx.textAlign = 'center'; ctx.fillStyle = '#111827'

  ctx.font = `bold ${nameFs}px sans-serif`
  if (ctx.measureText(c.name).width > usableW) {
    const words = c.name.split(' '); let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (ctx.measureText(test).width > usableW && line) { ctx.fillText(line, pxW / 2, y); line = word; y += nameFs + 2 }
      else { line = test }
    }
    if (line) { ctx.fillText(line, pxW / 2, y); y += nameFs + 2 }
  } else { ctx.fillText(c.name, pxW / 2, y); y += nameH }

  if (c.sku && !dropSku) { ctx.font = `${skuFs}px sans-serif`; ctx.fillStyle = '#374151'; ctx.fillText('SKU: ' + c.sku, pxW / 2, y); y += skuH; ctx.fillStyle = '#111827' }
  if (c.price > 0 && includePrice && !dropPrice) { ctx.font = `bold ${priceFs}px sans-serif`; ctx.fillText('RD$ ' + c.price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','), pxW / 2, y); y += priceH }

  const bc = buildCode128Bars(c.barcode)
  if (bc && bc.bars.length) {
    const s = (usableW - 6) / bc.width; const barY = y
    for (const bar of bc.bars) ctx.fillRect(margin + 3 + bar.x * s, barY, Math.max(bar.width * s, 0.4), barH)
    y = barY + barH + 3
  }

  if (maxY - y > 4) { ctx.font = `bold ${Math.min(pxW * 0.028, (maxY - y) * 0.7)}px monospace`; ctx.fillText(c.barcode, pxW / 2, y + (maxY - y) * 0.3) }
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
