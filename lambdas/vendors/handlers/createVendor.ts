import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { getValidAccessToken, qboFetch } from '../../shared/utils/qboClient'
import { respond } from '../../shared/utils/respond'
import { TOKEN_TABLE, QBO_MINOR_VERSION } from '../constants'

const REALM_ID = process.env.REALM_ID!

interface CreateVendorRequest {
  displayName: string
  companyName?: string
  email?: string
  phone?: string
}

/**
 * POST /vendors
 * Creates a new vendor in QBO.
 * Used when human approves a new vendor name from the expense processor.
 */
export const handleCreateVendor = async (ddb: DynamoDBDocumentClient, body: string | null) => {
  if (!body) {
    return respond(400, { error: 'Request body is required' })
  }

  let request: CreateVendorRequest
  try {
    request = JSON.parse(body)
  } catch {
    return respond(400, { error: 'Invalid JSON body' })
  }

  const { displayName, companyName, email, phone } = request

  if (!displayName) {
    return respond(400, { error: 'Missing required field: displayName' })
  }

  const accessToken = await getValidAccessToken(ddb, TOKEN_TABLE)

  // Check for existing vendor with same display name
  const query = encodeURIComponent(
    `SELECT * FROM Vendor WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`,
  )
  const queryResult = await qboFetch(
    accessToken,
    REALM_ID,
    `/query?query=${query}&minorversion=${QBO_MINOR_VERSION}`,
  )

  if (queryResult.QueryResponse?.Vendor?.length > 0) {
    const existing = queryResult.QueryResponse.Vendor[0]
    return respond(409, {
      error: 'Vendor already exists',
      existing: {
        id: existing.Id,
        displayName: existing.DisplayName,
        active: existing.Active,
      },
    })
  }

  // Build QBO Vendor entity
  const vendorEntity: Record<string, unknown> = {
    DisplayName: displayName,
  }
  if (companyName) vendorEntity.CompanyName = companyName
  if (email) vendorEntity.PrimaryEmailAddr = { Address: email }
  if (phone) vendorEntity.PrimaryPhone = { FreeFormNumber: phone }

  const result = await qboFetch(
    accessToken,
    REALM_ID,
    `/vendor?minorversion=${QBO_MINOR_VERSION}`,
    {
      method: 'POST',
      body: vendorEntity,
    },
  )

  return respond(201, {
    id: result.Vendor.Id,
    displayName: result.Vendor.DisplayName,
    active: result.Vendor.Active,
  })
}
