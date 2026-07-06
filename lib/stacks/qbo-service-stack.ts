import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { Construct } from 'constructs'
import * as path from 'path'
import { StageConfig } from '../../config'

interface QboServiceStackProps extends cdk.StackProps {
  stage: StageConfig
}

export class QboServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: QboServiceStackProps) {
    super(scope, id, props)

    const { stage } = props
    const stageName = stage.stageName
    const stageLower = stageName.toLowerCase()

    // Import existing auth from SSM (shared Cognito pool)
    const userPoolId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${stageName}/datamgmt/user-pool-id`,
    )
    const userPoolClientId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${stageName}/datamgmt/user-pool-client-id`,
    )
    const machineClientId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${stageName}/datamgmt/machine-client-id`,
    )

    // Import Intuit credentials from SSM
    const intuitClientId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${stageName}/datamgmt-qbo/intuit-client-id`,
    )
    const intuitClientSecret = ssm.StringParameter.valueForStringParameter(
      this,
      `/${stageName}/datamgmt-qbo/intuit-client-secret`,
    )
    const qboRedirectUri = ssm.StringParameter.valueForStringParameter(
      this,
      `/${stageName}/datamgmt-qbo/redirect-uri`,
    )
    const realmId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${stageName}/datamgmt-qbo/realm-id`,
    )

    // KMS key
    const key = new kms.Key(this, 'QboKey', {
      alias: `datamgmt-qbo-${stageLower}`,
      enableKeyRotation: true,
      description: `QBO Service encryption key (${stageName})`,
    })

    // DynamoDB token table
    const tokenTable = new dynamodb.Table(this, 'TokenTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: key,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // Shared Lambda environment
    const lambdaEnvironment = {
      TOKEN_TABLE: tokenTable.tableName,
      INTUIT_CLIENT_ID: intuitClientId,
      INTUIT_CLIENT_SECRET: intuitClientSecret,
      QBO_REDIRECT_URI: qboRedirectUri,
      REALM_ID: realmId,
      QBO_BASE_URL: stage.qboBaseUrl || 'https://sandbox-quickbooks.api.intuit.com/v3/company',
    }

    // Shared Lambda props
    const sharedLambdaProps = {
      runtime: Runtime.NODEJS_20_X,
      environment: lambdaEnvironment,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      timeout: cdk.Duration.seconds(30),
    }

    // Lambda functions
    const oauthLambda = new lambda.NodejsFunction(this, 'OAuthLambda', {
      ...sharedLambdaProps,
      entry: path.join(__dirname, '../../lambdas/oauth/index.ts'),
      functionName: `${stageName}-DataMgmt-QboOAuth`,
    })

    const purchasesLambda = new lambda.NodejsFunction(this, 'PurchasesLambda', {
      ...sharedLambdaProps,
      entry: path.join(__dirname, '../../lambdas/purchases/index.ts'),
      functionName: `${stageName}-DataMgmt-QboPurchases`,
    })

    const vendorsLambda = new lambda.NodejsFunction(this, 'VendorsLambda', {
      ...sharedLambdaProps,
      entry: path.join(__dirname, '../../lambdas/vendors/index.ts'),
      functionName: `${stageName}-DataMgmt-QboVendors`,
    })

    const connectionLambda = new lambda.NodejsFunction(this, 'ConnectionLambda', {
      ...sharedLambdaProps,
      entry: path.join(__dirname, '../../lambdas/connection/index.ts'),
      functionName: `${stageName}-DataMgmt-QboConnection`,
    })

    // Grant DynamoDB + KMS access to all lambdas
    const allLambdas = [oauthLambda, purchasesLambda, vendorsLambda, connectionLambda]
    for (const fn of allLambdas) {
      tokenTable.grantReadWriteData(fn)
      key.grantDecrypt(fn)
      key.grantEncrypt(fn)
    }

    // API Gateway
    const httpApi = new apigwv2.HttpApi(this, 'QboApi', {
      apiName: `${stageName}-DataMgmt-QboService`,
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    })

    // JWT Authorizer (reuses shared Cognito pool)
    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPoolId}`
    const jwtAuthorizer = new apigwv2Authorizers.HttpJwtAuthorizer('JwtAuthorizer', issuer, {
      jwtAudience: [userPoolClientId, machineClientId],
    })

    // Integrations
    const oauthIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'OAuthIntegration',
      oauthLambda,
    )
    const purchasesIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'PurchasesIntegration',
      purchasesLambda,
    )
    const vendorsIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'VendorsIntegration',
      vendorsLambda,
    )
    const connectionIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'ConnectionIntegration',
      connectionLambda,
    )

    // OAuth routes (NO authorizer - browser redirect flows)
    httpApi.addRoutes({
      path: '/auth/connect',
      methods: [apigwv2.HttpMethod.GET],
      integration: oauthIntegration,
    })
    httpApi.addRoutes({
      path: '/auth/callback',
      methods: [apigwv2.HttpMethod.GET],
      integration: oauthIntegration,
    })

    // Auth refresh (JWT protected)
    httpApi.addRoutes({
      path: '/auth/refresh',
      methods: [apigwv2.HttpMethod.POST],
      integration: oauthIntegration,
      authorizer: jwtAuthorizer,
    })

    // Purchases routes (JWT protected)
    httpApi.addRoutes({
      path: '/purchases',
      methods: [apigwv2.HttpMethod.POST],
      integration: purchasesIntegration,
      authorizer: jwtAuthorizer,
    })
    httpApi.addRoutes({
      path: '/purchases/{docNumber}',
      methods: [apigwv2.HttpMethod.GET],
      integration: purchasesIntegration,
      authorizer: jwtAuthorizer,
    })

    // Vendors route (JWT protected)
    httpApi.addRoutes({
      path: '/vendors',
      methods: [apigwv2.HttpMethod.GET],
      integration: vendorsIntegration,
      authorizer: jwtAuthorizer,
    })

    // Connection route (JWT protected)
    httpApi.addRoutes({
      path: '/connection',
      methods: [apigwv2.HttpMethod.GET],
      integration: connectionIntegration,
      authorizer: jwtAuthorizer,
    })

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'QBO Service API URL',
    })

    // Write API URL to SSM for cross-service discovery
    new ssm.StringParameter(this, 'ApiUrlParam', {
      parameterName: `/${stageName}/datamgmt-qbo/api-url`,
      stringValue: httpApi.apiEndpoint,
      description: `QBO Service API URL (${stageName})`,
    })
  }
}
