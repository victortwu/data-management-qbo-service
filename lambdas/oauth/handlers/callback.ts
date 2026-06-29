import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import {
  TOKEN_TABLE,
  INTUIT_CLIENT_ID,
  INTUIT_CLIENT_SECRET,
  INTUIT_TOKEN_URL,
  REALM_ID,
} from '../constants'
import { IntuitTokenResponse, OAuthTokens } from '../types'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

export const handleCallback = async (code: string, realmId?: string) => {
  const credentials = Buffer.from(`${INTUIT_CLIENT_ID}:${INTUIT_CLIENT_SECRET}`).toString('base64')

  const response = await fetch(INTUIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
    }).toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Token exchange failed:', error)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body><h1>Connection Failed</h1><p>Unable to connect to QuickBooks. Please try again.</p></body></html>',
    }
  }

  const tokenData = (await response.json()) as IntuitTokenResponse

  const now = new Date()
  const tokenExpiresAt = new Date(now.getTime() + tokenData.expires_in * 1000).toISOString()
  const refreshTokenExpiresAt = new Date(
    now.getTime() + tokenData.x_refresh_token_expires_in * 1000,
  ).toISOString()

  const tokens: OAuthTokens = {
    pk: 'OAUTH_TOKENS',
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    realmId: realmId || REALM_ID,
    tokenExpiresAt,
    refreshTokenExpiresAt,
    updatedAt: now.toISOString(),
  }

  await ddb.send(
    new PutCommand({
      TableName: TOKEN_TABLE,
      Item: tokens,
    }),
  )

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: '<html><body><h1>Connected to QuickBooks!</h1><p>You can close this window.</p></body></html>',
  }
}
