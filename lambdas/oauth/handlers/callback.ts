import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb'
import { TOKEN_TABLE, INTUIT_CLIENT_ID, INTUIT_TOKEN_URL, REALM_ID } from '../constants'
import { getClientSecret } from '../../shared/utils/getClientSecret'
import { logger } from '../../shared/utils/logger'
import { IntuitTokenResponse, OAuthTokens } from '../types'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

export const handleCallback = async (code: string, realmId?: string, state?: string) => {
  // CSRF validation: verify state parameter matches what we stored
  if (!state) {
    logger.warn('OAuth callback CSRF check', {
      operation: 'oauth_callback',
      decision: 'missing_state',
      errorClass: 'validation',
    })
    return {
      statusCode: 302,
      headers: { Location: `${process.env.QBO_REDIRECT_URI!}?status=error&reason=missing_state` },
      body: '',
    }
  }

  const stateResult = await ddb.send(
    new GetCommand({
      TableName: TOKEN_TABLE,
      Key: { pk: `OAUTH_STATE#${state}` },
    }),
  )

  if (!stateResult.Item) {
    logger.warn('OAuth callback CSRF check', {
      operation: 'oauth_callback',
      decision: 'invalid_state',
      errorClass: 'validation',
    })
    return {
      statusCode: 302,
      headers: { Location: `${process.env.QBO_REDIRECT_URI!}?status=error&reason=invalid_state` },
      body: '',
    }
  }

  // Delete used state (one-time use)
  await ddb.send(
    new DeleteCommand({
      TableName: TOKEN_TABLE,
      Key: { pk: `OAUTH_STATE#${state}` },
    }),
  )
  const clientSecret = await getClientSecret()
  const credentials = Buffer.from(`${INTUIT_CLIENT_ID}:${clientSecret}`).toString('base64')

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
    const tid = response.headers.get('intuit_tid')
    logger.error('Token exchange failed', {
      operation: 'oauth_callback',
      errorClass: 'qbo_api',
      httpStatus: response.status,
      intuitTid: tid ?? undefined,
      errorName: 'TokenExchangeError',
      errorMessage: error,
    })
    return {
      statusCode: 302,
      headers: { Location: `${process.env.QBO_REDIRECT_URI!}?status=error` },
      body: '',
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
    statusCode: 302,
    headers: { Location: `${process.env.QBO_REDIRECT_URI!}?status=success` },
    body: '',
  }
}
