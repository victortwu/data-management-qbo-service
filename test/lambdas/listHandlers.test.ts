export {}

const send = jest.fn()

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  ...jest.requireActual('@aws-sdk/lib-dynamodb'),
  DynamoDBDocumentClient: { from: () => ({ send }) },
}))

jest.mock('../../lambdas/shared/utils/getClientSecret', () => ({
  getClientSecret: jest.fn().mockResolvedValue('secret'),
}))

const validTokens = {
  Item: {
    pk: 'OAUTH_TOKENS',
    accessToken: 'at',
    refreshToken: 'rt',
    tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
  },
}

const event = (method = 'GET') => ({ requestContext: { http: { method } } }) as never

const qboPage = (entity: string, rows: unknown[]) =>
  new Response(JSON.stringify({ QueryResponse: { [entity]: rows } }))

const account = (
  Id: string,
  Name: string,
  FullyQualifiedName?: string,
  AccountType = 'Expense',
) => ({
  Id,
  Name,
  FullyQualifiedName,
  AccountType,
  Active: true,
})

const loadHandler = async (lambda: 'accounts' | 'vendors') => {
  jest.resetModules()
  process.env.TOKEN_TABLE = 'tokens'
  process.env.REALM_ID = 'realm'
  return (await import(`../../lambdas/${lambda}/index`)).handler
}

const parse = (res: { body?: string }) => JSON.parse(res.body!)

beforeEach(() => {
  send.mockReset().mockResolvedValue(validTokens)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('GET /accounts', () => {
  test('queries the 3 expense types, maps fields, sorts by fullyQualifiedName (Name fallback)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        qboPage('Account', [
          account('3', 'Rent'),
          account('1', 'Food Purchases', 'Cost of Goods Sold:Food Purchases', 'Cost of Goods Sold'),
          account('2', 'Fees', 'Bank:Fees', 'Other Expense'),
        ]),
      )
    const handler = await loadHandler('accounts')

    const res = await handler(event())

    expect(res.statusCode).toBe(200)
    expect(parse(res)).toEqual({
      accounts: [
        { id: '2', name: 'Fees', fullyQualifiedName: 'Bank:Fees', accountType: 'Other Expense' },
        {
          id: '1',
          name: 'Food Purchases',
          fullyQualifiedName: 'Cost of Goods Sold:Food Purchases',
          accountType: 'Cost of Goods Sold',
        },
        { id: '3', name: 'Rent', fullyQualifiedName: 'Rent', accountType: 'Expense' },
      ],
      count: 3,
    })
    const url = new URL((global.fetch as jest.Mock).mock.calls[0][0])
    expect(url.searchParams.get('query')).toBe(
      "SELECT * FROM Account WHERE Active = true AND AccountType IN ('Expense', 'Cost of Goods Sold', 'Other Expense') ORDERBY Id STARTPOSITION 1 MAXRESULTS 1000",
    )
  })

  test('pages through more than 1000 accounts', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => account(`a${i}`, `N${i}`))
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(qboPage('Account', full))
      .mockResolvedValueOnce(qboPage('Account', [account('z', 'Last')]))
    const handler = await loadHandler('accounts')

    const body = parse(await handler(event()))

    expect(body.count).toBe(1001)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  test('account missing both Name and FullyQualifiedName does not throw when sorting', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        qboPage('Account', [account('1', 'B'), { Id: '2', AccountType: 'Expense', Active: true }]),
      )
    const handler = await loadHandler('accounts')

    const res = await handler(event())

    expect(res.statusCode).toBe(200)
    expect(parse(res).count).toBe(2)
  })

  test('QBO 401 -> 401 QBO_AUTH_EXPIRED', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 401 }))
    const handler = await loadHandler('accounts')

    const res = await handler(event())

    expect(res.statusCode).toBe(401)
    expect(parse(res).error.code).toBe('QBO_AUTH_EXPIRED')
  })

  test('non-GET -> 404', async () => {
    const handler = await loadHandler('accounts')
    expect((await handler(event('POST'))).statusCode).toBe(404)
  })
})

describe('GET /vendors', () => {
  test('shape unchanged and pages past 1000', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({
      Id: `v${i}`,
      DisplayName: `V${i}`,
      Active: true,
    }))
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(qboPage('Vendor', full))
      .mockResolvedValueOnce(qboPage('Vendor', [{ Id: 'x', DisplayName: 'Last', Active: true }]))
    const handler = await loadHandler('vendors')

    const body = parse(await handler(event()))

    expect(body.count).toBe(1001)
    expect(body.vendors[1000]).toEqual({ id: 'x', displayName: 'Last', active: true })
  })
})
