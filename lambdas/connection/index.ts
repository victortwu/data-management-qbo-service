import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { respond } from '../shared/utils/respond'
import { TOKEN_TABLE } from './constants'
import { ConnectionStatus } from './types'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

const deriveStatus = (
  tokenExpiresAt: string,
  refreshTokenExpiresAt: string,
): ConnectionStatus['status'] => {
  const now = new Date()
  const refreshExpires = new Date(refreshTokenExpiresAt)
  const tokenExpires = new Date(tokenExpiresAt)

  if (refreshExpires <= now) {
    return 'expired'
  }

  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  if (refreshExpires <= oneDayFromNow || tokenExpires <= now) {
    return 'expiring_soon'
  }

  return 'active'
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async () => {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: TOKEN_TABLE,
        Key: { pk: 'OAUTH_TOKENS' },
      }),
    )

    if (!result.Item) {
      const status: ConnectionStatus = {
        connected: false,
        status: 'not_connected',
      }
      return respond(200, status)
    }

    const { realmId, tokenExpiresAt, refreshTokenExpiresAt } = result.Item

    const connectionStatus: ConnectionStatus = {
      connected: true,
      realmId,
      tokenExpiresAt,
      refreshTokenExpiresAt,
      status: deriveStatus(tokenExpiresAt, refreshTokenExpiresAt),
    }

    return respond(200, connectionStatus)
  } catch (error) {
    console.error('Connection handler error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return respond(500, { error: message })
  }
}
