import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
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

  test('creates 4 Lambda functions', () => {
    const lambdas = template.findResources('AWS::Lambda::Function')
    const lambdaCount = Object.keys(lambdas).length
    expect(lambdaCount).toBeGreaterThanOrEqual(4)
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

  test('creates API routes for OAuth without authorizer', () => {
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
    expect(routeKeys).toContain('POST /purchases')
    expect(routeKeys).toContain('GET /purchases/{docNumber}')
    expect(routeKeys).toContain('GET /vendors')
    expect(routeKeys).toContain('GET /connection')
  })

  test('OAuth routes have no authorizer', () => {
    const routes = template.findResources('AWS::ApiGatewayV2::Route')

    for (const [, route] of Object.entries(routes)) {
      const props = (route as { Properties: Record<string, unknown> }).Properties
      if (
        props.RouteKey === 'GET /auth/connect' ||
        props.RouteKey === 'GET /auth/callback' ||
        props.RouteKey === 'GET /auth/disconnect'
      ) {
        expect(props.AuthorizationType).toBe('NONE')
      }
    }
  })

  test('writes SSM parameter for API URL', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/Beta/datamgmt-qbo/api-url',
    })
  })
})
