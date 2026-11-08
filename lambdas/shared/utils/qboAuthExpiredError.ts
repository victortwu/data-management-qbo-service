export class QboAuthExpiredError extends Error {
  constructor(readonly intuitTid?: string) {
    super(`QBO authorization expired${intuitTid ? ` (intuit_tid: ${intuitTid})` : ''}`)
    this.name = 'QboAuthExpiredError'
  }
}
