import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { getValidAccessToken, qboFetch } from '../../shared/utils/qboClient'
import { respond } from '../../shared/utils/respond'
import { TOKEN_TABLE, QBO_MINOR_VERSION } from '../constants'

const REALM_ID = process.env.REALM_ID!

/**
 * GET /purchases?vendor={vendorId}
 * Returns the most recent purchases for a given vendor.
 * Used by expense processor to infer expense account from history.
 *
 * Note: QBO does not support filtering Purchase by EntityRef in queries,
 * so we fetch recent purchases and filter client-side.
 */
export const handleQueryPurchases = async (ddb: DynamoDBDocumentClient, vendorId: string) => {
  const accessToken = await getValidAccessToken(ddb, TOKEN_TABLE)

  // Fetch recent purchases (QBO doesn't allow filtering by EntityRef)
  // We fetch a reasonable batch and filter client-side
  const query = encodeURIComponent(
    `SELECT * FROM Purchase ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 100`,
  )
  const result = await qboFetch(
    accessToken,
    REALM_ID,
    `/query?query=${query}&minorversion=${QBO_MINOR_VERSION}`,
  )

  const allPurchases = result.QueryResponse?.Purchase || []

  // Filter by vendor ID
  const vendorPurchases = allPurchases
    .filter((p: Record<string, unknown>) => {
      const entityRef = p.EntityRef as { value?: string } | undefined
      return entityRef?.value === vendorId
    })
    .slice(0, 5) // Return at most 5

  const normalized = vendorPurchases.map((p: Record<string, unknown>) => ({
    id: p.Id,
    docNumber: p.DocNumber,
    txnDate: p.TxnDate,
    totalAmt: p.TotalAmt,
    paymentType: p.PaymentType,
    entityRef: p.EntityRef,
    lines: (p.Line as Array<Record<string, unknown>>)
      ?.filter((l) => l.DetailType === 'AccountBasedExpenseLineDetail')
      .map((l) => ({
        amount: l.Amount,
        description: l.Description,
        accountRef: (l.AccountBasedExpenseLineDetail as Record<string, unknown>)?.AccountRef,
      })),
  }))

  return respond(200, { purchases: normalized, count: normalized.length })
}
