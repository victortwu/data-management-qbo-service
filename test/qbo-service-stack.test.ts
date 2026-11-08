import * as cdk from 'aws-cdk-lib'
import { Template, Match } from 'aws-cdk-lib/assertions'
import { QboServiceStack } from '../lib/stacks/qbo-service-stack'

const createStack = () => {
  const app = new cdk.App()
  const stack = new QboServiceStack(app, 'TestStack', {
    stage: { stageName: 'Beta' },
  })
  return Template.fromStack(stack)
}

describe('QboServiceStack', () => {
  let template: Template

  beforeAll(() => {
    template = createStack()
  })

  test('synthesizes without errors', () => {
    expect(template).toBeDefined()
  })

  test('creates DynamoDB table with KMS encryption', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [
        {
          AttributeName: 'pk',
          KeyType: 'HASH',
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      SSESpecification: {
        SSEEnabled: true,
        SSEType: 'KMS',
      },
    })
  })

  test('creates API Gateway HTTP API', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'Beta-DataMgmt-QboService',
      ProtocolType: 'HTTP',
    })
  })

  test('creates 5 Lambda functions', () => {
    const lambdas = template.findResources('AWS::Lambda::Function')
    const lambdaCount = Object.keys(lambdas).length
    expect(lambdaCount).toBeGreaterThanOrEqual(5)
  })

  test('creates KMS key with auto-rotation', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    })
  })

  test('creates KMS key alias with correct naming', () => {
    template.hasResourceProperties('AWS::KMS::Alias', {
      AliasName: 'alias/datamgmt-qbo-beta',
    })
  })

  test('creates the unauthenticated Intuit browser-flow routes', () => {
    const routes = template.findResources('AWS::ApiGatewayV2::Route')
    const routeKeys = Object.values(routes).map(
      (r: Record<string, unknown>) =>
        (r as { Properties: { RouteKey: string } }).Properties.RouteKey,
    )

    expect(routeKeys).toContain('GET /auth/connect')
    expect(routeKeys).toContain('GET /auth/callback')
    expect(routeKeys).toContain('GET /auth/disconnect')
  })

  test('creates API routes for protected endpoints', () => {
    const routes = template.findResources('AWS::ApiGatewayV2::Route')
    const routeKeys = Object.values(routes).map(
      (r: Record<string, unknown>) =>
        (r as { Properties: { RouteKey: string } }).Properties.RouteKey,
    )

    expect(routeKeys).toContain('POST /auth/refresh')
    expect(routeKeys).toContain('POST /auth/disconnect')
    expect(routeKeys).toContain('POST /purchases')
    expect(routeKeys).toContain('GET /purchases/{docNumber}')
    expect(routeKeys).toContain('GET /vendors')
    expect(routeKeys).toContain('GET /accounts')
    expect(routeKeys).toContain('GET /connection')
  })

  test('GET /accounts is JWT protected and served by the accounts Lambda', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'Beta-DataMgmt-QboAccounts',
    })
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /accounts',
      AuthorizationType: 'JWT',
      AuthorizerId: Match.anyValue(),
    })
  })

  test('only the Intuit browser-flow routes are open; everything else has a JWT authorizer', () => {
    const open = ['GET /auth/connect', 'GET /auth/callback', 'GET /auth/disconnect']
    const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route')).map(
      (r) => (r as { Properties: Record<string, unknown> }).Properties,
    )

    for (const props of routes) {
      if (open.includes(props.RouteKey as string)) {
        expect(props.AuthorizationType).toBe('NONE')
      } else {
        expect([props.RouteKey, props.AuthorizationType]).toEqual([props.RouteKey, 'JWT'])
        expect(props.AuthorizerId).toBeDefined()
      }
    }
  })

  test('writes SSM parameter for API URL', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/Beta/datamgmt-qbo/api-url',
    })
  })

  test('passes Intuit client secret ARN (not value) to Lambda env', () => {
    const lambdas = template.findResources('AWS::Lambda::Function')
    const hasSecretArnEnv = Object.values(lambdas).some((fn) => {
      const env = (fn as { Properties: { Environment?: { Variables?: Record<string, unknown> } } })
        .Properties.Environment?.Variables
      return env !== undefined && 'INTUIT_CLIENT_SECRET_ARN' in env
    })
    expect(hasSecretArnEnv).toBe(true)
  })

  test('does not pass plaintext Intuit client secret to Lambda env', () => {
    const lambdas = template.findResources('AWS::Lambda::Function')
    const hasPlaintextSecretEnv = Object.values(lambdas).some((fn) => {
      const env = (fn as { Properties: { Environment?: { Variables?: Record<string, unknown> } } })
        .Properties.Environment?.Variables
      return env !== undefined && 'INTUIT_CLIENT_SECRET' in env
    })
    expect(hasPlaintextSecretEnv).toBe(false)
  })

  test('grants Secrets Manager read on the Intuit client secret', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['secretsmanager:GetSecretValue']),
          }),
        ]),
      },
    })
  })
})
