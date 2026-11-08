import { QBO_MINOR_VERSION, QBO_PAGE_SIZE } from '../constants/qbo'
import { qboFetch } from './qboClient'

/**
 * Returns every `entity` row matching `where`, paging QBO with STARTPOSITION/MAXRESULTS
 * until a page comes back short. Escape any interpolated literal in `where` with
 * escapeQboLiteral.
 */
export const queryAll = async <T>(
  accessToken: string,
  realmId: string,
  entity: string,
  where: string,
): Promise<T[]> => {
  const rows: T[] = []
  for (let start = 1; ; start += QBO_PAGE_SIZE) {
    const query = encodeURIComponent(
      `SELECT * FROM ${entity} WHERE ${where} ORDERBY Id STARTPOSITION ${start} MAXRESULTS ${QBO_PAGE_SIZE}`,
    )
    const result = await qboFetch(
      accessToken,
      realmId,
      `/query?query=${query}&minorversion=${QBO_MINOR_VERSION}`,
    )
    const page: T[] = result.QueryResponse?.[entity] ?? []
    rows.push(...page)
    if (page.length < QBO_PAGE_SIZE) return rows
  }
}
