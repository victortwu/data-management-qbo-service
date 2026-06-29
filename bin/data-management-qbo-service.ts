#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { QboServiceStack } from '../lib/stacks/qbo-service-stack'
import { stages } from '../config'

const app = new cdk.App()

for (const stage of stages) {
  new QboServiceStack(app, `${stage.stageName}-DataMgmtQboServiceStack`, { stage })
}
