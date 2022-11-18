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
import * as fs from "fs"
import * as seedrandom from "seedrandom"
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

/**
 * Helper function for creating an n-length random string from a seed value
 * @param length
 * @param seed
 * @returns string
 */

export function makeId(length: number, seed: string) {
  // Generate a n-length random value for each resource
  var result = ""
  var characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  var charactersLength = characters.length
  seedrandom(seed, { global: true })
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

// read from /dev/tty directly itself since cdk redirects stdin
export function prompt(promptText: string) {
  // https://github.com/nodejs/node/issues/26450#issue-417306344
  const fd = fs.openSync("/dev/tty", "r")
  const stream = fs.createReadStream("/dev/tty", {
    flags: "r",
    fd: fd,
  })

  process.stdout.write(promptText)

  // https://stackoverflow.com/a/60203932/2276637
  const CHAR_LF = 10
  const CHAR_CR = 13
  const data = []
  const buffer = Buffer.alloc ? Buffer.alloc(1) : new Buffer(1)
  while (true) {
    const bytesRead = fs.readSync(fd, buffer, 0, 1, null)
    if (bytesRead > 0) {
      if (buffer[0] === CHAR_LF) {
        break
      } else if (buffer[0] !== CHAR_CR) {
        data.push(Buffer.from(buffer))
      }
    }
  }

  stream.close()
  return Buffer.concat(data).toString("utf-8")
}

interface ResourceName {
  stackName: string
  baseName: string
  suffix: string
  resourceRegex: string
  maxLength: number
}

export function fullResourceName({
  stackName,
  baseName,
  suffix,
  resourceRegex,
  maxLength,
}: ResourceName) {
  let re = new RegExp(`[^\\[${resourceRegex}]`, "g")
  let resourceName = `${stackName}-${baseName}`.replace(re, "")
  resourceName = resourceName.substring(0, maxLength - suffix.length - 1)
  resourceName = `${resourceName}-${suffix}`
  return resourceName
}
