export interface OAuthTokens {
  pk: string
  accessToken: string
  refreshToken: string
  realmId: string
  tokenExpiresAt: string
  refreshTokenExpiresAt: string
  updatedAt: string
}

export interface IntuitTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  x_refresh_token_expires_in: number
  token_type: string
}
