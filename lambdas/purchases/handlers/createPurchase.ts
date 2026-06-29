import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { getValidAccessToken, qboFetch } from '../../shared/utils/qboClient'
import { respond } from '../../shared/utils/respond'
import { TOKEN_TABLE, QBO_MINOR_VERSION } from '../constants'
import { CreatePurchaseRequest } from '../types'

const REALM_ID = process.env.REALM_ID!

export const handleCreatePurchase = async (ddb: DynamoDBDocumentClient, body: string | null) => {
  if (!body) {
    return respond(400, { error: 'Request body is required' })
  }

  let request: CreatePurchaseRequest
  try {
    request = JSON.parse(body)
  } catch {
    return respond(400, { error: 'Invalid JSON body' })
  }

  const { docNumber, txnDate, paymentType, paymentAccountRef, entityRef, lines } = request

  if (
    !docNumber ||
    !txnDate ||
    !paymentType ||
    !paymentAccountRef ||
    !entityRef ||
    !lines?.length
  ) {
    return respond(400, {
      error:
        'Missing required fields: docNumber, txnDate, paymentType, paymentAccountRef, entityRef, lines',
    })
  }

  const accessToken = await getValidAccessToken(ddb, TOKEN_TABLE)

  // Check for duplicate
  const query = encodeURIComponent(`select * from Purchase where DocNumber = '${docNumber}'`)
  const queryResult = await qboFetch(
    accessToken,
    REALM_ID,
    `/query?query=${query}&minorversion=${QBO_MINOR_VERSION}`,
  )

  if (queryResult.QueryResponse?.Purchase?.length > 0) {
    const existing = queryResult.QueryResponse.Purchase[0]
    return respond(409, {
      error: 'Duplicate purchase',
      existing: {
        id: existing.Id,
        docNumber: existing.DocNumber,
        txnDate: existing.TxnDate,
        totalAmt: existing.TotalAmt,
      },
    })
  }

  // Map to QBO Purchase entity format
  const purchaseEntity = {
    DocNumber: docNumber,
    TxnDate: txnDate,
    PaymentType: paymentType,
    AccountRef: {
      value: paymentAccountRef.value,
      name: paymentAccountRef.name,
    },
    EntityRef: {
      value: entityRef.value,
      name: entityRef.name,
    },
    Line: lines.map((line) => ({
      Amount: line.amount,
      DetailType: 'AccountBasedExpenseLineDetail',
      AccountBasedExpenseLineDetail: {
        AccountRef: {
          value: line.accountRef.value,
          name: line.accountRef.name,
        },
      },
      Description: line.description || '',
    })),
    PrivateNote: request.privateNote || '',
  }

  const result = await qboFetch(
    accessToken,
    REALM_ID,
    `/purchase?minorversion=${QBO_MINOR_VERSION}`,
    {
      method: 'POST',
      body: purchaseEntity,
    },
  )

  return respond(201, {
    id: result.Purchase.Id,
    docNumber: result.Purchase.DocNumber,
    txnDate: result.Purchase.TxnDate,
    totalAmt: result.Purchase.TotalAmt,
    paymentType: result.Purchase.PaymentType,
  })
}
