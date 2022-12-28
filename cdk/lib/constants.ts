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

export const STACK_NAME =
  "f1-22-telemetry" || process.env.STACK_NAME || "%%STACK_NAME%%"

// Greengrass core minimal policy template
// NOTE: Additional permissions may be needed for components
export const fleetWiseMinimalIoTPolicy = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["iot:Connect"],
      "Resource": "arn:aws:iot:<%= region %>:<%= account %>:client/<%= thingname %>"
    },
    {
      "Effect": "Allow",
      "Action": ["iot:Publish"],
      "Resource": [
        "arn:aws:iot:<%= region %>:<%= account %>:topic/$aws/iotfleetwise/vehicles/<%= thingname %>*/checkins",
        "arn:aws:iot:<%= region %>:<%= account %>:topic/$aws/iotfleetwise/vehicles/<%= thingname %>*/signals"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["iot:Subscribe", "iot:Receive"],
      "Resource": [
        "arn:aws:iot:<%= region %>:<%= account %>:topicfilter/$aws/iotfleetwise/vehicles/<%= thingname %>*/collection_schemes",
        "arn:aws:iot:<%= region %>:<%= account %>:topicfilter/$aws/iotfleetwise/vehicles/<%= thingname %>*/decoder_manifests"
      ]
    }
  ]
}`
