import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { handleCreatePurchase } from './handlers/createPurchase'
import { handleGetPurchase } from './handlers/getPurchase'
import { respond } from '../shared/utils/respond'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const { requestContext, body, pathParameters } = event
  const method = requestContext.http.method

  try {
    // POST /purchases
    if (method === 'POST') {
      return handleCreatePurchase(ddb, body || null)
    }

    // GET /purchases/{docNumber}
    if (method === 'GET') {
      const docNumber = pathParameters?.docNumber
      if (!docNumber) {
        return respond(400, { error: 'Missing docNumber path parameter' })
      }
      return handleGetPurchase(ddb, docNumber)
    }

    return respond(404, { error: 'Route not found' })
  } catch (error) {
    console.error('Purchases handler error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return respond(500, { error: message })
  }
}
