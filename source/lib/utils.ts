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
import * as cdk from "aws-cdk-lib"
import { Construct, IConstruct } from "constructs"

/**
 * A custom Condition utility for recursively applying CloudFormation
 * conditions to both L1 and L2 CDK constructs.
 *
 * @noInheritDoc
 */
export class Condition {
  cfnCondition: cdk.CfnCondition

  constructor(cfnCondition: cdk.CfnCondition) {
    this.cfnCondition = cfnCondition
  }

  get logicalId(): string {
    return this.cfnCondition.logicalId
  }

  applyTo(node: IConstruct | cdk.CfnResource, force = false): void {
    this.applyCondition(this.cfnCondition, force, node)
    cdk.Aspects.of(node).add({
      visit: this.applyCondition.bind(this, this.cfnCondition, force),
    })
  }

  private applyCondition(
    condition: cdk.CfnCondition,
    force: boolean,
    node: IConstruct | cdk.CfnResource
  ) {
    if (node instanceof cdk.CfnResource) {
      // L1 Constructs
      if (force || !node.cfnOptions.condition) {
        node.cfnOptions.condition = condition
      }
    } else {
      // L2 Constructs
      const aNode = node.node.defaultChild as cdk.CfnResource
      if (aNode) {
        if (force || !aNode.cfnOptions.condition) {
          aNode.cfnOptions.condition = condition
        }
      }
    }
  }
}

/**
 * Helper function for creating a CloudFormation parameter with an explicit logical ID.
 * @param scope
 * @param name
 * @param props
 */
export function createParameter(
  scope: Construct,
  name: string,
  props: cdk.CfnParameterProps
): cdk.CfnParameter {
  const p = new cdk.CfnParameter(scope, name, props)
  p.overrideLogicalId(name)
  // warn for parameters missing input validation
  if (
    !props.allowedPattern &&
    !props.allowedValues &&
    props.minValue === undefined &&
    props.minValue === undefined
  ) {
    console.log(
      `WARNING - Missing one of allowedPattern, allowedValues, minValue, maxValue for parameter ${name}`
    )
  }
  return p
}

/**
 * Helper function for creating a Condition with an explicit logical ID.
 * @param scope
 * @param name
 * @param props
 */
export function createCondition(
  scope: Construct,
  name: string,
  props: cdk.CfnConditionProps
): Condition {
  const p = new cdk.CfnCondition(scope, name, props)
  p.overrideLogicalId(name)
  return new Condition(p)
}
