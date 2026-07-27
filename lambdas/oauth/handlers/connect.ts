import { randomUUID } from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import {
  INTUIT_AUTH_URL,
  INTUIT_CLIENT_ID,
  QBO_REDIRECT_URI,
  QBO_SCOPES,
  TOKEN_TABLE,
} from '../constants'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

export const handleConnect = async () => {
  const state = randomUUID()

  // Store state with 10-minute TTL for CSRF validation in callback
  const ttl = Math.floor(Date.now() / 1000) + 600
  await ddb.send(
    new PutCommand({
      TableName: TOKEN_TABLE,
      Item: { pk: `OAUTH_STATE#${state}`, ttl, createdAt: new Date().toISOString() },
    }),
  )

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
