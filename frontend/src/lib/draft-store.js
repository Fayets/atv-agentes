/**
 * Lo que se escribe en el cuadro del inicio viaja al workspace del agente
 * por acá, en memoria. Un objeto File no sobrevive al state del router, y
 * no hace falta persistirlo: si se recarga la página, se pierde y listo.
 */
let pending = null;

export function setPendingDraft(draft) {
  pending = draft;
}

export function takePendingDraft() {
  const d = pending;
  pending = null;
  return d;
}
