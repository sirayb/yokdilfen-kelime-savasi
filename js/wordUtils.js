// Kelime alanları (en/tr) her zaman küçük harfle saklanır ve karşılaştırılır.
// Birden fazla anlam virgülle ayrılabilir (örn. "kötüleşmek, bozulmak") —
// düelloda/antrenmanda bunlardan biri doğru yazılırsa yeterlidir.

export function normalizeWordField(str) {
  return (str || '')
    .split(',')
    .map((part) => part.trim().toLocaleLowerCase('tr'))
    .filter(Boolean)
    .join(', ');
}

export function splitAlternatives(str) {
  return (str || '')
    .split(',')
    .map((part) => normalizeAnswer(part))
    .filter(Boolean);
}

export function normalizeAnswer(str) {
  return (str || '').trim().toLocaleLowerCase('tr').normalize('NFC');
}
