import { randomUUID } from 'crypto'
import { INTUIT_AUTH_URL, INTUIT_CLIENT_ID, QBO_REDIRECT_URI, QBO_SCOPES } from '../constants'

export const handleConnect = async () => {
  const state = randomUUID()

  const params = new URLSearchParams({
    client_id: INTUIT_CLIENT_ID,
    redirect_uri: QBO_REDIRECT_URI,
    response_type: 'code',
    scope: QBO_SCOPES,
    state,
  })

  const authUrl = `${INTUIT_AUTH_URL}?${params.toString()}`

  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
    },
    body: '',
  }
}
