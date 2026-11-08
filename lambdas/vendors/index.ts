import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { respond } from '../shared/utils/respond'
import { respondWithError } from '../shared/utils/respondWithError'
import { handleCreateVendor } from './handlers/createVendor'
import { handleListVendors } from './handlers/listVendors'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const method = event.requestContext.http.method

  try {
    if (method === 'GET') {
      return await handleListVendors(ddb)
    }

    if (method === 'POST') {
      return await handleCreateVendor(ddb, event.body || null)
    }

    return respond(404, { error: 'Route not found' })
  } catch (error) {
    return respondWithError('vendors', error)
  }
}
