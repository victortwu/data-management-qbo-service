import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { TOKEN_TABLE } from '../constants'
import { respond } from '../../shared/utils/respond'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

export const handleDisconnect = async () => {
  await ddb.send(
    new DeleteCommand({
      TableName: TOKEN_TABLE,
      Key: { pk: 'OAUTH_TOKENS' },
    }),
  )

  return respond(200, { message: 'App disconnected successfully' })
}
