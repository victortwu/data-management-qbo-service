import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { handleCreatePurchase } from './handlers/createPurchase'
import { handleGetPurchase } from './handlers/getPurchase'
import { handleQueryPurchases } from './handlers/queryPurchases'
import { handleAttachFile } from './handlers/attachFile'
import { respond } from '../shared/utils/respond'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const { requestContext, body, pathParameters, queryStringParameters } = event
  const method = requestContext.http.method
  const path = requestContext.http.path

  try {
    // POST /purchases/{purchaseId}/attachments
    if (method === 'POST' && path.includes('/attachments')) {
      const purchaseId = pathParameters?.purchaseId
      if (!purchaseId) {
        return respond(400, { error: 'Missing purchaseId path parameter' })
      }
      return handleAttachFile(ddb, purchaseId, body || null)
    }

    // POST /purchases
    if (method === 'POST') {
      return handleCreatePurchase(ddb, body || null)
    }

    // GET /purchases/{docNumber} or GET /purchases?vendor={vendorId}
    if (method === 'GET') {
      const docNumber = pathParameters?.docNumber
      if (docNumber) {
        return handleGetPurchase(ddb, docNumber)
      }

      // Query by vendor
      const vendorId = queryStringParameters?.vendor
      if (vendorId) {
        return handleQueryPurchases(ddb, vendorId)
      }

      return respond(400, { error: 'Missing docNumber path parameter or vendor query parameter' })
    }

    return respond(404, { error: 'Route not found' })
  } catch (error) {
    console.error('Purchases handler error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return respond(500, { error: message })
  }
}
