import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { respond } from '../shared/utils/respond'
import { respondWithError } from '../shared/utils/respondWithError'
import { handleListAccounts } from './handlers/listAccounts'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    if (event.requestContext.http.method === 'GET') {
      return await handleListAccounts(ddb)
    }

    return respond(404, { error: 'Route not found' })
  } catch (error) {
    return respondWithError('accounts', error)
  }
}
