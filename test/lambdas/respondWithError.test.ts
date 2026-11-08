export {}

const send = jest.fn()

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  ...jest.requireActual('@aws-sdk/lib-dynamodb'),
  DynamoDBDocumentClient: { from: () => ({ send }) },
}))

type Res = { statusCode: number; body: string }

const event = (method: string, path: string, body: unknown = {}) =>
  ({
    requestContext: { http: { method, path } },
    rawPath: path,
    body: JSON.stringify(body),
  }) as never

describe('respondWithError', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    process.env.TOKEN_TABLE = 'tokens'
    process.env.REALM_ID = 'realm'
    send.mockReset()
  })

  test('POST /vendors: a rejecting handler (plain Error) becomes HTTP 500 JSON via the router catch', async () => {
    // handleCreateVendor rejects (token lookup throws). The router's `return await` is what
    // keeps this rejection inside its try/catch; a bare `return handleCreateVendor(...)`
    // would let the rejected promise escape the catch and surface as an unhandled Lambda error.
    send.mockRejectedValue(new Error('ddb down'))
    const { handler } = await import('../../lambdas/vendors')
    const res = (await handler(
      event('POST', '/vendors', { displayName: 'Acme' }),
      {} as never,
      () => undefined,
    )) as Res

    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body)).toEqual({ error: 'ddb down' })
  })

  test('connection router: QboAuthExpiredError goes through respondWithError as 401', async () => {
    const { QboAuthExpiredError } = await import('../../lambdas/shared/utils/qboAuthExpiredError')
    send.mockRejectedValue(new QboAuthExpiredError('tid-7'))
    const { handler } = await import('../../lambdas/connection')
    const res = (await handler(event('GET', '/connection'), {} as never, () => undefined)) as Res

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body)).toEqual({
      error: { code: 'QBO_AUTH_EXPIRED', message: expect.any(String) },
      intuitTid: 'tid-7',
    })
  })

  test('non-Error throw → 500 "Internal server error"', async () => {
    const { respondWithError } = await import('../../lambdas/shared/utils/respondWithError')
    const res = respondWithError('test', 'a string was thrown')

    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body)).toEqual({ error: 'Internal server error' })
  })
})
