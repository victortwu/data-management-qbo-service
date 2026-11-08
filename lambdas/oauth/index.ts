import { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { handleConnect } from './handlers/connect'
import { handleCallback } from './handlers/callback'
import { handleDisconnect } from './handlers/disconnect'
import { getValidAccessToken } from '../shared/utils/qboClient'
import { respond } from '../shared/utils/respond'
import { respondWithError } from '../shared/utils/respondWithError'
import { logger } from '../shared/utils/logger'
import { TOKEN_TABLE } from './constants'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const { requestContext, rawPath, queryStringParameters } = event
  const method = requestContext.http.method

  try {
    // GET /auth/connect
    if (method === 'GET' && rawPath.includes('/connect')) {
      logger.info('OAuth branch', { operation: 'oauth', branch: 'connect' })
      return await handleConnect()
    }

    // GET /auth/callback
    if (method === 'GET' && rawPath.includes('/callback')) {
      const code = queryStringParameters?.code
      const realmId = queryStringParameters?.realmId
      const state = queryStringParameters?.state

      logger.info('OAuth branch', {
        operation: 'oauth',
        branch: 'callback',
        codePresent: !!code,
      })

      if (!code) {
        return respond(400, { error: 'Missing authorization code' })
      }

      return await handleCallback(code, realmId, state)
    }

    // POST /auth/refresh
    if (method === 'POST' && rawPath.includes('/refresh')) {
      logger.info('OAuth branch', { operation: 'oauth', branch: 'refresh' })
      const accessToken = await getValidAccessToken(ddb, TOKEN_TABLE)
      return respond(200, {
        message: 'Token refreshed successfully',
        hasValidToken: !!accessToken,
      })
    }

    // GET /auth/disconnect — Intuit's registered Disconnect URL. Unauthenticated, so it must
    // never mutate state; Intuit has already revoked the tokens on its side.
    if (method === 'GET' && rawPath === '/auth/disconnect') {
      logger.info('OAuth branch', { operation: 'oauth', branch: 'disconnect-ack' })
      return respond(200, { message: 'Disconnect acknowledged' })
    }

    // POST /auth/disconnect (JWT) — deletes the stored tokens
    if (method === 'POST' && rawPath === '/auth/disconnect') {
      logger.info('OAuth branch', { operation: 'oauth', branch: 'disconnect' })
      return await handleDisconnect()
    }

    return respond(404, { error: 'Route not found' })
  } catch (error) {
    return respondWithError('oauth', error)
  }
}
