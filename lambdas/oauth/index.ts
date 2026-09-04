import { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { handleConnect } from './handlers/connect'
import { handleCallback } from './handlers/callback'
import { handleDisconnect } from './handlers/disconnect'
import { getValidAccessToken } from '../shared/utils/qboClient'
import { respond } from '../shared/utils/respond'
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
      return handleConnect()
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

      return handleCallback(code, realmId, state)
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

    // GET /auth/disconnect
    if (method === 'GET' && rawPath.includes('/disconnect')) {
      logger.info('OAuth branch', { operation: 'oauth', branch: 'disconnect' })
      return handleDisconnect()
    }

    return respond(404, { error: 'Route not found' })
  } catch (error) {
    const err = error as Error
    logger.error('OAuth handler error', {
      operation: 'oauth',
      errorName: err.name,
      errorMessage: err.message,
    })
    const message = error instanceof Error ? error.message : 'Internal server error'
    return respond(500, { error: message })
  }
}
