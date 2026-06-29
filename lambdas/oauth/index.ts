import { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { handleConnect } from './handlers/connect'
import { handleCallback } from './handlers/callback'
import { getValidAccessToken } from '../shared/utils/qboClient'
import { respond } from '../shared/utils/respond'
import { TOKEN_TABLE } from './constants'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const { requestContext, rawPath, queryStringParameters } = event
  const method = requestContext.http.method

  try {
    // GET /auth/connect
    if (method === 'GET' && rawPath.includes('/connect')) {
      return handleConnect()
    }

    // GET /auth/callback
    if (method === 'GET' && rawPath.includes('/callback')) {
      const code = queryStringParameters?.code
      const realmId = queryStringParameters?.realmId

      if (!code) {
        return respond(400, { error: 'Missing authorization code' })
      }

      return handleCallback(code, realmId)
    }

    // POST /auth/refresh
    if (method === 'POST' && rawPath.includes('/refresh')) {
      const accessToken = await getValidAccessToken(ddb, TOKEN_TABLE)
      return respond(200, {
        message: 'Token refreshed successfully',
        hasValidToken: !!accessToken,
      })
    }

    return respond(404, { error: 'Route not found' })
  } catch (error) {
    console.error('OAuth handler error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return respond(500, { error: message })
  }
}
