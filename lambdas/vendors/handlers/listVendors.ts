import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { getValidAccessToken } from '../../shared/utils/qboClient'
import { queryAll } from '../../shared/utils/queryAll'
import { respond } from '../../shared/utils/respond'
import { TOKEN_TABLE } from '../constants'
import { QboVendor } from '../types'

const REALM_ID = process.env.REALM_ID!

/** GET /vendors — all active vendors (paged). */
export const handleListVendors = async (ddb: DynamoDBDocumentClient) => {
  const accessToken = await getValidAccessToken(ddb, TOKEN_TABLE)
  const vendors = await queryAll<QboVendor>(accessToken, REALM_ID, 'Vendor', 'Active = true')

  return respond(200, {
    vendors: vendors.map(({ Id, DisplayName, Active }) => ({
      id: Id,
      displayName: DisplayName,
      active: Active,
    })),
    count: vendors.length,
  })
}
