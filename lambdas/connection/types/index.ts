export interface ConnectionStatus {
  connected: boolean
  realmId?: string
  tokenExpiresAt?: string
  refreshTokenExpiresAt?: string
  status: 'active' | 'expiring_soon' | 'expired' | 'not_connected'
}
