const CODE_128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

export function buildCode128Bars(value) {
  const text = sanitizeCode128Value(value)
  const values = [...text].map((character) => {
    const code = character.charCodeAt(0)
    return code >= 32 && code <= 126 ? code - 32 : 31
  })
  const checksum = values.reduce((sum, code, index) => sum + code * (index + 1), 104) % 103
  const codes = [104, ...values, checksum, 106]
  let x = 0
  const bars = []
  codes.forEach((code) => {
    const pattern = CODE_128_PATTERNS[code] || CODE_128_PATTERNS[31]
    ;[...pattern].forEach((unit, index) => {
      const width = Number(unit)
      if (index % 2 === 0) bars.push({ x, width })
      x += width
    })
  })
  return { text, bars, width: x }
}

export function sanitizeCode128Value(value) {
  const normalized = String(value || 'SIN-CODIGO')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, 48)
  return normalized || 'SIN-CODIGO'
}

export function getCode128Layout(barcode, availableWidth, quietModules = 10) {
  const safeWidth = Math.max(Number(availableWidth) || 0, 1)
  const quiet = Math.max(Number(quietModules) || 0, 0)
  const totalModules = barcode.width + quiet * 2
  const scale = safeWidth / totalModules
  const quietWidth = quiet * scale
  return {
    scale,
    quietWidth,
    barWidth: barcode.width * scale,
    totalWidth: totalModules * scale,
    totalModules,
  }
}
