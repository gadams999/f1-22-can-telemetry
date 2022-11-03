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
import * as seedrandom from "seedrandom"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as iam from "aws-cdk-lib/aws-iam"
import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"

export class F122TelemetryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const stackName = cdk.Stack.of(this).stackName
    const stackRandom: string = makeid(8, stackName)

    const logFileBucket = new s3.Bucket(this, "LogFileBucket", {
      bucketName: `${stackName}-logfiles-${cdk.Fn.ref(
        "AWS::AccountId"
      )}-${cdk.Fn.ref("AWS::Region")}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
      encryption: s3.BucketEncryption.S3_MANAGED,
      intelligentTieringConfigurations: [
        {
          name: "archive",
          archiveAccessTierTime: cdk.Duration.days(90),
          deepArchiveAccessTierTime: cdk.Duration.days(180),
        },
      ],
    })
    const vpcFlowLogRole = new iam.Role(this, "vpcFlowLogRole", {
      assumedBy: new iam.ServicePrincipal("vpc-flow-logs.amazonaws.com"),
    })
    logFileBucket.grantWrite(vpcFlowLogRole, "sharedVpcFlowLogs/*")

    const vpc = new ec2.Vpc(this, "listener-vpc", {
      ipAddresses: ec2.IpAddresses.cidr("172.31.0.0/16"),
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public-1",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    })

    // Create flow logs to S3
    new ec2.FlowLog(this, "sharedVpcFlowLogs", {
      destination: ec2.FlowLogDestination.toS3(
        logFileBucket,
        "sharedVpcFlowLogs/"
      ),
      trafficType: ec2.FlowLogTrafficType.ALL,
      flowLogName: "sharedVpcFlowLogs",
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
    })

    function makeid(length: number, seed: string) {
      // Generate a n-length random value for each resource
      var result = ""
      var characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
      var charactersLength = characters.length
      seedrandom(seed, { global: true })
      for (var i = 0; i < length; i++) {
        result += characters.charAt(
          Math.floor(Math.random() * charactersLength)
        )
      }
      return result
    }
  }
}
