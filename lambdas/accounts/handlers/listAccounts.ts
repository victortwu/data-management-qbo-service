import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { getValidAccessToken } from '../../shared/utils/qboClient'
import { queryAll } from '../../shared/utils/queryAll'
import { respond } from '../../shared/utils/respond'
import { TOKEN_TABLE } from '../constants'
import { QboAccount } from '../types'

const REALM_ID = process.env.REALM_ID!

const EXPENSE_ACCOUNT_TYPES = ['Expense', 'Cost of Goods Sold', 'Other Expense']
const WHERE = `Active = true AND AccountType IN (${EXPENSE_ACCOUNT_TYPES.map((t) => `'${t}'`).join(', ')})`

/** GET /accounts — active expense/COGS accounts (paged), sorted by fully-qualified name. */
export const handleListAccounts = async (ddb: DynamoDBDocumentClient) => {
  const accessToken = await getValidAccessToken(ddb, TOKEN_TABLE)
  const rows = await queryAll<QboAccount>(accessToken, REALM_ID, 'Account', WHERE)

  const accounts = rows
    .map(({ Id, Name, FullyQualifiedName, AccountType }) => ({
      id: Id,
      name: Name,
      fullyQualifiedName: FullyQualifiedName || Name,
      accountType: AccountType,
    }))
    .sort((a, b) => (a.fullyQualifiedName ?? '').localeCompare(b.fullyQualifiedName ?? ''))

  return respond(200, { accounts, count: accounts.length })
}
