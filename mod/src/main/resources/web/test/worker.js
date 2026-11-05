// Datei-Worker für den Machbarkeitstest: summiert 1..n
onmessage = e => {
  let s = 0
  for (let i = 1; i <= e.data; i++) s += i
  postMessage(s)
}
