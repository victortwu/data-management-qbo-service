import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { getValidAccessToken, qboFetch } from '../shared/utils/qboClient'
import { respond } from '../shared/utils/respond'
import { TOKEN_TABLE, QBO_MINOR_VERSION } from './constants'
import { QboVendor } from './types'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

const REALM_ID = process.env.REALM_ID!

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async () => {
  try {
    const accessToken = await getValidAccessToken(ddb, TOKEN_TABLE)

    const query = encodeURIComponent(
      'SELECT * FROM Vendor WHERE Active = true MAXRESULTS 1000',
    )
    const result = await qboFetch(
      accessToken,
      REALM_ID,
      `/query?query=${query}&minorversion=${QBO_MINOR_VERSION}`,
    )

    const vendors: QboVendor[] = result.QueryResponse?.Vendor || []

    const normalized = vendors.map((vendor) => ({
      id: vendor.Id,
      displayName: vendor.DisplayName,
      active: vendor.Active,
    }))

    return respond(200, { vendors: normalized, count: normalized.length })
  } catch (error) {
    console.error('Vendors handler error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return respond(500, { error: message })
  }
}
