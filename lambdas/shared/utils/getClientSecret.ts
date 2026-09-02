import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const client = new SecretsManagerClient({})

// Memoize across warm invocations — fetched once per Lambda container lifetime.
let cachedSecret: string | undefined

/**
 * Fetches the Intuit client secret from AWS Secrets Manager at runtime.
 * The secret ARN is provided via the INTUIT_CLIENT_SECRET_ARN env var; the
 * value itself is never baked into the Lambda environment.
 */
export const getClientSecret = async (): Promise<string> => {
  if (cachedSecret) {
    return cachedSecret
  }

  const secretArn = process.env.INTUIT_CLIENT_SECRET_ARN
  if (!secretArn) {
    throw new Error('INTUIT_CLIENT_SECRET_ARN is not set')
  }

  const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }))

  if (!result.SecretString) {
    throw new Error('Intuit client secret has no SecretString value')
  }

  cachedSecret = result.SecretString
  return cachedSecret
}
