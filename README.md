# DataMgmt QBO Service

Generic QuickBooks Online API wrapper service. Provides authenticated access to QBO Purchase and Vendor APIs with automatic OAuth token management. Designed to be reusable by any consumer — expense processors, MCP servers, CLI tools.

## Architecture

- **AWS CDK** infrastructure (TypeScript)
- **API Gateway HTTP API** with JWT authorizer (shared Cognito pool)
- **4 Lambda functions**: OAuth, Purchases, Vendors, Connection
- **DynamoDB** table for OAuth token storage (single item)
- **KMS** customer-managed key for encryption

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /auth/connect | None | Redirects to Intuit OAuth consent screen |
| GET | /auth/callback | None | Handles OAuth callback, stores tokens |
| POST | /auth/refresh | JWT | Force token refresh |
| POST | /purchases | JWT | Create a QBO Purchase |
| GET | /purchases/{docNumber} | JWT | Get purchase by doc number |
| GET | /vendors | JWT | List all active QBO vendors |
| GET | /connection | JWT | Check OAuth connection health |

## Prerequisites

Before deploying, set these SSM parameters and the Secrets Manager secret:

```bash
# Intuit app credentials (from Intuit Developer Portal)
aws ssm put-parameter --name "/Beta/datamgmt-qbo/intuit-client-id" --value "YOUR_CLIENT_ID" --type String
aws ssm put-parameter --name "/Beta/datamgmt-qbo/redirect-uri" --value "https://YOUR_API_URL/auth/callback" --type String
aws ssm put-parameter --name "/Beta/datamgmt-qbo/realm-id" --value "YOUR_REALM_ID" --type String

# Intuit client secret lives in AWS Secrets Manager (KMS-encrypted, read at
# runtime by ARN — never baked into the Lambda env). The secret NAME must match
# what the stack references: "{Stage}/datamgmt-qbo/intuit-client-secret".
aws secretsmanager create-secret \
  --name "Beta/datamgmt-qbo/intuit-client-secret" \
  --secret-string "YOUR_CLIENT_SECRET"
# To rotate/update the value later:
# aws secretsmanager put-secret-value \
#   --secret-id "Beta/datamgmt-qbo/intuit-client-secret" --secret-string "NEW_VALUE"

# These must already exist from DataMgmt core deployment:
# /Beta/datamgmt/user-pool-id
# /Beta/datamgmt/user-pool-client-id
```

## Deploy

```bash
npm install
npx cdk deploy Beta-DataMgmtQboServiceStack
```

## Test

```bash
npm test
```

## OAuth Flow

1. User visits `GET /auth/connect` in browser
2. Redirected to Intuit consent screen
3. After approval, Intuit redirects to `GET /auth/callback`
4. Callback exchanges code for tokens, stores in DynamoDB
5. All subsequent API calls auto-refresh tokens when expiring

## Project Structure

```
├── bin/                    # CDK app entry point
├── lib/
│   ├── stacks/            # CDK stack definitions
│   └── utils/             # CDK utilities
├── lambdas/
│   ├── shared/utils/      # Shared Lambda utilities (qboClient, respond)
│   ├── oauth/             # OAuth flow handlers
│   ├── purchases/         # QBO Purchase CRUD
│   ├── vendors/           # QBO Vendor queries
│   └── connection/        # Connection health check
├── test/                  # CDK assertion tests
└── config.ts             # Stage configuration
```

## Naming Convention

This service uses generic `datamgmt-qbo` naming to support reuse and forking:
- **Stack**: `{Stage}-DataMgmtQboServiceStack`
- **Lambdas**: `{Stage}-DataMgmt-Qbo{Purpose}`
- **KMS alias**: `datamgmt-qbo-{stage}`
- **SSM params**: `/{Stage}/datamgmt-qbo/*`

Business-specific logic (vendor rules, auto-submit decisions) belongs in a separate processor service that calls this API.
