export interface QboRef {
  value: string
  name?: string
}

export interface PurchaseLine {
  amount: number
  accountRef: QboRef
  description?: string
}

export interface CreatePurchaseRequest {
  docNumber: string
  txnDate: string
  paymentType: 'Cash' | 'Check' | 'CreditCard'
  paymentAccountRef: QboRef
  entityRef: QboRef
  lines: PurchaseLine[]
  privateNote?: string
}

export interface QboPurchaseResponse {
  Purchase: {
    Id: string
    DocNumber: string
    TxnDate: string
    TotalAmt: number
    PaymentType: string
  }
}
