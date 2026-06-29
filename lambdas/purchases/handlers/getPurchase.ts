import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { getValidAccessToken, qboFetch } from '../../shared/utils/qboClient'
import { respond } from '../../shared/utils/respond'
import { TOKEN_TABLE, QBO_MINOR_VERSION } from '../constants'

const REALM_ID = process.env.REALM_ID!

export const handleGetPurchase = async (ddb: DynamoDBDocumentClient, docNumber: string) => {
  const accessToken = await getValidAccessToken(ddb, TOKEN_TABLE)

  const query = encodeURIComponent(`select * from Purchase where DocNumber = '${docNumber}'`)
  const result = await qboFetch(
    accessToken,
    REALM_ID,
    `/query?query=${query}&minorversion=${QBO_MINOR_VERSION}`,
  )

  const purchases = result.QueryResponse?.Purchase
  if (!purchases || purchases.length === 0) {
    return respond(404, { error: `Purchase with DocNumber '${docNumber}' not found` })
  }

  const purchase = purchases[0]
  return respond(200, {
    id: purchase.Id,
    docNumber: purchase.DocNumber,
    txnDate: purchase.TxnDate,
    totalAmt: purchase.TotalAmt,
    paymentType: purchase.PaymentType,
    entityRef: purchase.EntityRef,
    lines: purchase.Line,
    privateNote: purchase.PrivateNote,
  })
}
