import { buildCode128Bars } from '../lib/barcodeEngine'

const SIZES = {
  '2x1': { widthIn: 2, heightIn: 1, cols: 4, name: '2" x 1"' },
  '3x2': { widthIn: 3, heightIn: 2, cols: 3, name: '3" x 2"' },
  '4x2': { widthIn: 4, heightIn: 2, cols: 2, name: '4" x 2"' },
  '4x3': { widthIn: 4, heightIn: 3, cols: 2, name: '4" x 3"' },
  '4x6': { widthIn: 4, heightIn: 6, cols: 1, name: '4" x 6"' },
}

export const LABEL_DIMENSIONS = Object.fromEntries(
  Object.entries(SIZES).map(([id, s]) => [
    id,
    { ...s, widthDots: s.widthIn * 203, heightDots: s.heightIn * 203 },
  ])
)

export function getLabelDim(id, dpi = 203) {
  const s = SIZES[id] || SIZES['3x2']
  return { ...s, widthDots: s.widthIn * dpi, heightDots: s.heightIn * dpi }
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
  const barcode = opts.barcode || product.barcode || product.sku || product.id || 'SIN-CODIGO'
  const sku = opts.sku || product.sku || ''
  return {
    name: String(product.name || 'Producto').trim().slice(0, 40),
    sku: includeSku ? String(sku).trim().slice(0, 20) : '',
    price: includePrice ? Number(product.price || product.salePrice || 0) : 0,
    barcode: String(barcode).trim().slice(0, 48) || 'SIN-CODIGO',
  }
}

/* =================================================================
   ZPL
   ================================================================= */
function zplFit(c, dim, includePrice, includeSku) {
  const margin = Math.round(dim.widthDots * 0.04)
  const usableW = dim.widthDots - margin * 2
  let y = margin
  const maxY = dim.heightDots - margin

  const bc = buildCode128Bars(c.barcode)
  const barModule = 2
  const bcWidthDots = bc.width * barModule
  const bcX = Math.max(margin, margin + Math.round((usableW - bcWidthDots) / 2))

  let nameFs = Math.min(Math.round(dim.heightDots * 0.13), 35)
  let priceFs = Math.min(Math.round(dim.heightDots * 0.17), 48)
  let skuFs = Math.round(nameFs * 0.65)
  let nameH = nameFs + Math.round(dim.heightDots * 0.04)
  let skuH = c.sku ? skuFs + Math.round(dim.heightDots * 0.025) : 0
  let priceH = (c.price > 0 && includePrice) ? priceFs + Math.round(dim.heightDots * 0.04) : 0
  let totalNeeded = nameH + skuH + priceH + Math.round(dim.heightDots * 0.22) + 8
  let dropSku = false
  let dropPrice = false

  if (totalNeeded > maxY) {
    const s = maxY / totalNeeded
    nameFs = Math.max(10, Math.round(nameFs * s))
    priceFs = Math.max(14, Math.round(priceFs * s))
    skuFs = Math.round(nameFs * 0.65)
    nameH = nameFs + Math.round(dim.heightDots * 0.03)
    skuH = c.sku ? skuFs + Math.round(dim.heightDots * 0.02) : 0
    priceH = (c.price > 0 && includePrice) ? priceFs + Math.round(dim.heightDots * 0.03) : 0
    totalNeeded = nameH + skuH + priceH + Math.round(dim.heightDots * 0.16) + 6
  }
  if (totalNeeded > maxY) { dropSku = true; totalNeeded = nameH + priceH + Math.round(dim.heightDots * 0.16) + 6 }
  if (totalNeeded > maxY && c.price > 0) { dropPrice = true; totalNeeded = nameH + Math.round(dim.heightDots * 0.16) + 6 }
  if (totalNeeded > maxY) { nameFs = Math.max(8, nameFs - 2); nameH = nameFs + Math.round(dim.heightDots * 0.02); totalNeeded = nameH + Math.round(dim.heightDots * 0.12) + 4 }

  const bcH = Math.max(18, Math.min(Math.round(maxY * 0.4), maxY - y - nameH - (dropSku ? 0 : skuH) - (dropPrice ? 0 : priceH) - 6))

  const lines = []
  function z(t) { lines.push(t) }
  z('^XA'); z(`^LL${dim.heightDots}`); z(`^PW${dim.widthDots}`)
  z(`^CF0,${nameFs}`); z(`^FO${margin},${y}^FD${c.name}^FS`); y += nameH
  if (c.sku && !dropSku) { z(`^CF0,${skuFs}`); z(`^FO${margin},${y}^FDSKU:${c.sku}^FS`); y += skuH }
  if (c.price > 0 && includePrice && !dropPrice) {
    z(`^CF0,${priceFs}`)
    z(`^FO${margin},${y}^FDRD$${c.price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}^FS`); y += priceH
  }
  z(`^FO${bcX},${y}^BY${barModule}^BCN,${bcH},Y,N,N`); z(`^FD${c.barcode}^FS`)
  lines.push('^XZ')
  return lines.join('\n')
}

export function generateZPL(product, { labelSize = '3x2', includePrice = true, includeSku = true, quantity = 1, dpi = 203, barcode = '', sku = '' } = {}) {
  const dim = getLabelDim(labelSize, dpi)
  const c = buildLabelContent(product, { includePrice, includeSku, barcode, sku })
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

/* =================================================================
   ESC/POS
   ================================================================= */
function encodeText(str, maxChars) {
  return new TextEncoder().encode((str || '').slice(0, maxChars || 48) + '\n')
}

export function generateESCPOS(product, { labelSize = '3x2', includePrice = true, includeSku = true, quantity = 1, dpi = 203, barcode = '', sku = '' } = {}) {
  const dim = getLabelDim(labelSize, dpi)
  const c = buildLabelContent(product, { includePrice, includeSku, barcode, sku })
  const maxChars = dim.widthDots > 300 ? 32 : 20
  const encoder = new TextEncoder()

  function build() {
    const chunks = []
    function cmd(...args) { chunks.push(new Uint8Array(args)) }
    function raw(arr) { chunks.push(arr) }

    cmd(0x1B, 0x40)
    cmd(0x1B, 0x61, 0x01)
    cmd(0x1B, 0x21, 0x08); raw(encodeText(c.name, maxChars))
    if (c.sku) { cmd(0x1B, 0x21, 0x01); raw(encodeText('SKU: ' + c.sku, maxChars)) }
    if (c.price > 0) { cmd(0x1B, 0x21, 0x30); raw(encodeText('RD$' + c.price.toFixed(2), maxChars)) }
    const barcodeBytes = encoder.encode(String(c.barcode || ''))
    cmd(0x1D, 0x68, Math.min(0xFF, Math.round(dim.heightDots * 0.35)))
    cmd(0x1D, 0x77, Math.min(5, Math.max(2, Math.round(barcodeBytes.length / 10))))
    cmd(0x1D, 0x6B, 0x49, (barcodeBytes.length + 2) & 0xFF, ((barcodeBytes.length + 2) >> 8) & 0xFF)
    raw(new Uint8Array([0x7B, 0x42])); raw(barcodeBytes); cmd(0x00)
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

/* =================================================================
   PNG
   ================================================================= */
function crc32(data) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

async function canvasToPngBlob(canvas, dpi) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!dpi || dpi <= 0) return blob
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return blob
  const ppm = Math.round(dpi / 0.0254)
  const pHYsData = new Uint8Array(9)
  pHYsData[0] = (ppm >> 24) & 0xFF; pHYsData[1] = (ppm >> 16) & 0xFF
  pHYsData[2] = (ppm >> 8) & 0xFF; pHYsData[3] = ppm & 0xFF
  pHYsData[4] = (ppm >> 24) & 0xFF; pHYsData[5] = (ppm >> 16) & 0xFF
  pHYsData[6] = (ppm >> 8) & 0xFF; pHYsData[7] = ppm & 0xFF
  pHYsData[8] = 1
  const type = new TextEncoder().encode('pHYs')
  const chunkData = new Uint8Array(type.length + pHYsData.length)
  chunkData.set(type, 0); chunkData.set(pHYsData, type.length)
  const crc = crc32(chunkData)
  const chunkLen = pHYsData.length
  const header = new Uint8Array(8)
  header[0] = (chunkLen >> 24) & 0xFF; header[1] = (chunkLen >> 16) & 0xFF
  header[2] = (chunkLen >> 8) & 0xFF; header[3] = chunkLen & 0xFF
  header[4] = (crc >> 24) & 0xFF; header[5] = (crc >> 16) & 0xFF
  header[6] = (crc >> 8) & 0xFF; header[7] = crc & 0xFF
  const sigLen = 8
  const result = new Uint8Array(sigLen + header.length + chunkData.length + bytes.length - sigLen)
  result.set(bytes.subarray(0, sigLen), 0)
  result.set(header, sigLen)
  result.set(chunkData, sigLen + header.length)
  result.set(bytes.subarray(sigLen), sigLen + header.length + chunkData.length)
  return new Blob([result], { type: 'image/png' })
}

export function renderLabelToCanvas(product, { labelSize = '3x2', includePrice = true, includeSku = true, dpi = 203, barcode = '', sku = '' } = {}) {
  const dim = getLabelDim(labelSize, dpi)
  const c = buildLabelContent(product, { includePrice, includeSku, barcode, sku })
  const pxW = Math.round(dim.widthIn * dpi)
  const pxH = Math.round(dim.heightIn * dpi)
  const margin = Math.round(pxW * 0.03)
  const usableW = pxW - margin * 2
  const maxY = pxH - margin

  const canvas = document.createElement('canvas')
  canvas.width = pxW; canvas.height = pxH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pxW, pxH)

  let nameFs = Math.max(10, pxH * 0.065)
  let skuFs = Math.max(8, pxH * 0.045)
  let priceFs = Math.max(14, pxH * 0.085)
  let nameH = nameFs * 1.25
  let skuH = c.sku ? skuFs * 1.1 : 0
  let priceH = (c.price > 0 && includePrice) ? priceFs * 1.3 : 0
  let barH = Math.max(20, pxH * 0.18)
  let totalH = nameH + skuH + priceH + barH + margin * 2
  let dropSku = false
  let dropPrice = false

  if (totalH > maxY) {
    const s = maxY / totalH
    nameFs = Math.max(7, nameFs * s); skuFs = Math.max(5, skuFs * s); priceFs = Math.max(10, priceFs * s)
    nameH = nameFs * 1.2; skuH = c.sku ? skuFs * 1.05 : 0; priceH = (c.price > 0 && includePrice) ? priceFs * 1.2 : 0
    barH = Math.max(14, barH * s); totalH = nameH + skuH + priceH + barH + margin * 1.5
  }
  if (totalH > maxY && c.sku) { dropSku = true; skuH = 0; totalH = nameH + priceH + barH + margin * 1.5 }
  if (totalH > maxY && c.price > 0) { dropPrice = true; priceH = 0; totalH = nameH + barH + margin * 1.5 }
  if (totalH > maxY) { nameFs = Math.max(6, nameFs - 1); nameH = nameFs * 1.1; barH = Math.max(10, barH - 2); totalH = nameH + barH + margin }

  let y = margin + nameFs * 0.3
  ctx.textAlign = 'center'; ctx.fillStyle = '#111827'

  ctx.font = `bold ${nameFs}px sans-serif`
  const nameWidth = ctx.measureText(c.name).width
  if (nameWidth > usableW) {
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
    const s = (usableW - 4) / bc.width
    const barY = y
    for (const bar of bc.bars) ctx.fillRect(margin + 2 + bar.x * s, barY, Math.max(bar.width * s, 0.6), barH)
    y = barY + barH + Math.round(margin * 0.5)
  }

  const codeTextH = maxY - y
  if (codeTextH > 3) {
    ctx.font = `bold ${Math.min(pxH * 0.028, codeTextH * 0.7)}px monospace`
    ctx.fillText(c.barcode, pxW / 2, y + codeTextH * 0.35)
  }
  return canvas
}

export async function downloadLabelPng(canvas, filename = 'etiqueta.png', dpi = 203) {
  const blob = await canvasToPngBlob(canvas, dpi)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* =================================================================
   WebUSB — ZPL directo
   ================================================================= */
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
