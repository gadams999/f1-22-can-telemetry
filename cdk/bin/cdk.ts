#!/usr/bin/env node
/**
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use
 * this file except in compliance with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under the License.
 **/
import "source-map-support/register"
import * as cdk from "aws-cdk-lib"
import { F122TelemetryStack } from "../lib/f1-22-telemetry-stack"
import * as Constants from "../lib/constants"
import { AwsSolutionsChecks } from "cdk-nag"

const app = new cdk.App()

const name = process.env.STACK_NAME || Constants.STACK_NAME

new F122TelemetryStack(app, name, {
  stackName: name,
  description: "EA Sports F1 2022 telemetry listening and CAN data export",
})
// Enable nag checks for the entire stack
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))
