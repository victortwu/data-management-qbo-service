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
    realmId: 'realm',
    tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
  },
}

const intuitReturns = (status: number, headers: Record<string, string> = {}) => {
  global.fetch = jest
    .fn()
    .mockResolvedValue(new Response('{"fault":"raw upstream text"}', { status, headers }))
}

const event = (method: string, path: string, extra: Record<string, unknown> = {}) =>
  ({
    requestContext: { http: { method, path } },
    rawPath: path,
    body: JSON.stringify({}),
    ...extra,
  }) as never

describe('QBO 401 -> HTTP 401 QBO_AUTH_EXPIRED', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    process.env.TOKEN_TABLE = 'tokens'
    process.env.REALM_ID = 'realm'
    send.mockReset().mockResolvedValue(validTokens)
  })

  const parse = (res: { body?: string }) => JSON.parse(res.body as string)

  test('GET /purchases/{docNumber} returns 401 with code and intuitTid', async () => {
    intuitReturns(401, { intuit_tid: 'tid-123' })
    const { handler } = await import('../../lambdas/purchases')
    const res = (await handler(
      event('GET', '/purchases/D1', { pathParameters: { docNumber: 'D1' } }),
      {} as never,
      () => undefined,
    )) as { statusCode: number; body: string }

    expect(res.statusCode).toBe(401)
    expect(parse(res)).toEqual({
      error: { code: 'QBO_AUTH_EXPIRED', message: expect.any(String) },
      intuitTid: 'tid-123',
    })
    expect(res.body).not.toContain('raw upstream text')
  })

  test('GET /vendors returns 401 and omits intuitTid when header absent', async () => {
    intuitReturns(401)
    const { handler } = await import('../../lambdas/vendors')
    const res = (await handler(event('GET', '/vendors'), {} as never, () => undefined)) as {
      statusCode: number
      body: string
    }

    expect(res.statusCode).toBe(401)
    expect(parse(res)).toEqual({
      error: { code: 'QBO_AUTH_EXPIRED', message: expect.any(String) },
    })
  })

  test('oauth router: non-QBO errors stay HTTP 500 with the existing message shape', async () => {
    send.mockRejectedValue(new Error('ddb down'))
    const { handler } = await import('../../lambdas/oauth')
    const res = (await handler(event('POST', '/auth/refresh'), {} as never, () => undefined)) as {
      statusCode: number
      body: string
    }

    expect(res.statusCode).toBe(500)
    expect(parse(res)).toEqual({ error: 'ddb down' })
  })

  test('non-401 Intuit errors remain HTTP 500 with the existing message shape', async () => {
    intuitReturns(500, { intuit_tid: 'tid-9' })
    const { handler } = await import('../../lambdas/purchases')
    const res = (await handler(
      event('GET', '/purchases/D1', { pathParameters: { docNumber: 'D1' } }),
      {} as never,
      () => undefined,
    )) as { statusCode: number; body: string }

    expect(res.statusCode).toBe(500)
    expect(typeof parse(res).error).toBe('string')
  })
})

describe('POST /auth/disconnect router', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env.TOKEN_TABLE = 'tokens'
    send.mockReset().mockResolvedValue({})
  })

  test('POST /auth/disconnect deletes tokens', async () => {
    const { handler } = await import('../../lambdas/oauth')
    const res = (await handler(
      event('POST', '/auth/disconnect'),
      {} as never,
      () => undefined,
    )) as {
      statusCode: number
    }
    expect(res.statusCode).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
  })

  test('GET /auth/disconnect (Intuit Disconnect URL) acknowledges without deleting', async () => {
    const { handler } = await import('../../lambdas/oauth')
    const res = (await handler(event('GET', '/auth/disconnect'), {} as never, () => undefined)) as {
      statusCode: number
    }
    expect(res.statusCode).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('re-authorization needed -> HTTP 401 QBO_AUTH_EXPIRED', () => {
  const expiredAccessToken = {
    Item: { ...validTokens.Item, tokenExpiresAt: new Date(Date.now() - 1000).toISOString() },
  }
  const callVendors = async () => {
    const { handler } = await import('../../lambdas/vendors')
    const res = (await handler(event('GET', '/vendors'), {} as never, () => undefined)) as {
      statusCode: number
      body: string
    }
    return { status: res.statusCode, body: JSON.parse(res.body) }
  }

  beforeEach(() => {
    jest.resetModules()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    process.env.TOKEN_TABLE = 'tokens'
    process.env.REALM_ID = 'realm'
    process.env.INTUIT_CLIENT_ID = 'client'
    send.mockReset()
  })

  test('no stored tokens (never connected / disconnected)', async () => {
    send.mockResolvedValue({})

    const { status, body } = await callVendors()

    expect(status).toBe(401)
    expect(body.error.code).toBe('QBO_AUTH_EXPIRED')
  })

  test.each([400, 401])('refresh token rejected by Intuit (%i)', async (code) => {
    send.mockResolvedValue(expiredAccessToken)
    intuitReturns(code, { intuit_tid: 'tid-r' })

    const { status, body } = await callVendors()

    expect(status).toBe(401)
    expect(body).toEqual({
      error: { code: 'QBO_AUTH_EXPIRED', message: expect.any(String) },
      intuitTid: 'tid-r',
    })
  })

  test('Intuit 5xx during refresh is NOT reported as expired', async () => {
    send.mockResolvedValue(expiredAccessToken)
    intuitReturns(503)

    const { status, body } = await callVendors()

    expect(status).toBe(500)
    expect(body.error).toEqual(expect.any(String))
  })
})
