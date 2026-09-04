import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { getClientSecret } from './getClientSecret'
import { logger } from './logger'

const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

interface StoredTokens {
  pk: string
  accessToken: string
  refreshToken: string
  realmId: string
  tokenExpiresAt: string
  refreshTokenExpiresAt: string
  updatedAt: string
}

interface IntuitTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  x_refresh_token_expires_in: number
  token_type: string
}

const getStoredTokens = async (ddb: DynamoDBDocumentClient, tableName: string) => {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'OAUTH_TOKENS' },
    }),
  )
  return result.Item as StoredTokens | undefined
}

const refreshTokens = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  currentRefreshToken: string,
) => {
  const clientId = process.env.INTUIT_CLIENT_ID!
  const clientSecret = await getClientSecret()
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(INTUIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
    }).toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    const tid = response.headers.get('intuit_tid')
    logger.error('Token refresh failed', {
      operation: 'refreshTokens',
      errorClass: 'qbo_api',
      httpStatus: response.status,
      intuitTid: tid ?? undefined,
      errorName: 'TokenRefreshError',
      errorMessage: error,
    })
    throw new Error(
      `Token refresh failed: ${response.status}${tid ? ` (intuit_tid: ${tid})` : ''} ${error}`,
    )
  }

  const tokenData = (await response.json()) as IntuitTokenResponse

  const now = new Date()
  const tokenExpiresAt = new Date(now.getTime() + tokenData.expires_in * 1000).toISOString()
  const refreshTokenExpiresAt = new Date(
    now.getTime() + tokenData.x_refresh_token_expires_in * 1000,
  ).toISOString()

  const storedTokens: StoredTokens = {
    pk: 'OAUTH_TOKENS',
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    realmId: process.env.REALM_ID!,
    tokenExpiresAt,
    refreshTokenExpiresAt,
    updatedAt: now.toISOString(),
  }

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: storedTokens,
    }),
  )

  return storedTokens
}

export const getValidAccessToken = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
): Promise<string> => {
  const tokens = await getStoredTokens(ddb, tableName)

  if (!tokens) {
    throw new Error('No OAuth tokens found. Please connect to QuickBooks first.')
  }

  const now = new Date()
  const expiresAt = new Date(tokens.tokenExpiresAt)
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

  // Refresh if token expires within 5 minutes
  if (expiresAt <= fiveMinutesFromNow) {
    const refreshed = await refreshTokens(ddb, tableName, tokens.refreshToken)
    return refreshed.accessToken
  }

  return tokens.accessToken
}

export interface QboFetchOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

export const qboFetch = async (
  accessToken: string,
  realmId: string,
  path: string,
  options: QboFetchOptions = {},
) => {
  const baseUrl = `${process.env.QBO_BASE_URL || 'https://sandbox-quickbooks.api.intuit.com/v3/company'}/${realmId}`
  const url = `${baseUrl}${path}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...options.headers,
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 401) {
    const tid = response.headers.get('intuit_tid')
    logger.warn('QBO API unauthorized', {
      operation: 'qboFetch',
      errorClass: 'qbo_api',
      httpStatus: 401,
      intuitTid: tid ?? undefined,
    })
    throw new Error(`UNAUTHORIZED${tid ? ` (intuit_tid: ${tid})` : ''}`)
  }

  if (!response.ok) {
    const error = await response.text()
    const tid = response.headers.get('intuit_tid')
    logger.error('QBO API error', {
      operation: 'qboFetch',
      errorClass: 'qbo_api',
      httpStatus: response.status,
      intuitTid: tid ?? undefined,
      errorName: 'QboApiError',
      errorMessage: error,
    })
    throw new Error(
      `QBO API error: ${response.status}${tid ? ` (intuit_tid: ${tid})` : ''} ${error}`,
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await response.json()) as any
}
