import { QboAuthExpiredError } from './qboAuthExpiredError'
import { respond } from './respond'
import { logger } from './logger'

export const respondWithError = (operation: string, error: unknown) => {
  if (error instanceof QboAuthExpiredError) {
    return respond(401, {
      error: {
        code: 'QBO_AUTH_EXPIRED',
        message: 'QuickBooks authorization expired. Reconnect QuickBooks and retry.',
      },
      intuitTid: error.intuitTid,
    })
  }

  const { name, message } =
    error instanceof Error ? error : { name: 'Error', message: 'Internal server error' }
  logger.error('Handler error', { operation, errorName: name, errorMessage: message })
  return respond(500, { error: message })
}
