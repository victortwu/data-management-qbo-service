import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { getValidAccessToken } from '../../shared/utils/qboClient'
import { respond } from '../../shared/utils/respond'
import { TOKEN_TABLE, QBO_MINOR_VERSION } from '../constants'

const REALM_ID = process.env.REALM_ID!

interface AttachmentRequest {
  fileName: string
  contentType: string
  content: string // base64-encoded file content
}

/**
 * POST /purchases/{purchaseId}/attachments
 * Attaches a file (typically a PDF) to an existing QBO Purchase.
 * Content must be sent as base64-encoded string in the request body.
 */
export const handleAttachFile = async (
  ddb: DynamoDBDocumentClient,
  purchaseId: string,
  body: string | null,
) => {
  if (!body) {
    return respond(400, { error: 'Request body is required' })
  }

  let request: AttachmentRequest
  try {
    request = JSON.parse(body)
  } catch {
    return respond(400, { error: 'Invalid JSON body' })
  }

  const { fileName, contentType, content } = request

  if (!fileName || !contentType || !content) {
    return respond(400, {
      error: 'Missing required fields: fileName, contentType, content (base64)',
    })
  }

  const accessToken = await getValidAccessToken(ddb, TOKEN_TABLE)
  const fileBuffer = Buffer.from(content, 'base64')

  // QBO Attachable API requires multipart/form-data upload
  const boundary = `----FormBoundary${Date.now()}`

  const metadataJson = JSON.stringify({
    AttachableRef: [
      {
        EntityRef: {
          type: 'Purchase',
          value: purchaseId,
        },
      },
    ],
    FileName: fileName,
    ContentType: contentType,
  })

  // Build multipart body
  const parts: Buffer[] = []

  // Metadata part
  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="file_metadata_0"\r\n' +
        'Content-Type: application/json\r\n\r\n' +
        metadataJson +
        '\r\n',
    ),
  )

  // File content part
  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file_content_0"; filename="${fileName}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
  )
  parts.push(fileBuffer)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  const multipartBody = Buffer.concat(parts)

  // Call QBO Attachable upload endpoint directly (not via qboFetch due to special content type)
  const baseUrl = `${process.env.QBO_BASE_URL || 'https://sandbox-quickbooks.api.intuit.com/v3/company'}/${REALM_ID}`
  const url = `${baseUrl}/upload?minorversion=${QBO_MINOR_VERSION}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: multipartBody,
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`QBO attachment upload failed: ${response.status} ${errorText}`)
    return respond(response.status === 401 ? 401 : 502, {
      error: `QBO attachment upload failed: ${response.status}`,
      detail: errorText,
    })
  }

  const result = await response.json()
  const attachable = (result as { AttachableResponse?: Array<{ Attachable?: { Id: string } }> })
    .AttachableResponse?.[0]?.Attachable

  return respond(201, {
    attachableId: attachable?.Id,
    purchaseId,
    fileName,
  })
}
