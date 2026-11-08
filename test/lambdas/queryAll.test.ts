import { queryAll } from '../../lambdas/shared/utils/queryAll'
import { escapeQboLiteral } from '../../lambdas/shared/utils/escapeQboLiteral'

jest.mock('../../lambdas/shared/utils/getClientSecret', () => ({
  getClientSecret: jest.fn(),
}))

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ Id: String(i) }))
const page = (n: number) => new Response(JSON.stringify({ QueryResponse: { Vendor: rows(n) } }))
const queryOf = (call: unknown[]) =>
  decodeURIComponent(new URL(call[0] as string).searchParams.get('query')!)

describe('queryAll', () => {
  test('pages until a short page: 2 full pages + partial = all rows', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(page(1000))
      .mockResolvedValueOnce(page(1000))
      .mockResolvedValueOnce(page(5))

    const result = await queryAll('at', 'realm', 'Vendor', 'Active = true')

    expect(result).toHaveLength(2005)
    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls.map(queryOf)).toEqual([
      'SELECT * FROM Vendor WHERE Active = true ORDERBY Id STARTPOSITION 1 MAXRESULTS 1000',
      'SELECT * FROM Vendor WHERE Active = true ORDERBY Id STARTPOSITION 1001 MAXRESULTS 1000',
      'SELECT * FROM Vendor WHERE Active = true ORDERBY Id STARTPOSITION 2001 MAXRESULTS 1000',
    ])
  })

  test('a single partial page makes one request', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(page(3))
    expect(await queryAll('at', 'realm', 'Vendor', 'Active = true')).toHaveLength(3)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('empty result (no entity key) returns []', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(new Response('{"QueryResponse":{}}'))
    expect(await queryAll('at', 'realm', 'Vendor', 'Active = true')).toEqual([])
  })

  test('an exact multiple of the page size fetches one more (empty) page', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(page(1000))
      .mockResolvedValueOnce(new Response('{"QueryResponse":{}}'))
    expect(await queryAll('at', 'realm', 'Vendor', 'Active = true')).toHaveLength(1000)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  test('errors propagate, including from a later page', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(page(1000))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
    await expect(queryAll('at', 'realm', 'Vendor', 'Active = true')).rejects.toThrow(
      /QBO API error: 500/,
    )
  })
})

describe('escapeQboLiteral', () => {
  test('escapes quotes and backslashes', () => {
    expect(escapeQboLiteral(`O'Brien\\`)).toBe(`O\\'Brien\\\\`)
  })
})
